import { Room } from './room.js';

export const rooms = new Map();

export function createRoom(id, name, maxPlayers) {
  const room = new Room(id, name, maxPlayers);
  

  room.on('empty', (roomId) => {
    console.log(`Room ${roomId} is empty. Deleting...`);
    rooms.delete(roomId);
  });
  
  rooms.set(id, room);
  return room;
}

createRoom('room1', 'Node.js Arena', 4);
createRoom('room2', 'Asteroid Belt', 8);

export function setupWebSocket(wss) {
  const pingInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.missedPongs = (ws.missedPongs || 0) + 1;
        if (ws.missedPongs >= 2) return ws.terminate();
      }
      ws.isAlive = false; 
      ws.ping();
    }
  }, 15000);

  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.missedPongs = 0;
    
    ws.on('pong', () => {
      ws.isAlive = true;
      ws.missedPongs = 0;
    });

    let isJoined = false;
    const joinTimeout = setTimeout(() => {
      if (!isJoined) ws.close(4008, 'Join timeout: No join message in 5s');
    }, 5000);

    let msgCount = 0;
    const rateLimitInterval = setInterval(() => { msgCount = 0; }, 1000);
    ws.on('close', () => clearInterval(rateLimitInterval));

    ws.on('message', (data) => {
      if (data.length > 2048) return ws.close(1009, 'Message too big');

      // Перевищено ліміт
      if (++msgCount > 20) return ws.close(4029, 'Rate limit exceeded');

      let msg;
      try {
        msg = JSON.parse(data);
      } catch (err) {
        return ws.close(1007, 'Invalid JSON format');
      }

      if (!msg || typeof msg.type !== 'string') {
        return ws.close(1008, 'Unknown or missing message type');
      }

      switch (msg.type) {
        case 'join': {
          if (isJoined) return;
          const room = rooms.get(msg.roomId);
          if (!room) return ws.close(4004, 'Room not found');
          
          if (typeof msg.playerName !== 'string' || msg.playerName.length > 20) {
            return ws.close(1008, 'Invalid player name');
          }

          clearTimeout(joinTimeout);
          if (room.addClient(ws, msg.playerName)) {
            isJoined = true;
            ws.send(JSON.stringify({ type: 'joined', roomId: room.id }));
          }
          break;
        }
        
        case 'input': {
          if (!isJoined) return;
          const room = rooms.get(ws.roomId);
          if (room) {
            room.handleInput(ws, msg);
          }
          break;
        }

        case 'chat': {
          if (!isJoined) return ws.close(4001, 'Must join a room first');
          if (typeof msg.text !== 'string' || msg.text.length > 200) {
            return ws.close(1008, 'Invalid chat payload');
          }
          const room = rooms.get(ws.roomId);
          if (room) {
            room.broadcast({ type: 'chat', playerName: ws.playerName, text: msg.text });
          }
          break;
        }
        default:
          return ws.close(1008, `Unknown message type: ${msg.type}`);
      }
    });
  });
}