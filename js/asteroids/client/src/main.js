import './style.css';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { loadAll } from './loading.js'; 
import { initAudio } from './audio.js';
import { audioCtx } from './assets.js';
import { Lobby } from './lobby.js';
import { GameSocket } from './network.js';
import { World } from '../../shared/world.js';
import { Entity, Ship } from '../../shared/entity.js';
import { Vector2 } from '../../shared/math.js';
import { packInput, unpackSnapshot } from '../../shared/protocol.js';

const canvas = document.getElementById('game-canvas');
const input = createInput();
const renderer = createRenderer(canvas);
const bounds = renderer.getBounds();

const world = new World(bounds.width, bounds.height);
export let globalAssets = null; 

let socket = null;
let myPlayerId = null;
let myShip = null;
let isJoined = false;

let inputSeq = 0;
let pendingInputs = [];
let posError = new Vector2(0, 0);

// Змінні Netgraph
let bytesReceived = 0;
let bps = 0;
let rtt = 0;
const inputTimes = new Map();

const unlockAudio = () => { if (audioCtx.state === 'suspended') audioCtx.resume(); };
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

const lobby = new Lobby();
lobby.show();

lobby.addEventListener('join', (e) => {
  lobby.hide();
  boot(e.detail.roomId, e.detail.playerName);
});

setInterval(() => {
  bps = bytesReceived;
  const bpsEl = document.getElementById('ng-bps');
  if (bpsEl) bpsEl.textContent = bps;
  bytesReceived = 0;
}, 1000);

async function boot(roomId, playerName) {
  try {
    globalAssets = await loadAll('/assets/manifest.json', () => {}, new AbortController().signal);
    initAudio();
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new GameSocket(`${protocol}//${window.location.host}/ws`);
    socket.connect();

    socket.addEventListener('open', () => {
      socket.ws.binaryType = 'arraybuffer';
      socket.send({ type: 'join', roomId, playerName });
    });

    socket.addEventListener('message', handleServerMessage);
  } catch (error) {
    console.error(error);
  }
}

async function handleServerMessage(e) {
  const data = e.detail;

  if (data instanceof ArrayBuffer || data instanceof Blob) {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    bytesReceived += buffer.byteLength;
    const msg = unpackSnapshot(buffer);
    
    if (msg.lastSeq > 0 && inputTimes.has(msg.lastSeq)) {
      rtt = performance.now() - inputTimes.get(msg.lastSeq);
      document.getElementById('ng-rtt').textContent = Math.round(rtt);
      document.getElementById('ng-age').textContent = Math.round(rtt / 2);
      inputTimes.delete(msg.lastSeq);
    }
    
    const serverIds = new Set();
    for (const s of msg.state) {
      serverIds.add(s.id);
      
      if (s.id === myPlayerId && myShip) {
        const oldX = myShip.pos.x;
        const oldY = myShip.pos.y;

        myShip.pos.x = s.x;
        myShip.pos.y = s.y;
        myShip.angle = s.a !== undefined ? s.a : myShip.angle;

        const serverLastSeq = msg.lastSeq;
        pendingInputs = pendingInputs.filter(inp => inp.seq > serverLastSeq);

        const dt = 1 / 30;
        for (const pending of pendingInputs) {
          myShip.applyInput(pending.keys, dt);
          myShip.update(dt);
        }

        posError.x += (oldX - myShip.pos.x);
        posError.y += (oldY - myShip.pos.y);

      } else {
        let entity = world.entities.get(s.id);
        if (!entity) {
          const radius = s.kind === 'ship' ? 16 : 20; 
          entity = new Entity(s.id, s.x, s.y, radius, s.kind);
          world.spawn(entity);
        }
        entity.pos.x = s.x;
        entity.pos.y = s.y;
        if (s.a !== undefined) entity.angle = s.a;
      }
    }

    for (const id of world.entities.keys()) {
      if (!serverIds.has(id)) world.remove(id);
    }
  } else {
    if (data.type === 'joined') {
      myPlayerId = data.playerId;
      isJoined = true;
      document.getElementById('netgraph').style.display = 'block';
      
      myShip = new Ship(myPlayerId, bounds.width / 2, bounds.height / 2);
      world.spawn(myShip);
      
      setInterval(clientTick, 1000 / 30);
      requestAnimationFrame(renderLoop);
    }
  }
}

function clientTick() {
  if (!isJoined || !myShip) return;

  const keys = {
    up: input.isPressed('KeyW') || input.isPressed('ArrowUp'),
    left: input.isPressed('KeyA') || input.isPressed('ArrowLeft'),
    right: input.isPressed('KeyD') || input.isPressed('ArrowRight'),
    space: input.isPressed('Space')
  };

  inputSeq++;
  inputTimes.set(inputSeq, performance.now());
  
  const currentInput = { seq: inputSeq, keys };
  const buffer = packInput(inputSeq, keys);
  socket.send(buffer);
  
  pendingInputs.push(currentInput);

  const dt = 1 / 30;
  myShip.applyInput(keys, dt);
  myShip.update(dt);
  
  if (myShip.pos.x < 0) { myShip.pos.x = 0; myShip.vel.x = 0; }
  if (myShip.pos.x > bounds.width) { myShip.pos.x = bounds.width; myShip.vel.x = 0; }
  if (myShip.pos.y < 0) { myShip.pos.y = 0; myShip.vel.y = 0; }
  if (myShip.pos.y > bounds.height) { myShip.pos.y = bounds.height; myShip.vel.y = 0; }
}

function renderLoop() {
  posError.x *= 0.85; 
  posError.y *= 0.85;

  if (Math.abs(posError.x) < 0.1) posError.x = 0;
  if (Math.abs(posError.y) < 0.1) posError.y = 0;

  if (myShip) {
    myShip.pos.x += posError.x;
    myShip.pos.y += posError.y;
  }

  const ngQueue = document.getElementById('ng-queue');
  const ngErr = document.getElementById('ng-err');
  if (ngQueue) ngQueue.textContent = pendingInputs.length;
  if (ngErr) {
    const errMagnitude = Math.sqrt(posError.x**2 + posError.y**2);
    ngErr.textContent = errMagnitude.toFixed(1);
  }

  renderer.render(world, 1, input);

  if (myShip) {
    myShip.pos.x -= posError.x;
    myShip.pos.y -= posError.y;
  }

  requestAnimationFrame(renderLoop);
}