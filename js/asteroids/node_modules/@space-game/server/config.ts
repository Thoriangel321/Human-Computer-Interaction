import { z } from 'zod';

const EnvConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  TICK_RATE: z.coerce.number().int().min(1).max(120).default(30),
  SIMULATED_LAG_MS: z.coerce.number().int().min(0).max(2000).default(100),
  LOG_DIR: z.string().min(1).default('logs')
});

export type ServerConfig = z.infer<typeof EnvConfigSchema>;

function loadConfig(): ServerConfig {
  const result = EnvConfigSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

export const config: ServerConfig = loadConfig();