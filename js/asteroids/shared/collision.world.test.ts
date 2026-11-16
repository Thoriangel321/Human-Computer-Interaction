import { describe, expect, it } from 'vitest';
import { applyCirclePushInPlace, circlesOverlap, resolveCirclePush } from './collision.js';
import { Asteroid, Ship, type InputKeys } from './entity.js';
import { MutableVector2, Vector2 } from './math.js';
import { PRNG } from './random.js';
import { reconcileShipState, World } from './world.js';
import { toEntityId, toInputSeq } from './types.js';

const NO_KEYS: InputKeys = { up: false, left: false, right: false, space: false };
const THRUST_LEFT: InputKeys = { up: true, left: true, right: false, space: false };

describe('Collision helpers', () => {
  it('detects overlapping circles and ignores separated ones', () => {
    const a = { pos: new Vector2(100, 100), radius: 20 };
    const overlapping = { pos: new Vector2(130, 100), radius: 15 };
    const separated = { pos: new Vector2(200, 100), radius: 15 };

    expect(circlesOverlap(a, overlapping)).toBe(true);
    expect(circlesOverlap(a, separated)).toBe(false);
  });

  it('resolves circle push along collision normal', () => {
    const mover = { pos: new Vector2(120, 100), radius: 15 };
    const obstacle = { pos: new Vector2(100, 100), radius: 20 };
    const res = resolveCirclePush(mover, obstacle, 2);

    expect(res).not.toBeNull();
    expect(res?.normal.x).toBeCloseTo(1);
    expect(res?.normal.y).toBeCloseTo(0);
    expect(res?.pos.x).toBeCloseTo(137);
  });

  it('returns null when circles do not overlap or share exact center', () => {
    const sameCenter = { pos: new Vector2(50, 50), radius: 10 };
    expect(resolveCirclePush(sameCenter, sameCenter)).toBeNull();

    const pos = new MutableVector2(300, 300);
    const vel = new MutableVector2(0, 0);
    expect(applyCirclePushInPlace(pos, vel, 10, sameCenter)).toBe(false);
  });

  it('applies circle push in place onto mutable position and velocity', () => {
    const pos = new MutableVector2(100, 115);
    const vel = new MutableVector2(0, -50);
    const obstacle = { pos: new Vector2(100, 100), radius: 20 };

    const pushed = applyCirclePushInPlace(pos, vel, 10, obstacle, 140, 2);
    expect(pushed).toBe(true);
    expect(pos.y).toBeCloseTo(132);
    expect(vel.y).toBeCloseTo(140);
  });
});

describe('World simulation & determinism', () => {
  function runSimulation(useSpatialHash: boolean): World {
    let nextId = 1;
    const rng = new PRNG(98765);
    const world = new World(800, 600, () => toEntityId(nextId++), rng);
    world.useSpatialHash = useSpatialHash;

    const ship = new Ship(toEntityId(nextId++), 400, 300);
    world.spawn(ship);

    const asteroid = new Asteroid(toEntityId(nextId++), 400, 210, 24);
    asteroid.vel.set(0, 20);
    world.spawn(asteroid);

    const dt = 1 / 30;
    for (let tick = 0; tick < 45; tick++) {
      ship.applyInput(tick === 0 ? { up: false, left: false, right: false, space: true } : THRUST_LEFT, dt);
      if (tick === 0) {
        world.tryFireBullet(ship);
      }
      world.step(dt);
    }
    return world;
  }

  it('produces identical snapshots across independent runs with the same seed', () => {
    const worldA = runSimulation(true);
    const worldB = runSimulation(true);

    expect(worldA.tick).toBe(worldB.tick);
    expect(worldA.createSnapshot()).toEqual(worldB.createSnapshot());
  });

  it('produces identical results between SpatialHash and brute-force collision modes', () => {
    const spatialWorld = runSimulation(true);
    const bruteWorld = runSimulation(false);

    expect(spatialWorld.createSnapshot()).toEqual(bruteWorld.createSnapshot());
  });

  it('reuses bullet instances from ObjectPool after bullet expires', () => {
    let nextId = 1;
    const world = new World(800, 600, () => toEntityId(nextId++), new PRNG(1));
    const ship = new Ship(toEntityId(nextId++), 400, 300);
    world.spawn(ship);

    const initialFree = world.bulletPool.freeCount;
    const bullet = world.tryFireBullet(ship);
    expect(bullet).not.toBeNull();
    expect(world.bulletPool.freeCount).toBe(initialFree - 1);

    // Другий постріл одразу заблокований fireCooldown
    expect(world.tryFireBullet(ship)).toBeNull();

    // Прокручуємо 50 тіків (> 1.4s TTL), куля повертається в пул
    for (let i = 0; i < 50; i++) {
      world.step(1 / 30);
    }
    expect(world.bulletPool.freeCount).toBe(initialFree);
  });

  it('damages enemy ship on bullet hit and respawns at 0 HP', () => {
    let nextId = 1;
    const world = new World(800, 600, () => toEntityId(nextId++), new PRNG(77));
    const shooter = new Ship(toEntityId(nextId++), 200, 300);
    shooter.angle = 0;
    const target = new Ship(toEntityId(nextId++), 255, 300);
    world.spawn(shooter);
    world.spawn(target);

    for (let shot = 0; shot < 4; shot++) {
      shooter.fireCooldown = 0;
      world.tryFireBullet(shooter);
      for (let step = 0; step < 5; step++) {
        world.step(1 / 30);
      }
    }

    expect(target.hp).toBe(100);
  });
});

describe('Server reconciliation (reconcileShipState)', () => {
  it('replays only unacknowledged inputs on top of server state and clamps to bounds', () => {
    const dt = 1 / 30;
    const serverShip = new Ship(toEntityId(1), 400, 300);
    const clientShip = new Ship(toEntityId(1), 400, 300);

    const inputs = [
      { seq: toInputSeq(1), keys: THRUST_LEFT },
      { seq: toInputSeq(2), keys: THRUST_LEFT },
      { seq: toInputSeq(3), keys: NO_KEYS }
    ];

    // Сервер підтвердив seq = 1
    serverShip.applyInput(THRUST_LEFT, dt);
    serverShip.update(dt);

    const snapshot = {
      kind: 'ship' as const,
      id: toEntityId(1),
      x: serverShip.pos.x,
      y: serverShip.pos.y,
      vx: serverShip.vel.x,
      vy: serverShip.vel.y,
      a: serverShip.angle,
      radius: serverShip.radius
    };

    const remaining = reconcileShipState(
      clientShip,
      snapshot,
      toInputSeq(1),
      inputs,
      { width: 800, height: 600 },
      dt
    );

    expect(remaining.map((i) => i.seq)).toEqual([toInputSeq(2), toInputSeq(3)]);

    // Еталонний сервер дораховує seq 2 і 3
    serverShip.applyInput(THRUST_LEFT, dt);
    serverShip.update(dt);
    serverShip.applyInput(NO_KEYS, dt);
    serverShip.update(dt);

    expect(clientShip.pos.x).toBeCloseTo(serverShip.pos.x, 5);
    expect(clientShip.pos.y).toBeCloseTo(serverShip.pos.y, 5);
    expect(clientShip.angle).toBeCloseTo(serverShip.angle, 5);
  });
});