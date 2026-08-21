// ============================================================
// Generates the app icons from the same geometry the chart uses, so the
// home-screen icon and the chart are the one mark rather than two drawings
// that drift apart. Run: node scripts/make-icons.mjs
//
// No image library: the mark is a handful of rings, arms and a triangle, so
// it is rasterised directly and written as PNG with the built-in zlib.
// ============================================================

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// Measured off the TCC icon. Same numbers as src/kernel/geometry.js.
const RING_INNER_FRAC = 0.538;
const RING_OUTER_FRAC = 0.896;
const RING_THICKNESS = 0.045;  // thicker than the chart, for the same reason
const C_GAP_CENTRE = -45;
const C_GAP_INNER = 50;
const C_GAP_OUTER = 30;
const ARM_ANGLES = [45, 135, 225];
const ARM_SHORT = 0.25;
const ARM_WIDTH = 0.026;
const ARROW_HEAD_W = 0.062;
const ARROW_HEAD_LEN = 0.085;

const BG = [11, 16, 19];        // #0b1013
const ACCENT = [54, 174, 203];  // #36aecb
const RING = [130, 131, 132];   // #828384
const RING_ALPHA = 0.8;   // bolder than the chart: the icon is read at ~60px

const DEG = Math.PI / 180;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Shortest angular distance, in degrees.
function angleGap(deg, centre) {
  let d = Math.abs(((deg - centre + 180) % 360 + 360) % 360 - 180);
  return d;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inTriangle(px, py, a, b, c) {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = s([px, py], a, b), d2 = s([px, py], b, c), d3 = s([px, py], c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// One sample: returns the colour at a point in the mark.
function sample(px, py, C, R) {
  let col = BG;
  const dx = px - C, dy = py - C;
  const dist = Math.hypot(dx, dy);
  const deg = Math.atan2(dy, dx) / DEG;
  const half = (R * RING_THICKNESS) / 2;

  for (const [frac, gap] of [[RING_INNER_FRAC, C_GAP_INNER], [RING_OUTER_FRAC, C_GAP_OUTER]]) {
    const r = R * frac;
    if (Math.abs(dist - r) <= half && angleGap(deg, C_GAP_CENTRE) > gap / 2) {
      col = mix(col, RING, RING_ALPHA);
    }
  }

  const armHalf = (R * ARM_WIDTH) / 2;
  for (const a of ARM_ANGLES) {
    const rad = a * DEG;
    if (distToSegment(px, py, C, C, C + R * ARM_SHORT * Math.cos(rad), C + R * ARM_SHORT * Math.sin(rad)) <= armHalf) {
      col = ACCENT;
    }
  }

  const ar = C_GAP_CENTRE * DEG, ca = Math.cos(ar), sa = Math.sin(ar);
  const shaft = R * RING_OUTER_FRAC;
  if (distToSegment(px, py, C, C, C + shaft * ca, C + shaft * sa) <= armHalf) col = ACCENT;

  const tip = shaft + R * ARROW_HEAD_LEN, hw = (R * ARROW_HEAD_W) / 2 + R * 0.03;
  const A = [C + tip * ca, C + tip * sa];
  const B = [C + shaft * ca + hw * sa, C + shaft * sa - hw * ca];
  const D = [C + shaft * ca - hw * sa, C + shaft * sa + hw * ca];
  if (inTriangle(px, py, A, B, D)) col = ACCENT;

  return col;
}

function render(S, scale, ss = 3) {
  const C = S / 2, R = S * scale;
  const px = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, C, R);
          acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]];
        }
      }
      const n = ss * ss, i = (y * S + x) * 3;
      px[i] = Math.round(acc[0] / n);
      px[i + 1] = Math.round(acc[1] / n);
      px[i + 2] = Math.round(acc[2] / n);
    }
  }
  return px;
}

// ---- minimal PNG writer ----
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(S, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  const raw = Buffer.alloc(S * (S * 3 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (S * 3 + 1) + 1, y * S * 3, (y + 1) * S * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public", { recursive: true });
for (const [file, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  // 0.34 keeps the mark inside the 80% safe zone maskable icons are cropped to.
  writeFileSync(`public/${file}`, png(size, render(size, 0.36)));
  console.log(`wrote public/${file} (${size}x${size})`);
}
