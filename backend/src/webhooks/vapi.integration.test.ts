import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('Vapi webhook database lifecycle', () => {
  const providerCallId = `integration-${randomUUID()}`;
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const config: AppConfig = {
    databaseUrl: testDatabaseUrl!,
    host: '127.0.0.1',
    nodeEnv: 'test',
    port: 3000,
    recordingNotice: 'Test recording notice',
    dashboardToken: 'dashboard-token',
    dashboardOrigin: 'http://127.0.0.1:5173',
    vapiWebhookToken: 'test-token',
  };
  const app = buildApp(config);

  beforeAll(async () => {
    await prisma.call.deleteMany({ where: { providerCallId } });
  });

  afterAll(async () => {
    await prisma.call.deleteMany({ where: { providerCallId } });
    await app.close();
    await prisma.$disconnect();
    await pool.end();
  });

  it('persists timestamps, duration, status, and repeated transcript safely', async () => {
    const headers = { authorization: 'Bearer test-token' };
    const call = {
      id: providerCallId,
      startedAt: '2026-10-26T10:00:00.000Z',
      customer: { number: '+15551234567' },
    };

    await app.inject({
      method: 'POST',
      url: '/webhooks/vapi',
      headers,
      payload: {
        message: { type: 'status-update', status: 'in-progress', call },
      },
    });

    for (const timestamp of [
      '2026-10-26T10:00:10.000Z',
      '2026-10-26T10:00:12.000Z',
    ]) {
      await app.inject({
        method: 'POST',
        url: '/webhooks/vapi',
        headers,
        payload: {
          message: {
            type: 'transcript',
            transcriptType: 'final',
            role: 'user',
            transcript: 'Yes',
            timestamp,
            call,
          },
        },
      });
    }

    const endReport = {
      message: {
        type: 'end-of-call-report',
        call,
        startedAt: '2026-10-26T10:00:00.000Z',
        endedAt: '2026-10-26T10:01:15.000Z',
        endedReason: 'customer-ended-call',
        artifact: {
          messages: [
            { role: 'user', message: 'Yes' },
            { role: 'user', message: 'Yes' },
          ],
        },
      },
    };

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/webhooks/vapi',
          headers,
          payload: endReport,
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: 'POST',
      url: '/webhooks/vapi',
      headers,
      payload: endReport,
    });

    const stored = await prisma.call.findUniqueOrThrow({
      where: { providerCallId },
      include: { transcriptMessages: true },
    });
    expect(stored.startedAt.toISOString()).toBe('2026-10-26T10:00:00.000Z');
    expect(stored.endedAt?.toISOString()).toBe('2026-10-26T10:01:15.000Z');
    expect(stored.durationSec).toBe(75);
    expect(stored.status).toBe('resolved');
    expect(stored.transcriptMessages).toHaveLength(2);
  });
});
