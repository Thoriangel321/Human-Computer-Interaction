export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  // Чисті методи: повертають новий екземпляр, не мутуючи оригінал
  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  mult(n) {
    return new Vector2(this.x * n, this.y * n);
  }

  mag() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize() {
    const m = this.mag();
    if (m === 0) return new Vector2(0, 0);
    return new Vector2(this.x / m, this.y / m);
  }
}