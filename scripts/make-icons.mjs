// node scripts/make-icons.mjs
// Draws the Flake app icon (white snowflake on the Ocean gradient) as PNGs in public/.
// Pure Node: a tiny rasterizer with 4× supersampling and a minimal PNG encoder.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const STOPS = [hex('#1d4ed8'), hex('#2563eb'), hex('#0891b2')];

function gradient(t) {
  const [a, b, u] = t < 0.55 ? [STOPS[0], STOPS[1], t / 0.55] : [STOPS[1], STOPS[2], (t - 0.55) / 0.45];
  return a.map((v, i) => v + (b[i] - v) * u);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Six spokes, each with two side branches, in unit coordinates around (0, 0). */
function flakeSegments() {
  const segs = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 - Math.PI / 2;
    const ex = Math.cos(a), ey = Math.sin(a);
    segs.push([0, 0, ex, ey]);
    for (const [at, len] of [[0.5, 0.3], [0.75, 0.2]]) {
      const bx = ex * at, by = ey * at;
      for (const s of [1, -1]) {
        const b = a + (s * Math.PI) / 4;
        segs.push([bx, by, bx + Math.cos(b) * len, by + Math.sin(b) * len]);
      }
    }
  }
  return segs;
}

function render(size, flakeScale) {
  const SS = 4;
  const segs = flakeSegments();
  const R = (size / 2) * flakeScale;
  const thick = R * 0.085;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS - size / 2) / R;
          const fy = (y + (sy + 0.5) / SS - size / 2) / R;
          if (segs.some(([ax, ay, bx, by]) => distToSegment(fx, fy, ax, ay, bx, by) * R <= thick)) cover++;
        }
      const c = cover / (SS * SS);
      const bg = gradient((x + y) / (2 * size));
      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round(bg[ch] * (1 - c) + 255 * c);
      px[i + 3] = 255;
    }
  return png(size, size, px);
}

// --- Minimal PNG encoder (RGBA, no interlace) ---
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Full-bleed squares: iOS and Android round the corners. Maskable keeps the flake in the safe zone.
writeFileSync(new URL('apple-touch-icon.png', OUT), render(180, 0.62));
writeFileSync(new URL('icon-192.png', OUT), render(192, 0.62));
writeFileSync(new URL('icon-512.png', OUT), render(512, 0.62));
writeFileSync(new URL('icon-maskable-512.png', OUT), render(512, 0.5));
console.log('icons written to public/');
