import { MutableVector2, Vector2, type Vec2Like } from './math.js';

export interface CircleBody {
  readonly pos: Vec2Like;
  readonly radius: number;
}

export interface CollisionPushResult {
  readonly pos: Vector2;
  readonly normal: Vector2;
}

export function circlesOverlap(a: CircleBody, b: CircleBody): boolean {
  const minDist = a.radius + b.radius;
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  return dx * dx + dy * dy < minDist * minDist;
}

export function resolveCirclePush(
  mover: CircleBody,
  obstacle: CircleBody,
  padding = 2
): CollisionPushResult | null {
  const dx = mover.pos.x - obstacle.pos.x;
  const dy = mover.pos.y - obstacle.pos.y;
  const dist = Math.hypot(dx, dy);
  const minDist = mover.radius + obstacle.radius;

  if (dist >= minDist || dist <= 0.0001) {
    return null;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  return {
    pos: new Vector2(
      obstacle.pos.x + nx * (minDist + padding),
      obstacle.pos.y + ny * (minDist + padding)
    ),
    normal: new Vector2(nx, ny)
  };
}

export function applyCirclePushInPlace(
  moverPos: MutableVector2,
  moverVel: MutableVector2,
  moverRadius: number,
  obstacle: CircleBody,
  bounceSpeed = 140,
  padding = 2
): boolean {
  const dx = moverPos.x - obstacle.pos.x;
  const dy = moverPos.y - obstacle.pos.y;
  const dist = Math.hypot(dx, dy);
  const minDist = moverRadius + obstacle.radius;

  if (dist >= minDist || dist <= 0.0001) {
    return false;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  moverPos.set(
    obstacle.pos.x + nx * (minDist + padding),
    obstacle.pos.y + ny * (minDist + padding)
  );
  moverVel.set(nx * bounceSpeed, ny * bounceSpeed);
  return true;
}