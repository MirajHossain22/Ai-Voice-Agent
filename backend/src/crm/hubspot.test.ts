import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config.js';
import { createHubSpotClient } from './hubspot.js';

const config: AppConfig = {
  databaseUrl: 'postgresql://localhost/test',
  host: '127.0.0.1',
  nodeEnv: 'test',
  port: 3000,
  recordingNotice: 'notice',
  dashboardToken: 'dashboard',
  dashboardOrigin: 'http://127.0.0.1:5173',
  vapiWebhookToken: 'vapi',
  hubspot: {
    accessToken: 'token',
    timeoutMs: 5000,
    retries: 2,
  },
};

describe('HubSpot client', () => {
  it('searches and updates a contact by phone', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 'contact-1',
                properties: { firstname: 'Caller', phone: '+15550000000' },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 'contact-1',
                properties: { firstname: 'Caller', phone: '+15550000000' },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'contact-1',
            properties: { phone: '+15550000000' },
          }),
          { status: 200 },
        ),
      );
    const client = createHubSpotClient(config);
    await expect(client?.findContact('+15550000000')).resolves.toMatchObject({
      id: 'contact-1',
    });
    await expect(
      client?.syncContact({ name: 'Caller', phone: '+15550000000' }),
    ).resolves.toMatchObject({ id: 'contact-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'PATCH' });
    fetchMock.mockRestore();
  });

  it('is disabled without HubSpot configuration', () => {
    expect(createHubSpotClient({ ...config, hubspot: undefined })).toBeNull();
  });
});
