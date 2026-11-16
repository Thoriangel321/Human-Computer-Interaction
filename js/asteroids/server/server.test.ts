import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { RateLimiter } from './rateLimiter.js';
import { createServerLoop } from './loop.js';
import { Room } from './room.js';
import { toInputSeq } from '../shared/types.js';

function createMockSocket(): WebSocket {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const mock = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
      return mock;
    })
  };
  return mock as unknown as WebSocket;
}

describe('RateLimiter', () => {
  it('allows burst up to maxTokens and blocks excess requests', () => {
    const limiter = new RateLimiter(3, 1);
    expect(limiter.allow('c1', 1000)).toBe(true);
    expect(limiter.allow('c1', 1000)).toBe(true);
    expect(limiter.allow('c1', 1000)).toBe(true);
    expect(limiter.allow('c1', 1000)).toBe(false);
  });

  it('refills tokens over elapsed time and isolates clients', () => {
    const limiter = new RateLimiter(2, 2);
    expect(limiter.allow('c1', 1000)).toBe(true);
    expect(limiter.allow('c1', 1000)).toBe(true);
    expect(limiter.allow('c1', 1000)).toBe(false);
    expect(limiter.allow('c2', 1000)).toBe(true);

    // Через 1 секунду відновлюються 2 токени
    expect(limiter.allow('c1', 2000)).toBe(true);
    limiter.remove('c1');
    expect(limiter.allow('c1', 2000)).toBe(true);
  });
});

describe('createServerLoop with fake timers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps simulation at fixed tick rate and stops cleanly', () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const loop = createServerLoop(30, (dt) => ticks.push(dt));

    loop.start();
    vi.advanceTimersByTime(110);
    expect(ticks.length).toBeGreaterThanOrEqual(3);

    const countBeforeStop = ticks.length;
    loop.stop();
    vi.advanceTimersByTime(200);
    expect(ticks.length).toBe(countBeforeStop);
  });
});

describe('Room lifecycle & simulation', () => {
  it('spawns initial asteroids and manages player join/leave events', () => {
    const room = new Room('test-room', 'Test Arena', 4);
    expect(room.world.entities.size).toBe(6);

    const joinedSpy = vi.fn();
    const emptySpy = vi.fn();
    room.on('playerJoined', joinedSpy);
    room.on('empty', emptySpy);

    const ws1 = createMockSocket();
    expect(room.addClient(ws1, 'Alice')).toBe(true);
    expect(room.playerCount).toBe(1);
    expect(joinedSpy).toHaveBeenCalledTimes(1);

    room.removeClient(ws1);
    expect(room.playerCount).toBe(0);
    expect(emptySpy).toHaveBeenCalledWith('test-room');
    room.shutdown();
  });

  it('rejects players when room reaches maxPlayers', () => {
    const room = new Room('full-room', 'Full Arena', 1);
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    expect(room.addClient(ws1, 'Alice')).toBe(true);
    expect(room.addClient(ws2, 'Bob')).toBe(false);
    expect(ws2.close).toHaveBeenCalledWith(4000, 'Room is full');
    room.shutdown();
  });

  it('processes queued inputs in stepSimulation and records step metrics', () => {
    const room = new Room('sim-room', 'Sim Arena', 4);
    const ws1 = createMockSocket();
    room.addClient(ws1, 'Pilot');

    room.handleInput(ws1, toInputSeq(1), { up: true, left: false, right: false, space: true });
    vi.useFakeTimers();
    vi.advanceTimersByTime(200);
    vi.useRealTimers();

    room.stepSimulation(1 / 30);
    const metrics = room.getStepMetrics();

    expect(metrics.players).toBe(1);
    expect(metrics.entities).toBeGreaterThanOrEqual(8); // 6 астероїдів + 1 корабель + 1 куля
    expect(metrics.avgStepMs).toBeGreaterThanOrEqual(0);

    room.resetStepMetrics();
    expect(room.getStepMetrics().avgStepMs).toBe(0);
    room.shutdown();
  });
});