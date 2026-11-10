
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
    console.log(`Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected!');
      this.reconnectAttempts = 0; 

      while (this.sendQueue.length > 0) {
        const msg = this.sendQueue.shift();
        this.ws.send(msg);
      }
      
      this.dispatchEvent(new Event('open'));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.dispatchEvent(new CustomEvent('message', { detail: data }));
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onclose = (event) => {
      console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
      this.ws = null;
      this.dispatchEvent(new Event('close'));

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  send(messageObj) {
    const payload = JSON.stringify(messageObj);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      console.log('Socket not open. Queuing message:', messageObj.type);
      this.sendQueue.push(payload);
    }
  }

  scheduleReconnect() {
    let delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    if (delay > this.maxDelay) delay = this.maxDelay;
    
    delay += Math.random() * 500;

    console.log(`Reconnecting in ${Math.round(delay)}ms...`);
    this.reconnectAttempts++;

    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected intentionally');
    }
  }
}