import { EventEmitter } from 'node:events';
import { MatchLogger } from './logger.js';

export class Room extends EventEmitter {
  constructor(id, name, maxPlayers) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.clients = new Set();

    this.logger = new MatchLogger(this.id);
  }

  get playerCount() {
    return this.clients.size;
  }

  addClient(ws, playerName) {
    if (this.clients.size >= this.maxPlayers) {
      ws.close(4000, 'Room is full');
      return false;
    }
    
    ws.playerName = playerName;
    ws.roomId = this.id;
    this.clients.add(ws);


    this.broadcast({ type: 'system', text: `Player [${playerName}] joined` });
    
    ws.on('close', () => this.removeClient(ws));
    return true;
  }

  removeClient(ws) {
    if (!this.clients.has(ws)) return;
    this.clients.delete(ws);
    
    this.broadcast({ type: 'system', text: `Player [${ws.playerName}] left` });
    
    if (this.clients.size === 0) {
      this.logger.close();
      this.emit('empty', this.id);
    }
  }

  broadcast(messageObj, excludeWs = null) {

    this.logger.log(messageObj);

    const payload = JSON.stringify(messageObj);
    
    for (const client of this.clients) {
      if (client === excludeWs || client.readyState !== 1) continue; 
      
      if (client.bufferedAmount > 16384 && messageObj.type !== 'system') {
        continue; 
      }
      
      client.send(payload);
    }
  }
}