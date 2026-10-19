import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { CallEventBus, type CallEvent } from './call-events.js';
import { DashboardService } from './dashboard-service.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const idParamsSchema = z.object({
  id: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Expected a UUID',
    ),
});

export function registerDashboardRoutes(
  app: FastifyInstance,
  config: AppConfig,
  callEvents: CallEventBus,
): void {
  const service = new DashboardService(config);

  app.get('/api/calls', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid call list query',
        statusCode: 400,
      });
    }

    return { calls: await service.listCalls(parsed.data.limit) };
  });

  app.get('/api/calls/stream', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: CallEvent) => {
      reply.raw.write(
        `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    };
    const unsubscribe = callEvents.subscribe(send);
    const keepAlive = setInterval(() => {
      reply.raw.write(': keep-alive\n\n');
    }, 20_000);

    send({
      type: 'connected',
      timestamp: new Date().toISOString(),
    });

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.get('/api/calls/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid call id',
        statusCode: 400,
      });
    }

    const call = await service.getCall(parsed.data.id);

    if (!call) {
      return reply.status(404).send({
        error: 'Call not found',
        statusCode: 404,
      });
    }

    return { call };
  });

  app.addHook('onClose', async () => {
    await service.disconnect();
  });
}
