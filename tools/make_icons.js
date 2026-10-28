// tools/make_icons.js - generate src/app/icon.png (128) and largeIcon.png (300)
// Dependency-free PNG writer (zlib + CRC32) + 4x supersampled vector drawing.
// Motif: a broadcast node radiating Sync-arc rings - Snapcast's multi-room idea.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG ----------
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(file, size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log(file, size + 'x' + size);
}

// ---------- drawing (all geometry in unit space, AA in device px) ----------
const SS = 4; // supersample factor
const AA = 1.6; // AA width in supersampled device pixels
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function render(size) {
  const S = size * SS;
  const img = Buffer.alloc(S * S * 4);
  const BG_TOP = hex('#1d2b38'), BG_BOT = hex('#0d141b');
  const DOT = hex('#f7f3ea'), ARC = hex('#f79a2b');
  const cx = 0.28, cy = 0.5; // broadcast node centre (unit space)
  const arcs = [ // [radius, half-angle deg, alpha]
    [0.22, 52, 1.0], [0.37, 46, 0.85], [0.52, 40, 0.7],
  ];
  const thick = 0.062, dotR = 0.095, RAD = 0.22;
  const DEG = Math.PI / 180;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      const fx = (x + 0.5) / S, fy = (y + 0.5) / S;

      // --- rounded-square card mask ---
      const ex = Math.max(Math.abs(fx - 0.5) - (0.5 - RAD), 0);
      const ey = Math.max(Math.abs(fy - 0.5) - (0.5 - RAD), 0);
      const card = Math.min(ex, ey) === 0 && (ex === 0 || ey === 0)
        ? 1
        : clamp01((RAD - Math.hypot(ex, ey)) / (AA / S) + 0.5);
      if (card <= 0) { img[o + 3] = 0; continue; }

      // --- background gradient ---
      let R = mix(BG_TOP[0], BG_BOT[0], fy), G = mix(BG_TOP[1], BG_BOT[1], fy), B = mix(BG_TOP[2], BG_BOT[2], fy);

      // --- arcs: annular sector = ring coverage x wedge coverage ---
      const dx = fx - cx, dy = fy - cy;
      const dist = Math.hypot(dx, dy);
      const ang = Math.abs(Math.atan2(dy, dx)) / DEG; // 0 = due right
      for (let i = arcs.length - 1; i >= 0; i--) {
        const ar = arcs[i][0], ha = arcs[i][1], al = arcs[i][2];
        const ring = clamp01((thick / 2 - Math.abs(dist - ar)) / (AA / S) + 0.5);
        if (ring <= 0) continue;
        // angular edge softened along the arc length (px = arc_len_per_deg * deg)
        const arcPx = (ha - ang) * DEG * Math.max(dist, 1e-4) * S;
        const cov = ring * clamp01(arcPx / AA + 0.5) * al;
        if (cov > 0) {
          R = mix(R, ARC[0], cov); G = mix(G, ARC[1], cov); B = mix(B, ARC[2], cov);
        }
      }
      // --- node dot ---
      const dot = clamp01((dotR - dist) / (AA / S) + 0.5);
      R = mix(R, DOT[0], dot); G = mix(G, DOT[1], dot); B = mix(B, DOT[2], dot);

      img[o] = Math.round(R); img[o + 1] = Math.round(G); img[o + 2] = Math.round(B);
      img[o + 3] = Math.round(255 * card);
    }
  }
  // --- box downsample with premultiplied average ---
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let aR = 0, aG = 0, aB = 0, aA = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const i = (((y * SS + sy) * S) + (x * SS + sx)) * 4;
        const a = img[i + 3];
        aA += a; aR += img[i] * a; aG += img[i + 1] * a; aB += img[i + 2] * a;
      }
      const n = SS * SS, A = aA / n, j = (y * size + x) * 4;
      out[j + 3] = Math.round(A);
      if (A > 0) { out[j] = Math.round(aR / aA); out[j + 1] = Math.round(aG / aA); out[j + 2] = Math.round(aB / aA); }
    }
  }
  return out;
}

const out = path.join(__dirname, '..', 'src', 'app');
writePng(path.join(out, 'icon.png'), 128, render(128));
writePng(path.join(out, 'largeIcon.png'), 300, render(300));
