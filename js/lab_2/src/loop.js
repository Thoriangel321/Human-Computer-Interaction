export function createLoop({ update, render, onMetricsUpdate }) {
  const DT = 1 / 60; // Фіксований крок симуляції (60 TPS)
  const MAX_ACCUMULATOR = 0.25; // Захист від "спіралі смерті" при згортанні вкладки

  let lastTime = 0;
  let accumulator = 0;
  let isRunning = false;
  let requestId = null;

  // Лічильники для HUD метрик
  let framesCounter = 0;
  let stepsCounter = 0;
  let lastMetricsUpdate = 0;

  function tick(currentTime) {
    if (!isRunning) return;

    if (lastTime === 0) {
      lastTime = currentTime;
    }

    // Розрахунок дельти кадру в секундах
    let frameTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Відсікаємо занадто великі паузи (наприклад, перемикання вкладок)
    if (frameTime > MAX_ACCUMULATOR) {
      frameTime = MAX_ACCUMULATOR;
    }

    accumulator += frameTime;

    // 1. Фіксована симуляція фізики (Task/Microtask friendly)
    while (accumulator >= DT) {
      update(DT);
      accumulator -= DT;
      stepsCounter++;
    }

    // 2. Рендер з інтерполяцією (alpha: 0.0 ... 1.0)
    const alpha = accumulator / DT;
    render(alpha);
    framesCounter++;

    // 3. Оновлення HUD раз на секунду
    if (currentTime - lastMetricsUpdate >= 1000) {
      if (onMetricsUpdate) {
        onMetricsUpdate({
          fps: framesCounter,
          tps: stepsCounter,
          frameTimeMs: (frameTime * 1000).toFixed(2)
        });
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
      if (requestId) {
        cancelAnimationFrame(requestId);
      }
    }
  };
}