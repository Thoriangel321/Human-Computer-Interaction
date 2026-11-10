import http from 'node:http';
import { WebSocketServer } from 'ws';
import { join, normalize, extname } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { config } from './config.js';
import { rooms, setupWebSocket } from './socket.js';
import { replayMatch } from './logger.js';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.ndjson': 'application/x-ndjson'
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  if (req.method === 'GET' && req.url === '/api/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const roomList = Array.from(rooms.values()).map(r => ({
      id: r.id,
      name: r.name,
      players: r.playerCount,
      maxPlayers: r.maxPlayers
    }));
    return res.end(JSON.stringify(roomList));
  }

  if (req.method === 'GET' && req.url.startsWith('/api/replay/')) {
    const roomId = req.url.split('/').pop();
    return replayMatch(roomId, res);
  }

  if (req.method === 'GET') {
    if (req.url.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }

    let filePath = join(process.cwd(), '../client/dist', normalize(req.url === '/' ? '/index.html' : req.url));

    try {
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
      
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      
      createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
});


const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

const shutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down');
  }
  
  for (const room of rooms.values()) {
    room.logger.close();
  }
  
  server.close(() => {
    console.log('HTTP server closed. Logs flushed.');
    process.exit(0); // Успішний вихід
  });

  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT')); 
process.on('SIGTERM', () => shutdown('SIGTERM')); 

server.listen(config.port, () => {
  console.log(`Node.js Server running on http://localhost:${config.port}`);
});