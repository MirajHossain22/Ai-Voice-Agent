import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { CallEventBus, type CallEvent } from './call-events.js';
import { DashboardService } from './dashboard-service.js';
import {
  allowDashboardRequest,
  dashboardCookieHeader,
  dashboardLogoutCookieHeader,
  isDashboardTokenValid,
  readDashboardCookie,
} from './dashboard-security.js';

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

const dateRangeSchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});

function currentWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function parseRange(query: unknown): { start: Date; end: Date } | null {
  const parsed = dateRangeSchema.safeParse(query);
  if (!parsed.success) return null;
  const defaults = currentWeekRange();
  const start = parsed.data.start
    ? new Date(parsed.data.start)
    : defaults.start;
  const end = parsed.data.end ? new Date(parsed.data.end) : defaults.end;
  return start < end ? { start, end } : null;
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  config: AppConfig,
  callEvents: CallEventBus,
): void {
  const service = new DashboardService(config);
  const secureCookie = config.nodeEnv === 'production';
  let activeStreams = 0;

  app.post('/api/dashboard/login', async (request, reply) => {
    if (!allowDashboardRequest(`login:${request.ip}`)) {
      return reply.status(403).send({
        error: 'Dashboard login unavailable',
        statusCode: 403,
      });
    }

    const body =
      typeof request.body === 'string'
        ? new URLSearchParams(request.body)
        : new URLSearchParams();
    const token = body.get('token');

    if (!isDashboardTokenValid(token, config.dashboardToken)) {
      return reply.status(401).send({
        error: 'Invalid dashboard credentials',
        statusCode: 401,
      });
    }

    return reply
      .header(
        'Set-Cookie',
        dashboardCookieHeader(config.dashboardToken, secureCookie),
      )
      .redirect(`${config.dashboardOrigin}/`);
  });

  app.post('/api/dashboard/logout', async (_request, reply) => {
    return reply
      .header('Set-Cookie', dashboardLogoutCookieHeader(secureCookie))
      .redirect('/dashboard');
  });

  app.get('/dashboard', async (_request, reply) => {
    return reply.type('text/html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Dashboard sign in</title></head>
<body><main><h1>Dashboard sign in</h1>
<form action="/api/dashboard/login" method="post">
<label for="token">Dashboard token</label>
<input id="token" name="token" type="password" required>
<button type="submit">Sign in</button>
</form></main></body></html>`);
  });

  const authorize = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const origin = request.headers.origin;
    if (origin && origin !== config.dashboardOrigin) {
      reply.status(403).send({ error: 'Origin not allowed', statusCode: 403 });
      return false;
    }
    if (
      !isDashboardTokenValid(
        readDashboardCookie(request.headers.cookie),
        config.dashboardToken,
      )
    ) {
      reply
        .status(401)
        .send({ error: 'Dashboard authentication required', statusCode: 401 });
      return false;
    }
    if (!allowDashboardRequest(request.ip)) {
      reply.status(429).send({ error: 'Too many requests', statusCode: 429 });
      return false;
    }
    return true;
  };

  app.get('/api/calls', async (request, reply) => {
    if (!authorize(request, reply)) return;
    const parsed = listQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid call list query',
        statusCode: 400,
      });
    }

    return { calls: await service.listCalls(parsed.data.limit) };
  });

  app.get('/api/kpis', async (request, reply) => {
    if (!authorize(request, reply)) return;
    const range = parseRange(request.query);
    if (!range) {
      return reply
        .status(400)
        .send({ error: 'Invalid date range', statusCode: 400 });
    }
    return service.getAnalytics(range.start, range.end);
  });

  app.get('/api/calls/daily', async (request, reply) => {
    if (!authorize(request, reply)) return;
    const range = parseRange(request.query);
    if (!range) {
      return reply
        .status(400)
        .send({ error: 'Invalid date range', statusCode: 400 });
    }
    return { days: await service.getDailyCalls(range.start, range.end) };
  });

  app.get('/api/intents', async (request, reply) => {
    if (!authorize(request, reply)) return;
    const range = parseRange(request.query);
    if (!range) {
      return reply
        .status(400)
        .send({ error: 'Invalid date range', statusCode: 400 });
    }
    return { intents: await service.getIntents(range.start, range.end) };
  });

  app.get('/api/calls/latest-summary', async (request, reply) => {
    if (!authorize(request, reply)) return;
    return { summary: await service.getLatestSummary() };
  });

  app.get('/api/calls/stream', async (request, reply) => {
    if (!authorize(request, reply)) return;
    if (activeStreams >= 10) {
      return reply.status(429).send({
        error: 'Too many live dashboard connections',
        statusCode: 429,
      });
    }
    activeStreams += 1;
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
      activeStreams -= 1;
    });
  });

  app.get('/api/calls/:id', async (request, reply) => {
    if (!authorize(request, reply)) return;
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
