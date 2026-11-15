export class PRNG {
  private seed: number;

  constructor(seed: number) {
    const normalized = Math.floor(seed) % 2147483647;
    this.seed = normalized <= 0 ? normalized + 2147483646 : normalized;
  }

  public next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  public range(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}