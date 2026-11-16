import { pino, type Logger } from 'pino';
import { config } from './config.js';

export const logger: Logger = pino({
  level: config.LOG_LEVEL,
  base: {
    service: 'space-game-server',
    gitSha: config.GIT_SHA
  },
  redact: {
    paths: [
      'password',
      'secret',
      'token',
      'authorization',
      'cookie',
      '*.password',
      '*.secret',
      '*.token'
    ],
    censor: '[REDACTED]'
  }
});

export function createRoomLogger(roomId: string): Logger {
  return logger.child({ roomId });
}

export function createPlayerLogger(roomId: string, playerId: number): Logger {
  return logger.child({ roomId, playerId });
}