import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { Room } from './room.js';
import { attachWebSocket } from './socket.js';

const clientDir = path.resolve(process.cwd(), 'client/dist');

const rooms = new Map<string, Room>();
rooms.set('room1', new Room('room1', 'Node.js Arena', config.MAX_PLAYERS_PER_ROOM));
rooms.set('room2', new Room('room2', 'Asteroid Belt', config.MAX_PLAYERS_PER_ROOM));

let shuttingDown = false;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav'
};

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function canAcceptPlayers(): boolean {
  if (shuttingDown) return false;
  for (const room of rooms.values()) {
    if (room.playerCount < room.maxPlayers) return true;
  }
  return rooms.size < config.MAX_ROOMS;
}

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const urlPath = (req.url ?? '/').split('?')[0] ?? '/';

  if (req.method === 'GET' && urlPath === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      gitSha: config.GIT_SHA,
      uptimeSec: Math.round(process.uptime())
    });
    return;
  }

  if (req.method === 'GET' && urlPath === '/ready') {
    const ready = canAcceptPlayers();
    sendJson(res, ready ? 200 : 503, {
      ready,
      shuttingDown,
      rooms: rooms.size
    });
    return;
  }

  if (req.method === 'GET' && urlPath === '/metrics') {
    sendJson(res, 200, metrics.getSnapshot(rooms));
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/rooms') {
    const list = Array.from(rooms.values()).map((room) => room.getSummary());
    sendJson(res, 200, list);
    return;
  }

  if (!fs.existsSync(clientDir)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Space Game TS Server is running. Run Vite dev server for client.');
    return;
  }

  const safePath = urlPath === '/' ? '/index.html' : urlPath;
  const resolvedPath = path.resolve(clientDir, `.${safePath}`);

  if (!resolvedPath.startsWith(clientDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolvedPath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(resolvedPath).pipe(res);
  });
});

const wss = attachWebSocket(server, rooms, () => shuttingDown);

server.listen(config.PORT, config.HOST, () => {
  logger.info(
    { port: config.PORT, host: config.HOST, gitSha: config.GIT_SHA },
    'Server started'
  );
});

function gracefulShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Received shutdown signal, closing rooms and sockets');

  const forceExitTimer = setTimeout(() => {
    logger.warn('Forced exit after shutdown timeout');
    logger.flush();
    process.exit(0);
  }, 8500);
  forceExitTimer.unref();

  for (const room of rooms.values()) {
    room.shutdown();
  }

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.close(1001, 'Server shutting down');
    }
  }

  wss.close(() => {
    server.close(() => {
      logger.info('HTTP and WebSocket servers closed cleanly');
      logger.flush();
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught exception, terminating process');
  logger.flush();
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ reason }, 'Unhandled promise rejection, terminating process');
  logger.flush();
  process.exit(1);
});