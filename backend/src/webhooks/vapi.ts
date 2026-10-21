import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

import type { AppConfig } from '../config.js';
import { CallEventBus } from '../dashboard/call-events.js';
import { VapiWebhookService } from './vapi-service.js';
import { vapiWebhookSchema } from './vapi-schemas.js';

function isAuthorized(request: FastifyRequest, expectedToken: string): boolean {
  let token = request.headers.authorization;
  if (!token && typeof request.headers['x-vapi-secret'] === 'string') {
    token = request.headers['x-vapi-secret'];
  }
  if (!token) {
    request.log.warn('Vapi request missing authorization header');
    return false;
  }

  // Handle both "Bearer <token>", "Bearer Bearer <token>", and raw "<token>"
  while (token.startsWith('Bearer ')) {
    token = token.slice('Bearer '.length).trim();
  }

  const receivedToken = Buffer.from(token.trim());
  const configuredToken = Buffer.from(expectedToken.trim());

  const valid =
    receivedToken.length === configuredToken.length &&
    timingSafeEqual(receivedToken, configuredToken);

  if (!valid) {
    request.log.warn(
      {
        receivedLength: receivedToken.length,
        expectedLength: configuredToken.length,
        receivedPreview: token.slice(0, 10) + '...',
      },
      'Vapi token mismatch',
    );
  }

  return valid;
}

export function registerVapiWebhook(
  app: FastifyInstance,
  config: AppConfig,
  callEvents: CallEventBus,
): void {
  const service = new VapiWebhookService(config, callEvents);

  app.post('/webhooks/vapi', async (request, reply) => {
    if (!isAuthorized(request, config.vapiWebhookToken)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        statusCode: 401,
      });
    }

    const parsed = vapiWebhookSchema.safeParse(request.body);

    if (!parsed.success) {
      request.log.warn(
        { issues: parsed.error.issues, body: request.body },
        'Invalid Vapi webhook payload',
      );
      return reply.status(400).send({
        error: 'Invalid Vapi webhook payload',
        statusCode: 400,
      });
    }

    const result = await service.handle(parsed.data.message);

    return reply.status(200).send(result ?? { received: true });
  });

  app.addHook('onClose', async () => {
    await service.disconnect();
  });
}
