import './style.css';
import { createInput } from './input.js';
import { createRenderer } from './renderer.js';
import { createLoop } from './loop.js';
import { World } from './world.js';
import { Ship, Entity } from './entity.js';
import { Vector2 } from './math.js';
import { handleCollisions, isColliding } from './collisions.js';
import { withHoming, withPickup } from './composition.js';

const canvas = document.getElementById('game-canvas');
const fpsEl = document.getElementById('fps');
const tpsEl = document.getElementById('tps');
const frameTimeEl = document.getElementById('frame-time');
const scoreEl = document.getElementById('score');

const input = createInput();
const renderer = createRenderer(canvas);
const bounds = renderer.getBounds();

const world = new World(bounds);
let playerShip = new Ship(bounds.width / 2, bounds.height / 2);
world.spawn(playerShip);

let score = 0;
function addScore(points) {
  score += points;
  scoreEl.textContent = `Score: ${score}`;
}


window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !playerShip.isDead) {
    playerShip.fire(world, performance.now() / 1000);
  }
});

function MathRandomRange(min, max) {
  return Math.random() * (max - min) + min;
}

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
  const x = Math.random() * bounds.width;
  const y = Math.random() * bounds.height;
  
  const pickup = new Entity(x, y, 8, 'particle');
  pickup.color = '#00ff00'; 
  
  withPickup(pickup, (ship) => {
    if (ship.hp !== undefined) {
      const currentHp = ship.hp; 
      addScore(50);
    }
  });
  
  world.spawn(pickup);
}

for (let i = 0; i < 5; i++) spawnRandomAsteroid();
spawnHealthPickup();

let respawnTimer = 0;

const loop = createLoop({
  update(dt, currentTime) {
    world.step(dt, input, currentTime);
    handleCollisions(world, addScore);

    
    if (!playerShip.isDead) {
      for (const entity of world.entities.values()) {
        if (entity.isPickup && !entity.isDead) {
          if (isColliding(playerShip, entity)) {
            entity.onPickup(playerShip);
            entity.isDead = true; 
          }
        }
      }
    }

    if (playerShip.isDead) {
      if (respawnTimer === 0) {
        respawnTimer = currentTime + 2; 
      } else if (currentTime >= respawnTimer) {
        playerShip = new Ship(bounds.width / 2, bounds.height / 2);
        world.spawn(playerShip);
        respawnTimer = 0;
      }
    }


    if (Array.from(world.ofKind('asteroid')).length < 6) {
      spawnRandomAsteroid();
    }

    if (Math.random() < 0.001) {
      spawnHealthPickup();
    }
  },
  render(alpha) {
    renderer.render(world, alpha, input);
  },
  onMetricsUpdate({ fps, tps, frameTimeMs }) {
    fpsEl.textContent = `FPS: ${fps}`;
    tpsEl.textContent = `Steps/s: ${tps}`;
    frameTimeEl.textContent = `Frame time: ${frameTimeMs}ms`;
  }
});

loop.start();