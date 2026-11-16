import './style.css';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { loadAll } from './loading.js';
import { initAudio, playLaserSound } from './audio.js';
import { getAudioContext, type LoadedAssets } from './assets.js';
import { Lobby } from './lobby.js';
import { GameSocket, type IncomingSocketPayload } from './network.js';
import { ParticleSystem } from './particlePool.js';
import { FrameProfiler } from './profiler.js';
import {
  reconcileShipState,
  World,
  type PendingInputEntry,
  type SnapshotEntity
} from '../../shared/world.js';
import { Asteroid, Bullet, Ship, type GameEntity } from '../../shared/entity.js';
import { MutableVector2 } from '../../shared/math.js';
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

function getRequiredCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error(`Required canvas #${id} not found`);
  }
  return el;
}

function getRequiredInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Required input #${id} not found`);
  }
  return el;
}

function getRequiredButton(id: string): HTMLButtonElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Required button #${id} not found`);
  }
  return el;
}

const canvasEl = getRequiredCanvas('game-canvas');
const chatInputEl = getRequiredInput('chat-input');
const chatSendEl = getRequiredButton('chat-send');
const btnBotsEl = getRequiredButton('btn-bots');
const btnProfileEl = getRequiredButton('btn-profile');

const gameContainerEl = getRequiredElement('game-container');
const netgraphEl = getRequiredElement('netgraph');
const ngRttEl = getRequiredElement('ng-rtt');
const ngAgeEl = getRequiredElement('ng-age');
const ngBpsEl = getRequiredElement('ng-bps');
const ngQueueEl = getRequiredElement('ng-queue');
const ngErrEl = getRequiredElement('ng-err');
const ngP99El = getRequiredElement('ng-p99');
const profileReportEl = getRequiredElement('profile-report');
const chatMessagesEl = getRequiredElement('chat-messages');
const errorOverlayEl = getRequiredElement('error-overlay');
const errorMessageEl = getRequiredElement('error-message');

const input = createInput();
const renderer = createRenderer(canvasEl);
const bounds = renderer.getBounds();

const world = new World(bounds.width, bounds.height);
const particles = new ParticleSystem(256);
const profiler = new FrameProfiler(3600);

export let globalAssets: LoadedAssets | null = null;
export let deterministicRng: PRNG | null = null;

let currentRoomId = 'room1';
let socket: GameSocket | null = null;
let myPlayerId: EntityId | null = null;
let myShip: Ship | null = null;
const myPrevPos = new MutableVector2(bounds.width / 2, bounds.height / 2);
let myPrevAngle = -Math.PI / 2;
let isJoined = false;
let hasReceivedInitialSpawn = false;

let inputSeq: InputSeq = toInputSeq(0);
let pendingInputs: PendingInputEntry[] = [];
const posError = new MutableVector2(0, 0);
let localFireCooldown = 0;

const snapshotBuffer: TimedSnapshot[] = [];
const activeIdsScratch = new Set<EntityId>();

// 8 клієнтських ботів, які шлють реальні пакети input
const botSockets: GameSocket[] = [];
let botTimer: ReturnType<typeof setInterval> | null = null;

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
  const stats = profiler.computePercentiles();
  ngP99El.textContent = stats.p99.toFixed(1);
}, 1000);

function appendChatMessage(text: string): void {
  const line = document.createElement('div');
  line.textContent = text;
  chatMessagesEl.appendChild(line);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function sendChatFromInput(): void {
  const text = chatInputEl.value.trim();
  if (text.length === 0 || socket === null) return;
  socket.sendJson({ type: 'chat', text });
  chatInputEl.value = '';
}

chatSendEl.addEventListener('click', sendChatFromInput);
chatInputEl.addEventListener('keydown', (e: KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    sendChatFromInput();
  }
});

function toggleBots(): void {
  if (botSockets.length > 0) {
    if (botTimer !== null) {
      clearInterval(botTimer);
      botTimer = null;
    }
    for (const bot of botSockets) {
      bot.disconnect();
    }
    botSockets.length = 0;
    btnBotsEl.textContent = 'Bots: OFF';
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  for (let i = 0; i < 8; i++) {
    const bot = new GameSocket(wsUrl);
    bot.setHandlers({
      onOpen: () => {
        bot.sendJson({ type: 'join', roomId: currentRoomId, playerName: `Bot-${i + 1}` });
      }
    });
    bot.connect();
    botSockets.push(bot);
  }

  let botSeq = 1;
  botTimer = setInterval(() => {
    const seq = toInputSeq(botSeq++);
    for (let i = 0; i < botSockets.length; i++) {
      const bot = botSockets[i];
      if (bot === undefined) continue;
      const phase = (botSeq + i * 9) % 60;
      bot.sendBinary(
        packInput(seq, {
          up: phase < 38,
          left: phase >= 10 && phase < 25,
          right: phase >= 35 && phase < 50,
          space: phase % 18 === 0
        })
      );
    }
  }, 1000 / 30);

  btnBotsEl.textContent = 'Bots: 8 ON';
}

btnBotsEl.addEventListener('click', toggleBots);

btnProfileEl.addEventListener('click', () => {
  if (profiler.active) return;
  profiler.startSession(30000);
  btnProfileEl.textContent = 'Recording...';
  profileReportEl.textContent = 'Recording 30s frame times...';
});

const lobby = new Lobby();
lobby.show();

lobby.onJoin(({ roomId, playerName }) => {
  currentRoomId = roomId;
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
    for (let i = 0; i < msg.state.length; i++) {
      const s = msg.state[i];
      if (s === undefined) continue;
      entityMap.set(s.id, s);

      if (myPlayerId !== null && s.id === myPlayerId && myShip !== null) {
        const beforeX = myShip.pos.x;
        const beforeY = myShip.pos.y;

        pendingInputs = reconcileShipState(
          myShip,
          s,
          msg.lastSeq,
          pendingInputs,
          bounds,
          FIXED_DT
        );

        if (!hasReceivedInitialSpawn) {
          hasReceivedInitialSpawn = true;
          myPrevPos.copyFrom(myShip.pos);
          myPrevAngle = myShip.angle;
          posError.set(0, 0);
        } else {
          const dx = beforeX - myShip.pos.x;
          const dy = beforeY - myShip.pos.y;
          if (Math.hypot(dx, dy) > 120) {
            posError.set(0, 0);
            myPrevPos.copyFrom(myShip.pos);
          } else {
            posError.set(posError.x + dx, posError.y + dy);
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
      myPrevPos.copyFrom(ship.pos);
      myPrevAngle = ship.angle;
      world.spawn(ship);

      lastFrameTime = performance.now();
      accumulator = 0;
      requestAnimationFrame(renderLoop);
      break;
    }
    case 'system':
      appendChatMessage(`[System] ${msg.text}`);
      break;
    case 'chat':
      appendChatMessage(`${msg.playerName}: ${msg.text}`);
      break;
    default:
      assertNever(msg);
  }
}

function clampShipToBounds(ship: Ship): void {
  if (ship.pos.x < ship.radius) { ship.pos.x = ship.radius; ship.vel.x = 0; }
  if (ship.pos.x > bounds.width - ship.radius) { ship.pos.x = bounds.width - ship.radius; ship.vel.x = 0; }
  if (ship.pos.y < ship.radius) { ship.pos.y = ship.radius; ship.vel.y = 0; }
  if (ship.pos.y > bounds.height - ship.radius) { ship.pos.y = bounds.height - ship.radius; ship.vel.y = 0; }
}

function stepLocalPrediction(): void {
  if (!isJoined || myShip === null || socket === null) return;

  myPrevPos.copyFrom(myShip.pos);
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

  if (keys.up) {
    const exhaustX = myShip.pos.x - Math.cos(myShip.angle) * 14;
    const exhaustY = myShip.pos.y - Math.sin(myShip.angle) * 14;
    particles.emit(
      exhaustX,
      exhaustY,
      -Math.cos(myShip.angle) * 70,
      -Math.sin(myShip.angle) * 70,
      0.25,
      3,
      '#facc15'
    );
  }

  socket.sendBinary(packInput(inputSeq, keys));
  pendingInputs.push({ seq: inputSeq, keys });

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
  activeIdsScratch.clear();

  for (const [id, snap1] of activeSource.entities.entries()) {
    if (myPlayerId !== null && id === myPlayerId) continue;
    activeIdsScratch.add(id);

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
          created = new Bullet(snap1.id, toEntityId(0), x, y, a, myPrevPos);
          break;
        default:
          return assertNever(snap1);
      }
      entity = created;
      world.spawn(entity);
    }

    entity.pos.set(x, y);
    entity.angle = a;
  }

  for (const id of world.entities.keys()) {
    if (myPlayerId !== null && id === myPlayerId) continue;
    if (!activeIdsScratch.has(id)) {
      world.remove(id);
    }
  }
}

function renderLoop(now: number): void {
  const frameStart = performance.now();
  const frameDt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  accumulator += frameDt;

  while (accumulator >= FIXED_DT) {
    stepLocalPrediction();
    accumulator -= FIXED_DT;
  }

  const alpha = accumulator / FIXED_DT;

  updateRemoteEntities(now);
  particles.update(frameDt);

  let errX = posError.x * 0.85;
  let errY = posError.y * 0.85;
  if (Math.abs(errX) < 0.05) errX = 0;
  if (Math.abs(errY) < 0.05) errY = 0;
  posError.set(errX, errY);

  let savedPosX = 0;
  let savedPosY = 0;
  let savedAngle = 0;

  if (myShip !== null) {
    savedPosX = myShip.pos.x;
    savedPosY = myShip.pos.y;
    savedAngle = myShip.angle;

    const interpX = myPrevPos.x + (savedPosX - myPrevPos.x) * alpha + posError.x;
    const interpY = myPrevPos.y + (savedPosY - myPrevPos.y) * alpha + posError.y;
    const interpA = interpolateAngle(myPrevAngle, savedAngle, alpha);

    myShip.pos.set(interpX, interpY);
    myShip.angle = interpA;
  }

  ngQueueEl.textContent = String(pendingInputs.length);
  ngErrEl.textContent = posError.length().toFixed(1);

  renderer.render(world, myPlayerId, particles);

  if (myShip !== null) {
    myShip.pos.set(savedPosX, savedPosY);
    myShip.angle = savedAngle;
  }

  const frameCostMs = performance.now() - frameStart;
  const finishedSession = profiler.recordFrame(frameCostMs, now);
  if (finishedSession) {
    const stats = profiler.computePercentiles();
    btnProfileEl.textContent = 'Profile 30s';
    profileReportEl.textContent =
      `30s (${stats.count} frames):\n` +
      `p50=${stats.p50}ms | p95=${stats.p95}ms | p99=${stats.p99}ms\n` +
      `Pool reused: ${particles.pool.totalReused}`;
  }

  requestAnimationFrame(renderLoop);
}