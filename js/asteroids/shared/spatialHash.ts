import type { Vec2Like } from './math.js';

export interface SpatialBody {
  readonly id: number;
  readonly pos: Vec2Like;
  readonly radius: number;
}

export class SpatialHash<T extends SpatialBody> {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly cells = new Map<number, T[]>();
  private readonly activeCells: T[][] = [];
  private readonly visitedIds = new Set<number>();

  constructor(cellSize = 80) {
    this.cellSize = Math.max(16, cellSize);
    this.invCellSize = 1 / this.cellSize;
  }

  private hashCoords(cx: number, cy: number): number {
    // Безпечне пакування двох 16-бітних знакових координат комірки в одне ціле число
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
  }

  public clear(): void {
    for (let i = 0; i < this.activeCells.length; i++) {
      const bucket = this.activeCells[i];
      if (bucket !== undefined) {
        bucket.length = 0;
      }
    }
    this.activeCells.length = 0;
  }

  public insert(body: T): void {
    const minX = Math.floor((body.pos.x - body.radius) * this.invCellSize);
    const maxX = Math.floor((body.pos.x + body.radius) * this.invCellSize);
    const minY = Math.floor((body.pos.y - body.radius) * this.invCellSize);
    const maxY = Math.floor((body.pos.y + body.radius) * this.invCellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this.hashCoords(cx, cy);
        let bucket = this.cells.get(key);
        if (bucket === undefined) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        if (bucket.length === 0) {
          this.activeCells.push(bucket);
        }
        bucket.push(body);
      }
    }
  }

  public query(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    this.visitedIds.clear();

    const minX = Math.floor((x - radius) * this.invCellSize);
    const maxX = Math.floor((x + radius) * this.invCellSize);
    const minY = Math.floor((y - radius) * this.invCellSize);
    const maxY = Math.floor((y + radius) * this.invCellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this.hashCoords(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket === undefined) continue;

        for (let i = 0; i < bucket.length; i++) {
          const candidate = bucket[i];
          if (candidate !== undefined && !this.visitedIds.has(candidate.id)) {
            this.visitedIds.add(candidate.id);
            out.push(candidate);
          }
        }
      }
    }

    return out;
  }
}