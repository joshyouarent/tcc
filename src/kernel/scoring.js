// ============================================================
// T.C.C. kernel: scoring
//
// Every metric is scored the same way, whatever it measures. Three landmarks
// define a band. Below the floor the work barely registers, between the floor
// and the ceiling is the productive band, and what happens past the ceiling
// depends on the metric's shape.
//
// Scores run 0 to 130. The chart turns a score into a radius; nothing else
// needs to know about geometry.
// ============================================================

export const BAND_LOW = 60;    // the floor lands here, on the inner ring
export const BAND_MID = 75;    // the ideal, unmarked, midway between the rings
export const BAND_HIGH = 90;   // the ceiling lands here, on the outer ring
export const SCALE_MAX = 130;  // headroom past the outer ring

// Returns arrive early and flatten toward the ceiling, so an even step in
// radius is not an even step in the underlying unit.
export const BAND_CURVE = 0.65;

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// SHAPES
//   rising   more is better with no upper limit. Past the ceiling it keeps
//            improving, approaching but never reaching the rim.
//   falling  less is better. The floor is a limit you stay under.
//   peak     there is a right amount. Past the ceiling the curve turns back
//            inward, so overshooting never plots better than getting it right.
//            This is the toggle for "too much is not better".
export const SHAPES = {
  rising: {
    name: "More is better",
    what: "No upper limit. Going past the ideal keeps improving, with diminishing returns.",
  },
  falling: {
    name: "Less is better",
    what: "The ceiling is a limit to stay under. Going lower keeps improving.",
  },
  peak: {
    name: "There is a right amount",
    what: "Past the ideal the dot turns back toward the centre, because more is no longer better.",
  },
};

export const FALLOFF = { gentle: 2, moderate: 1, steep: 0.5 };

// A metric declares { shape, floor, ceiling, falloff }. floor and ceiling are
// in the metric's own unit: sets, dollars, minutes, whatever it measures.
export function scoreValue(value, metric) {
  if (value == null || value === "") return null;
  const v = Number(value);
  if (Number.isNaN(v)) return null;

  const shape = metric.shape || "rising";
  const lo = Number(metric.floor);
  const hi = Number(metric.ceiling);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return null;

  // Below the floor, everything decays linearly to nothing.
  const below = (x, f) => clamp((x / (f || 1)) * BAND_LOW, 0, BAND_LOW);
  // Inside the band, front-loaded so early progress counts for more.
  const band = (frac) => BAND_LOW + (BAND_HIGH - BAND_LOW) * Math.pow(clamp(frac, 0, 1), BAND_CURVE);
  // Past the ceiling on a rising metric, approaching the rim without reaching it.
  const beyond = (over, scale) =>
    BAND_HIGH + (SCALE_MAX - BAND_HIGH) * (1 - Math.exp(-over / (scale || 1)));
  // Past the ceiling on a peak metric, turning back toward the centre.
  const back = (over, width, k) =>
    clamp(BAND_HIGH - (BAND_HIGH - BAND_LOW) * (over / (width * k)), 0, BAND_HIGH);

  if (shape === "falling") {
    // hi is the limit, lo is the stretch. Lower is further out.
    if (v > hi) return clamp(BAND_LOW - (BAND_LOW * (v - hi)) / (hi || 1), 0, BAND_LOW);
    if (v >= lo) return BAND_LOW + (BAND_HIGH - BAND_LOW) * ((hi - v) / ((hi - lo) || 1));
    return beyond(lo - v, lo || hi);
  }

  if (v < lo) return below(v, lo);
  if (v <= hi) return band((v - lo) / ((hi - lo) || 1));
  if (shape === "peak") {
    return back(v - hi, (hi - lo) || hi || 1, FALLOFF[metric.falloff] || 1);
  }
  return beyond(v - hi, hi - lo || hi);
}

// The set count sitting at a given score, used to say how far off a landmark is.
export function valueAtScore(score, metric) {
  const lo = Number(metric.floor), hi = Number(metric.ceiling);
  if (score <= BAND_LOW) return (score / BAND_LOW) * lo;
  const frac = Math.pow((score - BAND_LOW) / (BAND_HIGH - BAND_LOW), 1 / BAND_CURVE);
  return lo + frac * (hi - lo);
}

export const idealValue = (metric) => valueAtScore(BAND_MID, metric);

// Progress toward whichever landmark is next, always measured from zero.
export function progress(value, metric) {
  const v = Number(value) || 0;
  const lo = Number(metric.floor), hi = Number(metric.ceiling);
  const ideal = idealValue(metric);
  if (metric.shape === "falling") {
    if (v > hi) return { label: "over the limit", pct: (hi / (v || 1)) * 100 };
    return { label: "under the limit", pct: 100 };
  }
  if (v < lo) return { label: "to the floor", pct: (v / (lo || 1)) * 100 };
  if (v < ideal) return { label: "to the ideal", pct: (v / (ideal || 1)) * 100 };
  if (v < hi) return { label: "to the ceiling", pct: (v / (hi || 1)) * 100 };
  return { label: "past the ceiling", pct: (v / (hi || 1)) * 100 };
}

export function zoneOf(score) {
  if (score == null) return null;
  if (score > BAND_HIGH) return "beyond";
  if (score >= BAND_LOW) return "in";
  return "under";
}
