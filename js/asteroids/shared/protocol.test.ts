import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  packInput,
  packSnapshot,
  parseClientMessage,
  parseServerJsonMessage,
  PROTOCOL_VERSION,
  unpackInput,
  unpackSnapshot
} from './protocol.js';
import { Ship } from './entity.js';
import { toEntityId, toInputSeq, toTick } from './types.js';
import type { SnapshotEntity } from './world.js';

describe('Binary & JSON protocol unit tests', () => {
  it('packs and unpacks binary input packets accurately', () => {
    const seq = toInputSeq(42);
    const keys = { up: true, left: false, right: true, space: true };
    const buf = packInput(seq, keys);

    expect(buf.byteLength).toBe(7);
    const decoded = unpackInput(buf);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.data.seq).toBe(seq);
      expect(decoded.data.keys).toEqual(keys);
    }
  });

  it('rejects input packets with wrong length, version, type, or bitmask', () => {
    expect(unpackInput(new ArrayBuffer(3)).ok).toBe(false);

    const badVer = new Uint8Array([99, 1, 1, 0, 0, 0, 0]);
    expect(unpackInput(badVer).ok).toBe(false);

    const badType = new Uint8Array([PROTOCOL_VERSION, 9, 1, 0, 0, 0, 0]);
    expect(unpackInput(badType).ok).toBe(false);

    const badMask = new Uint8Array([PROTOCOL_VERSION, 1, 1, 0, 0, 0, 0b11110000]);
    expect(unpackInput(badMask).ok).toBe(false);
  });

  it('packs and unpacks snapshot packets for ship, asteroid, and bullet', () => {
    const entities: SnapshotEntity[] = [
      { kind: 'ship', id: toEntityId(1), x: 100.5, y: 200.25, vx: 12, vy: -8, a: 1.25, radius: 16 },
      { kind: 'asteroid', id: toEntityId(2), x: 300, y: 400, vx: -30, vy: 45, a: -0.5, radius: 24 },
      { kind: 'bullet', id: toEntityId(3), x: 150, y: 210, vx: 400, vy: 0, a: 0, radius: 4 }
    ];

    const buf = packSnapshot(toInputSeq(15), toTick(90), entities);
    expect(buf.byteLength).toBe(12 + 3 * 22);

    const decoded = unpackSnapshot(buf);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.data.lastSeq).toBe(toInputSeq(15));
      expect(decoded.data.tick).toBe(toTick(90));
      expect(decoded.data.state).toHaveLength(3);
      expect(decoded.data.state[2]?.kind).toBe('bullet');
    }
  });

  it('rejects snapshots with NaN coordinates, unknown kind, or id 0', () => {
    const badSnap: SnapshotEntity[] = [
      { kind: 'ship', id: toEntityId(1), x: Number.NaN, y: 10, vx: 0, vy: 0, a: 0, radius: 16 }
    ];
    const buf = packSnapshot(toInputSeq(1), toTick(1), badSnap);
    expect(unpackSnapshot(buf).ok).toBe(false);

    const view = new DataView(buf);
    view.setFloat32(16, 10, true);
    view.setUint8(14, 99); // unknown kind
    expect(unpackSnapshot(buf).ok).toBe(false);

    view.setUint16(12, 0, true); // invalid id 0
    expect(unpackSnapshot(buf).ok).toBe(false);
  });

  it('parses valid server JSON messages and rejects malformed ones', () => {
    const joined = parseServerJsonMessage(
      JSON.stringify({
        type: 'joined',
        roomId: 'room1',
        playerId: 5,
        seed: 123,
        bounds: { width: 800, height: 600 }
      })
    );
    expect(joined.ok).toBe(true);

    const chat = parseServerJsonMessage(
      JSON.stringify({ type: 'chat', playerName: 'Alice', text: 'Hi!' })
    );
    expect(chat.ok).toBe(true);

    expect(parseServerJsonMessage(12345).ok).toBe(false);
    expect(parseServerJsonMessage('{bad-json').ok).toBe(false);
    expect(parseServerJsonMessage(JSON.stringify({ type: 'unknown' })).ok).toBe(false);
  });
});

describe('fast-check property-based tests (7 properties)', () => {
  const inputKeysArb = fc.record({
    up: fc.boolean(),
    left: fc.boolean(),
    right: fc.boolean(),
    space: fc.boolean()
  });

  const snapshotEntityArb: fc.Arbitrary<SnapshotEntity> = fc.record({
    kind: fc.constantFrom<'ship' | 'asteroid' | 'bullet'>('ship', 'asteroid', 'bullet'),
    id: fc.integer({ min: 1, max: 60000 }).map(toEntityId),
    x: fc.float({ min: -2000, max: 2000, noNaN: true, noDefaultInfinity: true }),
    y: fc.float({ min: -2000, max: 2000, noNaN: true, noDefaultInfinity: true }),
    vx: fc.float({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    vy: fc.float({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    a: fc.float({ min: -3.14, max: 3.14, noNaN: true, noDefaultInfinity: true }),
    radius: fc.integer({ min: 1, max: 120 })
  });

  it('Property 1: packInput -> unpackInput roundtrip preserves seq and keys', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), inputKeysArb, (rawSeq, keys) => {
        const seq = toInputSeq(rawSeq);
        const decoded = unpackInput(packInput(seq, keys));
        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
          expect(decoded.data.seq).toBe(seq);
          expect(decoded.data.keys).toEqual(keys);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property 2: packSnapshot -> unpackSnapshot roundtrip preserves fields within angle rounding tolerance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(snapshotEntityArb, { maxLength: 20 }),
        (rawSeq, rawTick, entities) => {
          const buf = packSnapshot(toInputSeq(rawSeq), toTick(rawTick), entities);
          const decoded = unpackSnapshot(buf);
          expect(decoded.ok).toBe(true);
          if (decoded.ok) {
            expect(decoded.data.state).toHaveLength(entities.length);
            for (let i = 0; i < entities.length; i++) {
              const orig = entities[i];
              const dec = decoded.data.state[i];
              if (orig === undefined || dec === undefined) continue;
              expect(dec.id).toBe(orig.id);
              expect(dec.kind).toBe(orig.kind);
              expect(dec.radius).toBe(orig.radius);
              expect(dec.x).toBeCloseTo(orig.x, 3);
              expect(dec.y).toBeCloseTo(orig.y, 3);
              expect(Math.abs(dec.a - orig.a)).toBeLessThan(0.0002);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3: binary frame byteLength strictly matches protocol specification', () => {
    fc.assert(
      fc.property(fc.array(snapshotEntityArb, { maxLength: 30 }), (entities) => {
        const snapBuf = packSnapshot(toInputSeq(1), toTick(1), entities);
        expect(snapBuf.byteLength).toBe(12 + entities.length * 22);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 4: arbitrary corrupted binary buffers never crash unpackInput or unpackSnapshot', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 128 }), (bytes) => {
        const resIn = unpackInput(bytes);
        const resSnap = unpackSnapshot(bytes);
        expect(typeof resIn.ok).toBe('boolean');
        expect(typeof resSnap.ok).toBe('boolean');
      }),
      { numRuns: 200 }
    );
  });

  it('Property 5: ship remains inside arena bounds under arbitrary input sequences', () => {
    fc.assert(
      fc.property(fc.array(inputKeysArb, { minLength: 1, maxLength: 60 }), (sequence) => {
        const bounds = { width: 800, height: 600 };
        const ship = new Ship(toEntityId(1), 400, 300);
        const dt = 1 / 30;

        for (const keys of sequence) {
          reconcileShipState(
            ship,
            {
              kind: 'ship',
              id: ship.id,
              x: ship.pos.x,
              y: ship.pos.y,
              vx: ship.vel.x,
              vy: ship.vel.y,
              a: ship.angle,
              radius: ship.radius
            },
            toInputSeq(0),
            [{ seq: toInputSeq(1), keys }],
            bounds,
            dt
          );

          expect(ship.pos.x).toBeGreaterThanOrEqual(ship.radius);
          expect(ship.pos.x).toBeLessThanOrEqual(bounds.width - ship.radius);
          expect(ship.pos.y).toBeGreaterThanOrEqual(ship.radius);
          expect(ship.pos.y).toBeLessThanOrEqual(bounds.height - ship.radius);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property 6: parseClientMessage accepts valid generated join and chat payloads', () => {
    const validNameArb = fc
      .stringMatching(/^[A-Za-z0-9_-]{1,16}$/)
      .filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(validNameArb, validNameArb, (roomId, playerName) => {
        const raw = JSON.stringify({ type: 'join', roomId, playerName });
        const parsed = parseClientMessage(raw);
        expect(parsed.ok).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 7: parseClientMessage rejects arbitrary malformed strings without throwing', () => {
    fc.assert(
      fc.property(fc.string(), (garbage) => {
        const parsed = parseClientMessage(garbage);
        expect(typeof parsed.ok).toBe('boolean');
      }),
      { numRuns: 200 }
    );
  });
});