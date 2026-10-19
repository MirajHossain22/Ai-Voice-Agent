import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'),
});

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type AppConfig = Readonly<{
  databaseUrl: string;
  host: string;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
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
  };
}
