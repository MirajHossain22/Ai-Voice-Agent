import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import type { AppConfig } from '../../config.js';
import { createGoogleCalendarClient } from '../../calendar/google-calendar.js';
import { createHubSpotClient } from '../../crm/hubspot.js';
import { createResendClient } from '../../email/resend.js';
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
  const calendar = createGoogleCalendarClient(config);
  const hubspot = createHubSpotClient(config);
  const resend = createResendClient(config);

  return {
    async findLocalCallId(providerCallId: string): Promise<string | null> {
      const call = await prisma.call.findUnique({
        where: { providerCallId },
        select: { id: true },
      });
      return call?.id ?? null;
    },

    async listAvailableSlots(date: Date): Promise<AvailabilitySlot[]> {
      const nextDate = new Date(date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);

      const slots = await prisma.availabilitySlot.findMany({
        where: {
          startsAt: { gte: date, lt: nextDate },
          status: 'available',
        },
        orderBy: { startsAt: 'asc' },
      });
      if (!calendar || slots.length === 0) {
        return slots;
      }
      const busy = await calendar.listBusy(date, nextDate);
      return slots.filter(
        (slot) =>
          !busy.some(
            (period) =>
              new Date(period.start) < slot.endsAt &&
              new Date(period.end) > slot.startsAt,
          ),
      );
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

    async findExternalCustomer(phone: string): Promise<CustomerRecord | null> {
      if (!hubspot) return null;
      return hubspot.findContact(phone);
    },

    async createAppointment({ callId, customerName, phone, slot }) {
      let eventId: string | undefined;
      try {
        if (calendar) {
          eventId = await calendar.createEvent({
            start: slot.startsAt,
            end: slot.endsAt,
            name: customerName,
            phone,
          });
        }

        return await prisma.$transaction(async (transaction) => {
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

          const appointment = await transaction.appointment.create({
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
          if (hubspot) {
            await hubspot.syncContact({
              name: customerName,
              phone,
            });
          }
          return appointment;
        });
      } catch (error) {
        if (eventId && calendar) {
          await calendar.deleteEvent(eventId);
        }
        throw error;
      }
    },

    async findAppointment(appointmentId) {
      return prisma.appointment
        .findUnique({
          where: { id: appointmentId },
          select: {
            id: true,
            callId: true,
            startsAt: true,
            endsAt: true,
            customer: { select: { name: true } },
          },
        })
        .then((appointment) =>
          appointment
            ? {
                id: appointment.id,
                callId: appointment.callId,
                startsAt: appointment.startsAt,
                endsAt: appointment.endsAt,
                customerName: appointment.customer?.name ?? 'there',
              }
            : null,
        );
    },

    async sendConfirmationEmail({ email, appointment }) {
      if (!resend) {
        throw new Error('Resend is not configured');
      }
      await resend.sendConfirmation({
        to: email,
        customerName: appointment.customerName,
        appointmentId: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
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
