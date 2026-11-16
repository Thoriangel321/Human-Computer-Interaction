import { describe, expect, it, vi } from 'vitest';
import { ObjectPool } from './pool.js';
import { SpatialHash, type SpatialBody } from './spatialHash.js';
import { PRNG } from './random.js';
import { assertNever } from './types.js';

describe('ObjectPool', () => {
  it('preallocates initial capacity and reuses released items', () => {
    const resetSpy = vi.fn((item: { value: number }) => {
      item.value = 0;
    });
    const pool = new ObjectPool(() => ({ value: 1 }), resetSpy, 4);

    expect(pool.freeCount).toBe(4);
    expect(pool.totalCreated).toBe(4);

    const a = pool.acquire();
    a.value = 99;
    expect(pool.freeCount).toBe(3);
    expect(pool.totalReused).toBe(1);

    pool.release(a);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(a.value).toBe(0);
    expect(pool.freeCount).toBe(4);
  });

  it('creates a new object when pool is exhausted', () => {
    const pool = new ObjectPool(() => ({ id: Math.random() }), () => {}, 1);
    const first = pool.acquire();
    const second = pool.acquire();

    expect(first).not.toBe(second);
    expect(pool.totalCreated).toBe(2);
    expect(pool.totalReused).toBe(1);
  });
});

describe('SpatialHash', () => {
  function makeBody(id: number, x: number, y: number, radius: number): SpatialBody {
    return { id, pos: { x, y }, radius };
  }

  it('finds nearby bodies and ignores bodies in distant cells', () => {
    const hash = new SpatialHash<SpatialBody>(80);
    const b1 = makeBody(1, 50, 50, 15);
    const b2 = makeBody(2, 70, 60, 15);
    const far = makeBody(3, 650, 520, 20);

    hash.insert(b1);
    hash.insert(b2);
    hash.insert(far);

    const out: SpatialBody[] = [];
    hash.query(55, 55, 30, out);

    expect(out.map((b) => b.id)).toEqual([1, 2]);
  });

  it('deduplicates bodies spanning multiple cells', () => {
    const hash = new SpatialHash<SpatialBody>(50);
    const large = makeBody(10, 50, 50, 40);
    hash.insert(large);

    const out: SpatialBody[] = [];
    hash.query(50, 50, 45, out);

    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(10);
  });

  it('clears active cells between simulation ticks', () => {
    const hash = new SpatialHash<SpatialBody>(80);
    hash.insert(makeBody(1, 100, 100, 10));
    hash.clear();

    const out: SpatialBody[] = [];
    hash.query(100, 100, 20, out);
    expect(out).toHaveLength(0);
  });
});

describe('PRNG and assertNever', () => {
  it('generates identical deterministic sequences for identical seeds', () => {
    const rngA = new PRNG(123456);
    const rngB = new PRNG(123456);

    const seqA = Array.from({ length: 10 }, () => rngA.range(10, 90));
    const seqB = Array.from({ length: 10 }, () => rngB.range(10, 90));

    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(90);
    }
  });

  it('throws on unexpected value in assertNever', () => {
    const invalid = 'unexpected' as never;
    expect(() => assertNever(invalid)).toThrow();
  });
});