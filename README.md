# AI Voice Agent

AI voice receptionist for demo booking at an AI automation agency.

## Architecture

- `backend/`: Node.js and TypeScript service. Later phases will add Fastify,
  validation, PostgreSQL access, voice-platform webhooks, and agent tools.
- `dashboard/`: Next.js dashboard. Later phases will add the call dashboard and
  live updates backed by the backend API.
- PostgreSQL will be the shared persistent store through Prisma.
- Vapi is the planned managed voice platform. Its API contract and webhook
  authentication will be verified from official documentation before integration.

The voice platform will handle telephony, speech-to-text, language-model
processing, and text-to-speech. The backend will receive documented webhooks,
execute validated tools, and persist call data for the dashboard.

## Local development

```text
npm install
npm run db:generate
npm run typecheck
npm run lint
npm run format:check
```

For local database work, copy `.env.example` to `.env`, start PostgreSQL with
`docker compose up -d postgres`, then run:

```text
npm run db:migrate
npm run db:seed
```

The project currently contains the Phase 2 database foundation. Backend routes,
voice integration, and dashboard features are delivered in later approved
phases.
