import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { Room } from './room.js';
import { RateLimiter } from './rateLimiter.js';
import {
  parseClientMessage,
  unpackInput,
  USE_BINARY
} from '../shared/protocol.js';
import { assertNever, toInputSeq } from '../shared/types.js';

interface AliveWebSocket extends WebSocket {
  isAlive?: boolean;
  clientKey?: string;
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

export function attachWebSocket(server: HttpServer, rooms: Map<string, Room>): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
  const rateLimiter = new RateLimiter(90, 60);
  let nextClientSeq = 1;

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

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws: AliveWebSocket) => {
    const clientKey = `client-${nextClientSeq++}`;
    ws.isAlive = true;
    ws.clientKey = clientKey;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      rateLimiter.remove(clientKey);
    });

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!rateLimiter.allow(clientKey)) {
        return;
      }

      if (isBinary) {
        if (!USE_BINARY) return;

        const bytes = rawDataToUint8Array(data);
        if (bytes === null) return;

        const decoded = unpackInput(bytes);
        if (!decoded.ok) {
          console.warn(`[WS] Invalid binary packet: ${decoded.error}`);
          return;
        }

        const room = findRoomByClient(rooms, ws);
        if (room !== null) {
          room.handleInput(ws, decoded.data.seq, decoded.data.keys);
        }
        return;
      }

      const bytes = rawDataToUint8Array(data);
      if (bytes === null) return;

      const parsed = parseClientMessage(bytes);
      if (!parsed.ok) {
        console.warn(`[WS] Invalid client JSON message: ${parsed.error}`);
        return;
      }

      const msg = parsed.data;

      switch (msg.type) {
        case 'join': {
          let room = rooms.get(msg.roomId);
          if (room === undefined) {
            room = new Room(msg.roomId, `Room ${msg.roomId}`, 256);
            rooms.set(msg.roomId, room);
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