export class RateLimiter {
  private readonly maxTokens: number;
  private readonly refillPerSecond: number;
  private readonly buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  constructor(maxTokens = 60, refillPerSecond = 45) {
    this.maxTokens = maxTokens;
    this.refillPerSecond = refillPerSecond;
  }

  public allow(clientKey: string, nowMs = Date.now()): boolean {
    let bucket = this.buckets.get(clientKey);
    if (bucket === undefined) {
      bucket = { tokens: this.maxTokens - 1, lastRefillMs: nowMs };
      this.buckets.set(clientKey, bucket);
      return true;
    }

    const elapsedSec = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
    if (elapsedSec > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsedSec * this.refillPerSecond);
      bucket.lastRefillMs = nowMs;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  public remove(clientKey: string): void {
    this.buckets.delete(clientKey);
  }
}