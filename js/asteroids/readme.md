## Lab 4: Node.js, WebSockets, Streams & Event Loop

### Node.js vs Browser
* **Environment:** Node.js runs on the V8 engine without a DOM, Window, or Web APIs. It provides OS-level access (file system, network, processes).
* **Module System:** Node traditionally used CommonJS (`require`), but now supports ESM (`import`). The browser natively uses ESM.
* **Global Object:** `global` in Node, `window` in the browser.

### The Event Loop (libuv) Phases
Node.js offloads heavy I/O tasks to the libuv C++ library. The event loop has distinct phases:
1. **Timers:** Executes callbacks from `setTimeout` and `setInterval`.
2. **Pending Callbacks:** Executes I/O callbacks deferred to the next loop iteration.
3. **Idle, Prepare:** Internal libuv use only.
4. **Poll:** Retrieves new I/O events; executes I/O related callbacks. Blocks here if the queue is empty.
5. **Check:** Executes `setImmediate` callbacks.
6. **Close Callbacks:** Executes close handlers (e.g., `socket.on('close', ...)`).

### `EventEmitter` and the `"error"` Event
If an `EventEmitter` emits an `"error"` event and no listener is attached (`.on('error', ...)`), Node.js treats this as an unhandled exception. It will print the stack trace and **crash the entire process**. This is why `pipeline()` is crucial for streams, as it automatically handles internal stream errors.

### Streams and Backpressure
Processing a 100MB file with `fs.readFileSync` loads the entire file into RAM. **Streams** process data in small chunks. **Backpressure** is a mechanism where the writable stream (e.g., a slow network socket) tells the readable stream (e.g., a fast hard drive) to pause reading until the buffer clears. This prevents memory leaks.

### Replay System & Memory Graph (RSS)
When a client requests a match replay (`GET /api/replay/:roomId`), the server pipes the `.ndjson` log file directly to the HTTP response (`node:http` Stream). 
* **Scenario:** A client downloads a 500MB log over a slow 3G connection.
* **Memory Graph (RSS):** The Resident Set Size (RAM usage) curve remains completely **FLAT**.
* **Why:** Because of backpressure. The `pipeline` pauses reading from the disk as soon as the HTTP socket buffer is full, keeping memory consumption near zero regardless of file size.

### Blocking the Event Loop (300ms)
**Question:** What happens if an HTTP handler takes 300ms to process a request synchronously?
**Answer:** Because Node.js executes JavaScript on a **single thread**, a 300ms synchronous block freezes the entire server. During those 300 milliseconds:
* No other HTTP requests can be answered.
* WebSocket ping/pongs are delayed (potentially causing timeouts).
* Timers (`setTimeout`) will fire late.
* New players cannot join. 
Node.js relies on asynchronous I/O; CPU-heavy tasks must be offloaded to Worker Threads.

### npm Workspaces & Configuration
We use `npm workspaces` to manage `client` and `server` in a single monorepo, allowing shared dependencies and atomic installs. We load settings via `process.env` (verified in `config.js`) to strictly adhere to the Twelve-Factor App methodology, separating code from configuration.





