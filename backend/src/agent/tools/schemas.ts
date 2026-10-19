import { z } from 'zod';

export const checkAvailabilitySchema = z.object({
  date: z.string().date(),
});

export const bookAppointmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(7).max(30),
  start_time: z.string().datetime({ offset: true }),
});

export const lookupCustomerSchema = z.object({
  phone: z.string().trim().min(7).max(30),
});

export const sendConfirmationSchema = z.object({
  appointment_id: z.string().uuid(),
});

export const transferToHumanSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
