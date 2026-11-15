export interface ClientLoop {
  start(): void;
  stop(): void;
}

export function createClientLoop(
  fixedRateHz: number,
  onFixedStep: (dt: number) => void,
  onRender: (alpha: number, now: number) => void
): ClientLoop {
  const fixedDt = 1 / fixedRateHz;
  let running = false;
  let rafId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;

  function frame(now: number): void {
    if (!running) return;

    const frameDt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += frameDt;

    while (accumulator >= fixedDt) {
      onFixedStep(fixedDt);
      accumulator -= fixedDt;
    }

    const alpha = accumulator / fixedDt;
    onRender(alpha, now);

    rafId = requestAnimationFrame(frame);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTime = performance.now();
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  };
}