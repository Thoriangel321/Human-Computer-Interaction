import './style.css';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { createLoop } from './loop.js';
import { World } from './world.js';
import { Ship, Entity } from './entity.js';
import { Vector2 } from './math.js';
import { handleCollisions, isColliding } from './collisions.js';
import { withHoming, withPickup } from './composition.js';
import { loadAll } from './loading.js'; 
import { initAudio } from './audio.js';
import { audioCtx } from './assets.js';
import { Lobby } from './lobby.js'; // Імпорт лобі

const canvas = document.getElementById('game-canvas');
const fpsEl = document.getElementById('fps');
const tpsEl = document.getElementById('tps');
const frameTimeEl = document.getElementById('frame-time');
const scoreEl = document.getElementById('score');

const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');

const input = createInput();
const renderer = createRenderer(canvas);
const bounds = renderer.getBounds();

const world = new World(bounds);
let playerShip = null; 
let score = 0;

export let globalAssets = null; 

function addScore(points) {
  score += points;
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && playerShip && !playerShip.isDead) {
    playerShip.fire(world, performance.now() / 1000);
  }
});

const unlockAudio = () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => console.log('Audio unlocked!'));
  }
};
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

function MathRandomRange(min, max) { return Math.random() * (max - min) + min; }

function spawnRandomAsteroid() {
  const x = Math.random() * bounds.width;
  const y = Math.random() * 50; 
  const asteroid = new Entity(x, y, MathRandomRange(15, 30), 'asteroid');
  const angle = Math.random() * Math.PI * 2;
  const speed = MathRandomRange(30, 80);
  asteroid.vel = new Vector2(Math.cos(angle), Math.sin(angle)).mult(speed);
  if (Math.random() < 0.2) {
    withHoming(asteroid, playerShip);
    asteroid.radius = 12; 
    asteroid.vel = asteroid.vel.mult(1.5); 
  }
  world.spawn(asteroid);
}

function spawnHealthPickup() {
  const pickup = new Entity(Math.random() * bounds.width, Math.random() * bounds.height, 8, 'particle');
  pickup.color = '#00ff00';
  withPickup(pickup, (ship) => { if (ship.hp !== undefined) addScore(50); });
  world.spawn(pickup);
}

let respawnTimer = 0;

const loop = createLoop({
  update(dt, currentTime) {
    world.step(dt, input, currentTime);
    handleCollisions(world, addScore);

    if (playerShip && !playerShip.isDead) {
      for (const entity of world.entities.values()) {
        if (entity.isPickup && !entity.isDead && isColliding(playerShip, entity)) {
          entity.onPickup(playerShip);
          entity.isDead = true; 
        }
      }
    }

    if (playerShip && playerShip.isDead) {
      if (respawnTimer === 0) respawnTimer = currentTime + 2; 
      else if (currentTime >= respawnTimer) {
        playerShip = new Ship(bounds.width / 2, bounds.height / 2);
        world.spawn(playerShip);
        respawnTimer = 0;
      }
    }

    if (Array.from(world.ofKind('asteroid')).length < 6) spawnRandomAsteroid();
    if (Math.random() < 0.001) spawnHealthPickup();
  },
  render(alpha) { renderer.render(world, alpha, input); },
  onMetricsUpdate({ fps, tps, frameTimeMs }) {
    if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
    if (tpsEl) tpsEl.textContent = `Steps/s: ${tps}`;
    if (frameTimeEl) frameTimeEl.textContent = `Frame time: ${frameTimeMs}ms`;
  }
});

const ctx = canvas.getContext('2d');
let abortController = new AbortController();

function drawProgressBar(progress) {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const barWidth = 400, barHeight = 20;
  const x = (canvas.width - barWidth) / 2, y = (canvas.height - barHeight) / 2;
  ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2; ctx.strokeRect(x, y, barWidth, barHeight);
  ctx.fillStyle = '#00ffcc'; ctx.fillRect(x + 2, y + 2, (barWidth - 4) * progress, barHeight - 4);
  ctx.fillStyle = '#fff'; ctx.font = '16px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`Loading assets... ${Math.round(progress * 100)}%`, canvas.width / 2, y - 20);
}


const lobby = new Lobby();
lobby.show();


lobby.addEventListener('join', (e) => {
  console.log(`Гравець ${e.detail.playerName} приєднується до ${e.detail.roomId}`);
  lobby.hide(); 
  boot();       
});

// Завантаження і старт
async function boot() {
  if (errorOverlay) errorOverlay.style.display = 'none';
  let loadingProgress = 0, isLoading = true;

  function loadingLoop() {
    if (!isLoading) return;
    drawProgressBar(loadingProgress);
    requestAnimationFrame(loadingLoop);
  }
  requestAnimationFrame(loadingLoop);

  try {
    globalAssets = await loadAll('/assets/manifest.json', (p) => loadingProgress = p, abortController.signal);
    isLoading = false; 
    
    initAudio(); 
    
    playerShip = new Ship(bounds.width / 2, bounds.height / 2);
    world.spawn(playerShip);
    for (let i = 0; i < 5; i++) spawnRandomAsteroid();
    spawnHealthPickup();

    loop.start();
  } catch (error) {
    isLoading = false;
    if (errorMessage) errorMessage.textContent = error.message;
    if (errorOverlay) errorOverlay.style.display = 'block';
  }
}

if (retryBtn) {
  retryBtn.addEventListener('click', () => {
    abortController.abort(); 
    abortController = new AbortController(); 
    boot(); 
  });
}