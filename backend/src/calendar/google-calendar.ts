import type { AppConfig } from '../config.js';

type BusyPeriod = { start: string; end: string };

type GoogleCalendarClient = {
  listBusy: (timeMin: Date, timeMax: Date) => Promise<BusyPeriod[]>;
  createEvent: (input: {
    start: Date;
    end: Date;
    name: string;
    phone: string;
  }) => Promise<string>;
  deleteEvent: (eventId: string) => Promise<void>;
};

type TokenResponse = { access_token: string; expires_in: number };

export function createGoogleCalendarClient(
  config: AppConfig,
): GoogleCalendarClient | null {
  const configuredCalendar = config.googleCalendar;
  if (!configuredCalendar) {
    return null;
  }
  const settings = configuredCalendar;

  let accessToken: string | null = null;
  let tokenExpiresAt = 0;

  async function fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= settings.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });
        if (response.status >= 500 && attempt < settings.retries) {
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === settings.retries) {
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Google Calendar request failed');
  }

  async function getAccessToken(): Promise<string> {
    if (accessToken && Date.now() < tokenExpiresAt) {
      return accessToken;
    }

    const response = await fetchWithRetry(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          refresh_token: settings.refreshToken,
          grant_type: 'refresh_token',
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Google OAuth token request failed (${response.status})`);
    }
    const token = (await response.json()) as TokenResponse;
    accessToken = token.access_token;
    tokenExpiresAt = Date.now() + Math.max(token.expires_in - 60, 1) * 1000;
    return accessToken;
  }

  async function request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetchWithRetry(
      `https://www.googleapis.com/calendar/v3${path}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${await getAccessToken()}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Google Calendar request failed (${response.status})`);
    }
    return response;
  }

  return {
    async listBusy(timeMin, timeMax) {
      const response = await request('/freeBusy', {
        method: 'POST',
        body: JSON.stringify({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          timeZone: settings.timeZone,
          items: [{ id: settings.calendarId }],
        }),
      });
      const body = (await response.json()) as {
        calendars?: Record<string, { busy?: BusyPeriod[] }>;
      };
      return body.calendars?.[settings.calendarId]?.busy ?? [];
    },

    async createEvent({ start, end, name, phone }) {
      const response = await request(
        `/calendars/${encodeURIComponent(settings.calendarId)}/events`,
        {
          method: 'POST',
          body: JSON.stringify({
            summary: `AI Voice Agent appointment - ${name}`,
            description: `Caller phone: ${phone}`,
            start: {
              dateTime: start.toISOString(),
              timeZone: settings.timeZone,
            },
            end: { dateTime: end.toISOString(), timeZone: settings.timeZone },
          }),
        },
      );
      const body = (await response.json()) as { id?: string };
      if (!body.id) {
        throw new Error('Google Calendar event response did not include an ID');
      }
      return body.id;
    },

    async deleteEvent(eventId) {
      await request(
        `/calendars/${encodeURIComponent(settings.calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' },
      );
    },
  };
}
