import { describe, expect, it, vi } from 'vitest';

import { createAgentTools } from './handlers.js';
import type { ToolRepository } from './types.js';

function repository(overrides: Partial<ToolRepository> = {}): ToolRepository {
  return {
    findLocalCallId: vi.fn().mockResolvedValue(context.callId),
    listAvailableSlots: vi.fn().mockResolvedValue([]),
    findAvailableSlot: vi.fn().mockResolvedValue(null),
    findCustomerByPhone: vi.fn().mockResolvedValue(null),
    createAppointment: vi.fn(),
    findAppointment: vi.fn().mockResolvedValue(null),
    recordAction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const context = { callId: '00000000-0000-0000-0000-000000000001' };

describe('agent tools', () => {
  it('returns available slots for a valid date', async () => {
    const repo = repository({
      listAvailableSlots: vi.fn().mockResolvedValue([
        {
          id: 'slot-1',
          startsAt: new Date('2026-02-01T15:00:00.000Z'),
          endsAt: new Date('2026-02-01T15:30:00.000Z'),
        },
      ]),
    });
    const tools = createAgentTools(repo, context);

    await expect(
      tools.check_availability({ date: '2026-02-01' }),
    ).resolves.toEqual({
      ok: true,
      data: [
        {
          id: 'slot-1',
          start_time: '2026-02-01T15:00:00.000Z',
          end_time: '2026-02-01T15:30:00.000Z',
        },
      ],
    });
  });

  it('rejects invalid input for every tool', async () => {
    const tools = createAgentTools(repository(), context);

    await expect(
      tools.check_availability({ date: 'tomorrow' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    await expect(tools.book_appointment({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    await expect(tools.lookup_customer({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    await expect(
      tools.send_confirmation({ appointment_id: 'bad' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    await expect(tools.transfer_to_human({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('reports unavailable slots without claiming a booking', async () => {
    const repo = repository();
    const tools = createAgentTools(repo, context);

    await expect(
      tools.book_appointment({
        name: 'Caller',
        phone: '+15550000002',
        start_time: '2026-02-01T15:00:00.000Z',
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'SLOT_UNAVAILABLE',
        message: 'that appointment slot is not available',
      },
    });
    expect(repo.createAppointment).not.toHaveBeenCalled();
  });

  it('fails the second attempt to book the same slot', async () => {
    let slotAvailable = true;
    const slot = {
      id: 'slot-1',
      startsAt: new Date('2026-02-01T15:00:00.000Z'),
      endsAt: new Date('2026-02-01T15:30:00.000Z'),
    };
    const repo = repository({
      findAvailableSlot: vi.fn().mockImplementation(async () => {
        return slotAvailable ? slot : null;
      }),
      createAppointment: vi.fn().mockImplementation(async () => {
        if (!slotAvailable) {
          throw new Error('slot was already booked');
        }

        slotAvailable = false;
        return {
          id: 'appointment-1',
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
        };
      }),
    });
    const tools = createAgentTools(repo, context);
    const input = {
      name: 'Caller',
      phone: '+15550000002',
      start_time: '2026-02-01T15:00:00.000Z',
    };

    await expect(tools.book_appointment(input)).resolves.toMatchObject({
      ok: true,
    });
    await expect(tools.book_appointment(input)).resolves.toEqual({
      ok: false,
      error: {
        code: 'SLOT_UNAVAILABLE',
        message: 'that appointment slot is not available',
      },
    });
  });

  it('looks up customers and returns null when absent', async () => {
    const repo = repository({
      findCustomerByPhone: vi.fn().mockResolvedValue(null),
    });
    const tools = createAgentTools(repo, context);

    await expect(
      tools.lookup_customer({ phone: '+15550000002' }),
    ).resolves.toEqual({ ok: true, data: null });
  });

  it('records mocked confirmation and transfer actions', async () => {
    const appointmentId = '11111111-1111-4111-8111-111111111111';
    const repo = repository({
      findAppointment: vi.fn().mockResolvedValue({
        id: appointmentId,
        callId: context.callId,
      }),
    });
    const tools = createAgentTools(repo, context);

    await expect(
      tools.send_confirmation({ appointment_id: appointmentId }),
    ).resolves.toEqual({ ok: true, data: { sent: true } });
    await expect(
      tools.transfer_to_human({ reason: 'Caller requested a specialist' }),
    ).resolves.toEqual({ ok: true, data: { transferred: true } });
    expect(repo.recordAction).toHaveBeenCalledTimes(2);
  });

  it('returns explicit failure results from repository errors', async () => {
    const repo = repository({
      listAvailableSlots: vi.fn().mockRejectedValue(new Error('database down')),
      recordAction: vi.fn().mockRejectedValue(new Error('mock failed')),
    });
    const tools = createAgentTools(repo, context);

    await expect(
      tools.check_availability({ date: '2026-02-01' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AVAILABILITY_LOOKUP_FAILED' },
    });
    await expect(
      tools.transfer_to_human({ reason: 'Need help' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'TRANSFER_FAILED' },
    });
  });
});
