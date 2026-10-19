CREATE TYPE "CallStatus" AS ENUM ('in_progress', 'resolved', 'transferred', 'abandoned', 'failed');
CREATE TYPE "CallIntent" AS ENUM ('pricing_inquiry', 'book_demo', 'support_request', 'general_question', 'other');
CREATE TYPE "TranscriptRole" AS ENUM ('agent', 'caller');
CREATE TYPE "ActionType" AS ENUM ('information_provided', 'appointment_booked', 'confirmation_sent', 'transferred', 'other');
CREATE TYPE "ActionStatus" AS ENUM ('success', 'failed');
CREATE TYPE "AppointmentStatus" AS ENUM ('booked', 'cancelled');

CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "provider_call_id" TEXT NOT NULL,
    "customer_id" UUID,
    "caller_number" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL,
    "intent" "CallIntent",
    "language" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transcript_messages" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "role" "TranscriptRole" NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transcript_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "actions" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "type" "ActionType" NOT NULL,
    "status" "ActionStatus" NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "customer_id" UUID,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");
CREATE UNIQUE INDEX "calls_provider_call_id_key" ON "calls"("provider_call_id");
CREATE INDEX "calls_status_idx" ON "calls"("status");
CREATE INDEX "calls_started_at_idx" ON "calls"("started_at");
CREATE INDEX "transcript_messages_call_id_timestamp_idx" ON "transcript_messages"("call_id", "timestamp");
CREATE INDEX "actions_call_id_created_at_idx" ON "actions"("call_id", "created_at");
CREATE INDEX "appointments_starts_at_idx" ON "appointments"("starts_at");
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

ALTER TABLE "calls" ADD CONSTRAINT "calls_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transcript_messages" ADD CONSTRAINT "transcript_messages_call_id_fkey"
  FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "actions" ADD CONSTRAINT "actions_call_id_fkey"
  FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_call_id_fkey"
  FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
