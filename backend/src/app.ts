import Fastify, { type FastifyInstance } from 'fastify';

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

  app.get('/health', async () => ({
    status: 'ok',
  }));

  registerVapiWebhook(app, config, callEvents);
  registerDashboardRoutes(app, config, callEvents);

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
