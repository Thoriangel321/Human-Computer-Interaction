import { env } from 'node:process';
import { resolve } from 'node:path';

export const config = {
  port: parseInt(env.PORT || '3000', 10),
  logDir: resolve(env.LOG_DIR || './logs')
};

// Перевірка (валідація) конфігу
if (isNaN(config.port) || config.port < 1024 || config.port > 65535) {
  console.error('FATAL: Invalid PORT variable. Must be a number between 1024 and 65535.');
  process.exit(1);
}