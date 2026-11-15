export interface ServerLoop {
  start(): void;
  stop(): void;
}

export function createServerLoop(tickRate: number, updateFn: (dt: number) => void): ServerLoop {
  const tickInterval = 1000 / tickRate;
  const fixedDt = 1 / tickRate;

  let expectedTime = performance.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  function tick(): void {
    if (!running) return;

    updateFn(fixedDt);
    expectedTime += tickInterval;
    let delay = expectedTime - performance.now();

    if (delay < 0) {
      expectedTime = performance.now();
      delay = 0;
    }

    timeoutId = setTimeout(tick, delay);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      expectedTime = performance.now() + tickInterval;
      timeoutId = setTimeout(tick, tickInterval);
    },
    stop(): void {
      running = false;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}