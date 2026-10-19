import type { AppConfig } from '../config.js';

type ResendClient = {
  sendConfirmation: (input: {
    to: string;
    customerName: string;
    appointmentId: string;
    startsAt: Date;
    endsAt: Date;
  }) => Promise<void>;
};

export function createResendClient(config: AppConfig): ResendClient | null {
  const configuredResend = config.resend;
  if (!configuredResend) return null;
  const settings = configuredResend;

  async function request(body: Record<string, unknown>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= settings.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${settings.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (response.status >= 500 && attempt < settings.retries) continue;
        if (!response.ok) {
          throw new Error(`Resend request failed (${response.status})`);
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt === settings.retries) throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Resend request failed');
  }

  return {
    async sendConfirmation({
      to,
      customerName,
      appointmentId,
      startsAt,
      endsAt,
    }) {
      await request({
        from: settings.from,
        to: [to],
        subject: 'Your AI automation agency appointment',
        html: `<p>Hello ${customerName},</p><p>Your appointment is booked for ${startsAt.toISOString()} to ${endsAt.toISOString()}.</p><p>Appointment ID: ${appointmentId}</p>`,
      });
    },
  };
}
