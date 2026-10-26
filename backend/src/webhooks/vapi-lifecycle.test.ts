import { describe, expect, it } from 'vitest';

import {
  calculateDurationSec,
  findMissingArtifactMessages,
  mapEndedReasonToStatus,
  parseVapiDate,
} from './vapi-lifecycle.js';

describe('Vapi call lifecycle', () => {
  it('parses valid provider timestamps and rejects invalid values', () => {
    expect(parseVapiDate('2026-10-26T10:00:00.000Z')?.toISOString()).toBe(
      '2026-10-26T10:00:00.000Z',
    );
    expect(parseVapiDate('not-a-date')).toBeNull();
    expect(parseVapiDate(undefined)).toBeNull();
  });

  it('calculates rounded non-negative call durations', () => {
    expect(
      calculateDurationSec(
        new Date('2026-10-26T10:00:00.000Z'),
        new Date('2026-10-26T10:01:15.400Z'),
      ),
    ).toBe(75);
    expect(
      calculateDurationSec(
        new Date('2026-10-26T10:01:00.000Z'),
        new Date('2026-10-26T10:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it.each([
    ['customer-ended-call', 'resolved'],
    ['assistant-ended-call', 'resolved'],
    ['assistant-forwarded-call', 'transferred'],
    ['customer-did-not-answer', 'abandoned'],
    ['silence-timed-out', 'abandoned'],
    ['call.start.error-get-assistant', 'failed'],
    ['pipeline-error-openai-llm-failed', 'failed'],
    ['future-unknown-reason', 'failed'],
    [undefined, 'failed'],
  ] as const)('maps ended reason %s to %s', (reason, status) => {
    expect(mapEndedReasonToStatus(reason)).toBe(status);
  });

  it('preserves legitimate repetitions while making report retries idempotent', () => {
    const artifact = [
      { role: 'caller' as const, text: 'Yes' },
      { role: 'caller' as const, text: 'Yes' },
      { role: 'agent' as const, text: 'Your appointment is booked.' },
    ];

    expect(
      findMissingArtifactMessages([{ role: 'caller', text: 'Yes' }], artifact),
    ).toEqual([
      { role: 'caller', text: 'Yes' },
      { role: 'agent', text: 'Your appointment is booked.' },
    ]);
    expect(findMissingArtifactMessages(artifact, artifact)).toEqual([]);
  });
});
