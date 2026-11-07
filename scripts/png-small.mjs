// Rimpicciolisce una schermata PNG (di un telefono) e la stampa in base64, a righe da 100 caratteri.
// Serve alla "Prova su Android": le schermate finiscono nel log anche senza scaricare gli artefatti.
// Solo Node, senza librerie: legge PNG a 8 bit (RGB o RGBA, non interlacciati).
// Uso: node scripts/png-small.mjs <file.png> [fattore, es. 3]
import { readFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const [file, factorArg] = process.argv.slice(2);
const factor = Math.max(1, parseInt(factorArg || '3', 10));
const png = readFileSync(file);

let width = 0;
let height = 0;
let channels = 0;
const idat = [];
for (let pos = 8; pos < png.length;) {
  const len = png.readUInt32BE(pos);
  const type = png.toString('latin1', pos + 4, pos + 8);
  const data = png.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    const bitDepth = data[8];
    const colorType = data[9];
    if (bitDepth !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) {
      throw new Error('PNG non gestito (serve RGB o RGBA a 8 bit, non interlacciato)');
    }
    channels = colorType === 6 ? 4 : 3;
  } else if (type === 'IDAT') {
    idat.push(data);
  }
  pos += 12 + len;
}

// Toglie i filtri delle righe (PNG: None, Sub, Up, Average, Paeth)
const raw = inflateSync(Buffer.concat(idat));
const stride = width * channels;
const pixels = Buffer.alloc(stride * height);
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const src = y * (stride + 1) + 1;
  const dst = y * stride;
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? pixels[dst + x - channels] : 0;
    const b = y > 0 ? pixels[dst - stride + x] : 0;
    const c = x >= channels && y > 0 ? pixels[dst - stride + x - channels] : 0;
    let value = raw[src + x];
    if (filter === 1) value += a;
    else if (filter === 2) value += b;
    else if (filter === 3) value += (a + b) >> 1;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    pixels[dst + x] = value & 255;
  }
}

// Media dei pixel a blocchi factor×factor, in RGB
const w = Math.floor(width / factor);
const h = Math.floor(height / factor);
const out = Buffer.alloc((w * 3 + 1) * h);
for (let y = 0; y < h; y++) {
  out[y * (w * 3 + 1)] = 0;
  for (let x = 0; x < w; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) sum += pixels[(y * factor + dy) * stride + (x * factor + dx) * channels + ch];
      }
      out[y * (w * 3 + 1) + 1 + x * 3 + ch] = Math.round(sum / (factor * factor));
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0);
ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const small = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(out, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
const b64 = small.toString('base64');
for (let i = 0; i < b64.length; i += 100) console.log(b64.slice(i, i + 100));
