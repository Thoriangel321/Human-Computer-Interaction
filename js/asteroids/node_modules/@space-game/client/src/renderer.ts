import type { World, WorldBounds } from '../../shared/world.js';
import type { Asteroid, Bullet, GameEntity, Ship } from '../../shared/entity.js';
import { assertNever, type EntityId } from '../../shared/types.js';

export interface Renderer {
  getBounds(): WorldBounds;
  render(world: World, myPlayerId: EntityId | null): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Failed to acquire 2D rendering context');
  }

  const bounds: WorldBounds = {
    width: canvas.width,
    height: canvas.height
  };

  function drawShip(ship: Ship, isLocal: boolean): void {
    if (ctx === null) return;

    ctx.save();
    ctx.translate(ship.pos.x, ship.pos.y);
    ctx.rotate(ship.angle);

    if (ship.isThrusting) {
      ctx.beginPath();
      ctx.moveTo(-11, -5);
      ctx.lineTo(-22, 0);
      ctx.lineTo(-11, 5);
      ctx.closePath();
      ctx.fillStyle = '#facc15';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-13, -11);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-13, 11);
    ctx.closePath();

    ctx.fillStyle = isLocal ? '#38bdf8' : '#f97316';
    ctx.strokeStyle = isLocal ? '#e0f2fe' : '#ffedd5';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawAsteroid(asteroid: Asteroid): void {
    if (ctx === null) return;

    ctx.save();
    ctx.translate(asteroid.pos.x, asteroid.pos.y);
    ctx.rotate(asteroid.angle);

    const sides = 9;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const theta = (i / sides) * Math.PI * 2;
      const wobble = 0.85 + 0.15 * Math.sin(i * 2.3 + asteroid.id);
      const r = asteroid.radius * wobble;
      const px = Math.cos(theta) * r;
      const py = Math.sin(theta) * r;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();

    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawBullet(bullet: Bullet): void {
    if (ctx === null) return;

    ctx.save();
    ctx.translate(bullet.pos.x, bullet.pos.y);
    ctx.rotate(bullet.angle);

    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(7, 0);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  function drawEntity(entity: GameEntity, myPlayerId: EntityId | null): void {
    switch (entity.kind) {
      case 'ship':
        drawShip(entity, myPlayerId !== null && entity.id === myPlayerId);
        break;
      case 'asteroid':
        drawAsteroid(entity);
        break;
      case 'bullet':
        drawBullet(entity);
        break;
      default:
        assertNever(entity);
    }
  }

  return {
    getBounds(): WorldBounds {
      return bounds;
    },
    render(world: World, myPlayerId: EntityId | null): void {
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, bounds.width, bounds.height);

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 1;
      const gridStep = 50;
      for (let x = gridStep; x < bounds.width; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, bounds.height);
        ctx.stroke();
      }
      for (let y = gridStep; y < bounds.height; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(bounds.width, y);
        ctx.stroke();
      }

      for (const entity of world.entities.values()) {
        drawEntity(entity, myPlayerId);
      }
    }
  };
}