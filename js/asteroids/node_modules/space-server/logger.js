import { Transform, PassThrough, pipeline } from 'node:stream';
import { createWriteStream, createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

try {
  mkdirSync(config.logDir, { recursive: true });
} catch (err) {}

export class MatchLogger {
  constructor(roomId) {
    this.filePath = join(config.logDir, `${roomId}.ndjson`);
    

    this.source = new PassThrough({ objectMode: true });

    const toNDJSON = new Transform({
      writableObjectMode: true,
      transform(chunk, encoding, callback) {
        try {
          const str = JSON.stringify(chunk) + '\n';
          callback(null, str); 
        } catch (err) {
          callback(err);
        }
      }
    });

    const outStream = createWriteStream(this.filePath, { flags: 'a' });


    pipeline(this.source, toNDJSON, outStream, (err) => {
      if (err) console.error(`Log pipeline failed for ${roomId}:`, err);
    });
  }

  log(eventObj) {
    this.source.write({ timestamp: Date.now(), ...eventObj });
  }

  close() {
    this.source.end(); 
  }
}


export function replayMatch(roomId, res) {
  const filePath = join(config.logDir, `${roomId}.ndjson`);
  const readStream = createReadStream(filePath);

  readStream.on('error', (err) => {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Log not found');
    }
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server Error');
  });

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  

  pipeline(readStream, res, (err) => {
    if (err) console.error(`Replay stream failed for ${roomId}:`, err);
  });
}