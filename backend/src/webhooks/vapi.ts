import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

import type { AppConfig } from '../config.js';
import { CallEventBus } from '../dashboard/call-events.js';
import { VapiWebhookService } from './vapi-service.js';
import { vapiWebhookSchema } from './vapi-schemas.js';

function isAuthorized(request: FastifyRequest, expectedToken: string): boolean {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return false;
  }

  const receivedToken = Buffer.from(authorization.slice('Bearer '.length));
  const configuredToken = Buffer.from(expectedToken);

  return (
    receivedToken.length === configuredToken.length &&
    timingSafeEqual(receivedToken, configuredToken)
  );
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
