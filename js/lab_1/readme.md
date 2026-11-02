Event Loop & Game Loop

**JavaScript Event Loop Basics:**
* **Call Stack:** Runs synchronous code. If it's busy, the browser cannot render the screen.
* **Microtask Queue:** Handles Promises. Clears out immediately after the Call Stack is empty.
* **Task Queue:** Handles `setInterval` and DOM events. Processes tasks one at a time.
* **requestAnimationFrame (rAF):** Triggers right before the screen render, syncing perfectly with the monitor's refresh rate.

**Experiments (Breaking the Loop):**
1. **Blocking the Call Stack (100ms loop):** The browser couldn't reach the render phase. Resulted in massive input lag and a drop to ~10 FPS.
2. **Using setInterval instead of rAF:** Browser timers are inaccurate and not synced with the monitor. Resulted in unstable frame rates and micro-stutters.
3. **Variable Timestep (No Accumulator):** When FPS drops, the time delta becomes too large. Physics calculations break, allowing the ship to tunnel through screen boundaries.
