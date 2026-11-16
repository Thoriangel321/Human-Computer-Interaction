import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import type { Logger } from 'pino';
import { WebSocket } from 'ws';
import { createPlayerLogger, createRoomLogger } from './logger.js';
import { metrics } from './metrics.js';
import { createServerLoop, type ServerLoop } from './loop.js';
import { config } from './config.js';
import { World } from '../shared/world.js';
import { Asteroid, Ship, type InputKeys } from '../shared/entity.js';
import { Vector2 } from '../shared/math.js';
import { PRNG } from '../shared/random.js';
import { packSnapshot, type ServerJsonMessage } from '../shared/protocol.js';
import { toEntityId, toInputSeq, type EntityId, type InputSeq } from '../shared/types.js';

export interface RoomEvents {
  empty: [roomId: string];
  playerJoined: [roomId: string, playerId: EntityId, playerName: string];
  playerLeft: [roomId: string, playerId: EntityId];
}

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly players: number;
  readonly maxPlayers: number;
}

export interface RoomStepMetrics {
  readonly avgStepMs: number;
  readonly maxStepMs: number;
}

interface QueuedInput {
  readonly seq: InputSeq;
  readonly keys: InputKeys;
}

interface ClientSession {
  readonly ws: WebSocket;
  readonly playerId: EntityId;
  readonly playerName: string;
  readonly log: Logger;
  readonly ship: Ship;
  readonly inputQueue: QueuedInput[];
  lastKeys: InputKeys | null;
  lastSeq: InputSeq;
}

export class Room extends EventEmitter<RoomEvents> {
  public readonly id: string;
  public readonly name: string;
  public readonly maxPlayers: number;
  public readonly log: Logger;
  public readonly world: World;

  private readonly sessions = new Map<WebSocket, ClientSession>();
  private readonly seed: number;
  private readonly random: PRNG;
  private readonly loop: ServerLoop;
  private nextEntityId = 1;

  private stepSumMs = 0;
  private stepCount = 0;
  private maxStepMs = 0;

  constructor(id: string, name: string, maxPlayers: number) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.log = createRoomLogger(this.id);

    this.seed = Math.floor(Math.random() * 2147483647);
    this.random = new PRNG(this.seed);
    this.world = new World(800, 600, () => this.allocateEntityId(), this.random);
    this.log.info({ event: 'room_created', seed: this.seed }, 'Room created');

    this.spawnInitialAsteroids(6);

    this.loop = createServerLoop(config.TICK_RATE, (dt: number) => this.tick(dt));
  }

  private allocateEntityId(): EntityId {
    const id = this.nextEntityId;
    this.nextEntityId = id >= 60000 ? 100 : id + 1;
    return toEntityId(id);
  }

  private spawnInitialAsteroids(count: number): void {
    for (let i = 0; i < count; i++) {
      const id = this.allocateEntityId();
      const radius = Math.round(this.random.range(20, 32));
      const x = this.random.range(60, this.world.bounds.width - 60);
      const y = this.random.range(60, this.world.bounds.height - 60);
      const asteroid = new Asteroid(id, x, y, radius);

      const angle = this.random.range(0, Math.PI * 2);
      const speed = this.random.range(30, 75);
      asteroid.vel = new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      asteroid.angle = angle;

      this.world.spawn(asteroid);
    }
  }

  public get playerCount(): number {
    return this.sessions.size;
  }

  public getSummary(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      players: this.sessions.size,
      maxPlayers: this.maxPlayers
    };
  }

  public getStepMetrics(): RoomStepMetrics {
    return {
      avgStepMs: this.stepCount > 0 ? this.stepSumMs / this.stepCount : 0,
      maxStepMs: this.maxStepMs
    };
  }

  public hasClient(ws: WebSocket): boolean {
    return this.sessions.has(ws);
  }

  public addClient(ws: WebSocket, playerName: string): boolean {
    if (this.sessions.size >= this.maxPlayers) {
      ws.close(4000, 'Room is full');
      return false;
    }

    const playerId = this.allocateEntityId();
    const playerLog = createPlayerLogger(this.id, playerId);
    const x = this.random.range(150, 650);
    const y = this.random.range(150, 450);
    const ship = new Ship(playerId, x, y);
    this.world.spawn(ship);

    const session: ClientSession = {
      ws,
      playerId,
      playerName,
      log: playerLog,
      ship,
      inputQueue: [],
      lastKeys: null,
      lastSeq: toInputSeq(0)
    };

    this.sessions.set(ws, session);
    playerLog.info({ event: 'player_joined', playerName }, 'Player joined room');

    if (this.sessions.size === 1) {
      this.loop.start();
    }

    const joinedMsg: ServerJsonMessage = {
      type: 'joined',
      roomId: this.id,
      playerId,
      seed: this.seed,
      bounds: this.world.bounds
    };
    this.sendWithLag(ws, JSON.stringify(joinedMsg));

    const systemMsg: ServerJsonMessage = {
      type: 'system',
      text: `Player [${playerName}] joined`
    };
    this.broadcastJson(systemMsg);

    this.emit('playerJoined', this.id, playerId, playerName);

    ws.on('close', () => {
      this.removeClient(ws);
    });

    return true;
  }

  public removeClient(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    this.sessions.delete(ws);
    this.world.remove(session.playerId);
    session.log.info({ event: 'player_left', playerName: session.playerName }, 'Player left room');

    const leftMsg: ServerJsonMessage = {
      type: 'system',
      text: `Player [${session.playerName}] left`
    };
    this.broadcastJson(leftMsg);

    this.emit('playerLeft', this.id, session.playerId);

    if (this.sessions.size === 0) {
      this.loop.stop();
      this.stepSumMs = 0;
      this.stepCount = 0;
      this.maxStepMs = 0;
      this.emit('empty', this.id);
    }
  }

  public handleInput(ws: WebSocket, seq: InputSeq, keys: InputKeys): void {
    const enqueue = (): void => {
      const session = this.sessions.get(ws);
      if (!session) return;
      if (seq <= session.lastSeq && session.inputQueue.length === 0) return;

      if (session.inputQueue.length < 16) {
        session.inputQueue.push({ seq, keys });
      }
    };

    if (config.SIMULATED_LAG_MS <= 0) {
      enqueue();
    } else {
      setTimeout(enqueue, config.SIMULATED_LAG_MS);
    }
  }

  public handleChat(ws: WebSocket, text: string): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    session.log.info({ event: 'chat', playerName: session.playerName }, 'Chat message');
    const chatMsg: ServerJsonMessage = {
      type: 'chat',
      playerName: session.playerName,
      text
    };
    this.broadcastJson(chatMsg);
  }

  private tick(dt: number): void {
    const t0 = performance.now();

    for (const session of this.sessions.values()) {
      const nextInput = session.inputQueue.shift();
      let keysToApply: InputKeys | null = null;

      if (nextInput !== undefined) {
        keysToApply = nextInput.keys;
        session.lastKeys = nextInput.keys;
        if (nextInput.seq > session.lastSeq) {
          session.lastSeq = nextInput.seq;
        }
      } else {
        keysToApply = session.lastKeys;
      }

      if (keysToApply !== null) {
        session.ship.applyInput(keysToApply, dt);
        if (keysToApply.space) {
          this.world.tryFireBullet(session.ship);
        }
      }
    }

    this.world.step(dt);
    const state = this.world.createSnapshot();

    for (const session of this.sessions.values()) {
      if (session.ws.readyState !== WebSocket.OPEN) continue;
      if (session.ws.bufferedAmount > 65536) continue;

      const snapshotBuffer = packSnapshot(session.lastSeq, this.world.tick, state);
      this.sendWithLag(session.ws, snapshotBuffer);
    }

    const elapsed = performance.now() - t0;
    this.stepSumMs += elapsed;
    this.stepCount += 1;
    if (elapsed > this.maxStepMs) {
      this.maxStepMs = elapsed;
    }
  }

  private sendWithLag(ws: WebSocket, payload: string | ArrayBuffer): void {
    const byteLen = typeof payload === 'string' ? Buffer.byteLength(payload) : payload.byteLength;
    metrics.recordOutgoing(byteLen);

    if (config.SIMULATED_LAG_MS <= 0) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
      return;
    }

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }, config.SIMULATED_LAG_MS);
  }

  public broadcastJson(message: ServerJsonMessage, excludeWs: WebSocket | null = null): void {
    const payload = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      if (session.ws === excludeWs || session.ws.readyState !== WebSocket.OPEN) continue;
      this.sendWithLag(session.ws, payload);
    }
  }

  public shutdown(): void {
    this.loop.stop();
    const shutdownPayload = JSON.stringify({
      type: 'shutdown',
      reason: 'Server shutting down'
    } satisfies ServerJsonMessage);

    for (const session of this.sessions.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(shutdownPayload);
        session.ws.close(1001, 'Server shutting down');
      }
    }
    this.sessions.clear();
  }
}