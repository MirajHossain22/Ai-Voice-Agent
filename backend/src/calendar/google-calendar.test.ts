import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config.js';
import { createGoogleCalendarClient } from './google-calendar.js';

const config: AppConfig = {
  databaseUrl: 'postgresql://localhost/test',
  host: '127.0.0.1',
  nodeEnv: 'test',
  port: 3000,
  recordingNotice: 'notice',
  dashboardToken: 'dashboard',
  dashboardOrigin: 'http://127.0.0.1:5173',
  vapiWebhookToken: 'vapi',
  googleCalendar: {
    calendarId: 'calendar@example.com',
    timeZone: 'UTC',
    clientId: 'client',
    clientSecret: 'secret',
    refreshToken: 'refresh',
    timeoutMs: 5000,
    retries: 2,
  },
};

describe('Google Calendar client', () => {
  it('uses OAuth refresh tokens for free/busy and event requests', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access', expires_in: 3600 }),
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            calendars: {
              'calendar@example.com': {
                busy: [
                  {
                    start: '2026-02-01T15:00:00.000Z',
                    end: '2026-02-01T15:30:00.000Z',
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'event-1' }), { status: 200 }),
      );

    const client = createGoogleCalendarClient(config);
    expect(client).not.toBeNull();
    await expect(
      client?.listBusy(
        new Date('2026-02-01T00:00:00.000Z'),
        new Date('2026-02-02T00:00:00.000Z'),
      ),
    ).resolves.toHaveLength(1);
    await expect(
      client?.createEvent({
        start: new Date('2026-02-01T16:00:00.000Z'),
        end: new Date('2026-02-01T16:30:00.000Z'),
        name: 'Caller',
        phone: '+15550000000',
      }),
    ).resolves.toBe('event-1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://www.googleapis.com/calendar/v3/freeBusy',
    );
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      headers: expect.objectContaining({ authorization: 'Bearer access' }),
    });
    fetchMock.mockRestore();
  });

  it('is disabled when calendar settings are absent', () => {
    expect(
      createGoogleCalendarClient({ ...config, googleCalendar: undefined }),
    ).toBeNull();
  });

  it('retries transient provider responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access', expires_in: 3600 }),
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            calendars: { 'calendar@example.com': { busy: [] } },
          }),
          { status: 200 },
        ),
      );

    const client = createGoogleCalendarClient(config);
    await expect(
      client?.listBusy(
        new Date('2026-02-01T00:00:00.000Z'),
        new Date('2026-02-02T00:00:00.000Z'),
      ),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });
});
