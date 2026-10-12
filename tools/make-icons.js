/* Draws the app icons (icons/*.png) by code, like everything else in the game: the relay gate's hexagon ring, glowing cyan on the dark.
   Run it with Node from the project folder (`node tools/make-icons.js`) after changing the design; it needs nothing but Node itself. */
const fs = require('fs'), path = require('path'), zlib = require('zlib');

/* ---------- a minimal PNG writer: 8-bit RGBA, no filtering ---------- */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- the design, in the game's colours ---------- */
const VOID = [13, 15, 14], CORE = [26, 33, 33], GATE = [31, 224, 255], NODE = [200, 250, 255];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
/* distance to a flat-topped hexagon's edge, measured like a radius (the gate's discs and ring are six-sided) */
const hex = (x, y) => Math.max(Math.abs(x) * .866 + Math.abs(y) * .5, Math.abs(y));
/* colour at (x, y), with -1..1 across the icon; k shrinks the gate to leave a margin (maskable icons need more) */
function shade(x, y, k) {
  const r = Math.hypot(x, y);
  let c = mix(CORE, VOID, Math.min(1, r / 1.25));                                     // a dark pool, lighter in the middle
  const R = .62 * k, W = .07 * k, h = hex(x, y), d = Math.abs(h - R);
  if (h < R - W) c = mix(c, GATE, .16 + .1 * (1 - h / R));                            // the gate's field, faintly lit
  c = mix(c, GATE, Math.min(1, Math.exp(-((d / (.16 * k)) ** 2)) * .55));             // glow around the ring
  if (d < W) c = mix(c, mix(GATE, NODE, .25), Math.min(1, (W - d) / (W * .35)));      // the ring itself
  for (let n = 0; n < 6; n++) {                                                       // six nodes around the ring
    const a = Math.PI / 2 + n * Math.PI / 3, dn = Math.hypot(x - Math.cos(a) * R, y - Math.sin(a) * R);
    if (dn < .085 * k) c = mix(c, NODE, Math.min(1, (.085 * k - dn) / (.03 * k)));
  }
  return c;
}
function draw(size, k) {
  const out = Buffer.alloc(size * size * 4), S = 4;   // 4 x 4 samples a pixel, for smooth edges
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = ((px + (sx + .5) / S) / size) * 2 - 1, y = ((py + (sy + .5) / S) / size) * 2 - 1, c = shade(x, y, k);
      acc = acc.map((v, i) => v + c[i]);
    }
    const o = (py * size + px) * 4; out[o] = Math.round(acc[0] / S / S); out[o + 1] = Math.round(acc[1] / S / S); out[o + 2] = Math.round(acc[2] / S / S); out[o + 3] = 255;
  }
  return png(size, out);
}

const dir = path.join(__dirname, '..', 'icons'); fs.mkdirSync(dir, { recursive: true });
for (const [name, size, k] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, .78], ['apple-touch-icon.png', 180, .9]]) {
  fs.writeFileSync(path.join(dir, name), draw(size, k)); console.log('wrote icons/' + name);
}
