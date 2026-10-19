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

Copy `.env.example` to `.env` at the repository root. Set
`DATABASE_URL`, `VAPI_WEBHOOK_TOKEN`, and `DASHBOARD_TOKEN`; keep `.env`
untracked. `DASHBOARD_ORIGIN` should match the browser origin used to access
the dashboard.

For local database work, start PostgreSQL with `docker compose up -d postgres`,
then run:

```text
npm run db:migrate
npm run db:seed
```

Start the development services separately:

```text
cd backend
npm start

cd ../dashboard
npm run dev
```

Open `http://127.0.0.1:5173/dashboard` to sign in. The backend exposes:

- `GET /health`: process-level liveness check; does not require the database.
- `GET /ready`: database-backed readiness check; returns `503` when the
  database is unavailable.

Build and run the backend for production:

```text
npm run build --workspace=@ai-voice-agent/backend
npm run start:prod --workspace=@ai-voice-agent/backend
```

Build the dashboard with:

```text
npm run build --workspace=@ai-voice-agent/dashboard
```
