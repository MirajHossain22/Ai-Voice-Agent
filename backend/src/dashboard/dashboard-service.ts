import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import type { AppConfig } from '../config.js';
import { maskPhoneNumber } from '../logger.js';

const callSummarySelect = {
  id: true,
  providerCallId: true,
  callerNumber: true,
  status: true,
  intent: true,
  language: true,
  startedAt: true,
  endedAt: true,
  durationSec: true,
  summary: true,
  createdAt: true,
} as const;

export type DashboardCallSummary = {
  id: string;
  providerCallId: string;
  callerNumber: string;
  status: string;
  intent: string | null;
  language: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  summary: string | null;
  createdAt: Date;
};

function maskCall<T extends { callerNumber: string }>(call: T) {
  return { ...call, callerNumber: maskPhoneNumber(call.callerNumber) };
}

export class DashboardService {
  private readonly pool: Pool;
  private readonly prisma: PrismaClient;

  public constructor(config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(this.pool),
    });
  }

  public async listCalls(limit: number): Promise<DashboardCallSummary[]> {
    const calls = await this.prisma.call.findMany({
      select: callSummarySelect,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return calls.map(maskCall);
  }

  public async getCall(id: string) {
    const call = await this.prisma.call.findUnique({
      where: { id },
      select: {
        ...callSummarySelect,
        transcriptMessages: {
          orderBy: { timestamp: 'asc' },
          select: { id: true, role: true, text: true, timestamp: true },
        },
        actions: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            status: true,
            payloadJson: true,
            createdAt: true,
          },
        },
        appointments: {
          orderBy: { startsAt: 'asc' },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return call ? maskCall(call) : null;
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
