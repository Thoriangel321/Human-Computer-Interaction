import { integrate, MutableVector2, type Vec2Like } from './math.js';
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
  public readonly pos: MutableVector2;
  public readonly vel: MutableVector2;
  public angle: number;
  public isDead: boolean;

  constructor(id: EntityId, x: number, y: number, radius: number, kind: EntityKind) {
    this.id = id;
    this.pos = new MutableVector2(x, y);
    this.vel = new MutableVector2(0, 0);
    this.radius = radius;
    this.kind = kind;
    this.angle = -Math.PI / 2;
    this.isDead = false;
  }

  public update(dt: number): void {
    integrate(this.pos, this.vel, dt);
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
      this.vel.addScaledInPlace(Math.cos(this.angle), Math.sin(this.angle), thrust * dt);
    }

    this.vel.scaleInPlace(drag);
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
  public mutableId: EntityId;
  public ownerId: EntityId;
  public ttl = 1.4;

  constructor(
    id: EntityId,
    ownerId: EntityId,
    x: number,
    y: number,
    angle: number,
    shipVel: Vec2Like
  ) {
    super(id, x, y, 4, 'bullet');
    this.mutableId = id;
    this.ownerId = ownerId;
    this.reset(id, ownerId, x, y, angle, shipVel);
  }

  public reset(
    id: EntityId,
    ownerId: EntityId,
    x: number,
    y: number,
    angle: number,
    shipVel: Vec2Like
  ): void {
    this.mutableId = id;
    this.ownerId = ownerId;
    this.pos.set(x, y);
    this.angle = angle;
    this.ttl = 1.4;
    this.isDead = false;

    const bulletSpeed = 460;
    this.vel.set(
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