import {
  bookAppointmentSchema,
  checkAvailabilitySchema,
  lookupCustomerSchema,
  sendConfirmationSchema,
  transferToHumanSchema,
} from './schemas.js';
import type {
  CustomerRecord,
  ToolContext,
  ToolRepository,
  ToolResult,
} from './types.js';

function failure(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

export function createAgentTools(
  repository: ToolRepository,
  context: ToolContext,
) {
  return {
    async check_availability(
      input: unknown,
    ): Promise<
      ToolResult<{ id: string; start_time: string; end_time: string }[]>
    > {
      const parsed = checkAvailabilitySchema.safeParse(input);

      if (!parsed.success) {
        return failure('INVALID_INPUT', 'date must be a valid calendar date');
      }

      try {
        const slots = await repository.listAvailableSlots(
          new Date(`${parsed.data.date}T00:00:00.000Z`),
        );
        return {
          ok: true,
          data: slots.map((slot) => ({
            id: slot.id,
            start_time: slot.startsAt.toISOString(),
            end_time: slot.endsAt.toISOString(),
          })),
        };
      } catch {
        return failure(
          'AVAILABILITY_LOOKUP_FAILED',
          'availability is temporarily unavailable',
        );
      }
    },

    async book_appointment(
      input: unknown,
    ): Promise<ToolResult<{ appointment_id: string }>> {
      const parsed = bookAppointmentSchema.safeParse(input);

      if (!parsed.success) {
        return failure(
          'INVALID_INPUT',
          'name, phone, and start_time are required',
        );
      }

      const startTime = new Date(parsed.data.start_time);

      try {
        const slot = await repository.findAvailableSlot(startTime);

        if (!slot) {
          return failure(
            'SLOT_UNAVAILABLE',
            'that appointment slot is not available',
          );
        }

        const appointment = await repository.createAppointment({
          callId: context.callId,
          customerName: parsed.data.name,
          phone: parsed.data.phone,
          slot,
        });

        await repository.recordAction({
          callId: context.callId,
          type: 'appointment_booked',
          status: 'success',
          payloadJson: { appointmentId: appointment.id },
        });

        return { ok: true, data: { appointment_id: appointment.id } };
      } catch {
        return failure('BOOKING_FAILED', 'the appointment could not be booked');
      }
    },

    async lookup_customer(
      input: unknown,
    ): Promise<ToolResult<CustomerRecord | null>> {
      const parsed = lookupCustomerSchema.safeParse(input);

      if (!parsed.success) {
        return failure('INVALID_INPUT', 'phone is required');
      }

      try {
        return {
          ok: true,
          data: await repository.findCustomerByPhone(parsed.data.phone),
        };
      } catch {
        return failure(
          'CUSTOMER_LOOKUP_FAILED',
          'customer lookup is temporarily unavailable',
        );
      }
    },

    async send_confirmation(
      input: unknown,
    ): Promise<ToolResult<{ sent: true }>> {
      const parsed = sendConfirmationSchema.safeParse(input);

      if (!parsed.success) {
        return failure('INVALID_INPUT', 'appointment_id must be a valid ID');
      }

      try {
        const appointment = await repository.findAppointment(
          parsed.data.appointment_id,
        );

        if (!appointment || appointment.callId !== context.callId) {
          return failure('APPOINTMENT_NOT_FOUND', 'appointment was not found');
        }

        await repository.recordAction({
          callId: context.callId,
          type: 'confirmation_sent',
          status: 'success',
          payloadJson: { appointmentId: appointment.id, mocked: 'true' },
        });

        return { ok: true, data: { sent: true } };
      } catch {
        return failure('CONFIRMATION_FAILED', 'confirmation could not be sent');
      }
    },

    async transfer_to_human(
      input: unknown,
    ): Promise<ToolResult<{ transferred: true }>> {
      const parsed = transferToHumanSchema.safeParse(input);

      if (!parsed.success) {
        return failure('INVALID_INPUT', 'reason is required');
      }

      try {
        await repository.recordAction({
          callId: context.callId,
          type: 'transferred',
          status: 'success',
          payloadJson: { reason: parsed.data.reason, mocked: 'true' },
        });

        return { ok: true, data: { transferred: true } };
      } catch {
        return failure(
          'TRANSFER_FAILED',
          'a human transfer could not be started',
        );
      }
    },
  };
}
