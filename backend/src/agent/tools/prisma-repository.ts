import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import type { AppConfig } from '../../config.js';
import type {
  AvailabilitySlot,
  CustomerRecord,
  ToolRepository,
} from './types.js';

export function createPrismaToolRepository(
  config: AppConfig,
): ToolRepository & { disconnect: () => Promise<void> } {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  return {
    async listAvailableSlots(date: Date): Promise<AvailabilitySlot[]> {
      const nextDate = new Date(date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);

      return prisma.availabilitySlot.findMany({
        where: {
          startsAt: { gte: date, lt: nextDate },
          status: 'available',
        },
        orderBy: { startsAt: 'asc' },
      });
    },

    async findAvailableSlot(startTime: Date): Promise<AvailabilitySlot | null> {
      return prisma.availabilitySlot.findFirst({
        where: { startsAt: startTime, status: 'available' },
      });
    },

    async findCustomerByPhone(phone: string): Promise<CustomerRecord | null> {
      return prisma.customer.findUnique({
        where: { phone },
        select: { id: true, name: true, phone: true },
      });
    },

    async createAppointment({ callId, customerName, phone, slot }) {
      return prisma.$transaction(async (transaction) => {
        const claimedSlot = await transaction.availabilitySlot.updateMany({
          where: { id: slot.id, status: 'available' },
          data: { status: 'booked' },
        });

        if (claimedSlot.count !== 1) {
          throw new Error('slot was already booked');
        }

        const customer = await transaction.customer.upsert({
          where: { phone },
          create: { name: customerName, phone },
          update: { name: customerName },
        });

        return transaction.appointment.create({
          data: {
            callId,
            customerId: customer.id,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: 'booked',
            slotId: slot.id,
          },
          select: { id: true, startsAt: true, endsAt: true },
        });
      });
    },

    async findAppointment(appointmentId) {
      return prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { id: true, callId: true },
      });
    },

    async recordAction({ callId, type, status, payloadJson }) {
      await prisma.action.create({
        data: { callId, type, status, payloadJson },
      });
    },

    async disconnect() {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
