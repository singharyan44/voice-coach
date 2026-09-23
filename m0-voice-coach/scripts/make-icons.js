// Generates simple PWA icons (mic glyph on gradient) as PNGs. Run once:
// node scripts/make-icons.js. No dependencies (raw PNG via zlib).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function draw(size) {
  const W = size, H = size;
  const raw = Buffer.alloc(W * H * 3 + H);
  // vertical gradient bg #0f172a -> #1e3a5f
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    const t = y / H;
    const bg = [Math.round(15 + t * 20), Math.round(23 + t * 35), Math.round(42 + t * 53)];
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = bg[0]; raw[o + 1] = bg[1]; raw[o + 2] = bg[2];
    }
  }
  const px = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const o = y * (W * 3 + 1) + 1 + x * 3;
    raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
  };
  const CYAN = [34, 211, 238];
  const cx = W / 2;
  // mic capsule
  const r = W * 0.11, top = H * 0.24, bot = H * 0.56;
  for (let y = top; y < bot; y++)
    for (let x = cx - r; x < cx + r; x++) {
      const dx = (x - (cx - r)) / (2 * r);
      const inCap = (y > top + r && y < bot - r && Math.abs(x - cx) <= r);
      const dTop = Math.hypot(x - cx, y - (top + r));
      const dBot = Math.hypot(x - cx, y - (bot - r));
      if (inCap || (y <= top + r && dTop <= r) || (y >= bot - r && dBot <= r)) px(x, y, CYAN);
    }
  // mic arc + stem + base
  for (let a = 0; a <= Math.PI; a += 0.01) {
    px(cx + Math.cos(a) * r * 1.7, (top + bot) / 2 + 10 + Math.sin(a) * r * 1.2, CYAN);
  }
  for (let y = (top + bot) / 2 + 10 + r * 1.2; y < H * 0.82; y++) px(cx, y, CYAN);
  for (let x = cx - r * 1.1; x < cx + r * 1.1; x++) px(x, H * 0.82, CYAN);
  return raw;
}

function crcTable() {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
}
const TABLE = crcTable();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  let c = 0xffffffff;
  for (let i = 0; i < td.length; i++) c = TABLE[(c ^ td[i]) & 0xff] ^ (c >>> 8);
  const crc = Buffer.alloc(4); crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [192, 512]) {
  const p = path.join(dir, `icon-${s}.png`);
  fs.writeFileSync(p, png(s, draw(s)));
  console.log('wrote', p);
}
