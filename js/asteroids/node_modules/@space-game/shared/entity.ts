import { Vector2 } from './math.js';
import type { EntityId } from './types.js';

export type EntityKind = 'ship' | 'asteroid' | 'bullet';

export interface InputKeys {
  readonly up: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly space: boolean;
}

export class Entity {
  public readonly id: EntityId;
  public readonly radius: number;
  public readonly kind: EntityKind;
  public pos: Vector2;
  public vel: Vector2;
  public angle: number;
  public isDead: boolean;

  constructor(id: EntityId, x: number, y: number, radius: number, kind: EntityKind) {
    this.id = id;
    this.pos = new Vector2(x, y);
    this.vel = new Vector2(0, 0);
    this.radius = radius;
    this.kind = kind;
    this.angle = -Math.PI / 2;
    this.isDead = false;
  }

  public update(dt: number): void {
    this.pos = new Vector2(
      this.pos.x + this.vel.x * dt,
      this.pos.y + this.vel.y * dt
    );
  }
}

export class Ship extends Entity {
  public override readonly kind: 'ship' = 'ship';
  public hp: number;
  public fireCooldown: number;
  public isThrusting: boolean;

  constructor(id: EntityId, x: number, y: number) {
    super(id, x, y, 16, 'ship');
    this.hp = 100;
    this.fireCooldown = 0;
    this.isThrusting = false;
  }

  public applyInput(input: InputKeys, dt: number): void {
    const turnSpeed = 3.6;
    const thrust = 220;
    const drag = 0.992;

    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    }

    if (input.left) this.angle -= turnSpeed * dt;
    if (input.right) this.angle += turnSpeed * dt;

    this.isThrusting = input.up;
    if (input.up) {
      this.vel = new Vector2(
        this.vel.x + Math.cos(this.angle) * thrust * dt,
        this.vel.y + Math.sin(this.angle) * thrust * dt
      );
    }

    this.vel = this.vel.scale(drag);
  }
}

export class Asteroid extends Entity {
  public override readonly kind: 'asteroid' = 'asteroid';

  constructor(id: EntityId, x: number, y: number, radius = 22) {
    super(id, x, y, radius, 'asteroid');
  }
}

export class Bullet extends Entity {
  public override readonly kind: 'bullet' = 'bullet';
  public readonly ownerId: EntityId;
  public ttl: number;

  constructor(id: EntityId, ownerId: EntityId, x: number, y: number, angle: number, shipVel: Vector2) {
    super(id, x, y, 4, 'bullet');
    this.ownerId = ownerId;
    this.angle = angle;
    this.ttl = 1.4;

    const bulletSpeed = 460;
    this.vel = new Vector2(
      shipVel.x + Math.cos(angle) * bulletSpeed,
      shipVel.y + Math.sin(angle) * bulletSpeed
    );
  }

  public override update(dt: number): void {
    super.update(dt);
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.isDead = true;
    }
  }
}

export type GameEntity = Ship | Asteroid | Bullet;