export interface FramePercentiles {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly overBudgetCount: number;
}

export class FrameProfiler {
  private readonly samples: number[] = [];
  private readonly scratch: number[] = [];
  private readonly maxSamples: number;
  private recordingUntilMs = 0;
  private isRecording = false;

  constructor(maxSamples = 3600) {
    this.maxSamples = maxSamples;
  }

  public startSession(durationMs = 30000, nowMs = performance.now()): void {
    this.samples.length = 0;
    this.recordingUntilMs = nowMs + durationMs;
    this.isRecording = true;
  }

  public recordFrame(frameDurationMs: number, nowMs = performance.now()): boolean {
    if (!this.isRecording) {
      if (this.samples.length >= this.maxSamples) {
        this.samples.shift();
      }
      this.samples.push(frameDurationMs);
      return false;
    }

    if (nowMs <= this.recordingUntilMs) {
      this.samples.push(frameDurationMs);
      return false;
    }

    this.isRecording = false;
    return true;
  }

  public get active(): boolean {
    return this.isRecording;
  }

  public computePercentiles(): FramePercentiles {
    if (this.samples.length === 0) {
      return { count: 0, p50: 0, p95: 0, p99: 0, max: 0, overBudgetCount: 0 };
    }

    this.scratch.length = this.samples.length;
    let overBudgetCount = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const val = this.samples[i] ?? 0;
      this.scratch[i] = val;
      if (val > 16.7) overBudgetCount += 1;
    }

    this.scratch.sort((a, b) => a - b);

    const at = (q: number): number => {
      const idx = Math.min(this.scratch.length - 1, Math.floor(q * this.scratch.length));
      return this.scratch[idx] ?? 0;
    };

    return {
      count: this.scratch.length,
      p50: Number(at(0.5).toFixed(2)),
      p95: Number(at(0.95).toFixed(2)),
      p99: Number(at(0.99).toFixed(2)),
      max: Number((this.scratch[this.scratch.length - 1] ?? 0).toFixed(2)),
      overBudgetCount
    };
  }
}