export interface WorkerEntityItem {
  readonly id: number;
  readonly kind: 'ship' | 'asteroid' | 'bullet';
  readonly radius: number;
  readonly x0: number;
  readonly y0: number;
  readonly a0: number;
  readonly x1: number;
  readonly y1: number;
  readonly a1: number;
}

export interface WorkerInterpolateRequest {
  readonly type: 'interpolate';
  readonly alpha: number;
  readonly items: readonly WorkerEntityItem[];
}

export interface WorkerInterpolatedEntity {
  readonly id: number;
  readonly kind: 'ship' | 'asteroid' | 'bullet';
  readonly radius: number;
  readonly x: number;
  readonly y: number;
  readonly a: number;
}

export interface WorkerInterpolateResponse {
  readonly type: 'interpolated';
  readonly entities: readonly WorkerInterpolatedEntity[];
}

function interpolateAngle(a0: number, a1: number, t: number): number {
  let diff = a1 - a0;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a0 + diff * t;
}

self.addEventListener('message', (event: MessageEvent<WorkerInterpolateRequest>) => {
  const msg = event.data;
  if (msg.type !== 'interpolate') return;

  const t = Math.max(0, Math.min(1, msg.alpha));
  const entities: WorkerInterpolatedEntity[] = new Array<WorkerInterpolatedEntity>(msg.items.length);

  for (let i = 0; i < msg.items.length; i++) {
    const item = msg.items[i];
    if (item === undefined) continue;
    entities[i] = {
      id: item.id,
      kind: item.kind,
      radius: item.radius,
      x: item.x0 + (item.x1 - item.x0) * t,
      y: item.y0 + (item.y1 - item.y0) * t,
      a: interpolateAngle(item.a0, item.a1, t)
    };
  }

  const response: WorkerInterpolateResponse = { type: 'interpolated', entities };
  self.postMessage(response);
});