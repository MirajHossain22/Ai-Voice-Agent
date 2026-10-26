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

Create a Vapi custom Bearer credential whose token exactly matches
`VAPI_WEBHOOK_TOKEN`, then attach that credential to the assistant's server
configuration. Replace `REPLACE_WITH_VAPI_CREDENTIAL_ID` in
`vapi-assistant-config.json` only in the copy submitted to Vapi. Never commit
the credential token or a populated credential ID. If a token has ever been
committed, revoke and rotate it before accepting webhook traffic.

Google Calendar booking is opt-in. Set `GOOGLE_CALENDAR_ENABLED=true`,
`GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_TIME_ZONE`, and the Google OAuth client
and refresh-token variables shown in `.env.example`. The OAuth grant must
include Calendar access. When enabled, local availability is filtered through
Google Calendar free/busy data and successful bookings create a Google Calendar
event. When disabled, the existing database-backed slot behavior is used.
`GOOGLE_CALENDAR_TIMEOUT_MS` and `GOOGLE_CALENDAR_RETRIES` bound provider
requests; transient network failures are retried and provider failures return a
failed booking/availability tool result so the agent can apologize and offer a
human.

The integration uses Google's documented OAuth refresh-token endpoint,
`freeBusy.query`, and `events.insert`/`events.delete` APIs. Credentials are
loaded only from the root `.env` and must never be committed.

HubSpot CRM synchronization is also opt-in. Set `HUBSPOT_ENABLED=true` and
provide a HubSpot private-app access token with CRM contact read/write scopes.
The integration searches contacts by phone and creates or updates the contact
during booking. `HUBSPOT_TIMEOUT_MS` and `HUBSPOT_RETRIES` bound provider
requests. Provider failures return a failed tool result so the agent can
apologize and offer a human.

Resend email confirmations are opt-in. Set `RESEND_ENABLED=true` and provide
`RESEND_API_KEY` plus a verified `RESEND_FROM` address. The caller's email is
validated by the confirmation tool, and the email is sent only after the
appointment has been verified for the current call. Timeout and retry settings
are bounded by `RESEND_TIMEOUT_MS` and `RESEND_RETRIES`.

### Railway deployment

Deploy the repository as two Railway services:

1. Backend service root directory: `/backend`, using
   `/backend/railway.toml`.
2. Dashboard service root directory: `/dashboard`, using
   `/dashboard/railway.toml`.

Set the backend variables from `.env.example` in Railway's service variables.
Set `VITE_API_BASE_URL` on the dashboard service to the public backend URL
before building it. Set the backend `DASHBOARD_ORIGIN` to the public dashboard
URL. Railway injects `PORT`; do not replace it with a fixed production port.

For the backend database, provision a Railway PostgreSQL service and set
`DATABASE_URL` from its connection reference. Run the Prisma deploy migration
command once before serving traffic:

```text
npx prisma migrate deploy --schema prisma/schema.prisma
```

Configure Railway's backend healthcheck as `/health`. `/ready` can be used for
manual database readiness verification after `DATABASE_URL` is configured.

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
