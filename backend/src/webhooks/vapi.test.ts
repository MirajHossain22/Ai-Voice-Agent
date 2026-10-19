import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';

const config: AppConfig = {
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  host: '127.0.0.1',
  nodeEnv: 'test',
  port: 3000,
  recordingNotice: 'Test recording notice',
  dashboardToken: 'dashboard-token',
  dashboardOrigin: 'http://127.0.0.1:5173',
  vapiWebhookToken: 'test-token',
};

describe('Vapi webhook', () => {
  const apps: ReturnType<typeof buildApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('rejects requests without the bearer token', async () => {
    const app = buildApp(config);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/vapi',
      payload: { message: { type: 'status-update' } },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects malformed webhook payloads', async () => {
    const app = buildApp(config);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/vapi',
      headers: { authorization: 'Bearer test-token' },
      payload: { invalid: true },
    });

    expect(response.statusCode).toBe(400);
  });

  it('acknowledges ignored event types without requiring call data', async () => {
    const app = buildApp(config);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/vapi',
      headers: { authorization: 'Bearer test-token' },
      payload: { message: { type: 'tool-calls' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
  });
});
