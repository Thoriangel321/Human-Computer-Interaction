import { performance, type EventLoopUtilization } from 'node:perf_hooks';
import type { Room } from './room.js';

class MetricsCollector {
  private msgCounter = 0;
  private byteCounter = 0;
  private messagesPerSec = 0;
  private bytesPerSec = 0;
  private lastElu: EventLoopUtilization = performance.eventLoopUtilization();
  private eluRatio = 0;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor() {
    this.timer = setInterval(() => {
      this.messagesPerSec = this.msgCounter;
      this.bytesPerSec = this.byteCounter;
      this.msgCounter = 0;
      this.byteCounter = 0;

      const nextElu = performance.eventLoopUtilization();
      const diff = performance.eventLoopUtilization(this.lastElu, nextElu);
      this.lastElu = nextElu;
      this.eluRatio = Number(diff.utilization.toFixed(4));
    }, 1000);
    this.timer.unref();
  }

  public recordIncoming(bytes: number): void {
    this.msgCounter += 1;
    this.byteCounter += bytes;
  }

  public recordOutgoing(bytes: number): void {
    this.msgCounter += 1;
    this.byteCounter += bytes;
  }

  public getSnapshot(rooms: ReadonlyMap<string, Room>): Record<string, unknown> {
    let totalPlayers = 0;
    let avgStepMs = 0;
    let maxStepMs = 0;
    let activeStepRooms = 0;

    for (const room of rooms.values()) {
      totalPlayers += room.playerCount;
      const stats = room.getStepMetrics();
      if (stats.avgStepMs > 0) {
        avgStepMs += stats.avgStepMs;
        activeStepRooms += 1;
      }
      if (stats.maxStepMs > maxStepMs) {
        maxStepMs = stats.maxStepMs;
      }
    }

    const mem = process.memoryUsage();

    return {
      players: totalPlayers,
      rooms: rooms.size,
      messagesPerSec: this.messagesPerSec,
      bytesPerSec: this.bytesPerSec,
      stepDurationMs: {
        avg: activeStepRooms > 0 ? Number((avgStepMs / activeStepRooms).toFixed(3)) : 0,
        max: Number(maxStepMs.toFixed(3))
      },
      eventLoopUtilization: this.eluRatio,
      memoryBytes: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external
      }
    };
  }
}

export const metrics = new MetricsCollector();