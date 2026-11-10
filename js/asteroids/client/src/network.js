export class GameSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.ws = null;
    this.sendQueue = [];
    
    this.reconnectAttempts = 0;
    this.baseDelay = 500;
    this.maxDelay = 10000;
    this.shouldReconnect = true;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      while (this.sendQueue.length > 0) {
        this.ws.send(this.sendQueue.shift());
      }
      this.dispatchEvent(new Event('open'));
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        this.dispatchEvent(new CustomEvent('message', { detail: event.data }));
      } else {
        try {
          const data = JSON.parse(event.data);
          this.dispatchEvent(new CustomEvent('message', { detail: data }));
        } catch (err) {
          console.error('JSON parse error:', err);
        }
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.dispatchEvent(new Event('close'));
      if (this.shouldReconnect) this.scheduleReconnect();
    };
  }

  send(messageObj) {
    const payload = messageObj instanceof ArrayBuffer ? messageObj : JSON.stringify(messageObj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.sendQueue.push(payload);
    }
  }

  scheduleReconnect() {
    let delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    if (delay > this.maxDelay) delay = this.maxDelay;
    delay += Math.random() * 500;
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) this.ws.close(1000, 'Client disconnected intentionally');
  }
}