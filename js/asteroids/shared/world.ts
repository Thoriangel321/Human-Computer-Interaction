import { Vector2 } from './math.js';
import { Asteroid, Bullet, Ship, type GameEntity } from './entity.js';
import { circlesOverlap, resolveCirclePush } from './collision.js';
import { PRNG } from './random.js';
import { assertNever, toTick, type EntityId, type Tick } from './types.js';

export interface WorldBounds {
  readonly width: number;
  readonly height: number;
}

export interface ShipSnapshot {
  readonly kind: 'ship';
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly a: number;
  readonly radius: number;
}

export interface AsteroidSnapshot {
  readonly kind: 'asteroid';
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly a: number;
  readonly radius: number;
}

export interface BulletSnapshot {
  readonly kind: 'bullet';
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly a: number;
  readonly radius: number;
}

export type SnapshotEntity = ShipSnapshot | AsteroidSnapshot | BulletSnapshot;

export type IdAllocator = () => EntityId;

export class World {
  public readonly bounds: WorldBounds;
  public readonly entities: Map<EntityId, GameEntity>;
  public tick: Tick;

  private readonly allocateId: IdAllocator | null;
  private readonly rng: PRNG | null;

  constructor(
    width: number,
    height: number,
    allocateId: IdAllocator | null = null,
    rng: PRNG | null = null
  ) {
    this.bounds = { width, height };
    this.entities = new Map<EntityId, GameEntity>();
    this.tick = toTick(0);
    this.allocateId = allocateId;
    this.rng = rng;
  }

  public spawn(entity: GameEntity): void {
    this.entities.set(entity.id, entity);
  }

  public remove(id: EntityId): void {
    this.entities.delete(id);
  }

  public tryFireBullet(ship: Ship): Bullet | null {
    if (this.allocateId === null || ship.fireCooldown > 0) {
      return null;
    }

    ship.fireCooldown = 0.22;
    const noseOffset = ship.radius + 6;
    const bx = ship.pos.x + Math.cos(ship.angle) * noseOffset;
    const by = ship.pos.y + Math.sin(ship.angle) * noseOffset;

    const bullet = new Bullet(this.allocateId(), ship.id, bx, by, ship.angle, ship.vel);
    this.spawn(bullet);
    return bullet;
  }

  public step(dt: number): void {
    this.tick = toTick(this.tick + 1);

    // 1. Оновлення позицій та меж арени
    for (const entity of this.entities.values()) {
      entity.update(dt);

      let nx = entity.pos.x;
      let ny = entity.pos.y;
      let vx = entity.vel.x;
      let vy = entity.vel.y;

      switch (entity.kind) {
        case 'asteroid': {
          if (nx < entity.radius) { nx = entity.radius; vx = Math.abs(vx); }
          if (nx > this.bounds.width - entity.radius) { nx = this.bounds.width - entity.radius; vx = -Math.abs(vx); }
          if (ny < entity.radius) { ny = entity.radius; vy = Math.abs(vy); }
          if (ny > this.bounds.height - entity.radius) { ny = this.bounds.height - entity.radius; vy = -Math.abs(vy); }
          break;
        }
        case 'ship': {
          if (nx < entity.radius) { nx = entity.radius; vx = 0; }
          if (nx > this.bounds.width - entity.radius) { nx = this.bounds.width - entity.radius; vx = 0; }
          if (ny < entity.radius) { ny = entity.radius; vy = 0; }
          if (ny > this.bounds.height - entity.radius) { ny = this.bounds.height - entity.radius; vy = 0; }
          break;
        }
        case 'bullet': {
          if (nx < 0 || nx > this.bounds.width || ny < 0 || ny > this.bounds.height) {
            entity.isDead = true;
          }
          break;
        }
        default:
          assertNever(entity);
      }

      if (nx !== entity.pos.x || ny !== entity.pos.y || vx !== entity.vel.x || vy !== entity.vel.y) {
        entity.pos = new Vector2(nx, ny);
        entity.vel = new Vector2(vx, vy);
      }
    }

    // 2. Колізії (виконуються тільки на авторитетному боці з allocateId)
    if (this.allocateId !== null) {
      this.resolveCollisions();
    }

    // 3. Видалення знищених сутностей
    for (const [id, entity] of this.entities.entries()) {
      if (entity.isDead) {
        this.entities.delete(id);
      }
    }
  }

  private resolveCollisions(): void {
    const ships: Ship[] = [];
    const asteroids: Asteroid[] = [];
    const bullets: Bullet[] = [];

    for (const entity of this.entities.values()) {
      if (entity.isDead) continue;
      switch (entity.kind) {
        case 'ship':
          ships.push(entity);
          break;
        case 'asteroid':
          asteroids.push(entity);
          break;
        case 'bullet':
          bullets.push(entity);
          break;
        default:
          assertNever(entity);
      }
    }

    // Кулі проти астероїдів та чужих кораблів
    for (const bullet of bullets) {
      if (bullet.isDead) continue;

      for (const asteroid of asteroids) {
        if (asteroid.isDead) continue;
        if (circlesOverlap(bullet, asteroid)) {
          bullet.isDead = true;
          asteroid.isDead = true;
          this.handleAsteroidDestroyed(asteroid);
          break;
        }
      }

      if (bullet.isDead) continue;

      for (const ship of ships) {
        if (ship.isDead || ship.id === bullet.ownerId) continue;
        if (circlesOverlap(bullet, ship)) {
          bullet.isDead = true;
          ship.hp -= 25;
          if (ship.hp <= 0) {
            this.respawnShip(ship);
          }
          break;
        }
      }
    }

    // Кораблі проти астероїдів
    for (const ship of ships) {
      for (const asteroid of asteroids) {
        if (asteroid.isDead) continue;
        const push = resolveCirclePush(ship, asteroid, 2);
        if (push !== null) {
          ship.pos = push.pos;
          ship.vel = push.normal.scale(140);
          asteroid.isDead = true;
          this.handleAsteroidDestroyed(asteroid);
        }
      }
    }
  }

  private handleAsteroidDestroyed(asteroid: Asteroid): void {
    if (this.allocateId === null || this.rng === null) return;

    if (asteroid.radius >= 20) {
      const childRadius = Math.max(11, Math.round(asteroid.radius * 0.58));
      for (let i = 0; i < 2; i++) {
        const child = new Asteroid(this.allocateId(), asteroid.pos.x, asteroid.pos.y, childRadius);
        const angle = this.rng.range(0, Math.PI * 2);
        const speed = this.rng.range(55, 110);
        child.vel = new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
        child.angle = angle;
        this.spawn(child);
      }
      return;
    }

    let asteroidCount = 0;
    for (const e of this.entities.values()) {
      if (!e.isDead && e.kind === 'asteroid') asteroidCount += 1;
    }

    if (asteroidCount < 6) {
      const radius = Math.round(this.rng.range(20, 30));
      const edge = Math.floor(this.rng.range(0, 4));
      let x = radius + 10;
      let y = radius + 10;

      if (edge === 0) {
        x = this.rng.range(radius, this.bounds.width - radius);
        y = radius + 5;
      } else if (edge === 1) {
        x = this.bounds.width - radius - 5;
        y = this.rng.range(radius, this.bounds.height - radius);
      } else if (edge === 2) {
        x = this.rng.range(radius, this.bounds.width - radius);
        y = this.bounds.height - radius - 5;
      } else {
        x = radius + 5;
        y = this.rng.range(radius, this.bounds.height - radius);
      }

      const fresh = new Asteroid(this.allocateId(), x, y, radius);
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(30, 70);
      fresh.vel = new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      fresh.angle = angle;
      this.spawn(fresh);
    }
  }

  private respawnShip(ship: Ship): void {
    ship.hp = 100;
    const x = this.rng ? this.rng.range(120, this.bounds.width - 120) : this.bounds.width / 2;
    const y = this.rng ? this.rng.range(120, this.bounds.height - 120) : this.bounds.height / 2;
    ship.pos = new Vector2(x, y);
    ship.vel = new Vector2(0, 0);
  }

  public createSnapshot(): readonly SnapshotEntity[] {
    const state: SnapshotEntity[] = [];
    for (const e of this.entities.values()) {
      if (e.isDead) continue;
      state.push({
        kind: e.kind,
        id: e.id,
        x: e.pos.x,
        y: e.pos.y,
        vx: e.vel.x,
        vy: e.vel.y,
        a: e.angle,
        radius: e.radius
      });
    }
    return state;
  }
}