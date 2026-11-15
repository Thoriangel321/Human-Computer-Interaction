export class Vector2 {
  public readonly x: number;
  public readonly y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  public add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  public sub(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  public scale(factor: number): Vector2 {
    return new Vector2(this.x * factor, this.y * factor);
  }

  public length(): number {
    return Math.hypot(this.x, this.y);
  }
}