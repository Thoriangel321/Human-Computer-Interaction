import './style.css';
import { createInput } from './input.js';
import { createShip, integrate } from './physics.js';
import { createRenderer } from './renderer.js';
import { createLoop } from './loop.js';

const canvas = document.getElementById('game-canvas');
const fpsEl = document.getElementById('fps');
const tpsEl = document.getElementById('tps');
const frameTimeEl = document.getElementById('frame-time');

const input = createInput();
const renderer = createRenderer(canvas);

const bounds = renderer.getBounds();
let ship = createShip(bounds.width / 2, bounds.height / 2);
let prevShip = { ...ship };

// gameloop
const loop = createLoop({
  update(dt) {

    prevShip = { ...ship };

    ship = integrate(ship, input, dt, renderer.getBounds());
  },
  render(alpha) {
    renderer.render(prevShip, ship, alpha, input);
  },
  onMetricsUpdate({ fps, tps, frameTimeMs }) {
    fpsEl.textContent = `FPS: ${fps}`;
    tpsEl.textContent = `Steps/s: ${tps}`;
    frameTimeEl.textContent = `Frame time: ${frameTimeMs}ms`;
  }
});


loop.start();