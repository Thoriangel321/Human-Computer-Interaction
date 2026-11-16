import WebSocket from 'ws';
import { packInput } from '../shared/protocol.js';
import { toInputSeq } from '../shared/types.js';

const SERVER_HTTP = process.env['SERVER_HTTP'] ?? 'http://localhost:3000';
const SERVER_WS = process.env['SERVER_WS'] ?? 'ws://localhost:3000/ws';
const TIERS = [8, 32, 64, 128] as const;
const MEASURE_DURATION_MS = 3500;

interface MetricsResponse {
  readonly rooms: ReadonlyArray<{
    readonly roomId: string;
    readonly players: number;
    readonly entities: number;
    readonly lastStepMs: number;
    readonly avgStepMs: number;
    readonly maxStepMs: number;
    readonly useSpatialHash: boolean;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectBot(index: number, roomId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_WS);
    ws.binaryType = 'arraybuffer';

    ws.once('open', () => {
      ws.send(JSON.stringify({
        type: 'join',
        roomId,
        playerName: `LoadBot-${index}`
      }));
      resolve(ws);
    });

    ws.once('error', (err) => reject(err));
  });
}

async function runTier(clientCount: number): Promise<void> {
  const roomId = `bench-${clientCount}`;
  const clients: WebSocket[] = [];

  for (let i = 0; i < clientCount; i++) {
    const ws = await connectBot(i, roomId);
    clients.push(ws);
  }

  await sleep(300);
  await fetch(`${SERVER_HTTP}/api/metrics/reset`, { method: 'POST' });

  let seq = 1;
  const inputTimer = setInterval(() => {
    const currentSeq = toInputSeq(seq++);
    for (let i = 0; i < clients.length; i++) {
      const ws = clients[i];
      if (ws === undefined || ws.readyState !== WebSocket.OPEN) continue;

      const phase = (seq + i * 7) % 60;
      const packet = packInput(currentSeq, {
        up: phase < 40,
        left: phase >= 10 && phase < 25,
        right: phase >= 35 && phase < 50,
        space: phase % 15 === 0
      });
      ws.send(packet);
    }
  }, 1000 / 30);

  await sleep(MEASURE_DURATION_MS);
  clearInterval(inputTimer);

  const res = await fetch(`${SERVER_HTTP}/api/metrics`);
  const data = (await res.json()) as MetricsResponse;
  const roomStats = data.rooms.find((r) => r.roomId === roomId);

  for (const ws of clients) {
    ws.close();
  }
  await sleep(250);

  if (roomStats === undefined) {
    console.log(`${String(clientCount).padEnd(8)} | NO DATA`);
    return;
  }

  const exceeded = roomStats.avgStepMs > 33.3 || roomStats.maxStepMs > 33.3;
  console.log(
    `${String(clientCount).padEnd(8)} | ` +
    `${String(roomStats.entities).padEnd(8)} | ` +
    `${roomStats.avgStepMs.toFixed(3).padEnd(11)} | ` +
    `${roomStats.maxStepMs.toFixed(3).padEnd(11)} | ` +
    `${exceeded ? 'EXCEEDS 33.3 ms' : 'OK (< 33.3 ms)'}`
  );
}

async function main(): Promise<void> {
  console.log('Connecting headless bots (8, 32, 64, 128) to measure server step duration...');
  console.log('Clients  | Entities | Avg Step ms | Max Step ms | Budget (33.3 ms @ 30 TPS)');
  console.log('---------+----------+-------------+-------------+--------------------------');

  for (const tier of TIERS) {
    await runTier(tier);
  }
}

void main();