import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { dispatchToolCalls } from '../agent/tool-call-dispatcher.js';
import { createPrismaToolRepository } from '../agent/tools/prisma-repository.js';
import type { AppConfig } from '../config.js';
import { CallEventBus } from '../dashboard/call-events.js';
import { processPostCall } from '../post-call/processor.js';
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
    if (!message.call || !message.toolCallList) {
      return undefined;
    }

    const result = await dispatchToolCalls(
      this.toolRepository,
      message.call.id,
      message.toolCallList,
    );
    const callId = await this.toolRepository.findLocalCallId(message.call.id);

    if (callId) {
      this.callEvents.publishCallUpdate(callId, 'action');
    }

    return result;
  }

  private async upsertCall(message: VapiMessage) {
    const call = requireCall(message);
    const callerNumber = call.customer?.number;

    if (!callerNumber) {
      throw new Error('Vapi call is missing customer.number');
    }

    return this.prisma.call.upsert({
      where: { providerCallId: call.id },
      create: {
        providerCallId: call.id,
        callerNumber,
        language: 'en',
        status: 'in_progress',
        startedAt: new Date(call.createdAt),
      },
      update: {
        callerNumber,
      },
    });
  }

  private async handleStatusUpdate(message: VapiMessage): Promise<void> {
    const call = await this.upsertCall(message);
    this.callEvents.publishCallUpdate(call.id, 'status');

    if (message.status === 'ended') {
      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          status: 'resolved',
          endedAt: new Date(),
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

    const existing = await this.prisma.transcriptMessage.findFirst({
      where: {
        callId: call.id,
        role,
        text: message.transcript,
      },
    });

    if (!existing) {
      await this.prisma.transcriptMessage.create({
        data: {
          callId: call.id,
          role,
          text: message.transcript,
        },
      });
      this.callEvents.publishCallUpdate(call.id, 'transcript');
    }
  }

  private async handleEndOfCallReport(message: VapiMessage): Promise<void> {
    const call = await this.upsertCall(message);
    const artifactMessages = message.artifact?.messages ?? [];

    await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: 'resolved',
        endedAt: new Date(),
      },
    });
    this.callEvents.publishCallUpdate(call.id, 'status');

    for (const artifactMessage of artifactMessages) {
      if (!artifactMessage || typeof artifactMessage !== 'object') {
        continue;
      }

      const messageRecord = artifactMessage as Record<string, unknown>;
      const role = transcriptRole(
        typeof messageRecord.role === 'string' ? messageRecord.role : undefined,
      );
      const text =
        typeof messageRecord.message === 'string'
          ? messageRecord.message
          : undefined;

      if (!role || !text) {
        continue;
      }

      const existing = await this.prisma.transcriptMessage.findFirst({
        where: {
          callId: call.id,
          role,
          text,
        },
      });

      if (!existing) {
        await this.prisma.transcriptMessage.create({
          data: {
            callId: call.id,
            role,
            text,
          },
        });
        this.callEvents.publishCallUpdate(call.id, 'transcript');
      }
    }

    await processPostCall(this.prisma, call.id, this.config);
    this.callEvents.publishCallUpdate(call.id, 'intent');
  }
}
