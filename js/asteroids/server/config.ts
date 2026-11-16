import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  TICK_RATE: z.coerce.number().int().min(10).max(120).default(30),
  SIMULATED_LAG_MS: z.coerce.number().int().min(0).max(2000).default(0),
  LOG_DIR: z.string().min(1).default('./logs'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ALLOWED_ORIGINS: z.string().default('*'),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(1000).default(10),
  MAX_ROOMS: z.coerce.number().int().min(1).max(200).default(20),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(256).default(32),
  GIT_SHA: z.string().min(1).default('dev')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server environment configuration:', parsed.error.format());
  process.exit(1);
}

const rawOrigins = parsed.data.ALLOWED_ORIGINS.trim();
const allowedOriginsList =
  rawOrigins === '*'
    ? ['*']
    : rawOrigins
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

export const config = {
  ...parsed.data,
  allowedOriginsList
} as const;