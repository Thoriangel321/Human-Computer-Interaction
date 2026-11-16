import { z } from 'zod';
import type { InputKeys } from './entity.js';
import type { SnapshotEntity, WorldBounds } from './world.js';
import {
  toEntityId,
  toInputSeq,
  toTick,
  type EntityId,
  type InputSeq,
  type Tick
} from './types.js';

export const PROTOCOL_VERSION = 1;
export const USE_BINARY = true;

export const MSG_TYPE = {
  INPUT: 1,
  SNAPSHOT: 2
} as const;

export const ENTITY_KIND = {
  ship: 1,
  asteroid: 2,
  bullet: 3
} as const;

export type DecodeResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

const inputKeysSchema = z.object({
  up: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  space: z.boolean()
}).strict();

const joinMessageSchema = z.object({
  type: z.literal('join'),
  roomId: z.string().trim().min(1).max(32),
  playerName: z.string().trim().min(1).max(20)
}).strict();

const chatMessageSchema = z.object({
  type: z.literal('chat'),
  text: z.string().trim().min(1).max(160)
}).strict();

const clientInputJsonSchema = z.object({
  type: z.literal('input'),
  seq: z.number().int().nonnegative(),
  keys: inputKeysSchema
}).strict();

export const clientMessageSchema = z.discriminatedUnion('type', [
  joinMessageSchema,
  chatMessageSchema,
  clientInputJsonSchema
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

const serverJoinedSchema = z.object({
  type: z.literal('joined'),
  roomId: z.string().min(1),
  playerId: z.number().int().positive().transform(toEntityId),
  seed: z.number().int(),
  bounds: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }).strict()
}).strict();

const serverSystemSchema = z.object({
  type: z.literal('system'),
  text: z.string().min(1)
}).strict();

const serverChatSchema = z.object({
  type: z.literal('chat'),
  playerName: z.string().min(1),
  text: z.string().min(1)
}).strict();

const serverShutdownSchema = z.object({
  type: z.literal('shutdown'),
  reason: z.string().min(1)
}).strict();

export const serverJsonMessageSchema = z.discriminatedUnion('type', [
  serverJoinedSchema,
  serverSystemSchema,
  serverChatSchema,
  serverShutdownSchema
]);

export type ServerJsonMessage =
  | {
      readonly type: 'joined';
      readonly roomId: string;
      readonly playerId: EntityId;
      readonly seed: number;
      readonly bounds: WorldBounds;
    }
  | {
      readonly type: 'system';
      readonly text: string;
    }
  | {
      readonly type: 'chat';
      readonly playerName: string;
      readonly text: string;
    }
  | {
      readonly type: 'shutdown';
      readonly reason: string;
    };

function decodeRawJson(raw: unknown): DecodeResult<unknown> {
  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else if (raw instanceof Uint8Array) {
    text = new TextDecoder().decode(raw);
  } else if (raw instanceof ArrayBuffer) {
    text = new TextDecoder().decode(new Uint8Array(raw));
  } else {
    return { ok: false, error: 'Unsupported message payload type' };
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'Malformed JSON syntax' };
  }
}

export function parseClientMessage(raw: unknown): DecodeResult<ClientMessage> {
  const jsonResult = decodeRawJson(raw);
  if (!jsonResult.ok) return jsonResult;

  const parsed = clientMessageSchema.safeParse(jsonResult.data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid client message' };
  }
  return { ok: true, data: parsed.data };
}

export function parseServerJsonMessage(raw: unknown): DecodeResult<ServerJsonMessage> {
  const jsonResult = decodeRawJson(raw);
  if (!jsonResult.ok) return jsonResult;

  const parsed = serverJsonMessageSchema.safeParse(jsonResult.data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid server message' };
  }
  return { ok: true, data: parsed.data };
}

export function packInput(seq: InputSeq, keys: InputKeys): ArrayBuffer {
  const buffer = new ArrayBuffer(7);
  const view = new DataView(buffer);

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MSG_TYPE.INPUT);
  view.setUint32(2, seq >>> 0, true);

  let mask = 0;
  if (keys.up) mask |= 1 << 0;
  if (keys.left) mask |= 1 << 1;
  if (keys.right) mask |= 1 << 2;
  if (keys.space) mask |= 1 << 3;
  view.setUint8(6, mask);

  return buffer;
}

export interface UnpackedInput {
  readonly seq: InputSeq;
  readonly keys: InputKeys;
}

export function unpackInput(data: ArrayBuffer | Uint8Array): DecodeResult<UnpackedInput> {
  const view =
    data instanceof Uint8Array
      ? new DataView(data.buffer, data.byteOffset, data.byteLength)
      : new DataView(data);

  if (view.byteLength !== 7) {
    return { ok: false, error: `Invalid input packet length: ${view.byteLength}` };
  }

  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    return { ok: false, error: `Unsupported protocol version: ${version}` };
  }

  const type = view.getUint8(1);
  if (type !== MSG_TYPE.INPUT) {
    return { ok: false, error: `Unexpected input message type: ${type}` };
  }

  const seq = toInputSeq(view.getUint32(2, true));
  const mask = view.getUint8(6);

  if ((mask & ~0x0f) !== 0) {
    return { ok: false, error: `Invalid input bitmask: ${mask}` };
  }

  return {
    ok: true,
    data: {
      seq,
      keys: {
        up: (mask & (1 << 0)) !== 0,
        left: (mask & (1 << 1)) !== 0,
        right: (mask & (1 << 2)) !== 0,
        space: (mask & (1 << 3)) !== 0
      }
    }
  };
}

export function packSnapshot(
  lastSeq: InputSeq,
  tick: Tick,
  entities: readonly SnapshotEntity[]
): ArrayBuffer {
  const headerSize = 12;
  const recordSize = 22;
  const count = Math.min(entities.length, 65535);
  const buffer = new ArrayBuffer(headerSize + count * recordSize);
  const view = new DataView(buffer);

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MSG_TYPE.SNAPSHOT);
  view.setUint32(2, lastSeq >>> 0, true);
  view.setUint32(6, tick >>> 0, true);
  view.setUint16(10, count, true);

  let offset = headerSize;
  for (let i = 0; i < count; i++) {
    const e = entities[i];
    if (e === undefined) continue;

    view.setUint16(offset, e.id, true);
    view.setUint8(offset + 2, ENTITY_KIND[e.kind]);
    view.setUint8(offset + 3, Math.max(1, Math.min(255, Math.round(e.radius))));
    view.setFloat32(offset + 4, e.x, true);
    view.setFloat32(offset + 8, e.y, true);
    view.setFloat32(offset + 12, e.vx, true);
    view.setFloat32(offset + 16, e.vy, true);

    const normalizedAngle = Math.atan2(Math.sin(e.a), Math.cos(e.a));
    const encodedAngle = Math.round((normalizedAngle / Math.PI) * 32767);
    view.setInt16(offset + 20, encodedAngle, true);

    offset += recordSize;
  }

  return buffer;
}

export interface UnpackedSnapshot {
  readonly lastSeq: InputSeq;
  readonly tick: Tick;
  readonly state: readonly SnapshotEntity[];
}

export function unpackSnapshot(data: ArrayBuffer | Uint8Array): DecodeResult<UnpackedSnapshot> {
  const view =
    data instanceof Uint8Array
      ? new DataView(data.buffer, data.byteOffset, data.byteLength)
      : new DataView(data);

  const headerSize = 12;
  const recordSize = 22;

  if (view.byteLength < headerSize) {
    return { ok: false, error: `Snapshot too short: ${view.byteLength}` };
  }

  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    return { ok: false, error: `Unsupported protocol version: ${version}` };
  }

  const type = view.getUint8(1);
  if (type !== MSG_TYPE.SNAPSHOT) {
    return { ok: false, error: `Unexpected snapshot message type: ${type}` };
  }

  const lastSeq = toInputSeq(view.getUint32(2, true));
  const tick = toTick(view.getUint32(6, true));
  const count = view.getUint16(10, true);

  const expectedLength = headerSize + count * recordSize;
  if (view.byteLength !== expectedLength) {
    return {
      ok: false,
      error: `Snapshot length mismatch: expected ${expectedLength}, got ${view.byteLength}`
    };
  }

  const state: SnapshotEntity[] = [];
  let offset = headerSize;

  for (let i = 0; i < count; i++) {
    const rawId = view.getUint16(offset, true);
    if (rawId === 0) {
      return { ok: false, error: 'Entity id 0 is invalid' };
    }
    const id = toEntityId(rawId);

    const kindCode = view.getUint8(offset + 2);
    const radius = view.getUint8(offset + 3);
    const x = view.getFloat32(offset + 4, true);
    const y = view.getFloat32(offset + 8, true);
    const vx = view.getFloat32(offset + 12, true);
    const vy = view.getFloat32(offset + 16, true);
    const encodedAngle = view.getInt16(offset + 20, true);
    const a = (encodedAngle / 32767) * Math.PI;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(vx) ||
      !Number.isFinite(vy) ||
      !Number.isFinite(a)
    ) {
      return { ok: false, error: `Non-finite float in entity ${id}` };
    }

    if (kindCode === ENTITY_KIND.ship) {
      state.push({ kind: 'ship', id, x, y, vx, vy, a, radius });
    } else if (kindCode === ENTITY_KIND.asteroid) {
      state.push({ kind: 'asteroid', id, x, y, vx, vy, a, radius });
    } else if (kindCode === ENTITY_KIND.bullet) {
      state.push({ kind: 'bullet', id, x, y, vx, vy, a, radius });
    } else {
      return { ok: false, error: `Unknown entity kind code: ${kindCode}` };
    }

    offset += recordSize;
  }

  return { ok: true, data: { lastSeq, tick, state } };
}