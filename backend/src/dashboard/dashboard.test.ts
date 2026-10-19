import { describe, expect, it } from 'vitest';

import { maskPhoneNumber } from '../logger.js';

describe('dashboard data safety', () => {
  it('masks phone numbers before returning them to the dashboard', () => {
    expect(maskPhoneNumber('+15551234567')).toBe('***4567');
  });
});
