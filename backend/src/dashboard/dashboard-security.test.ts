import { describe, expect, it } from 'vitest';

import {
  dashboardCookieHeader,
  dashboardLogoutCookieHeader,
  isDashboardTokenValid,
  readDashboardCookie,
} from './dashboard-security.js';

describe('dashboard security', () => {
  it('validates tokens without accepting a missing or different token', () => {
    expect(isDashboardTokenValid('secret', 'secret')).toBe(true);
    expect(isDashboardTokenValid('wrong', 'secret')).toBe(false);
    expect(isDashboardTokenValid(null, 'secret')).toBe(false);
  });

  it('creates and reads an HTTP-only session cookie', () => {
    const header = dashboardCookieHeader('secret value', false);

    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(readDashboardCookie(header)).toBe('secret value');
    expect(dashboardLogoutCookieHeader(false)).toContain('Max-Age=0');
  });
});
