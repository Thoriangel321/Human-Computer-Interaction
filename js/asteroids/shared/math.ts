export interface Vec2Like {
  readonly x: number;
  readonly y: number;
}

export class Vector2 implements Vec2Like {
  public readonly x: number;
  public readonly y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  public add(other: Vec2Like): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  public sub(other: Vec2Like): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  public scale(factor: number): Vector2 {
    return new Vector2(this.x * factor, this.y * factor);
  }

  public length(): number {
    return Math.hypot(this.x, this.y);
  }

  public lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }
}

export class MutableVector2 implements Vec2Like {
  public x: number;
  public y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  public set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  public copyFrom(other: Vec2Like): this {
    this.x = other.x;
    this.y = other.y;
    return this;
  }

  public addInPlace(other: Vec2Like): this {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  public subInPlace(other: Vec2Like): this {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  public addScaledInPlace(vx: number, vy: number, scale: number): this {
    this.x += vx * scale;
    this.y += vy * scale;
    return this;
  }

  public scaleInPlace(factor: number): this {
    this.x *= factor;
    this.y *= factor;
    return this;
  }

  public length(): number {
    return Math.hypot(this.x, this.y);
  }

  public lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }
}

export function integrate(pos: MutableVector2, vel: Vec2Like, dt: number): void {
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
}