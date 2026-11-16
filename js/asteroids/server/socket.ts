import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { config } from './config.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { Room } from './room.js';
import {
  parseClientMessage,
  unpackInput,
  USE_BINARY
} from '../shared/protocol.js';
import { assertNever, toInputSeq } from '../shared/types.js';

interface AliveWebSocket extends WebSocket {
  isAlive?: boolean;
  clientIp?: string;
  invalidFramesInWindow?: number;
  windowStartMs?: number;
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function isOriginAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (config.allowedOriginsList.includes('*')) {
    return true;
  }
  if (typeof origin !== 'string' || origin.length === 0) {
    return false;
  }
  if (config.allowedOriginsList.includes(origin)) {
    return true;
  }
  const host = req.headers.host;
  if (typeof host === 'string') {
    try {
      const parsed = new URL(origin);
      if (parsed.host === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function findRoomByClient(rooms: Map<string, Room>, ws: WebSocket): Room | null {
  for (const room of rooms.values()) {
    if (room.hasClient(ws)) return room;
  }
  return null;
}

function rawDataToUint8Array(data: RawData): Uint8Array | null {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    const merged = Buffer.concat(data);
    return new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
  }
  return null;
}

export function attachWebSocket(
  server: HttpServer,
  rooms: Map<string, Room>,
  isShuttingDown: () => boolean
): WebSocketServer {
  const connectionsByIp = new Map<string, number>();

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 2048,
    verifyClient: (info, done) => {
      if (isShuttingDown()) {
        done(false, 503, 'Server shutting down');
        return;
      }

      if (!isOriginAllowed(info.req)) {
        logger.warn({ origin: info.req.headers.origin }, 'Rejected WebSocket due to disallowed Origin');
        done(false, 403, 'Forbidden Origin');
        return;
      }

      const ip = getClientIp(info.req);
      const current = connectionsByIp.get(ip) ?? 0;
      if (current >= config.MAX_CONNECTIONS_PER_IP) {
        logger.warn({ ip, current }, 'Rejected WebSocket due to per-IP connection limit');
        done(false, 429, 'Too many connections from this IP');
        return;
      }

      done(true);
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const client = ws as AliveWebSocket;
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 15000);
  heartbeat.unref();

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws: AliveWebSocket, req: IncomingMessage) => {
    const ip = getClientIp(req);
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);

    ws.isAlive = true;
    ws.clientIp = ip;
    ws.invalidFramesInWindow = 0;
    ws.windowStartMs = Date.now();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      const count = connectionsByIp.get(ip) ?? 1;
      if (count <= 1) {
        connectionsByIp.delete(ip);
      } else {
        connectionsByIp.set(ip, count - 1);
      }
    });

    const recordInvalidFrame = (reason: string): boolean => {
      const now = Date.now();
      if (ws.windowStartMs === undefined || now - ws.windowStartMs >= 1000) {
        ws.windowStartMs = now;
        ws.invalidFramesInWindow = 0;
      }
      ws.invalidFramesInWindow = (ws.invalidFramesInWindow ?? 0) + 1;

      if (ws.invalidFramesInWindow >= 15) {
        logger.warn({ ip, reason }, 'Disconnecting client flooding invalid frames');
        ws.close(1008, 'Protocol violation: invalid frame flood');
        return true;
      }
      return false;
    };

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isShuttingDown()) return;

      const bytes = rawDataToUint8Array(data);
      if (bytes === null) {
        recordInvalidFrame('unreadable_payload');
        return;
      }

      metrics.recordIncoming(bytes.byteLength);

      if (isBinary) {
        if (!USE_BINARY) return;

        const decoded = unpackInput(bytes);
        if (!decoded.ok) {
          recordInvalidFrame(decoded.error);
          return;
        }

        const room = findRoomByClient(rooms, ws);
        if (room !== null) {
          room.handleInput(ws, decoded.data.seq, decoded.data.keys);
        }
        return;
      }

      const parsed = parseClientMessage(bytes);
      if (!parsed.ok) {
        recordInvalidFrame(parsed.error);
        return;
      }

      const msg = parsed.data;

      switch (msg.type) {
        case 'join': {
          let room = rooms.get(msg.roomId);
          if (room === undefined) {
            if (rooms.size >= config.MAX_ROOMS) {
              ws.close(4001, 'Server room limit reached');
              return;
            }
            const createdRoom = new Room(msg.roomId, `Room ${msg.roomId}`, config.MAX_PLAYERS_PER_ROOM);
            createdRoom.on('empty', (emptyId) => {
              if (emptyId !== 'room1' && emptyId !== 'room2') {
                rooms.delete(emptyId);
              }
            });
            rooms.set(msg.roomId, createdRoom);
            room = createdRoom;
          }

          if (!room.hasClient(ws)) {
            room.addClient(ws, msg.playerName);
          }
          break;
        }
        case 'chat': {
          const room = findRoomByClient(rooms, ws);
          if (room !== null) {
            room.handleChat(ws, msg.text);
          }
          break;
        }
        case 'input': {
          const room = findRoomByClient(rooms, ws);
          if (room !== null) {
            room.handleInput(ws, toInputSeq(msg.seq), msg.keys);
          }
          break;
        }
        default:
          assertNever(msg);
      }
    });
  });

  return wss;
}