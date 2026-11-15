import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { Room, type RoomSummary } from './room.js';
import { parseClientMessage, unpackInput } from '../shared/protocol.js';
import { assertNever, toInputSeq } from '../shared/types.js';

export const rooms = new Map<string, Room>();

export function createRoom(id: string, name: string, maxPlayers: number): Room {
  const room = new Room(id, name, maxPlayers);
  room.on('empty', (roomId: string) => {
    console.log(`[Room] Room "${roomId}" is empty and removed.`);
    rooms.delete(roomId);
  });
  rooms.set(id, room);
  return room;
}

export function getRoomSummaries(): RoomSummary[] {
  const list: RoomSummary[] = [];
  for (const room of rooms.values()) {
    list.push(room.getSummary());
  }
  return list;
}

createRoom('room1', 'Node.js Arena', 4);
createRoom('room2', 'Asteroid Belt', 8);

interface SocketConnectionState {
  isAlive: boolean;
  missedPongs: number;
  roomId: string | null;
  msgCount: number;
}

function normalizeRawData(data: RawData): Buffer | ArrayBuffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return data;
}

export function setupWebSocket(wss: WebSocketServer): void {
  const connectionStates = new Map<WebSocket, SocketConnectionState>();

  const pingInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const state = connectionStates.get(ws);
      if (!state) continue;

      if (!state.isAlive) {
        state.missedPongs += 1;
        if (state.missedPongs >= 2) {
          ws.terminate();
          continue;
        }
      }
      state.isAlive = false;
      ws.ping();
    }
  }, 15000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  wss.on('connection', (ws: WebSocket) => {
    const connState: SocketConnectionState = {
      isAlive: true,
      missedPongs: 0,
      roomId: null,
      msgCount: 0
    };
    connectionStates.set(ws, connState);

    ws.on('pong', () => {
      connState.isAlive = true;
      connState.missedPongs = 0;
    });

    const rateLimitInterval = setInterval(() => {
      connState.msgCount = 0;
    }, 1000);

    ws.on('close', () => {
      clearInterval(rateLimitInterval);
      connectionStates.delete(ws);
    });

    ws.on('message', (data: RawData, isBinary: boolean) => {
      connState.msgCount += 1;
      if (connState.msgCount > 45) {
        ws.close(4029, 'Rate limit exceeded');
        return;
      }

      const normalized = normalizeRawData(data);

      if (isBinary) {
        const decoded = unpackInput(normalized);
        if (!decoded.ok) {
          console.warn(`[WS] Invalid binary packet: ${decoded.error}`);
          ws.close(1007, 'Invalid binary protocol packet');
          return;
        }

        if (connState.roomId === null) return;
        const room = rooms.get(connState.roomId);
        if (room) {
          room.handleInput(ws, decoded.data.seq, decoded.data.keys);
        }
        return;
      }

      const byteLength =
        normalized instanceof ArrayBuffer ? normalized.byteLength : normalized.length;
      if (byteLength > 2048) {
        ws.close(1009, 'Message too big');
        return;
      }

      const parsed = parseClientMessage(normalized);
      if (!parsed.ok) {
        console.warn(`[WS] Invalid client JSON message: ${parsed.error}`);
        ws.close(1007, 'Invalid message format');
        return;
      }

      const msg = parsed.data;
      switch (msg.type) {
        case 'join': {
          if (connState.roomId !== null) return;

          let room = rooms.get(msg.roomId);
          if (!room && (msg.roomId === 'room1' || msg.roomId === 'room2')) {
            room = createRoom(
              msg.roomId,
              msg.roomId === 'room1' ? 'Node.js Arena' : 'Asteroid Belt',
              msg.roomId === 'room1' ? 4 : 8
            );
          }

          if (!room) {
            ws.close(4004, 'Room not found');
            return;
          }

          if (room.addClient(ws, msg.playerName)) {
            connState.roomId = room.id;
          }
          break;
        }

        case 'chat': {
          if (connState.roomId === null) return;
          const room = rooms.get(connState.roomId);
          if (room) {
            room.handleChat(ws, msg.text);
          }
          break;
        }

        case 'input': {
          if (connState.roomId === null) return;
          const room = rooms.get(connState.roomId);
          if (room) {
            room.handleInput(ws, toInputSeq(msg.seq), msg.keys);
          }
          break;
        }

        default:
          return assertNever(msg);
      }
    });
  });
}