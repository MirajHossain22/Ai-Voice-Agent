import Fastify, { type FastifyInstance } from 'fastify';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { loadConfig, type AppConfig } from './config.js';
import { CallEventBus } from './dashboard/call-events.js';
import { registerDashboardRoutes } from './dashboard/dashboard.js';
import { maskLogFields } from './logger.js';
import { registerVapiWebhook } from './webhooks/vapi.js';

export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'test' ? 'silent' : 'info',
    },
  });
  const callEvents = new CallEventBus();
  const readinessPool = new Pool({ connectionString: config.databaseUrl });
  const readinessPrisma = new PrismaClient({
    adapter: new PrismaPg(readinessPool),
  });

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, body),
  );
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    return payload;
  });

  app.get('/health', async () => ({
    status: 'ok',
  }));

  app.get('/ready', async (_request, reply) => {
    try {
      await readinessPrisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (error: unknown) {
      app.log.error({ err: error }, 'Readiness check failed');
      return reply.status(503).send({
        error: 'Service unavailable',
        statusCode: 503,
      });
    }
  });

  registerVapiWebhook(app, config, callEvents);
  registerDashboardRoutes(app, config, callEvents);

  app.addHook('onClose', async () => {
    await readinessPrisma.$disconnect();
    await readinessPool.end();
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: 'Not Found',
      statusCode: 404,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400
        ? error.statusCode
        : 500;
    const message = error instanceof Error ? error.message : 'Unknown error';

    request.log.error(
      maskLogFields({
        err: error,
        method: request.method,
        url: request.url,
      }),
      'Unhandled request error',
    );

    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : message,
      statusCode,
    });
  });

  return app;
}
