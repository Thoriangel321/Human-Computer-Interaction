import './style.css';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { loadAll } from './loading.js';
import { initAudio, playLaserSound } from './audio.js';
import { getAudioContext, type LoadedAssets } from './assets.js';
import { Lobby } from './lobby.js';
import { GameSocket, type IncomingSocketPayload } from './network.js';
import { World, type SnapshotEntity } from '../../shared/world.js';
import { Asteroid, Bullet, Ship, type GameEntity, type InputKeys } from '../../shared/entity.js';
import { Vector2 } from '../../shared/math.js';
import { PRNG } from '../../shared/random.js';
import {
  packInput,
  parseServerJsonMessage,
  unpackSnapshot
} from '../../shared/protocol.js';
import {
  assertNever,
  toEntityId,
  toInputSeq,
  type EntityId,
  type InputSeq
} from '../../shared/types.js';

interface PendingInput {
  readonly seq: InputSeq;
  readonly keys: InputKeys;
}

interface TimedSnapshot {
  readonly receivedAt: number;
  readonly entities: ReadonlyMap<EntityId, SnapshotEntity>;
}

const FIXED_DT = 1 / 30;
const INTERPOLATION_DELAY_MS = 90;

function getRequiredElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Required element #${id} not found`);
  }
  return el;
}

const canvasEl = document.getElementById('game-canvas');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Required canvas #game-canvas not found');
}

const gameContainerEl = getRequiredElement('game-container');
const netgraphEl = getRequiredElement('netgraph');
const ngRttEl = getRequiredElement('ng-rtt');
const ngAgeEl = getRequiredElement('ng-age');
const ngBpsEl = getRequiredElement('ng-bps');
const ngQueueEl = getRequiredElement('ng-queue');
const ngErrEl = getRequiredElement('ng-err');
const errorOverlayEl = getRequiredElement('error-overlay');
const errorMessageEl = getRequiredElement('error-message');

const input = createInput();
const renderer = createRenderer(canvasEl);
const bounds = renderer.getBounds();

const world = new World(bounds.width, bounds.height);
export let globalAssets: LoadedAssets | null = null;
export let deterministicRng: PRNG | null = null;

let socket: GameSocket | null = null;
let myPlayerId: EntityId | null = null;
let myShip: Ship | null = null;
let myPrevPos = new Vector2(bounds.width / 2, bounds.height / 2);
let myPrevAngle = -Math.PI / 2;
let isJoined = false;
let hasReceivedInitialSpawn = false;

let inputSeq: InputSeq = toInputSeq(0);
let pendingInputs: PendingInput[] = [];
let posError = new Vector2(0, 0);
let localFireCooldown = 0;

const snapshotBuffer: TimedSnapshot[] = [];

// Метрики Netgraph
let bytesReceived = 0;
let rttMs = 0;
const inputSentTimestamps = new Map<InputSeq, number>();

let lastFrameTime = performance.now();
let accumulator = 0;

const unlockAudio = (): void => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
};
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

setInterval(() => {
  ngBpsEl.textContent = String(bytesReceived);
  bytesReceived = 0;
}, 1000);

const lobby = new Lobby();
lobby.show();

lobby.onJoin(({ roomId, playerName }) => {
  lobby.hide();
  gameContainerEl.style.display = 'block';
  void boot(roomId, playerName);
});

async function boot(roomId: string, playerName: string): Promise<void> {
  try {
    globalAssets = await loadAll('/assets/manifest.json', () => {}, new AbortController().signal);
    initAudio();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const clientSocket = new GameSocket(`${protocol}//${window.location.host}/ws`);
    socket = clientSocket;

    clientSocket.setHandlers({
      onOpen: () => {
        clientSocket.sendJson({ type: 'join', roomId, playerName });
      },
      onMessage: (payload: IncomingSocketPayload) => {
        void handleServerPayload(payload);
      }
    });

    clientSocket.connect();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errorMessageEl.textContent = message;
    errorOverlayEl.style.display = 'block';
  }
}

async function handleServerPayload(payload: IncomingSocketPayload): Promise<void> {
  if (payload.kind === 'binary') {
    const buffer =
      payload.data instanceof Blob ? await payload.data.arrayBuffer() : payload.data;
    bytesReceived += buffer.byteLength;

    const decoded = unpackSnapshot(buffer);
    if (!decoded.ok) {
      console.warn(`[Client] Dropped invalid snapshot: ${decoded.error}`);
      return;
    }

    const msg = decoded.data;
    const now = performance.now();

    const sentAt = inputSentTimestamps.get(msg.lastSeq);
    if (sentAt !== undefined) {
      rttMs = now - sentAt;
      ngRttEl.textContent = String(Math.round(rttMs));
      ngAgeEl.textContent = String(Math.round(rttMs / 2));
      inputSentTimestamps.delete(msg.lastSeq);
    }

    const entityMap = new Map<EntityId, SnapshotEntity>();
    for (const s of msg.state) {
      entityMap.set(s.id, s);

      if (myPlayerId !== null && s.id === myPlayerId && myShip !== null) {
        const beforeX = myShip.pos.x;
        const beforeY = myShip.pos.y;

        myShip.pos = new Vector2(s.x, s.y);
        myShip.vel = new Vector2(s.vx, s.vy);
        myShip.angle = s.a;

        const serverLastSeq = msg.lastSeq;
        pendingInputs = pendingInputs.filter((inp) => inp.seq > serverLastSeq);

        for (const pending of pendingInputs) {
          myShip.applyInput(pending.keys, FIXED_DT);
          myShip.update(FIXED_DT);
          clampShipToBounds(myShip);
        }

        if (!hasReceivedInitialSpawn) {
          hasReceivedInitialSpawn = true;
          myPrevPos = myShip.pos;
          myPrevAngle = myShip.angle;
          posError = new Vector2(0, 0);
        } else {
          const dx = beforeX - myShip.pos.x;
          const dy = beforeY - myShip.pos.y;
          // Великий стрибок (наприклад, респавн після знищення) застосовуємо одразу
          if (Math.hypot(dx, dy) > 120) {
            posError = new Vector2(0, 0);
            myPrevPos = myShip.pos;
          } else {
            posError = new Vector2(posError.x + dx, posError.y + dy);
          }
        }
      }
    }

    snapshotBuffer.push({ receivedAt: now, entities: entityMap });
    if (snapshotBuffer.length > 30) {
      snapshotBuffer.shift();
    }
    return;
  }

  const parsed = parseServerJsonMessage(payload.text);
  if (!parsed.ok) {
    console.warn(`[Client] Invalid server JSON: ${parsed.error}`);
    return;
  }

  const msg = parsed.data;
  switch (msg.type) {
    case 'joined': {
      myPlayerId = msg.playerId;
      deterministicRng = new PRNG(msg.seed);
      isJoined = true;
      hasReceivedInitialSpawn = false;
      netgraphEl.style.display = 'block';

      const ship = new Ship(msg.playerId, msg.bounds.width / 2, msg.bounds.height / 2);
      myShip = ship;
      myPrevPos = ship.pos;
      myPrevAngle = ship.angle;
      world.spawn(ship);

      lastFrameTime = performance.now();
      accumulator = 0;
      requestAnimationFrame(renderLoop);
      break;
    }
    case 'system':
      console.log(`[System] ${msg.text}`);
      break;
    case 'chat':
      console.log(`[Chat] ${msg.playerName}: ${msg.text}`);
      break;
    default:
      assertNever(msg);
  }
}

function clampShipToBounds(ship: Ship): void {
  let nx = ship.pos.x;
  let ny = ship.pos.y;
  let vx = ship.vel.x;
  let vy = ship.vel.y;

  if (nx < ship.radius) { nx = ship.radius; vx = 0; }
  if (nx > bounds.width - ship.radius) { nx = bounds.width - ship.radius; vx = 0; }
  if (ny < ship.radius) { ny = ship.radius; vy = 0; }
  if (ny > bounds.height - ship.radius) { ny = bounds.height - ship.radius; vy = 0; }

  if (nx !== ship.pos.x || ny !== ship.pos.y || vx !== ship.vel.x || vy !== ship.vel.y) {
    ship.pos = new Vector2(nx, ny);
    ship.vel = new Vector2(vx, vy);
  }
}

function stepLocalPrediction(): void {
  if (!isJoined || myShip === null || socket === null) return;

  myPrevPos = myShip.pos;
  myPrevAngle = myShip.angle;

  const keys = input.readKeys();
  inputSeq = toInputSeq(inputSeq + 1);
  inputSentTimestamps.set(inputSeq, performance.now());

  if (localFireCooldown > 0) {
    localFireCooldown = Math.max(0, localFireCooldown - FIXED_DT);
  }
  if (keys.space && localFireCooldown <= 0) {
    localFireCooldown = 0.22;
    playLaserSound();
  }

  const currentInput: PendingInput = { seq: inputSeq, keys };
  socket.sendBinary(packInput(inputSeq, keys));
  pendingInputs.push(currentInput);

  myShip.applyInput(keys, FIXED_DT);
  myShip.update(FIXED_DT);
  clampShipToBounds(myShip);
}

function interpolateAngle(a0: number, a1: number, t: number): number {
  let diff = a1 - a0;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a0 + diff * t;
}

function updateRemoteEntities(now: number): void {
  if (snapshotBuffer.length === 0) return;

  const renderTime = now - INTERPOLATION_DELAY_MS;

  // Видаляємо застарілі знімки, залишаючи принаймні один перед renderTime
  while (snapshotBuffer.length >= 2) {
    const second = snapshotBuffer[1];
    if (second !== undefined && second.receivedAt <= renderTime) {
      snapshotBuffer.shift();
    } else {
      break;
    }
  }

  const s0 = snapshotBuffer[0];
  if (s0 === undefined) return;
  const s1 = snapshotBuffer[1];

  let t = 0;
  if (s1 !== undefined && s1.receivedAt > s0.receivedAt) {
    t = Math.max(0, Math.min(1, (renderTime - s0.receivedAt) / (s1.receivedAt - s0.receivedAt)));
  }

  const activeSource = s1 ?? s0;
  const activeIds = new Set<EntityId>();

  for (const [id, snap1] of activeSource.entities.entries()) {
    if (myPlayerId !== null && id === myPlayerId) continue;
    activeIds.add(id);

    const snap0 = s0.entities.get(id);
    let x = snap1.x;
    let y = snap1.y;
    let a = snap1.a;

    if (snap0 !== undefined && s1 !== undefined) {
      x = snap0.x + (snap1.x - snap0.x) * t;
      y = snap0.y + (snap1.y - snap0.y) * t;
      a = interpolateAngle(snap0.a, snap1.a, t);
    }

    let entity = world.entities.get(id);
    if (!entity || entity.kind !== snap1.kind || entity.radius !== snap1.radius) {
      if (entity) world.remove(id);
      let created: GameEntity;
      switch (snap1.kind) {
        case 'ship':
          created = new Ship(snap1.id, x, y);
          break;
        case 'asteroid':
          created = new Asteroid(snap1.id, x, y, snap1.radius);
          break;
        case 'bullet':
          created = new Bullet(snap1.id, toEntityId(0), x, y, a, new Vector2(0, 0));
          break;
        default:
          return assertNever(snap1);
      }
      entity = created;
      world.spawn(entity);
    }

    entity.pos = new Vector2(x, y);
    entity.angle = a;
  }

  for (const id of world.entities.keys()) {
    if (myPlayerId !== null && id === myPlayerId) continue;
    if (!activeIds.has(id)) {
      world.remove(id);
    }
  }
}

function renderLoop(now: number): void {
  const frameDt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  accumulator += frameDt;

  while (accumulator >= FIXED_DT) {
    stepLocalPrediction();
    accumulator -= FIXED_DT;
  }

  const alpha = accumulator / FIXED_DT;

  updateRemoteEntities(now);

  let errX = posError.x * 0.85;
  let errY = posError.y * 0.85;
  if (Math.abs(errX) < 0.05) errX = 0;
  if (Math.abs(errY) < 0.05) errY = 0;
  posError = new Vector2(errX, errY);

  let savedPos: Vector2 | null = null;
  let savedAngle = 0;

  if (myShip !== null) {
    savedPos = myShip.pos;
    savedAngle = myShip.angle;

    const interpX = myPrevPos.x + (savedPos.x - myPrevPos.x) * alpha + posError.x;
    const interpY = myPrevPos.y + (savedPos.y - myPrevPos.y) * alpha + posError.y;
    const interpA = interpolateAngle(myPrevAngle, savedAngle, alpha);

    myShip.pos = new Vector2(interpX, interpY);
    myShip.angle = interpA;
  }

  ngQueueEl.textContent = String(pendingInputs.length);
  ngErrEl.textContent = posError.length().toFixed(1);

  renderer.render(world, myPlayerId);

  if (myShip !== null && savedPos !== null) {
    myShip.pos = savedPos;
    myShip.angle = savedAngle;
  }

  requestAnimationFrame(renderLoop);
}