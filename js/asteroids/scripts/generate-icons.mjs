import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createIconPng(size) {
  const rowStride = 1 + size * 4;
  const raw = Buffer.alloc(rowStride * size);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;

  for (let y = 0; y < size; y++) {
    raw[y * rowStride] = 0;
    for (let x = 0; x < size; x++) {
      const idx = y * rowStride + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const inShip =
        dx >= -r * 0.7 &&
        dx <= r &&
        Math.abs(dy) <= ((r - dx) / (1.7 * r)) * r * 0.75;

      if (inShip) {
        raw[idx] = 56;
        raw[idx + 1] = 189;
        raw[idx + 2] = 248;
        raw[idx + 3] = 255;
      } else {
        raw[idx] = 7;
        raw[idx + 1] = 11;
        raw[idx + 2] = 20;
        raw[idx + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = path.resolve(process.cwd(), 'client/public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), createIconPng(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createIconPng(512));
console.log('Generated PWA icons: icon-192.png, icon-512.png');