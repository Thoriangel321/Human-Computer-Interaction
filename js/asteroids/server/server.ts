import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { setupWebSocket, getRoomSummaries, rooms } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST_DIR = path.resolve(__dirname, '../client/dist');
const LOGS_DIR = path.resolve(process.cwd(), config.LOG_DIR);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg'
};

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const rawUrl = req.url ?? '/';
  const parsedUrl = new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/rooms') {
    sendJson(res, 200, getRoomSummaries());
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/logs/')) {
    const fileName = path.basename(pathname);
    if (!fileName.endsWith('.ndjson')) {
      sendJson(res, 400, { error: 'Invalid log filename' });
      return;
    }

    const fullLogPath = path.join(LOGS_DIR, fileName);
    if (!fullLogPath.startsWith(LOGS_DIR) || !fs.existsSync(fullLogPath)) {
      sendJson(res, 404, { error: 'Log file not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`
    });

    const readStream = fs.createReadStream(fullLogPath);
    readStream.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[HTTP] Stream error while reading log:', message);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Failed to stream log' });
      } else {
        res.destroy();
      }
    });
    readStream.pipe(res);
    return;
  }

  // Статичні файли клієнтської збірки (production)
  const safeSuffix = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(CLIENT_DIST_DIR, safeSuffix);

  if (!filePath.startsWith(CLIENT_DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(res, 404, { error: 'Not Found' });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(handleRequest);
const wss = new WebSocketServer({ server, path: '/ws' });

setupWebSocket(wss);

server.listen(config.PORT, config.HOST, () => {
  console.log(`Server running on http://${config.HOST}:${config.PORT} (TPS: ${config.TICK_RATE})`);
});

function gracefulShutdown(signal: string): void {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  for (const room of rooms.values()) {
    room.shutdown();
  }
  rooms.clear();

  wss.close(() => {
    server.close(() => {
      console.log('HTTP & WebSocket servers closed.');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));