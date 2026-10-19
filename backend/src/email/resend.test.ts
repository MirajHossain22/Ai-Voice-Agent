import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config.js';
import { createResendClient } from './resend.js';

const config: AppConfig = {
  databaseUrl: 'postgresql://localhost/test',
  host: '127.0.0.1',
  nodeEnv: 'test',
  port: 3000,
  recordingNotice: 'notice',
  dashboardToken: 'dashboard',
  dashboardOrigin: 'http://127.0.0.1:5173',
  vapiWebhookToken: 'vapi',
  resend: {
    apiKey: 're_test',
    from: 'bookings@example.com',
    timeoutMs: 5000,
    retries: 2,
  },
};

describe('Resend client', () => {
  it('sends a confirmation email using the documented API shape', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const client = createResendClient(config);

    await expect(
      client?.sendConfirmation({
        to: 'caller@example.com',
        customerName: 'Caller',
        appointmentId: 'appointment-1',
        startsAt: new Date('2026-02-01T15:00:00.000Z'),
        endsAt: new Date('2026-02-01T15:30:00.000Z'),
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer re_test',
        }),
      }),
    );
    fetchMock.mockRestore();
  });

  it('is disabled without Resend configuration', () => {
    expect(createResendClient({ ...config, resend: undefined })).toBeNull();
  });
});
