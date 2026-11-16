import { MutableVector2 } from './math.js';
import { Asteroid, Bullet, Ship, type GameEntity, type InputKeys } from './entity.js';
import { applyCirclePushInPlace, circlesOverlap } from './collision.js';
import { ObjectPool } from './pool.js';
import { SpatialHash } from './spatialHash.js';
import { PRNG } from './random.js';
import { assertNever, toEntityId, toTick, type EntityId, type InputSeq, type Tick } from './types.js';

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

export interface PendingInputEntry {
  readonly seq: InputSeq;
  readonly keys: InputKeys;
}

const ZERO_VEL = new MutableVector2(0, 0);

export class World {
  public readonly bounds: WorldBounds;
  public readonly entities: Map<EntityId, GameEntity>;
  public readonly bulletPool: ObjectPool<Bullet>;
  public readonly spatialHash: SpatialHash<GameEntity>;
  public useSpatialHash = true;
  public tick: Tick;

  private readonly allocateId: IdAllocator | null;
  private readonly rng: PRNG | null;
  private readonly queryBuffer: GameEntity[] = [];

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
    this.spatialHash = new SpatialHash<GameEntity>(80);

    this.bulletPool = new ObjectPool<Bullet>(
      () => new Bullet(toEntityId(0), toEntityId(0), 0, 0, 0, ZERO_VEL),
      (bullet) => {
        bullet.isDead = true;
        bullet.ttl = 0;
      },
      64
    );
  }

  public spawn(entity: GameEntity): void {
    const key = entity.kind === 'bullet' ? entity.mutableId : entity.id;
    this.entities.set(key, entity);
  }

  public remove(id: EntityId): void {
    const existing = this.entities.get(id);
    if (existing !== undefined) {
      this.entities.delete(id);
      if (existing.kind === 'bullet') {
        this.bulletPool.release(existing);
      }
    }
  }

  public tryFireBullet(ship: Ship): Bullet | null {
    if (this.allocateId === null || ship.fireCooldown > 0) {
      return null;
    }

    ship.fireCooldown = 0.22;
    const noseOffset = ship.radius + 6;
    const bx = ship.pos.x + Math.cos(ship.angle) * noseOffset;
    const by = ship.pos.y + Math.sin(ship.angle) * noseOffset;

    const bulletId = this.allocateId();
    const bullet = this.bulletPool.acquire();
    bullet.reset(bulletId, ship.id, bx, by, ship.angle, ship.vel);
    this.entities.set(bulletId, bullet);
    return bullet;
  }

  public step(dt: number): void {
    this.tick = toTick(this.tick + 1);

    // 1. Оновлення позицій та меж арени (zero-allocation)
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

      if (nx !== entity.pos.x || ny !== entity.pos.y) {
        entity.pos.set(nx, ny);
      }
      if (vx !== entity.vel.x || vy !== entity.vel.y) {
        entity.vel.set(vx, vy);
      }
    }

    // 2. Колізії (авторитетна симуляція)
    if (this.allocateId !== null) {
      if (this.useSpatialHash) {
        this.resolveCollisionsSpatial();
      } else {
        this.resolveCollisionsBruteForce();
      }
    }

    // 3. Видалення знищених сутностей та повернення куль у пул
    for (const [id, entity] of this.entities.entries()) {
      if (entity.isDead) {
        this.entities.delete(id);
        if (entity.kind === 'bullet') {
          this.bulletPool.release(entity);
        }
      }
    }
  }

  private resolveCollisionsSpatial(): void {
    this.spatialHash.clear();
    for (const entity of this.entities.values()) {
      if (!entity.isDead) {
        this.spatialHash.insert(entity);
      }
    }

    for (const entity of this.entities.values()) {
      if (entity.isDead) continue;

      if (entity.kind === 'bullet') {
        const candidates = this.spatialHash.query(
          entity.pos.x,
          entity.pos.y,
          entity.radius + 36,
          this.queryBuffer
        );

        for (let i = 0; i < candidates.length; i++) {
          const target = candidates[i];
          if (target === undefined || target.isDead || target === entity) continue;

          if (target.kind === 'asteroid' && circlesOverlap(entity, target)) {
            entity.isDead = true;
            target.isDead = true;
            this.handleAsteroidDestroyed(target);
            break;
          }

          if (target.kind === 'ship' && target.id !== entity.ownerId && circlesOverlap(entity, target)) {
            entity.isDead = true;
            target.hp -= 25;
            if (target.hp <= 0) {
              this.respawnShip(target);
            }
            break;
          }
        }
      } else if (entity.kind === 'ship') {
        const candidates = this.spatialHash.query(
          entity.pos.x,
          entity.pos.y,
          entity.radius + 36,
          this.queryBuffer
        );

        for (let i = 0; i < candidates.length; i++) {
          const target = candidates[i];
          if (target === undefined || target.isDead || target.kind !== 'asteroid') continue;

          if (applyCirclePushInPlace(entity.pos, entity.vel, entity.radius, target, 140, 2)) {
            target.isDead = true;
            this.handleAsteroidDestroyed(target);
          }
        }
      }
    }
  }

  private resolveCollisionsBruteForce(): void {
    for (const entity of this.entities.values()) {
      if (entity.isDead) continue;

      if (entity.kind === 'bullet') {
        for (const target of this.entities.values()) {
          if (target.isDead || target === entity) continue;

          if (target.kind === 'asteroid' && circlesOverlap(entity, target)) {
            entity.isDead = true;
            target.isDead = true;
            this.handleAsteroidDestroyed(target);
            break;
          }

          if (target.kind === 'ship' && target.id !== entity.ownerId && circlesOverlap(entity, target)) {
            entity.isDead = true;
            target.hp -= 25;
            if (target.hp <= 0) {
              this.respawnShip(target);
            }
            break;
          }
        }
      } else if (entity.kind === 'ship') {
        for (const target of this.entities.values()) {
          if (target.isDead || target.kind !== 'asteroid') continue;

          if (applyCirclePushInPlace(entity.pos, entity.vel, entity.radius, target, 140, 2)) {
            target.isDead = true;
            this.handleAsteroidDestroyed(target);
          }
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
        child.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
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
      fresh.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
      fresh.angle = angle;
      this.spawn(fresh);
    }
  }

  private respawnShip(ship: Ship): void {
    ship.hp = 100;
    const x = this.rng ? this.rng.range(120, this.bounds.width - 120) : this.bounds.width / 2;
    const y = this.rng ? this.rng.range(120, this.bounds.height - 120) : this.bounds.height / 2;
    ship.pos.set(x, y);
    ship.vel.set(0, 0);
  }

  public createSnapshot(): readonly SnapshotEntity[] {
    const state: SnapshotEntity[] = [];
    for (const e of this.entities.values()) {
      if (e.isDead) continue;
      const entityId = e.kind === 'bullet' ? e.mutableId : e.id;
      state.push({
        kind: e.kind,
        id: entityId,
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

/**
 * Детермінована звірка локального корабля з авторитетним знімком сервера (Server Reconciliation).
 */
export function reconcileShipState(
  ship: Ship,
  serverState: SnapshotEntity,
  serverLastSeq: InputSeq,
  pendingInputs: readonly PendingInputEntry[],
  bounds: WorldBounds,
  dt: number
): PendingInputEntry[] {
  ship.pos.set(serverState.x, serverState.y);
  ship.vel.set(serverState.vx, serverState.vy);
  ship.angle = serverState.a;

  const remaining = pendingInputs.filter((inp) => inp.seq > serverLastSeq);

  for (let i = 0; i < remaining.length; i++) {
    const pending = remaining[i];
    if (pending === undefined) continue;
    ship.applyInput(pending.keys, dt);
    ship.update(dt);

    if (ship.pos.x < ship.radius) { ship.pos.x = ship.radius; ship.vel.x = 0; }
    if (ship.pos.x > bounds.width - ship.radius) { ship.pos.x = bounds.width - ship.radius; ship.vel.x = 0; }
    if (ship.pos.y < ship.radius) { ship.pos.y = ship.radius; ship.vel.y = 0; }
    if (ship.pos.y > bounds.height - ship.radius) { ship.pos.y = bounds.height - ship.radius; ship.vel.y = 0; }
  }

  return remaining;
}