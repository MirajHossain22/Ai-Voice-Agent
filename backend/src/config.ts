import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'),
});

const environmentSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    HOST: z.string().min(1).default('127.0.0.1'),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    RECORDING_NOTICE: z
      .string()
      .min(1)
      .default('This call may be recorded and processed by AI.'),
    DASHBOARD_TOKEN: z.string().min(1),
    DASHBOARD_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
    VAPI_WEBHOOK_TOKEN: z.string().min(1),
    GOOGLE_CALENDAR_ENABLED: z.coerce.boolean().default(false),
    GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
    GOOGLE_CALENDAR_TIME_ZONE: z.string().min(1).default('UTC'),
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_OAUTH_REFRESH_TOKEN: z.string().min(1).optional(),
    GOOGLE_CALENDAR_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30000)
      .default(5000),
    GOOGLE_CALENDAR_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    HUBSPOT_ENABLED: z.coerce.boolean().default(false),
    HUBSPOT_ACCESS_TOKEN: z.string().min(1).optional(),
    HUBSPOT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30000)
      .default(5000),
    HUBSPOT_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    RESEND_ENABLED: z.coerce.boolean().default(false),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM: z.string().email().optional(),
    RESEND_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30000)
      .default(5000),
    RESEND_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  })
  .superRefine((value, context) => {
    if (
      value.GOOGLE_CALENDAR_ENABLED &&
      (!value.GOOGLE_CALENDAR_ID ||
        !value.GOOGLE_OAUTH_CLIENT_ID ||
        !value.GOOGLE_OAUTH_CLIENT_SECRET ||
        !value.GOOGLE_OAUTH_REFRESH_TOKEN)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Google Calendar requires calendar ID, OAuth client ID, client secret, and refresh token',
        path: ['GOOGLE_CALENDAR_ENABLED'],
      });
    }
    if (value.RESEND_ENABLED && (!value.RESEND_API_KEY || !value.RESEND_FROM)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Resend requires an API key and sender email',
        path: ['RESEND_ENABLED'],
      });
    }
  });

export type AppConfig = Readonly<{
  databaseUrl: string;
  host: string;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  recordingNotice: string;
  dashboardToken: string;
  dashboardOrigin: string;
  vapiWebhookToken: string;
  googleCalendar?: {
    calendarId: string;
    timeZone: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    timeoutMs: number;
    retries: number;
  };
  hubspot?: {
    accessToken: string;
    timeoutMs: number;
    retries: number;
  };
  resend?: {
    apiKey: string;
    from: string;
    timeoutMs: number;
    retries: number;
  };
  gemini?: {
    apiKey: string;
    model: string;
  };
}>;

export function loadConfig(): AppConfig {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    databaseUrl: result.data.DATABASE_URL,
    host: result.data.HOST,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    recordingNotice: result.data.RECORDING_NOTICE,
    dashboardToken: result.data.DASHBOARD_TOKEN,
    dashboardOrigin: result.data.DASHBOARD_ORIGIN,
    vapiWebhookToken: result.data.VAPI_WEBHOOK_TOKEN,
    ...(result.data.GEMINI_API_KEY
      ? {
          gemini: {
            apiKey: result.data.GEMINI_API_KEY,
            model: result.data.GEMINI_MODEL,
          },
        }
      : {}),
    ...(result.data.GOOGLE_CALENDAR_ENABLED
      ? {
          googleCalendar: {
            calendarId: result.data.GOOGLE_CALENDAR_ID!,
            timeZone: result.data.GOOGLE_CALENDAR_TIME_ZONE,
            clientId: result.data.GOOGLE_OAUTH_CLIENT_ID!,
            clientSecret: result.data.GOOGLE_OAUTH_CLIENT_SECRET!,
            refreshToken: result.data.GOOGLE_OAUTH_REFRESH_TOKEN!,
            timeoutMs: result.data.GOOGLE_CALENDAR_TIMEOUT_MS,
            retries: result.data.GOOGLE_CALENDAR_RETRIES,
          },
        }
      : {}),
    ...(result.data.HUBSPOT_ENABLED
      ? {
          hubspot: {
            accessToken: result.data.HUBSPOT_ACCESS_TOKEN!,
            timeoutMs: result.data.HUBSPOT_TIMEOUT_MS,
            retries: result.data.HUBSPOT_RETRIES,
          },
        }
      : {}),
    ...(result.data.RESEND_ENABLED
      ? {
          resend: {
            apiKey: result.data.RESEND_API_KEY!,
            from: result.data.RESEND_FROM!,
            timeoutMs: result.data.RESEND_TIMEOUT_MS,
            retries: result.data.RESEND_RETRIES,
          },
        }
      : {}),
  };
}
