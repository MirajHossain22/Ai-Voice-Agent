import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { dispatchToolCalls } from '../agent/tool-call-dispatcher.js';
import { createPrismaToolRepository } from '../agent/tools/prisma-repository.js';
import type { AppConfig } from '../config.js';
import { CallEventBus } from '../dashboard/call-events.js';
import { processPostCall } from '../post-call/processor.js';
import {
  calculateDurationSec,
  findMissingArtifactMessages,
  mapEndedReasonToStatus,
  parseVapiDate,
} from './vapi-lifecycle.js';
import type { VapiWebhook } from './vapi-schemas.js';

type VapiMessage = VapiWebhook['message'];

function transcriptRole(role: string | undefined): 'agent' | 'caller' | null {
  if (role === 'assistant') {
    return 'agent';
  }

  if (role === 'user') {
    return 'caller';
  }

  return null;
}

function requireCall(message: VapiMessage): NonNullable<VapiMessage['call']> {
  if (!message.call) {
    throw new Error('Vapi message is missing call data');
  }

  return message.call;
}

export class VapiWebhookService {
  private readonly pool: Pool;
  private readonly prisma: PrismaClient;
  private readonly toolRepository: ReturnType<
    typeof createPrismaToolRepository
  >;
  private readonly config: AppConfig;

  public constructor(
    config: AppConfig,
    private readonly callEvents: CallEventBus,
  ) {
    this.config = config;
    this.pool = new Pool({ connectionString: config.databaseUrl });
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(this.pool),
    });
    this.toolRepository = createPrismaToolRepository(config);
  }

  public async handle(
    message: VapiMessage,
  ): Promise<{ results: unknown[] } | undefined> {
    switch (message.type) {
      case 'status-update':
        await this.handleStatusUpdate(message);
        return;
      case 'transcript':
        await this.handleTranscript(message);
        return;
      case 'end-of-call-report':
        await this.handleEndOfCallReport(message);
        return;
      case 'tool-calls':
        return this.handleToolCalls(message);
      default:
        return;
    }
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
    await this.toolRepository.disconnect();
  }

  private async handleToolCalls(message: VapiMessage) {
    const toolCalls = message.toolCallList ?? message.toolCalls;
    if (!message.call || !toolCalls) {
      return undefined;
    }

    try {
      await this.upsertCall(message);
    } catch {
      // Continue if upsert fails so tool call execution is not blocked
    }

    const result = await dispatchToolCalls(
      this.toolRepository,
      message.call.id,
      toolCalls,
    );
    const callId = await this.toolRepository.findLocalCallId(message.call.id);

    if (callId) {
      this.callEvents.publishCallUpdate(callId, 'action');
    }

    return result;
  }

  private async upsertCall(message: VapiMessage) {
    const call = requireCall(message);
    const callerNumber = call.customer?.number || 'web-caller';
    const providerStartedAt =
      parseVapiDate(message.startedAt) ??
      parseVapiDate(call.startedAt) ??
      parseVapiDate(call.createdAt);
    const startedAt = providerStartedAt ?? new Date();

    return this.prisma.call.upsert({
      where: { providerCallId: call.id },
      create: {
        providerCallId: call.id,
        callerNumber,
        language: 'en',
        status: 'in_progress',
        startedAt,
      },
      update: {
        callerNumber,
        ...(providerStartedAt ? { startedAt: providerStartedAt } : {}),
      },
    });
  }

  private async handleStatusUpdate(message: VapiMessage): Promise<void> {
    const call = await this.upsertCall(message);
    this.callEvents.publishCallUpdate(call.id, 'status');

    if (message.status === 'ended') {
      const endedAt =
        parseVapiDate(message.endedAt) ??
        parseVapiDate(message.call?.endedAt) ??
        new Date();
      const endedReason = message.endedReason ?? message.call?.endedReason;
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          status: mapEndedReasonToStatus(endedReason),
          endedAt,
          durationSec: calculateDurationSec(call.startedAt, endedAt),
        },
      });
      this.callEvents.publishCallUpdate(call.id, 'status');
    }
  }

  private async handleTranscript(message: VapiMessage): Promise<void> {
    if (message.transcriptType !== 'final' || !message.transcript) {
      return;
    }

    const call = await this.upsertCall(message);
    const role = transcriptRole(message.role);

    if (!role) {
      return;
    }

    const timestamp = parseVapiDate(message.timestamp);
    const existing = await this.prisma.transcriptMessage.findFirst({
      where: timestamp
        ? { callId: call.id, role, text: message.transcript, timestamp }
        : { callId: call.id, role, text: message.transcript },
    });

    if (!existing) {
      await this.prisma.transcriptMessage.create({
        data: {
          callId: call.id,
          role,
          text: message.transcript,
          ...(timestamp ? { timestamp } : {}),
        },
      });
      this.callEvents.publishCallUpdate(call.id, 'transcript');
    }
  }

  private async handleEndOfCallReport(message: VapiMessage): Promise<void> {
    const call = await this.upsertCall(message);
    const startedAt =
      parseVapiDate(message.startedAt) ??
      parseVapiDate(message.call?.startedAt) ??
      call.startedAt;
    const endedAt =
      parseVapiDate(message.endedAt) ??
      parseVapiDate(message.call?.endedAt) ??
      new Date();
    const endedReason = message.endedReason ?? message.call?.endedReason;
    const artifactMessages = (message.artifact?.messages ?? [])
      .map((artifactMessage) => {
        const role = transcriptRole(artifactMessage.role);
        return role && artifactMessage.message
          ? { role, text: artifactMessage.message }
          : null;
      })
      .filter((artifactMessage) => artifactMessage !== null);

    await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: mapEndedReasonToStatus(endedReason),
        startedAt,
        endedAt,
        durationSec: calculateDurationSec(startedAt, endedAt),
      },
    });
    this.callEvents.publishCallUpdate(call.id, 'status');

    const storedMessages = await this.prisma.transcriptMessage.findMany({
      where: { callId: call.id },
      select: { role: true, text: true },
    });
    const missingMessages = findMissingArtifactMessages(
      storedMessages,
      artifactMessages,
    );

    if (missingMessages.length > 0) {
      await this.prisma.transcriptMessage.createMany({
        data: missingMessages.map(({ role, text }) => ({
          callId: call.id,
          role,
          text,
        })),
      });
      this.callEvents.publishCallUpdate(call.id, 'transcript');
    }

    if (!call.endedAt || !call.intent) {
      await processPostCall(this.prisma, call.id, this.config);
      this.callEvents.publishCallUpdate(call.id, 'intent');
    }
  }
}
