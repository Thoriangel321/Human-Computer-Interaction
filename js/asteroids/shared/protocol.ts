import { z } from 'zod';
import type { InputKeys } from './entity.js';
import type { SnapshotEntity, WorldBounds } from './world.js';
import {
  assertNever,
  toEntityId,
  toInputSeq,
  toTick,
  type EntityId,
  type InputSeq,
  type Tick
} from './types.js';

export const USE_BINARY = true;
export const PROTOCOL_VERSION = 1;

const MSG_INPUT = 1;
const MSG_SNAPSHOT = 2;
const INPUT_PACKET_SIZE = 7;
const SNAPSHOT_HEADER_SIZE = 12; // 1 ver + 1 type + 4 lastSeq + 4 tick + 2 count
const SNAPSHOT_ENTITY_SIZE = 22; // 2 id + 1 kind + 1 radius + 4 x + 4 y + 4 vx + 4 vy + 2 angle
const MAX_ENTITIES_PER_SNAPSHOT = 512;

// --- ZOD СХЕМИ ПОВІДОМЛЕНЬ ---

export const InputKeysSchema = z.object({
  up: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  space: z.boolean()
});

export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  roomId: z.string().min(1).max(32),
  playerName: z.string().trim().min(1).max(20)
});

export const ChatMessageSchema = z.object({
  type: z.literal('chat'),
  text: z.string().trim().min(1).max(200)
});

export const InputJsonMessageSchema = z.object({
  type: z.literal('input'),
  seq: z.number().int().nonnegative(),
  keys: InputKeysSchema
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  ChatMessageSchema,
  InputJsonMessageSchema
]);

export type JoinMessage = z.infer<typeof JoinMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerJoinedSchema = z.object({
  type: z.literal('joined'),
  roomId: z.string(),
  playerId: z.number().int().positive(),
  seed: z.number().int(),
  bounds: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  })
});

export const ServerSystemSchema = z.object({
  type: z.literal('system'),
  text: z.string()
});

export const ServerChatSchema = z.object({
  type: z.literal('chat'),
  playerName: z.string(),
  text: z.string()
});

export const ServerJsonMessageSchema = z.discriminatedUnion('type', [
  ServerJoinedSchema,
  ServerSystemSchema,
  ServerChatSchema
]);

export type ServerJsonMessage =
  | {
      readonly type: 'joined';
      readonly roomId: string;
      readonly playerId: EntityId;
      readonly seed: number;
      readonly bounds: WorldBounds;
    }
  | z.infer<typeof ServerSystemSchema>
  | z.infer<typeof ServerChatSchema>;

export type ParseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  let text: string;

  if (typeof raw === 'string') {
    text = raw;
  } else if (raw instanceof Uint8Array) {
    text = new TextDecoder().decode(raw);
  } else {
    return { ok: false, error: 'Payload is not a string or Uint8Array' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Malformed JSON syntax' };
  }

  const result = ClientMessageSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      error: `Schema validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`
    };
  }

  return { ok: true, data: result.data };
}

export function parseServerJsonMessage(raw: unknown): ParseResult<ServerJsonMessage> {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Expected string JSON from server' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Malformed server JSON' };
  }

  const result = ServerJsonMessageSchema.safeParse(parsedJson);
  if (!result.success) {
    return { ok: false, error: 'Invalid server message structure' };
  }

  const msg = result.data;
  switch (msg.type) {
    case 'joined':
      return {
        ok: true,
        data: {
          type: 'joined',
          roomId: msg.roomId,
          playerId: toEntityId(msg.playerId),
          seed: msg.seed,
          bounds: msg.bounds
        }
      };
    case 'system':
    case 'chat':
      return { ok: true, data: msg };
    default:
      return assertNever(msg);
  }
}

// --- БІНАРНИЙ ПРОТОКОЛ (DataView, little-endian) ---

export interface DecodedInputPacket {
  readonly type: 'input';
  readonly seq: InputSeq;
  readonly keys: InputKeys;
}

export interface DecodedSnapshotPacket {
  readonly type: 'snapshot';
  readonly lastSeq: InputSeq;
  readonly tick: Tick;
  readonly state: readonly SnapshotEntity[];
}

export function packInput(seq: InputSeq, keys: InputKeys): ArrayBuffer {
  const buf = new ArrayBuffer(INPUT_PACKET_SIZE);
  const view = new DataView(buf);

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MSG_INPUT);
  view.setUint32(2, seq, true);

  let mask = 0;
  if (keys.up) mask |= 1;
  if (keys.left) mask |= 2;
  if (keys.right) mask |= 4;
  if (keys.space) mask |= 8;
  view.setUint8(6, mask);

  return buf;
}

export function unpackInput(data: ArrayBufferView | ArrayBuffer): ParseResult<DecodedInputPacket> {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (view.byteLength !== INPUT_PACKET_SIZE) {
    return {
      ok: false,
      error: `Invalid input packet length: expected ${INPUT_PACKET_SIZE}, got ${view.byteLength}`
    };
  }

  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    return { ok: false, error: `Unsupported protocol version: ${version}` };
  }

  const msgType = view.getUint8(1);
  if (msgType !== MSG_INPUT) {
    return { ok: false, error: `Unexpected binary message type: ${msgType}` };
  }

  const seqNum = view.getUint32(2, true);
  const mask = view.getUint8(6);

  if ((mask & ~0b1111) !== 0) {
    return { ok: false, error: `Invalid input bitmask: ${mask}` };
  }

  return {
    ok: true,
    data: {
      type: 'input',
      seq: toInputSeq(seqNum),
      keys: {
        up: (mask & 1) !== 0,
        left: (mask & 2) !== 0,
        right: (mask & 4) !== 0,
        space: (mask & 8) !== 0
      }
    }
  };
}

export function packSnapshot(
  lastSeq: InputSeq,
  tick: Tick,
  entities: readonly SnapshotEntity[]
): ArrayBuffer {
  const buf = new ArrayBuffer(SNAPSHOT_HEADER_SIZE + entities.length * SNAPSHOT_ENTITY_SIZE);
  const view = new DataView(buf);

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MSG_SNAPSHOT);
  view.setUint32(2, lastSeq, true);
  view.setUint32(6, tick, true);
  view.setUint16(10, entities.length, true);

  let offset = SNAPSHOT_HEADER_SIZE;
  for (const e of entities) {
    view.setUint16(offset, e.id, true);

    let kindByte: number;
    switch (e.kind) {
      case 'ship':
        kindByte = 1;
        break;
      case 'asteroid':
        kindByte = 2;
        break;
      case 'bullet':
        kindByte = 3;
        break;
      default:
        assertNever(e);
    }

    view.setUint8(offset + 2, kindByte);
    view.setUint8(offset + 3, Math.max(1, Math.min(255, Math.round(e.radius))));
    view.setFloat32(offset + 4, e.x, true);
    view.setFloat32(offset + 8, e.y, true);
    view.setFloat32(offset + 12, e.vx, true);
    view.setFloat32(offset + 16, e.vy, true);

    const encodedAngle = Math.max(-32768, Math.min(32767, Math.round(e.a * 10000)));
    view.setInt16(offset + 20, encodedAngle, true);

    offset += SNAPSHOT_ENTITY_SIZE;
  }

  return buf;
}

export function unpackSnapshot(data: ArrayBufferView | ArrayBuffer): ParseResult<DecodedSnapshotPacket> {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (view.byteLength < SNAPSHOT_HEADER_SIZE) {
    return { ok: false, error: 'Snapshot packet shorter than header' };
  }

  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) {
    return { ok: false, error: `Unsupported protocol version: ${version}` };
  }

  const msgType = view.getUint8(1);
  if (msgType !== MSG_SNAPSHOT) {
    return { ok: false, error: `Unexpected binary message type: ${msgType}` };
  }

  const lastSeq = toInputSeq(view.getUint32(2, true));
  const tick = toTick(view.getUint32(6, true));
  const count = view.getUint16(10, true);

  if (count > MAX_ENTITIES_PER_SNAPSHOT) {
    return { ok: false, error: `Snapshot entity count exceeds max: ${count}` };
  }

  const expectedLength = SNAPSHOT_HEADER_SIZE + count * SNAPSHOT_ENTITY_SIZE;
  if (view.byteLength !== expectedLength) {
    return {
      ok: false,
      error: `Snapshot byteLength mismatch: expected ${expectedLength}, got ${view.byteLength}`
    };
  }

  const state: SnapshotEntity[] = [];
  let offset = SNAPSHOT_HEADER_SIZE;

  for (let i = 0; i < count; i++) {
    const rawId = view.getUint16(offset, true);
    if (rawId === 0) {
      return { ok: false, error: 'Invalid entity id 0 in snapshot' };
    }

    const kindByte = view.getUint8(offset + 2);
    let kind: SnapshotEntity['kind'];
    if (kindByte === 1) {
      kind = 'ship';
    } else if (kindByte === 2) {
      kind = 'asteroid';
    } else if (kindByte === 3) {
      kind = 'bullet';
    } else {
      return { ok: false, error: `Unknown entity kind byte: ${kindByte}` };
    }

    const radius = view.getUint8(offset + 3);
    if (radius === 0) {
      return { ok: false, error: 'Invalid entity radius 0 in snapshot' };
    }

    const x = view.getFloat32(offset + 4, true);
    const y = view.getFloat32(offset + 8, true);
    const vx = view.getFloat32(offset + 12, true);
    const vy = view.getFloat32(offset + 16, true);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vx) || !Number.isFinite(vy)) {
      return { ok: false, error: 'Non-finite coordinates or velocity in snapshot' };
    }

    const a = view.getInt16(offset + 20, true) / 10000;

    state.push({
      kind,
      id: toEntityId(rawId),
      x,
      y,
      vx,
      vy,
      a,
      radius
    });

    offset += SNAPSHOT_ENTITY_SIZE;
  }

  return {
    ok: true,
    data: {
      type: 'snapshot',
      lastSeq,
      tick,
      state
    }
  };
}