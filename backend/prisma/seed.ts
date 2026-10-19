import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before running the database seed');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.appointment.deleteMany();
    await transaction.availabilitySlot.deleteMany();
    await transaction.action.deleteMany();
    await transaction.transcriptMessage.deleteMany();
    await transaction.call.deleteMany();
    await transaction.customer.deleteMany();

    const today = new Date();
    const openSlots = Array.from({ length: 3 }, (_, index) => {
      const startsAt = new Date(today);
      startsAt.setUTCHours(15, 0, 0, 0);
      startsAt.setUTCDate(startsAt.getUTCDate() + index + 1);

      const endsAt = new Date(startsAt);
      endsAt.setUTCMinutes(30);

      return { startsAt, endsAt };
    });

    await transaction.availabilitySlot.createMany({
      data: openSlots.map(({ startsAt, endsAt }) => ({
        startsAt,
        endsAt,
        status: 'available' as const,
      })),
    });

    const customer = await transaction.customer.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Seed Demo Customer',
        phone: '+15550000001',
      },
    });

    const call = await transaction.call.create({
      data: {
        id: '00000000-0000-0000-0000-000000000002',
        providerCallId: 'seed-provider-call-001',
        customerId: customer.id,
        callerNumber: customer.phone,
        status: 'resolved',
        intent: 'book_demo',
        language: 'en',
        startedAt: new Date('2026-01-15T14:00:00.000Z'),
        endedAt: new Date('2026-01-15T14:04:12.000Z'),
        durationSec: 252,
        summary: 'Seed data: caller booked a product demo.',
      },
    });

    await transaction.transcriptMessage.createMany({
      data: [
        {
          callId: call.id,
          role: 'agent',
          text: 'Hello, how can I help you today?',
          timestamp: new Date('2026-01-15T14:00:05.000Z'),
        },
        {
          callId: call.id,
          role: 'caller',
          text: 'I would like to book a demo.',
          timestamp: new Date('2026-01-15T14:00:12.000Z'),
        },
      ],
    });

    await transaction.action.create({
      data: {
        callId: call.id,
        type: 'appointment_booked',
        status: 'success',
        payloadJson: { source: 'seed' },
      },
    });

    const slot = await transaction.availabilitySlot.create({
      data: {
        id: '00000000-0000-0000-0000-000000000003',
        startsAt: new Date('2026-01-20T15:00:00.000Z'),
        endsAt: new Date('2026-01-20T15:30:00.000Z'),
        status: 'booked',
      },
    });

    await transaction.appointment.create({
      data: {
        callId: call.id,
        customerId: customer.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: 'booked',
        slotId: slot.id,
      },
    });
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
