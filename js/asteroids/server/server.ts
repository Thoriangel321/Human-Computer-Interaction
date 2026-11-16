import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { Room } from './room.js';
import { attachWebSocket } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '../client/dist');

const rooms = new Map<string, Room>();
rooms.set('room1', new Room('room1', 'Node.js Arena', 256));
rooms.set('room2', new Room('room2', 'Asteroid Belt', 256));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav'
};

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const urlPath = req.url ?? '/';

  if (req.method === 'GET' && urlPath === '/api/rooms') {
    const list = Array.from(rooms.values()).map((room) => room.getSummary());
    sendJson(res, 200, list);
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/metrics') {
    const metrics = Array.from(rooms.values()).map((room) => room.getStepMetrics());
    sendJson(res, 200, { rooms: metrics });
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/metrics/reset') {
    for (const room of rooms.values()) {
      room.resetStepMetrics();
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && urlPath === '/health') {
    sendJson(res, 200, { status: 'ok', rooms: rooms.size });
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

attachWebSocket(server, rooms);

server.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT}`);
});

function gracefulShutdown(): void {
  console.log('Shutting down server...');
  for (const room of rooms.values()) {
    room.shutdown();
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);