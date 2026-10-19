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

function percentageChange(current: number, previous: number): number | null {
  return previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 100);
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

  public async getAnalytics(start: Date, end: Date) {
    const previousStart = new Date(start);
    previousStart.setUTCDate(
      previousStart.getUTCDate() -
        Math.round((end.getTime() - start.getTime()) / 86_400_000),
    );

    const [
      calls,
      previousCalls,
      appointments,
      previousAppointments,
      durations,
      previousDurations,
    ] = await Promise.all([
      this.prisma.call.count({ where: { startedAt: { gte: start, lt: end } } }),
      this.prisma.call.count({
        where: { startedAt: { gte: previousStart, lt: start } },
      }),
      this.prisma.appointment.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      this.prisma.appointment.count({
        where: { createdAt: { gte: previousStart, lt: start } },
      }),
      this.prisma.call.findMany({
        where: {
          startedAt: { gte: start, lt: end },
          durationSec: { not: null },
        },
        select: { durationSec: true, status: true },
      }),
      this.prisma.call.findMany({
        where: {
          startedAt: { gte: previousStart, lt: start },
          durationSec: { not: null },
        },
        select: { durationSec: true },
      }),
    ]);

    const resolved = await this.prisma.call.count({
      where: { startedAt: { gte: start, lt: end }, status: 'resolved' },
    });
    const previousResolved = await this.prisma.call.count({
      where: {
        startedAt: { gte: previousStart, lt: start },
        status: 'resolved',
      },
    });
    const totalDuration = durations.reduce(
      (total, call) => total + (call.durationSec ?? 0),
      0,
    );
    const previousTotalDuration = previousDurations.reduce(
      (total, call) => total + (call.durationSec ?? 0),
      0,
    );
    const averageDuration = durations.length
      ? totalDuration / durations.length
      : 0;
    const previousAverageDuration = previousDurations.length
      ? previousTotalDuration / previousDurations.length
      : 0;

    return {
      range: { start: start.toISOString(), end: end.toISOString() },
      kpis: {
        totalCalls: calls,
        callsResolved: resolved,
        appointmentsBooked: appointments,
        averageCallDurationSec: durations.length
          ? Math.round(averageDuration)
          : null,
        changes: {
          totalCalls: percentageChange(calls, previousCalls),
          callsResolved: percentageChange(resolved, previousResolved),
          appointmentsBooked: percentageChange(
            appointments,
            previousAppointments,
          ),
          averageCallDurationSec: percentageChange(
            averageDuration,
            previousAverageDuration,
          ),
        },
      },
    };
  }

  public async getDailyCalls(start: Date, end: Date) {
    const calls = await this.prisma.call.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { startedAt: true },
      orderBy: { startedAt: 'asc' },
    });
    const daily = new Map<string, number>();

    for (const call of calls) {
      const date = call.startedAt.toISOString().slice(0, 10);
      daily.set(date, (daily.get(date) ?? 0) + 1);
    }

    const result: { date: string; count: number }[] = [];
    for (
      let date = new Date(start);
      date < end;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const dateKey = date.toISOString().slice(0, 10);
      result.push({ date: dateKey, count: daily.get(dateKey) ?? 0 });
    }
    return result;
  }

  public async getIntents(start: Date, end: Date) {
    const calls = await this.prisma.call.groupBy({
      by: ['intent'],
      where: { startedAt: { gte: start, lt: end }, intent: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { intent: 'desc' } },
    });
    const total = calls.reduce((sum, item) => sum + item._count._all, 0);

    return calls.map((item) => ({
      intent: item.intent,
      count: item._count._all,
      percentage: total ? Math.round((item._count._all / total) * 100) : 0,
    }));
  }

  public async getLatestSummary() {
    return this.prisma.call.findFirst({
      where: { summary: { not: null } },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        summary: true,
        status: true,
        intent: true,
        actions: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, type: true, status: true },
        },
      },
    });
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
