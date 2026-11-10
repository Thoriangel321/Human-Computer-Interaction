export function createLoop({ update, render, onMetricsUpdate }) {
  const DT = 1 / 60;
  const MAX_ACCUMULATOR = 0.25;

  let lastTime = 0;
  let accumulator = 0;
  let isRunning = false;
  let requestId = null;

  let framesCounter = 0;
  let stepsCounter = 0;
  let lastMetricsUpdate = 0;

  function tick(currentTime) {
    if (!isRunning) return;
    if (lastTime === 0) lastTime = currentTime;

    let frameTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (frameTime > MAX_ACCUMULATOR) frameTime = MAX_ACCUMULATOR;
    accumulator += frameTime;

    const currentTimeSec = currentTime / 1000;

    while (accumulator >= DT) {
      update(DT, currentTimeSec); 
      accumulator -= DT;
      stepsCounter++;
    }

    const alpha = accumulator / DT;
    render(alpha);
    framesCounter++;

    if (currentTime - lastMetricsUpdate >= 1000) {
      if (onMetricsUpdate) {
        onMetricsUpdate({ fps: framesCounter, tps: stepsCounter, frameTimeMs: (frameTime * 1000).toFixed(2) });
      }
      framesCounter = 0;
      stepsCounter = 0;
      lastMetricsUpdate = currentTime;
    }
    requestId = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      lastTime = 0;
      requestId = requestAnimationFrame(tick);
    },
    stop() {
      isRunning = false;
      if (requestId) cancelAnimationFrame(requestId);
    }
  };
}