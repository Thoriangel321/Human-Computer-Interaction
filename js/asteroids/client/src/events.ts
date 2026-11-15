export type EventListener<T> = (payload: T) => void;

export class EventChannel<T> {
  private readonly listeners = new Set<EventListener<T>>();

  public subscribe(listener: EventListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(payload: T): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}