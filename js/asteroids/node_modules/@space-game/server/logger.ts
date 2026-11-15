import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PassThrough, Transform, pipeline, type TransformCallback } from 'node:stream';
import type { EntityId, Tick } from '../shared/types.js';

export type MatchLogEvent =
  | { readonly event: 'room_created'; readonly roomId: string; readonly seed: number }
  | { readonly event: 'player_joined'; readonly playerId: EntityId; readonly playerName: string }
  | { readonly event: 'player_left'; readonly playerId: EntityId; readonly playerName: string }
  | { readonly event: 'chat'; readonly playerName: string; readonly text: string }
  | { readonly event: 'snapshot'; readonly tick: Tick; readonly entityCount: number };

export interface TimestampedLogEntry {
  readonly ts: string;
  readonly payload: MatchLogEvent;
}

export class MatchLogger {
  public readonly filePath: string;
  private readonly source: PassThrough;
  private closed = false;

  constructor(roomId: string, logDir: string) {
    mkdirSync(logDir, { recursive: true });
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.filePath = path.join(logDir, `match-${safeRoomId}-${Date.now()}.ndjson`);

    this.source = new PassThrough({ objectMode: true });

    const ndjsonTransform = new Transform({
      writableObjectMode: true,
      transform(chunk: unknown, _encoding: BufferEncoding, callback: TransformCallback): void {
        try {
          const line = `${JSON.stringify(chunk)}\n`;
          callback(null, line);
        } catch (err: unknown) {
          callback(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });

    const destination = createWriteStream(this.filePath, { flags: 'a', encoding: 'utf8' });

    pipeline(this.source, ndjsonTransform, destination, (err: NodeJS.ErrnoException | null) => {
      if (err) {
        console.error(`[MatchLogger:${roomId}] Pipeline error:`, err.message);
      }
    });
  }

  public log(payload: MatchLogEvent): void {
    if (this.closed || !this.source.writable) return;
    const entry: TimestampedLogEntry = {
      ts: new Date().toISOString(),
      payload
    };
    this.source.write(entry);
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.source.end();
  }
}