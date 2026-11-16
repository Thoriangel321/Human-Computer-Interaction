export class ObjectPool<T> {
  private readonly freeList: T[] = [];
  private readonly factory: () => T;
  private readonly resetFn: (item: T) => void;
  private createdCount = 0;
  private reusedCount = 0;

  constructor(factory: () => T, resetFn: (item: T) => void, initialCapacity = 0) {
    this.factory = factory;
    this.resetFn = resetFn;
    if (initialCapacity > 0) {
      this.preallocate(initialCapacity);
    }
  }

  public preallocate(count: number): void {
    for (let i = 0; i < count; i++) {
      this.createdCount += 1;
      this.freeList.push(this.factory());
    }
  }

  public acquire(): T {
    const existing = this.freeList.pop();
    if (existing !== undefined) {
      this.reusedCount += 1;
      return existing;
    }
    this.createdCount += 1;
    return this.factory();
  }

  public release(item: T): void {
    this.resetFn(item);
    this.freeList.push(item);
  }

  public get freeCount(): number {
    return this.freeList.length;
  }

  public get totalCreated(): number {
    return this.createdCount;
  }

  public get totalReused(): number {
    return this.reusedCount;
  }
}