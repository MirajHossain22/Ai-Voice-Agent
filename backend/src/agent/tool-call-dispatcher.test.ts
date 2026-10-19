import { describe, expect, it, vi } from 'vitest';

import { dispatchToolCalls } from './tool-call-dispatcher.js';
import type { ToolRepository } from './tools/types.js';

function repository(): ToolRepository {
  return {
    findLocalCallId: vi
      .fn()
      .mockResolvedValue('00000000-0000-0000-0000-000000000001'),
    listAvailableSlots: vi.fn().mockResolvedValue([]),
    findAvailableSlot: vi.fn().mockResolvedValue(null),
    findCustomerByPhone: vi.fn().mockResolvedValue(null),
    createAppointment: vi.fn(),
    findAppointment: vi.fn().mockResolvedValue(null),
    recordAction: vi.fn().mockResolvedValue(undefined),
  };
}

describe('tool-call dispatcher', () => {
  it('returns Vapi results for known and unknown tools', async () => {
    const result = await dispatchToolCalls(repository(), 'provider-call-1', [
      {
        id: 'tool-1',
        function: {
          name: 'lookup_customer',
          arguments: { phone: '+15550000002' },
        },
      },
      {
        id: 'tool-2',
        function: { name: 'unknown_tool', arguments: {} },
      },
    ]);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      name: 'lookup_customer',
      toolCallId: 'tool-1',
    });
    expect(JSON.parse(result.results[1].result)).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_TOOL' },
    });
  });

  it('returns a structured error when the call is unknown', async () => {
    const repo = repository();
    vi.mocked(repo.findLocalCallId).mockResolvedValue(null);

    const result = await dispatchToolCalls(repo, 'missing-call', [
      {
        id: 'tool-1',
        function: { name: 'lookup_customer', arguments: {} },
      },
    ]);

    expect(JSON.parse(result.results[0].result)).toMatchObject({
      ok: false,
      error: { code: 'CALL_NOT_FOUND' },
    });
  });
});
