import type { ClientMessage } from '../../shared/protocol.js';

export type IncomingSocketPayload =
  | { readonly kind: 'binary'; readonly data: ArrayBuffer | Blob }
  | { readonly kind: 'text'; readonly text: string };

export interface GameSocketHandlers {
  onOpen?: () => void;
  onMessage?: (payload: IncomingSocketPayload) => void;
  onClose?: () => void;
}

export class GameSocket {
  private readonly url: string;
  private ws: WebSocket | null = null;
  private readonly sendQueue: Array<string | ArrayBuffer> = [];

  private reconnectAttempts = 0;
  private readonly baseDelay = 500;
  private readonly maxDelay = 10000;
  private shouldReconnect = true;
  private handlers: GameSocketHandlers = {};

  constructor(url: string) {
    this.url = url;
  }

  public setHandlers(handlers: GameSocketHandlers): void {
    this.handlers = handlers;
  }

  public connect(): void {
    const socket = new WebSocket(this.url);
    socket.binaryType = 'arraybuffer';
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      while (this.sendQueue.length > 0) {
        const queued = this.sendQueue.shift();
        if (queued !== undefined) {
          socket.send(queued);
        }
      }
      this.handlers.onOpen?.();
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (payload instanceof ArrayBuffer || payload instanceof Blob) {
        this.handlers.onMessage?.({ kind: 'binary', data: payload });
      } else if (typeof payload === 'string') {
        this.handlers.onMessage?.({ kind: 'text', text: payload });
      }
    };

    socket.onclose = () => {
      this.ws = null;
      this.handlers.onClose?.();
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  public sendJson(message: ClientMessage): void {
    this.sendRaw(JSON.stringify(message));
  }

  public sendBinary(buffer: ArrayBuffer): void {
    this.sendRaw(buffer);
  }

  private sendRaw(payload: string | ArrayBuffer): void {
    if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.sendQueue.push(payload);
    }
  }

  private scheduleReconnect(): void {
    const expDelay = Math.min(this.maxDelay, this.baseDelay * Math.pow(2, this.reconnectAttempts));
    const jitter = Math.random() * 500;
    this.reconnectAttempts += 1;
    setTimeout(() => this.connect(), expDelay + jitter);
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws !== null) {
      this.ws.close(1000, 'Client disconnected intentionally');
    }
  }
}