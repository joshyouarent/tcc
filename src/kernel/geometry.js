// ============================================================
// T.C.C. kernel: geometry
//
// Measured off the TCC icon. The rings sit at 0.538 and 0.896 of the radius,
// a ratio of 0.601 where a linear scale would give 0.667, so the radial scale
// is anchored to the rings rather than running evenly from the centre.
// None of these numbers are arbitrary. Do not round them.
// ============================================================

import { BAND_LOW, BAND_HIGH, SCALE_MAX, clamp } from "./scoring.js";

export const SIZE = 800;
export const CENTER = 400;
export const MAX_R = 248;

export const RING_INNER_FRAC = 0.538;
export const RING_OUTER_FRAC = 0.896;
export const RING_THICKNESS = 0.0335;
export const EXCEED_FRAC = 1.06;      // room past the outer ring, clear of the labels

export const C_GAP_CENTRE = -45;      // both rings break here, where the arrow exits
export const C_GAP_INNER = 50;
export const C_GAP_OUTER = 30;

export const ARM_ANGLES = [45, 135, 225];
export const ARM_SHORT = 0.25;
export const ARM_WIDTH = 0.026;
export const ARROW_SHAFT_W = ARM_WIDTH;
export const ARROW_HEAD_W = 0.062;
export const ARROW_HEAD_LEN = 0.085;

export function radiusFor(score) {
  const x = clamp(Number(score) || 0, 0, SCALE_MAX);
  let f;
  if (x <= BAND_LOW) f = (x / BAND_LOW) * RING_INNER_FRAC;
  else if (x <= BAND_HIGH)
    f = RING_INNER_FRAC + ((x - BAND_LOW) / (BAND_HIGH - BAND_LOW)) * (RING_OUTER_FRAC - RING_INNER_FRAC);
  else
    f = RING_OUTER_FRAC + ((x - BAND_HIGH) / (SCALE_MAX - BAND_HIGH)) * (EXCEED_FRAC - RING_OUTER_FRAC);
  return MAX_R * f;
}

// Spokes are laid out from the same offset whatever the count, so the four
// quadrant dividers stay put as spokes are added and removed.
export function axisPoint(i, total, r) {
  const step = (Math.PI * 2) / Math.max(total, 1);
  const a = step * i - Math.PI / 2 + (45 * Math.PI) / 180 + step / 2;
  return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) };
}

export function arcPath(r, fromDeg, sweepDeg) {
  const a0 = (fromDeg * Math.PI) / 180;
  const a1 = ((fromDeg + sweepDeg) * Math.PI) / 180;
  return `M ${CENTER + r * Math.cos(a0)} ${CENTER + r * Math.sin(a0)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${CENTER + r * Math.cos(a1)} ${CENTER + r * Math.sin(a1)}`;
}

// Catmull-Rom through the points, as cubic Beziers. It passes exactly through
// every point, so a reading is never misrepresented by the smoothing.
export function smoothPath(pts, closed) {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  const S = 1 / 6;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M ${P(0).x} ${P(0).y}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    d += ` C ${p1.x + (p2.x - p0.x) * S} ${p1.y + (p2.y - p0.y) * S}, ${p2.x - (p3.x - p1.x) * S} ${p2.y - (p3.y - p1.y) * S}, ${p2.x} ${p2.y}`;
  }
  return closed ? `${d} Z` : d;
}

// Labels wrap onto a second line rather than being cut off.
export function wrapLabel(name, perLine = 13, maxLines = 2) {
  const words = String(name || "").trim().split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w.length > perLine ? `${w.slice(0, perLine - 1)}\u2026` : w;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const l = lines[maxLines - 1];
    lines[maxLines - 1] = (l.length > perLine - 1 ? l.slice(0, perLine - 1) : l) + "\u2026";
  }
  return lines.slice(0, maxLines);
}
