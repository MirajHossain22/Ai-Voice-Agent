import { describe, expect, it, vi } from 'vitest';

import { CallEventBus } from './call-events.js';

describe('CallEventBus', () => {
  it('publishes typed call updates and unsubscribes listeners', () => {
    const bus = new CallEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.publishCallUpdate('call-1', 'transcript');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call.updated',
        callId: 'call-1',
        change: 'transcript',
      }),
    );

    unsubscribe();
    bus.publishCallUpdate('call-1', 'status');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
