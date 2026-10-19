CREATE TYPE "AvailabilitySlotStatus" AS ENUM ('available', 'booked');

CREATE TABLE "availability_slots" (
    "id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "AvailabilitySlotStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "appointments" ADD COLUMN "slot_id" UUID;

CREATE UNIQUE INDEX "appointments_slot_id_key" ON "appointments"("slot_id");
CREATE INDEX "availability_slots_starts_at_status_idx" ON "availability_slots"("starts_at", "status");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "availability_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
