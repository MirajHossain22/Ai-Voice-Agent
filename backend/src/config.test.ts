import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

const requiredEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  DASHBOARD_TOKEN: 'dashboard-token',
  VAPI_WEBHOOK_TOKEN: 'vapi-token',
};

describe('environment configuration', () => {
  it('keeps integrations disabled when their flags are the string false', () => {
    const config = loadConfig({
      ...requiredEnvironment,
      GOOGLE_CALENDAR_ENABLED: 'false',
      HUBSPOT_ENABLED: 'false',
      RESEND_ENABLED: 'false',
    });

    expect(config.googleCalendar).toBeUndefined();
    expect(config.hubspot).toBeUndefined();
    expect(config.resend).toBeUndefined();
  });

  it('rejects unsupported boolean values', () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        GOOGLE_CALENDAR_ENABLED: 'yes',
      }),
    ).toThrow(/GOOGLE_CALENDAR_ENABLED/);
  });

  it('requires complete Google Calendar credentials when enabled', () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        GOOGLE_CALENDAR_ENABLED: 'true',
      }),
    ).toThrow(/Google Calendar requires/);
  });

  it('requires a HubSpot access token when enabled', () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        HUBSPOT_ENABLED: 'true',
      }),
    ).toThrow(/HubSpot requires/);
  });

  it('requires complete Resend credentials when enabled', () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        RESEND_ENABLED: 'true',
      }),
    ).toThrow(/Resend requires/);
  });

  it('enables integrations only with their required credentials', () => {
    const config = loadConfig({
      ...requiredEnvironment,
      GOOGLE_CALENDAR_ENABLED: 'true',
      GOOGLE_CALENDAR_ID: 'primary',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      HUBSPOT_ENABLED: 'true',
      HUBSPOT_ACCESS_TOKEN: 'hubspot-token',
      RESEND_ENABLED: 'true',
      RESEND_API_KEY: 'resend-key',
      RESEND_FROM: 'bookings@example.com',
    });

    expect(config.googleCalendar?.calendarId).toBe('primary');
    expect(config.hubspot?.accessToken).toBe('hubspot-token');
    expect(config.resend?.from).toBe('bookings@example.com');
  });
});
