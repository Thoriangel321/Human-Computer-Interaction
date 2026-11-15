import { Vector2 } from './math.js';

export interface CircleBody {
  readonly pos: Vector2;
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
  const delta = mover.pos.sub(obstacle.pos);
  const dist = delta.length();
  const minDist = mover.radius + obstacle.radius;

  if (dist >= minDist || dist <= 0.0001) {
    return null;
  }

  const normal = delta.scale(1 / dist);
  const pos = obstacle.pos.add(normal.scale(minDist + padding));
  return { pos, normal };
}