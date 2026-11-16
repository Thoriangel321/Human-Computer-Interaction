import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientLoop } from './loop.js';
import { ParticleSystem } from './particlePool.js';
import { FrameProfiler } from './profiler.js';
import { compose2, pipe2, pipe3 } from './composition.js';
import { EventChannel } from './events.js';
import { DEFAULT_ARENA_MAP, isInsideBounds } from './map.js';

describe('createClientLoop with fake timers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('executes fixed steps and passes interpolation alpha to render callback', () => {
    vi.useFakeTimers();
    let nowMs = 0;
    const rafCallbacks = new Map<number, (ts: number) => void>();
    let nextRafId = 1;

    vi.stubGlobal('performance', { now: () => nowMs });
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks.delete(id);
    });

    const fixedSteps: number[] = [];
    const alphas: number[] = [];
    const loop = createClientLoop(
      30,
      (dt) => fixedSteps.push(dt),
      (alpha) => alphas.push(alpha)
    );

    loop.start();
    const firstFrame = rafCallbacks.get(1);
    expect(firstFrame).toBeDefined();

    nowMs = 50; // 50 мс = 1 крок по 33.3 мс + 16.7 мс залишок (alpha ≈ 0.5)
    firstFrame?.(nowMs);

    expect(fixedSteps).toHaveLength(1);
    expect(alphas[0]).toBeCloseTo(0.5, 1);

    loop.stop();
    expect(rafCallbacks.size).toBe(0);
  });
});

describe('ParticleSystem (pooled particles)', () => {
  it('emits particles from ObjectPool and recycles expired ones', () => {
    const sys = new ParticleSystem(8);
    expect(sys.pool.freeCount).toBe(8);

    sys.emit(10, 20, 100, -50, 0.2, 3, '#facc15');
    sys.emit(30, 40, 0, 50, 0.5, 2, '#38bdf8');

    expect(sys.activeParticles).toHaveLength(2);
    expect(sys.pool.freeCount).toBe(6);

    sys.update(0.25); // Перша частинка завершила життя, друга активна
    expect(sys.activeParticles).toHaveLength(1);
    expect(sys.pool.freeCount).toBe(7);

    sys.update(0.3); // Друга частинка повернулася в пул
    expect(sys.activeParticles).toHaveLength(0);
    expect(sys.pool.freeCount).toBe(8);
  });
});

describe('FrameProfiler', () => {
  it('computes p50, p95, p99 percentiles and tracks frames over 16.7ms budget', () => {
    const profiler = new FrameProfiler(200);
    profiler.startSession(30000, 1000);
    expect(profiler.active).toBe(true);

    for (let i = 1; i <= 100; i++) {
      const cost = i === 100 ? 22.5 : i * 0.1;
      profiler.recordFrame(cost, 1000 + i * 16);
    }

    const stats = profiler.computePercentiles();
    expect(stats.count).toBe(100);
    expect(stats.p50).toBeCloseTo(5.1, 1);
    expect(stats.p95).toBeCloseTo(9.6, 1);
    expect(stats.p99).toBe(22.5);
    expect(stats.overBudgetCount).toBe(1);

    // Завершення сесії після 30000 мс
    const finished = profiler.recordFrame(4.0, 32000);
    expect(finished).toBe(true);
    expect(profiler.active).toBe(false);
  });

  it('returns zeroed metrics when no samples are recorded', () => {
    const profiler = new FrameProfiler();
    expect(profiler.computePercentiles()).toEqual({
      count: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      overBudgetCount: 0
    });
  });
});

describe('Functional utilities, EventChannel, and Map bounds', () => {
  it('composes unary functions with pipe2, pipe3, and compose2', () => {
    const add1 = (n: number): number => n + 1;
    const double = (n: number): number => n * 2;
    const toStr = (n: number): string => `#${n}`;

    expect(pipe2(add1, double)(4)).toBe(10);
    expect(pipe3(add1, double, toStr)(4)).toBe('#10');
    expect(compose2(double, add1)(4)).toBe(10);
  });

  it('delivers typed events via EventChannel and supports unsubscribe', () => {
    const channel = new EventChannel<string>();
    const received: string[] = [];

    const unsub = channel.subscribe((msg) => received.push(msg));
    channel.emit('first');
    unsub();
    channel.emit('second');

    expect(received).toEqual(['first']);
    channel.clear();
  });

  it('checks arena bounds correctly', () => {
    expect(isInsideBounds(400, 300, DEFAULT_ARENA_MAP.bounds, 16)).toBe(true);
    expect(isInsideBounds(5, 300, DEFAULT_ARENA_MAP.bounds, 16)).toBe(false);
  });
});