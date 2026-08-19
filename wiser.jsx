import React, { useState, useEffect, useMemo, useRef } from "react";

// ============================================================
// T.C.C. // Wiser
//
// A brain dump becomes an ordered run of tasks. Each task carries three time
// estimates. Finishing one plots it on the chart: faster is further out, and
// beating the fast estimate puts it outside the outer ring. One lap around the
// circle means the job is done.
// ============================================================

// ---------- KERNEL v1 ----------
// Shared with apps/training.jsx. Changes here must be copied across.
// Geometry measured from the TCC icon: rings at 0.538 and 0.896 of the radius,
// each broken by a gap at 315 degrees, and four arms forming the T.
const SIZE = 800, CENTER = 400, MAX_R = 248;
const BAND_LOW = 60, BAND_MID = 75, BAND_HIGH = 90, SCALE_MAX = 130;
const RING_INNER_FRAC = 0.538, RING_OUTER_FRAC = 0.896, RING_THICKNESS = 0.0335;
// Beating the target plots past the outer ring. That zone runs to 1.06R rather
// than stopping at the rim, so exceptional work is visibly clear of the ring
// instead of sitting on it. Axis labels sit at MAX_R + 30, so nothing collides.
const EXCEED_FRAC = 1.06;
const C_GAP_CENTRE = -45, C_GAP_INNER = 50, C_GAP_OUTER = 30;
const ARM_SHORT = 0.25, ARM_WIDTH = 0.026;
// The shaft matches the three short arms, so the T reads as one mark rather
// than one heavy limb and three thin ones. The head is sized off the shaft.
const ARROW_SHAFT_W = ARM_WIDTH, ARROW_HEAD_W = 0.062, ARROW_HEAD_LEN = 0.085;
const ARM_ANGLES = [45, 135, 225];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Centre is nothing done, the rim is the ceiling. Anchored to the rings rather
// than running linearly, so a score of 60 and 90 land exactly on the mark.
function radiusFor(v) {
  const x = clamp(Number(v) || 0, 0, SCALE_MAX);
  let f;
  if (x <= BAND_LOW) f = (x / BAND_LOW) * RING_INNER_FRAC;
  else if (x <= BAND_HIGH) f = RING_INNER_FRAC + ((x - BAND_LOW) / (BAND_HIGH - BAND_LOW)) * (RING_OUTER_FRAC - RING_INNER_FRAC);
  else f = RING_OUTER_FRAC + ((x - BAND_HIGH) / (SCALE_MAX - BAND_HIGH)) * (EXCEED_FRAC - RING_OUTER_FRAC);
  return MAX_R * f;
}

// Spokes are laid out from the same offset whatever the count, so the four
// quadrants stay put as tasks are added and removed.
function axisPoint(i, total, r) {
  const step = (Math.PI * 2) / Math.max(total, 1);
  const a = step * i - Math.PI / 2 + ((45 * Math.PI) / 180) + step / 2;
  return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) };
}

function arcPath(r, fromDeg, sweepDeg) {
  const a0 = (fromDeg * Math.PI) / 180, a1 = ((fromDeg + sweepDeg) * Math.PI) / 180;
  return `M ${CENTER + r * Math.cos(a0)} ${CENTER + r * Math.sin(a0)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${CENTER + r * Math.cos(a1)} ${CENTER + r * Math.sin(a1)}`;
}

// A Catmull-Rom spline through the points, written as cubic Beziers. It passes
// exactly through every dot rather than near them, so a reading is never
// misrepresented by the smoothing. Tested against the worst case on this
// layout, dots alternating between the centre and past the outer ring, and the
// curve does not overshoot the dots it joins.
function smoothPath(pts, closed) {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  const S = 1 / 6;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M ${P(0).x} ${P(0).y}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1x = p1.x + (p2.x - p0.x) * S, c1y = p1.y + (p2.y - p0.y) * S;
    const c2x = p2.x - (p3.x - p1.x) * S, c2y = p2.y - (p3.y - p1.y) * S;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return closed ? `${d} Z` : d;
}

const THEME = {
  dark: {
    bg: "#0b1013", panel: "#111a1e", accent: "#36aecb", accentText: "#36aecb",
    soft: "rgba(54,174,203,0.12)", border: "rgba(54,174,203,0.26)",
    borderStrong: "rgba(54,174,203,0.50)", text: "#e8f4f8",
    muted: "#a8b0b2", faint: "#828384", ring: "#828384",
    band: "rgba(130,131,132,0.09)", warn: "#e0a848", danger: "#e07a7a",
    line: "rgba(130,131,132,0.30)", good: "#5fd39a",
  },
  light: {
    bg: "#f5f8f9", panel: "#ffffff", accent: "#36aecb", accentText: "#1b7a91",
    soft: "rgba(54,174,203,0.10)", border: "rgba(54,174,203,0.35)",
    borderStrong: "rgba(54,174,203,0.60)", text: "#0d1a1e",
    muted: "#5d6668", faint: "#828384", ring: "#828384",
    band: "rgba(130,131,132,0.10)", warn: "#8a5d12", danger: "#a33a3a",
    line: "rgba(130,131,132,0.35)", good: "#1c8158",
  },
};
// ---------- END KERNEL v1 ----------

const TRANSITION = 15;   // seconds between tasks

// Seven steps, not fourteen. 16px on inputs is not a taste call: Safari on iOS
// zooms the page whenever you focus a field smaller than that, which undoes the
// zoom locking elsewhere in this file.
const TYPE = {
  micro: "11px",     // section heads, captions
  small: "12px",     // secondary figures
  body: "14px",      // list text
  input: "16px",     // anything you can type into
  strong: "18px",    // task names, the task in hand
  numeral: "22px",   // clocks and running totals
  hero: "34px",      // the final score
};

// The debrief asks about the two tasks that stood out, and keeps the answers so
// the next run opens with what was learned rather than a blank page.
const HELPED = [
  "Smaller than expected",
  "I had momentum from the task before",
  "I had help from someone else",
];
const HINDERED = [
  "Bigger than expected",
  "I got distracted partway",
  "I had to wait on something",
  "Ran out of energy",
  "Ran out of time",
];
const OTHER = "Other";

// Optional. The same work done depleted is worth more than the same work done
// fresh, so a lower rating raises the multiplier. Left unset it does nothing.
const ENERGY = [
  { v: 0, label: "Empty", mult: 1.5 },
  { v: 1, label: "Very low", mult: 1.3 },
  { v: 2, label: "Low", mult: 1.2 },
  { v: 3, label: "Middling", mult: 1.1 },
  { v: 4, label: "Good", mult: 1 },
  { v: 5, label: "Full", mult: 1 },
];
const energyMult = (v) => {
  const found = ENERGY.find((e) => e.v === v);
  return found ? found.mult : 1;
};

// Montserrat if it can be fetched, otherwise the nearest geometric sans already
// on the device. Avenir Next covers iOS and macOS, Century Gothic covers
// Windows with Office, and system-ui catches the rest.
const FONT = '"Montserrat", "Avenir Next", "Century Gothic", "Futura", system-ui, -apple-system, "Segoe UI", sans-serif';

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
@keyframes goalDotIn { from { r: 0; opacity: 0; } to { opacity: 1; } }
@keyframes goalFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes goalScorePop { 0% { transform: scale(1); } 30% { transform: scale(1.14); } 100% { transform: scale(1); } }
.goal-fade { animation: goalFadeUp 260ms ease-out both; }
.goal-press { transition: transform 120ms ease, background-color 160ms ease, border-color 160ms ease; }
.goal-press:active { transform: scale(0.965); }
.goal-row { transition: transform 220ms cubic-bezier(.2,.7,.3,1), opacity 200ms ease; }
.goal-dot { transition: cx 480ms cubic-bezier(.34,1.1,.64,1), cy 480ms cubic-bezier(.34,1.1,.64,1); }
.goal-line { transition: d 480ms cubic-bezier(.34,1.1,.64,1); }
.goal-pop { animation: goalScorePop 420ms cubic-bezier(.34,1.56,.64,1) both; display: inline-block; }
`;

// The realistic estimate is the baseline. Every second under adds, every second
// over subtracts. Bigger tasks are worth more without needing a multiplier.
const taskPoints = (actual, real) => Math.round(Number(real) + (Number(real) - actual));

// The chart plots points, not time. Time only enters by way of the score, so
// any future change to how points are earned moves the chart with it.
// The three estimates become three point anchors: hitting the slow estimate is
// worth the inner ring, the realistic estimate sits midway, the fast estimate
// reaches the outer ring, and beating it goes past.
function pointAnchors(t) {
  const real = Number(t.real);
  return { slow: taskPoints(Number(t.slow), real), real, fast: taskPoints(Number(t.fast), real) };
}

function scoreFromPoints(points, t) {
  if (points == null) return null;
  const a = pointAnchors(t);
  if (points >= a.fast) {
    const over = points - a.fast;
    const span = Math.max(a.fast - a.real, 1);
    return clamp(BAND_HIGH + (SCALE_MAX - BAND_HIGH) * (1 - Math.exp(-over / (span * 0.6))), BAND_HIGH, SCALE_MAX);
  }
  if (points >= a.real) return BAND_MID + (BAND_HIGH - BAND_MID) * ((points - a.real) / ((a.fast - a.real) || 1));
  if (points >= a.slow) return BAND_LOW + (BAND_MID - BAND_LOW) * ((points - a.slow) / ((a.real - a.slow) || 1));
  // Below the slow estimate the dot runs to the centre, reaching it at zero
  // points, which is the honest place for a task that earned nothing.
  return clamp(BAND_LOW * (points / (a.slow || 1)), 0, BAND_LOW);
}

const paceScore = (actual, t) => (!actual || actual <= 0 ? null : scoreFromPoints(taskPoints(actual, t.real), t));

const mmss = (n) => {
  const s = Math.max(0, Math.round(n));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
// Chart labels wrap onto a second line rather than being cut off, so a long
// task name stays readable without widening the chart. Two lines is the limit,
// after which it truncates at a word boundary.
function wrapLabel(name, perLine = 13, maxLines = 2) {
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
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = (last.length > perLine - 1 ? last.slice(0, perLine - 1) : last) + "\u2026";
  }
  return lines.slice(0, maxLines);
}

// A row that slides under the finger and deletes once it has travelled far
// enough. The listener is attached natively rather than through React, because
// React registers touchmove passively and preventDefault is ignored on a
// passive listener, which is what let the whole page pan sideways.
function SwipeRow({ onDelete, c, children }) {
  const [dx, setDx] = React.useState(0);
  const [gone, setGone] = React.useState(false);
  const ref = React.useRef(null);
  const st = React.useRef({ x: 0, y: 0, axis: null, moved: false, dx: 0 });
  const THRESHOLD = 92;
  const ENGAGE = 10;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const begin = (e) => {
      st.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, moved: false, dx: 0 };
    };

    const move = (e) => {
      const s = st.current;
      const mx = e.touches[0].clientX - s.x;
      const my = e.touches[0].clientY - s.y;
      // Decide once whether this gesture is a sideways swipe or a scroll, then
      // stick with it. Without the lock, a scroll that drifts sideways starts
      // dragging rows around.
      if (s.axis === null) {
        if (Math.abs(mx) < ENGAGE && Math.abs(my) < ENGAGE) return;
        s.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      }
      if (s.axis !== "x") return;
      e.preventDefault();
      s.moved = true;
      s.dx = Math.min(0, Math.max(-160, mx));
      setDx(s.dx);
    };

    const end = () => {
      const s = st.current;
      if (s.axis === "x" && s.dx < -THRESHOLD) {
        setGone(true);
        setTimeout(onDelete, 180);
      } else {
        setDx(0);
      }
      s.axis = null;
    };

    el.addEventListener("touchstart", begin, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", begin);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [onDelete]);

  // A swipe ends with a tap on whatever sits underneath, so that click is
  // swallowed rather than being treated as a selection.
  const swallowClick = (e) => {
    if (st.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      st.current.moved = false;
    }
  };

  const armed = dx < -THRESHOLD;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "8px",
      marginBottom: "6px", maxHeight: gone ? 0 : "120px", opacity: gone ? 0 : 1,
      transition: "max-height 200ms ease, opacity 160ms ease, margin 200ms ease" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "flex-end", paddingRight: "16px",
        background: armed ? c.danger : "transparent", opacity: armed ? 0.22 : 0.1,
        transition: "background 150ms ease, opacity 150ms ease" }}>
        <span style={{ color: c.danger, fontSize: TYPE.small }}>Remove</span>
      </div>
      <div ref={ref} className="goal-row" onClickCapture={swallowClick}
        style={{ transform: `translateX(${dx}px)`, position: "relative", touchAction: "pan-y" }}>
        {children}
      </div>
    </div>
  );
}

// The page itself does not zoom, because pinching it breaks the layout. The
// chart does, inside its own frame, with a double tap to reset.
function ZoomFrame({ children, c }) {
  const [scale, setScale] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const start = React.useRef(null);
  const lastTap = React.useRef(0);

  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onStart = (e) => {
    if (e.touches.length === 2) {
      start.current = { d: dist(e.touches), scale, pan: { ...pan } };
    } else if (e.touches.length === 1 && scale > 1) {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, pan: { ...pan } };
    }
  };

  const onMove = (e) => {
    if (!start.current) return;
    if (e.touches.length === 2 && start.current.d) {
      const next = Math.min(4, Math.max(1, start.current.scale * (dist(e.touches) / start.current.d)));
      setScale(next);
      if (next === 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && start.current.x != null) {
      const lim = 180 * (scale - 1);
      setPan({
        x: Math.max(-lim, Math.min(lim, start.current.pan.x + e.touches[0].clientX - start.current.x)),
        y: Math.max(-lim, Math.min(lim, start.current.pan.y + e.touches[0].clientY - start.current.y)),
      });
    }
  };

  const onEnd = (e) => {
    start.current = null;
    if (e.touches.length === 0) {
      const now = Date.now();
      if (now - lastTap.current < 300) { setScale(1); setPan({ x: 0, y: 0 }); }
      lastTap.current = now;
    }
  };

  return (
    <div onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      style={{ overflow: "hidden", borderRadius: "8px", position: "relative",
        touchAction: scale > 1 ? "none" : "pan-y" }}>
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        transformOrigin: "center center",
        transition: start.current ? "none" : "transform 260ms cubic-bezier(.2,.7,.3,1)" }}>
        {children}
      </div>
      {scale > 1 && (
        <div style={{ position: "absolute", right: "8px", bottom: "6px", color: c.faint,
          fontSize: TYPE.micro, pointerEvents: "none" }}>
          {scale.toFixed(1)}x, double tap to reset
        </div>
      )}
    </div>
  );
}

// Splitting a list into tasks does not need a model. This runs locally and
// always works; the model call only improves on it by grouping into areas and
// judging how long each one takes.
const AREA_HINTS = [
  ["Kitchen", ["dish", "bench", "kitchen", "fridge", "sink", "cook", "oven", "kettle", "pantry"]],
  ["Bathroom", ["bathroom", "shower", "toilet", "mirror", "towel", "basin"]],
  ["Bedroom", ["bed", "pillow", "sheet", "wardrobe", "cot", "pyjama"]],
  ["Laundry", ["washing", "laundry", "fold", "iron", "dryer"]],
  ["Living room", ["couch", "lounge", "living", "tv", "vacuum", "cushion"]],
  ["Outside", ["car", "garage", "garden", "lawn", "outside", "bin", "kerb", "pram", "downstairs"]],
  ["Desk", ["email", "desk", "computer", "invoice", "admin", "call", "book", "laptop"]],
];

function guessArea(name) {
  const low = name.toLowerCase();
  for (const [area, words] of AREA_HINTS) {
    if (words.some((w) => low.indexOf(w) >= 0)) return area;
  }
  return "General";
}

function parseLocally(text) {
  return String(text || "")
    .split(/[\n\r]+|,(?=\s)|;/)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 1)
    .map((name) => {
      const real = 180;
      return { id: newId(), area: guessArea(name), name,
        fast: Math.round(real * 0.6), real, slow: Math.round(real * 1.8), actual: null };
    });
}

const newId = () => `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// A walkthrough that runs rather than describes. The chart is real, the dots
// land as you press through, and each button is labelled with the action it
// stands for, so a lap is completed before the first real one.
const DEMO = [
  { name: "Unload dishwasher", fast: 120, real: 180, slow: 300, actual: 150 },
  { name: "Wipe benches", fast: 60, real: 90, slow: 180, actual: 40 },
  { name: "Bins out", fast: 60, real: 120, slow: 240, actual: 105 },
  { name: "Fold washing", fast: 300, real: 420, slow: 660, actual: 700 },
];

// The copy quotes real numbers, so they are computed from the demo rather than
// typed in. If the scoring changes, the walkthrough changes with it.
const fmt = (n) => `${Math.floor(n / 60)}:${String(Math.round(n) % 60).padStart(2, "0")}`;

function buildSteps() {
  const [a, b, c3, d] = DEMO;
  const ptsA = taskPoints(a.actual, a.real);
  const ptsD = taskPoints(d.actual, d.real);
  const onTimeD = taskPoints(d.real, d.real);
  return [
    { done: 0, title: "Two rings, three targets",
      body: `Every task gets a fast, a likely and a slow estimate. The inner ring is the slow one, the outer ring is the fast one. A dot between them means you worked at a sensible pace.`,
      action: "Next" },
    { done: 0, title: "Start with the list",
      body: "Type it, paste it, in any order. It gets split into tasks and grouped by where each one happens.",
      action: "Sort it" },
    { done: 0, title: `${DEMO.length} tasks, ready`,
      body: "Each one carries its three targets. Reorder them, delete any you do not want, add more by hand.",
      action: "Set energy" },
    { done: 0, title: "Say how you are feeling",
      body: "Optional, nought to five. The lower it is, the higher the multiplier on everything you earn, because the same work costs more when you are depleted.",
      action: "Go" },
    { done: 0, title: "The clock counts up",
      body: "It never counts down, because you can switch tasks at any point and a countdown would not know which target it was counting against.",
      action: "Complete" },
    { done: 1, title: "A dot lands",
      body: `${a.name} took ${fmt(a.actual)} against a ${fmt(a.real)} estimate. ${fmt(a.real - a.actual)} under, so ${ptsA} points and a dot in the outer half of the band.`,
      action: "Next task" },
    { done: 2, title: "Faster than the fast target",
      body: `${b.name} took ${fmt(b.actual)} against a ${fmt(b.fast)} fast target. Beating it puts the dot outside the outer ring, which is the only way to get there.`,
      action: "Next task" },
    { done: 3, title: "Steady",
      body: `${c3.name} landed inside the band. Points scale with the size of the task, so a long job is worth more than a short one at the same pace.`,
      action: "Last task" },
    { done: 4, title: "One lap, job done",
      body: `${d.name} ran past its slow target, so it sits inside the inner ring and earned ${ptsD} rather than the ${onTimeD} that hitting the estimate was worth. The lap closes either way.`,
      action: "See the review" },
    { done: 4, title: "Then the debrief",
      body: "You get the score, the fastest and slowest task against their own estimates, and two questions about why. Those answers come back the next time you set up a run.",
      action: "Start for real" },
  ];
}

function Walkthrough({ c, onClose, FONT, TYPE }) {
  const [i, setI] = React.useState(0);
  const STEPS = React.useMemo(buildSteps, []);
  const step = STEPS[i];
  const shown = DEMO.slice(0, step.done).map((t, k) => ({
    ...t, score: paceScore(t.actual, t), idx: k,
  }));
  const n = DEMO.length;
  const mean = shown.length ? shown.reduce((a, p) => a + p.score, 0) / shown.length : 0;
  const pts = shown.map((p) => ({ ...p, ...axisPoint(p.idx, n, radiusFor(p.score)) }));

  const arrowA = (C_GAP_CENTRE * Math.PI) / 180;
  const shaft = radiusFor(mean);
  const tip = shaft + MAX_R * ARROW_HEAD_LEN;
  const hw = (MAX_R * ARROW_HEAD_W) / 2;
  const ca = Math.cos(arrowA), sa = Math.sin(arrowA);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 80,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: c.panel, border: `1px solid ${c.border}`, maxWidth: "440px",
        width: "100%", maxHeight: "92vh", overflowY: "auto", fontFamily: FONT }}
        className="rounded-lg p-4">

        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-1">
            {STEPS.map((_, k) => (
              <div key={k} style={{ width: k === i ? "18px" : "6px", height: "4px", borderRadius: "2px",
                background: k <= i ? c.accent : c.line, transition: "all 220ms ease" }} />
            ))}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none",
            color: c.faint, fontFamily: FONT, fontSize: TYPE.small }}>Skip</button>
        </div>

        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", maxHeight: "34vh", display: "block", margin: "0 auto" }}>
          <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_HIGH)} fill={c.band} />
          <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_LOW)} fill={c.panel} />
          {[0, 1, 2, 3].map((q) => {
            const a = ((-45 + 90 * q) * Math.PI) / 180;
            return <line key={q} x1={CENTER + MAX_R * 0.29 * Math.cos(a)} y1={CENTER + MAX_R * 0.29 * Math.sin(a)}
              x2={CENTER + (MAX_R + 30) * Math.cos(a)} y2={CENTER + (MAX_R + 30) * Math.sin(a)}
              stroke={c.ring} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 7" strokeLinecap="round" />;
          })}
          {ARM_ANGLES.map((deg) => {
            const a = (deg * Math.PI) / 180;
            return <line key={deg} x1={CENTER} y1={CENTER}
              x2={CENTER + MAX_R * ARM_SHORT * Math.cos(a)} y2={CENTER + MAX_R * ARM_SHORT * Math.sin(a)}
              stroke={c.accent} strokeWidth={MAX_R * ARM_WIDTH} strokeLinecap="round" />;
          })}
          {shown.length > 0 && (
            <g>
              <line x1={CENTER} y1={CENTER} x2={CENTER + shaft * ca} y2={CENTER + shaft * sa}
                stroke={c.accent} strokeWidth={MAX_R * ARROW_SHAFT_W} strokeLinecap="round"
                style={{ transition: "all 480ms cubic-bezier(.34,1.1,.64,1)" }} />
              <polygon fill={c.accent} style={{ transition: "all 480ms cubic-bezier(.34,1.1,.64,1)" }}
                points={`${CENTER + tip * ca},${CENTER + tip * sa} ${CENTER + shaft * ca + hw * sa},${CENTER + shaft * sa - hw * ca} ${CENTER + shaft * ca - hw * sa},${CENTER + shaft * sa + hw * ca}`} />
            </g>
          )}
          {DEMO.map((t, k) => {
            const edge = axisPoint(k, n, MAX_R);
            return <line key={k} x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y}
              stroke={c.accent} strokeOpacity={0.13} />;
          })}
          {[[BAND_LOW, C_GAP_INNER], [BAND_HIGH, C_GAP_OUTER]].map(([pct, gap]) => (
            <path key={pct} d={arcPath(radiusFor(pct), C_GAP_CENTRE + gap / 2, 360 - gap)}
              fill="none" stroke={c.ring} strokeOpacity={0.5}
              strokeWidth={MAX_R * RING_THICKNESS} strokeLinecap="round" />
          ))}
          {pts.length > 1 && (
            <path d={smoothPath(pts, false)} fill="none" stroke={c.accent} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
          )}
          {pts.map((p) => {
            const tone = p.score > BAND_HIGH ? c.good : p.score >= BAND_LOW ? c.accent : c.danger;
            const lp = axisPoint(p.idx, n, MAX_R + 32);
            const anchor = Math.abs(lp.x - CENTER) < 14 ? "middle" : lp.x > CENTER ? "start" : "end";
            const lines = wrapLabel(p.name);
            return (
              <g key={p.name}>
                <circle cx={p.x} cy={p.y} r={6} fill={p.score >= BAND_LOW ? tone : c.bg}
                  stroke={tone} strokeWidth={p.score >= BAND_LOW ? 0 : 2.5}>
                  <animate attributeName="r" from="0" to="6" dur="0.32s"
                    calcMode="spline" keySplines="0.34 1.56 0.64 1" fill="freeze" />
                </circle>
                <text x={lp.x} y={lp.y - (lines.length - 1) * 7.5} fontSize="13.5" fontFamily={FONT}
                  fontWeight="500" fill={c.accent} fillOpacity={0.85}
                  textAnchor={anchor} dominantBaseline="middle">
                  {lines.map((ln, q) => <tspan key={q} x={lp.x} dy={q === 0 ? 0 : 15}>{ln}</tspan>)}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="goal-fade" key={i}>
          <div style={{ fontSize: TYPE.strong, fontWeight: 600, marginTop: "8px" }}>{step.title}</div>
          <div style={{ color: c.muted, fontSize: TYPE.body, marginTop: "6px", lineHeight: 1.45 }}>
            {step.body}
          </div>
        </div>

        <button onClick={() => (i === STEPS.length - 1 ? onClose() : setI(i + 1))}
          style={{ background: c.soft, border: `1px solid ${c.borderStrong}`, color: c.accentText,
            fontFamily: FONT, fontSize: TYPE.body, fontWeight: 600 }}
          className="goal-press w-full rounded py-3 uppercase tracking-widest mt-4">
          {step.action}
        </button>
      </div>
    </div>
  );
}

export default function Wiser() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    if (window.matchMedia) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      setTheme(mql.matches ? "dark" : "light");
      const h = (e) => setTheme(e.matches ? "dark" : "light");
      mql.addEventListener?.("change", h);
      return () => mql.removeEventListener?.("change", h);
    }
  }, []);
  const c = THEME[theme];

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = STYLES;
    document.head.appendChild(el);
    // Safari on iOS ignores user-scalable=no, so page level pinch is stopped by
    // swallowing the gesture events instead. Anything inside a zoom frame is
    // left to handle its own.
    const block = (e) => { if (!e.target.closest || !e.target.closest("[data-zoomable]")) e.preventDefault(); };
    ["gesturestart", "gesturechange", "gestureend"].forEach((n) => document.addEventListener(n, block, { passive: false }));
    return () => {
      document.head.removeChild(el);
      ["gesturestart", "gesturechange", "gestureend"].forEach((n) => document.removeEventListener(n, block));
    };
  }, []);

  const [phase, setPhase] = useState("plan");     // plan | run | review
  const [dump, setDump] = useState("");
  const [tasks, setTasks] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const [best, setBest] = useState(null);

  const [activeId, setActiveId] = useState(null);
  const [startedAt, setStartedAt] = useState(null);      // wall clock, ms
  const [transitionUntil, setTransitionUntil] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [completedCount, setCompletedCount] = useState(0);
  const [justDone, setJustDone] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [energy, setEnergy] = useState(null);
  const [tour, setTour] = useState(false);
  const [debrief, setDebrief] = useState({ helped: null, hindered: null, helpedOther: "", hinderedOther: "", saved: false });
  const [manual, setManual] = useState({ name: "", area: "", real: "" });
  const tickRef = useRef(null);

  // ---- best run, kept across sessions ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("productivity:best");
        if (res && res.value) setBest(JSON.parse(res.value));
      } catch (err) { /* nothing saved yet */ }
      try {
        const res = await window.storage.get("productivity:lessons");
        if (res && res.value) setLessons(JSON.parse(res.value));
      } catch (err) { /* nothing saved yet */ }
    })();
  }, []);

  // ---- the clock. Counts up, because a countdown cannot know which target it
  // is counting against until you have chosen which task you are doing.
  // Elapsed time is derived from the wall clock rather than accumulated by a
  // tick, so leaving the app and coming back reports the real time, not the
  // time the browser felt like giving us while backgrounded. ----
  useEffect(() => {
    if (phase !== "run") return;
    tickRef.current = setInterval(() => setNow(Date.now()), 250);
    const wake = () => setNow(Date.now());
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(tickRef.current);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [phase]);

  const inTransition = transitionUntil != null && now < transitionUntil;
  const transition = inTransition ? Math.ceil((transitionUntil - now) / 1000) : 0;
  const elapsed = startedAt == null ? 0
    : Math.max(0, Math.floor((now - (inTransition ? transitionUntil : startedAt)) / 1000));

  const done = tasks.filter((t) => t.actual != null);
  const pending = tasks.filter((t) => t.actual == null);
  const active = tasks.find((t) => t.id === activeId) || null;

  const rawScore = done.reduce((n, t) => n + taskPoints(t.actual, t.real), 0);
  const multiplier = energyMult(energy);
  const totalScore = Math.round(rawScore * multiplier);
  const plannedSeconds = tasks.reduce((n, t) => n + Number(t.real), 0);
  const doneSeconds = done.reduce((n, t) => n + Number(t.real), 0);
  const progressPct = plannedSeconds ? (doneSeconds / plannedSeconds) * 100 : 0;
  const spentSeconds = done.reduce((n, t) => n + t.actual, 0);

  // ---- brain dump goes to the model and comes back as structured tasks ----
  const parseDump = async () => {
    const raw = dump.trim();
    if (!raw) return;
    setThinking(true);
    setError(null);

    // The local split is the floor. Anything the model gives us replaces it.
    const local = parseLocally(raw);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Split this list into tasks. Group by the physical area each happens in, and order so tasks in the same area sit together. If an item gives no clue about location, use "General".

For each task estimate three durations in seconds: fast (done efficiently, no interruption), real (most likely), slow (dawdling or distracted).

Reply with a JSON array and nothing else.
[{"area":"Kitchen","name":"Unload dishwasher","fast":120,"real":180,"slow":300}]

List:
${raw}`,
          }],
        }),
      });

      const data = await res.json();
      const text = (data && data.content ? data.content : [])
        .filter((b) => b && b.type === "text").map((b) => b.text).join("").trim();

      const open = text.indexOf("[");
      const close = text.lastIndexOf("]");
      if (open < 0 || close <= open) throw new Error("no array in reply");

      const parsed = JSON.parse(text.slice(open, close + 1));
      if (!Array.isArray(parsed) || !parsed.length) throw new Error("empty array");

      const built = parsed.filter((t) => t && t.name).map((t) => {
        const real = Math.max(15, Math.round(Number(t.real)) || 180);
        return {
          id: newId(), area: String(t.area || "General").trim(), name: String(t.name).trim(),
          fast: Math.max(10, Math.min(real - 5, Math.round(Number(t.fast)) || Math.round(real * 0.6))),
          real,
          slow: Math.max(real + 10, Math.round(Number(t.slow)) || Math.round(real * 1.8)),
          actual: null,
        };
      });
      if (!built.length) throw new Error("nothing usable");

      setTasks(built);
      setDump("");
    } catch (err) {
      // Fall back rather than fail. The list is still split, the estimates are
      // just defaults until you edit them.
      if (local.length) {
        setTasks(local);
        setDump("");
        setError(`Estimated times could not be fetched, so every task is set to 3:00. Edit any of them below. (${err && err.message ? err.message : "unknown"})`);
      } else {
        setError("Nothing to split. Put one task per line.");
      }
    } finally {
      setThinking(false);
    }
  };

  const addManual = () => {
    if (!manual.name.trim()) return;
    const real = Math.max(15, Number(manual.real) * 60 || 120);
    setTasks([...tasks, { id: newId(), area: manual.area.trim() || "General",
      name: manual.name.trim(), fast: Math.round(real * 0.7), real, slow: Math.round(real * 1.6), actual: null }]);
    setManual({ name: "", area: manual.area, real: "" });
  };

  const removeTask = (id) => setTasks(tasks.filter((t) => t.id !== id));
  const moveTask = (id, dir) => {
    const i = tasks.findIndex((t) => t.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= tasks.length) return;
    const next = tasks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setTasks(next);
  };

  // ---- running ----
  const start = () => {
    if (!tasks.length) return;
    setPhase("run");
    setActiveId(tasks[0].id);
    setStartedAt(Date.now());
    setTransitionUntil(null);
  };

  // Any task can be picked at any time. The clock moves to whatever you are
  // actually doing rather than assuming you followed the order.
  const switchTo = (id) => {
    if (id === activeId) return;
    setActiveId(id);
    setStartedAt(Date.now());
    setTransitionUntil(null);
  };

  // The handover can be cut short. Waiting it out on the last task means
  // staring at a countdown with nothing else on screen.
  const skipTransition = () => {
    if (!inTransition) return;
    setTransitionUntil(null);
    setStartedAt(Date.now());
  };

  const completeActive = () => {
    if (!active || inTransition) return;
    const secs = Math.max(1, elapsed);
    const order = completedCount + 1;
    setCompletedCount(order);
    setJustDone(active.id);
    setTimeout(() => setJustDone(null), 900);
    const next = tasks.map((t) => t.id === active.id ? { ...t, actual: secs, order } : t);
    setTasks(next);
    const remaining = next.filter((t) => t.actual == null);
    if (remaining.length) {
      setActiveId(remaining[0].id);
      // The transition runs first, then the next task's clock starts from the
      // moment it ends, so the handover is not counted against either task.
      const until = Date.now() + TRANSITION * 1000;
      setTransitionUntil(until);
      setStartedAt(until);
    } else {
      setActiveId(null);
      setStartedAt(null);
      setTransitionUntil(null);
      finish(next);
    }
  };

  const finish = async (list) => {
    const raw = list.reduce((n, t) => n + taskPoints(t.actual, t.real), 0);
    const score = Math.round(raw * energyMult(energy));
    const run = { score, raw, energy, multiplier: energyMult(energy),
      at: new Date().toISOString(), tasks: list.length,
      spent: list.reduce((n, t) => n + (t.actual || 0), 0) };
    if (!best || score > best.score) {
      setBest(run);
      try { await window.storage.set("productivity:best", JSON.stringify(run)); } catch (err) { /* best effort */ }
    }
    setPhase("review");
  };

  // Fastest and slowest are judged on pace against their own estimate, not on
  // raw seconds, so a long task is not automatically the worst one.
  const standouts = useMemo(() => {
    const scored = tasks.filter((t) => t.actual != null)
      .map((t) => ({ t, score: paceScore(t.actual, t) }));
    if (scored.length < 2) return null;
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    return { best: sorted[0].t, worst: sorted[sorted.length - 1].t };
  }, [tasks]);

  const saveDebrief = async () => {
    if (!standouts) return;
    const entry = {
      at: new Date().toISOString(), score: totalScore, tasks: tasks.length,
      best: standouts.best.name, worst: standouts.worst.name,
      helped: debrief.helped === OTHER ? debrief.helpedOther.trim() : debrief.helped,
      hindered: debrief.hindered === OTHER ? debrief.hinderedOther.trim() : debrief.hindered,
    };
    const next = [entry, ...lessons].slice(0, 12);
    setLessons(next);
    setDebrief({ ...debrief, saved: true });
    try { await window.storage.set("productivity:lessons", JSON.stringify(next)); } catch (err) { /* best effort */ }
  };

  const reset = () => {
    setDebrief({ helped: null, hindered: null, helpedOther: "", hinderedOther: "", saved: false });
    setEnergy(null);
    setTasks(tasks.map((t) => ({ ...t, actual: null, order: undefined })));
    setPhase("plan");
    setActiveId(null);
    setStartedAt(null);
    setTransitionUntil(null);
    setCompletedCount(0);
  };

  // ---- styles ----
  const input = { background: c.panel, border: `1px solid ${c.border}`, color: c.text, fontFamily: FONT, fontSize: TYPE.input };
  const panel = { border: `1px solid ${c.border}`, background: c.panel };
  const primaryBtn = { background: c.soft, border: `1px solid ${c.borderStrong}`, color: c.accentText, fontFamily: FONT, fontWeight: 600 };
  const head = { color: c.ring, fontSize: TYPE.micro, letterSpacing: "2px", fontWeight: 700 };

  // ---- the chart. One spoke per task, in order. A full lap is a finished job. ----
  const Chart = () => {
    const n = tasks.length;
    if (!n) return null;
    // Spokes are not owned by a task. Finished tasks take the spokes in the
    // order they were actually completed, so the chart fills clockwise however
    // you jump around the list. Whatever is left fills the rest.
    const finished = tasks.filter((t) => t.actual != null).sort((a, b) => a.order - b.order);
    const rest = tasks.filter((t) => t.actual == null);
    const ordered = [...finished, ...rest];
    const pts = ordered.map((t, i) => {
      const sc = t.actual != null ? paceScore(t.actual, t) : null;
      return { t, i, score: sc, ...(sc != null ? axisPoint(i, n, radiusFor(sc)) : {}) };
    });
    const filled = pts.filter((p) => p.score != null);
    const meanScore = filled.length ? filled.reduce((s, p) => s + p.score, 0) / filled.length : 0;
    const complete = filled.length === n;


    const arrowA = (C_GAP_CENTRE * Math.PI) / 180;
    const shaft = radiusFor(meanScore);
    const tip = shaft + MAX_R * ARROW_HEAD_LEN;
    const hw = (MAX_R * ARROW_HEAD_W) / 2;
    const cosA = Math.cos(arrowA), sinA = Math.sin(arrowA);

    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto"
        style={{ maxHeight: phase === "run" ? "44vh" : "52vh", display: "block", margin: "0 auto" }}>
        <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_HIGH)} fill={c.band} />
        <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_LOW)} fill={c.panel} />

        {/* Quadrants are fixed whatever the task count, so passing one means
            you are a quarter of the way round. */}
        {[0, 1, 2, 3].map((q) => {
          const a = ((-45 + 90 * q) * Math.PI) / 180;
          return (
            <line key={`d${q}`} x1={CENTER + MAX_R * 0.29 * Math.cos(a)} y1={CENTER + MAX_R * 0.29 * Math.sin(a)}
              x2={CENTER + (MAX_R + 30) * Math.cos(a)} y2={CENTER + (MAX_R + 30) * Math.sin(a)}
              stroke={c.ring} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="2 7" strokeLinecap="round" />
          );
        })}

        {ARM_ANGLES.map((deg) => {
          const a = (deg * Math.PI) / 180;
          return (
            <line key={`arm${deg}`} x1={CENTER} y1={CENTER}
              x2={CENTER + MAX_R * ARM_SHORT * Math.cos(a)} y2={CENTER + MAX_R * ARM_SHORT * Math.sin(a)}
              stroke={c.accent} strokeWidth={MAX_R * ARM_WIDTH} strokeLinecap="round" />
          );
        })}
        {/* Average performance across the tasks finished so far. Progress round
            the lap is carried by the spokes, so this is only ever pace. */}
        {filled.length > 0 && (
          <g style={{ transition: "opacity 300ms ease" }}>
            <line x1={CENTER} y1={CENTER} x2={CENTER + shaft * cosA} y2={CENTER + shaft * sinA}
              stroke={c.accent} strokeWidth={MAX_R * ARROW_SHAFT_W} strokeLinecap="round"
              style={{ transition: "all 500ms cubic-bezier(.34,1.2,.64,1)" }} />
            <polygon fill={c.accent}
              style={{ transition: "all 500ms cubic-bezier(.34,1.2,.64,1)" }}
              points={`${CENTER + tip * cosA},${CENTER + tip * sinA} ${CENTER + shaft * cosA + hw * sinA},${CENTER + shaft * sinA - hw * cosA} ${CENTER + shaft * cosA - hw * sinA},${CENTER + shaft * sinA + hw * cosA}`} />
          </g>
        )}

        {pts.map((p) => {
          const edge = axisPoint(p.i, n, MAX_R);
          const isActive = p.t.id === activeId;
          // Pushed clear of the furthest a dot can sit, which is 1.06R plus the dot
          // radius. At +20 an exceptional dot sat underneath its own label.
          const lp = axisPoint(p.i, n, MAX_R + 32);
          const anchor = Math.abs(lp.x - CENTER) < 14 ? "middle" : lp.x > CENTER ? "start" : "end";
          return (
            <g key={`s${p.t.id}`}>
              <line x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y}
                stroke={c.accent} strokeOpacity={isActive ? 0.6 : 0.13}
                strokeWidth={isActive ? 2 : 1} />
              {p.score != null && (() => {
                const lines = wrapLabel(p.t.name);
                return (
                  <text x={lp.x} y={lp.y - (lines.length - 1) * 7.5} fontSize="13.5" fontFamily={FONT}
                    fontWeight="500" fill={c.accent} fillOpacity={p.t.id === justDone ? 1 : 0.8}
                    textAnchor={anchor} dominantBaseline="middle">
                    {lines.map((ln, k) => (
                      <tspan key={k} x={lp.x} dy={k === 0 ? 0 : 15}>{ln}</tspan>
                    ))}
                    {p.t.id === justDone && (
                      <animate attributeName="fill-opacity" from="0" to="1" dur="0.45s" fill="freeze" />
                    )}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {[[BAND_LOW, C_GAP_INNER], [BAND_HIGH, C_GAP_OUTER]].map(([pct, gap]) => (
          <path key={pct} d={arcPath(radiusFor(pct), C_GAP_CENTRE + gap / 2, 360 - gap)}
            fill="none" stroke={c.ring} strokeOpacity={0.5}
            strokeWidth={MAX_R * RING_THICKNESS} strokeLinecap="round" />
        ))}

        {/* The lap is left open. Joining the last dot back to the first would
            draw a line between two tasks that have nothing to do with each
            other, and the closed shape reads as a shape rather than a path. */}
        {filled.length > 1 && (
          <path className="goal-line" d={smoothPath(filled, false)}
            fill="none" stroke={c.accent} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />
        )}

        {filled.map((p) => {
          const tone = p.score > BAND_HIGH ? c.good : p.score >= BAND_LOW ? c.accent : c.danger;
          const fresh = p.t.id === justDone;
          return (
            <g key={`p${p.t.id}`}>
              {fresh && (
                <circle cx={p.x} cy={p.y} fill="none" stroke={tone} strokeWidth={2}>
                  <animate attributeName="r" from="6" to="26" dur="0.7s" fill="freeze" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="0.7s" fill="freeze" />
                </circle>
              )}
              <circle className="goal-dot" cx={p.x} cy={p.y} r={6}
                fill={p.score >= BAND_LOW ? tone : c.bg} stroke={tone}
                strokeWidth={p.score >= BAND_LOW ? 0 : 2.5}>
                {fresh && <animate attributeName="r" from="0" to="6" dur="0.32s"
                  calcMode="spline" keySplines="0.34 1.56 0.64 1" fill="freeze" />}
              </circle>
            </g>
          );
        })}

        {/* the task in hand */}
        {active && (() => {
          const i = ordered.findIndex((t) => t.id === active.id);
          if (i < 0) return null;
          const e = axisPoint(i, n, MAX_R + 16);
          return <circle cx={e.x} cy={e.y} r={5} fill="none" stroke={c.accent} strokeWidth={2} />;
        })()}
      </svg>
    );
  };

  const areas = useMemo(() => {
    const out = [];
    tasks.forEach((t) => {
      const last = out[out.length - 1];
      if (last && last.area === t.area) last.items.push(t);
      else out.push({ area: t.area, items: [t] });
    });
    return out;
  }, [tasks]);

  return (
    <div style={{ background: c.bg, color: c.text, minHeight: "100vh", fontFamily: FONT }}
      className="w-full p-4 sm:p-5">
      {tour && <Walkthrough c={c} FONT={FONT} TYPE={TYPE} onClose={() => setTour(false)} />}

      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 style={{ color: c.accentText }} className="text-base sm:text-lg tracking-widest uppercase leading-tight">
            T.C.C. // Wiser
          </h1>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit" }}
            className="goal-press shrink-0 text-xs px-2 py-1 rounded uppercase tracking-wide">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
        <button onClick={() => setTour(true)}
          style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: FONT,
            fontSize: TYPE.small }}
          className="goal-press rounded px-3 py-1.5 mb-4">
          How it works
        </button>

        {/* ---------------- PLAN ---------------- */}
        {phase === "plan" && (
          <div>
            {lessons.length > 0 && (
              <div style={{ ...panel, borderLeft: `2px solid ${c.accent}` }}
                className="rounded p-3 mb-4 goal-fade">
                <div style={{ ...head, marginBottom: "8px" }}>FROM LAST TIME</div>
                {lessons.slice(0, 3).map((l, i) => (
                  <div key={i} className={i ? "mt-2.5" : ""}>
                    {l.helped && (
                      <div style={{ fontSize: TYPE.small, color: c.muted }}>
                        <span style={{ color: c.good }}>{l.best}</span> went well: {l.helped.toLowerCase()}.
                      </div>
                    )}
                    {l.hindered && (
                      <div style={{ fontSize: TYPE.small, color: c.muted, marginTop: "2px" }}>
                        <span style={{ color: c.warn }}>{l.worst}</span> ran long: {l.hindered.toLowerCase()}.
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ color: c.faint, fontSize: TYPE.micro, marginTop: "10px" }}>
                  Sort the first of those before you start and the run gets easier.
                </div>
              </div>
            )}

            <div style={panel} className="rounded p-4 mb-4">
              <div style={{ ...head, marginBottom: "8px" }}>ADD TASK LIST</div>
              <textarea value={dump} onChange={(e) => setDump(e.target.value)}
                placeholder="Type or paste to-do list here."
                style={{ ...input, minHeight: "110px" }} className="w-full rounded px-3 py-2.5 mb-2" />
              <button onClick={parseDump} disabled={thinking || !dump.trim()}
                style={{ ...primaryBtn, opacity: thinking || !dump.trim() ? 0.4 : 1 }}
                className="goal-press w-full rounded py-2.5 text-xs uppercase tracking-wide">
                {thinking ? "Sorting..." : "Sort into tasks"}
              </button>
              {error && <div style={{ color: c.warn }} className="text-xs mt-2">{error}</div>}
            </div>

            {tasks.length > 0 && (
              <>
                <div style={panel} data-zoomable className="rounded-lg p-3 mb-3"><ZoomFrame key={phase} c={c}><Chart /></ZoomFrame></div>

                <div style={panel} className="rounded p-3 mb-3">
                  <div className="flex justify-between items-baseline mb-2">
                    <div style={head}>ENERGY RIGHT NOW</div>
                    <div style={{ color: multiplier > 1 ? c.good : c.faint, fontSize: TYPE.micro }}>
                      {multiplier > 1 ? `${multiplier}x points` : "optional"}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {ENERGY.map((e) => {
                      const on = energy === e.v;
                      return (
                        <button key={e.v} onClick={() => setEnergy(on ? null : e.v)}
                          style={on
                            ? { border: `1px solid ${c.accent}`, background: c.soft, color: c.accentText, fontFamily: FONT }
                            : { border: `1px solid ${c.line}`, color: c.muted, fontFamily: FONT }}
                          className="goal-press flex-1 rounded py-2">
                          <div style={{ fontSize: TYPE.input, fontWeight: 600 }}>{e.v}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ color: c.faint }} className="text-xs mt-2">
                    {energy == null
                      ? "0 is nothing left, 5 is fresh. Lower ratings raise the multiplier."
                      : `${(ENERGY.find((e) => e.v === energy) || {}).label}. ${multiplier > 1 ? `Every task is worth ${multiplier}x.` : "No multiplier above 3."}`}
                  </div>
                </div>

                <button onClick={start} style={{ ...primaryBtn, fontSize: TYPE.body }}
                  className="goal-press w-full rounded py-3.5 uppercase tracking-widest mb-4">Go</button>

                <div className="flex justify-between items-baseline mb-2">
                  <div style={head}>{tasks.length} TASKS</div>
                  <div style={{ color: c.faint }} className="text-xs">
                    {mmss(plannedSeconds)} at pace
                  </div>
                </div>

                {areas.map((grp) => (
                  <div key={grp.area} className="mb-3">
                    <div style={{ ...head, marginBottom: "6px" }}>{grp.area.toUpperCase()}</div>
                    {grp.items.map((t) => (
                      <div key={t.id} style={panel} className="rounded px-3 py-2 mb-1.5 flex items-center gap-2 goal-fade">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate" style={{ fontWeight: 500 }}>{t.name}</div>
                          <div style={{ color: c.faint }} className="text-xs mt-0.5 truncate">
                            {mmss(t.fast)} / {mmss(t.real)} / {mmss(t.slow)}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {[["\u2191", () => moveTask(t.id, -1), c.muted],
                            ["\u2193", () => moveTask(t.id, 1), c.muted],
                            ["\u00d7", () => removeTask(t.id), c.danger]].map(([lbl, fn, col], k) => (
                            <button key={k} onClick={fn}
                              style={{ border: `1px solid ${c.line}`, color: col, fontFamily: FONT,
                                width: "38px", height: "38px", lineHeight: 1,
                                fontSize: TYPE.strong, fontWeight: 600 }}
                              className="goal-press rounded">{lbl}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            <div style={panel} className="rounded p-4 mb-4">
              <div style={{ ...head, marginBottom: "8px" }}>ADD TASK</div>
              <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })}
                placeholder="Task" style={{ ...input }} className="w-full rounded px-2 py-2 mb-2" />
              <div className="flex gap-2 mb-2">
                <input value={manual.area} onChange={(e) => setManual({ ...manual, area: e.target.value })}
                  placeholder="Area" style={{ ...input, minWidth: 0 }} className="flex-1 rounded px-2 py-2" />
                <input value={manual.real} onChange={(e) => setManual({ ...manual, real: e.target.value })}
                  placeholder="min" type="number" inputMode="numeric"
                  style={{ ...input, width: "78px" }} className="shrink-0 rounded px-2 py-2" />
              </div>
              <button onClick={addManual} disabled={!manual.name.trim()}
                style={{ ...primaryBtn, opacity: manual.name.trim() ? 1 : 0.4 }}
                className="goal-press w-full rounded py-2 text-xs uppercase tracking-wide">Add task</button>
            </div>

          </div>
        )}

        {/* ---------------- RUN ---------------- */}
        {phase === "run" && (
          <div>
            {/* Pinned so the chart stays in view while you work down the list and
                can be seen reacting the moment a task is completed. */}
            <div style={{ ...panel, position: "sticky", top: 0, zIndex: 30,
              backgroundColor: c.panel, boxShadow: `0 10px 18px -10px ${c.bg}` }}
              data-zoomable className="rounded-lg px-2 pt-2 pb-2 mb-4">
              <ZoomFrame key={phase} c={c}><Chart /></ZoomFrame>
              <div className="px-1 pt-1">
                <div style={{ position: "relative", height: "16px", borderRadius: "4px",
                  border: `1px solid ${c.line}`, overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${clamp(progressPct, 0, 100)}%`,
                    background: c.accent, opacity: 0.35, transition: "width 0.4s ease" }} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                    justifyContent: "space-between", padding: "0 8px", fontSize: TYPE.micro, color: c.muted }}>
                    <span>{done.length} of {tasks.length}</span>
                    <span key={done.length} className="goal-pop"
                      style={{ color: totalScore >= 0 ? c.accentText : c.danger, fontWeight: 600 }}>
                      {totalScore >= 0 ? "+" : ""}{totalScore}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {transition > 0 && (
              <button onClick={skipTransition}
                style={{ border: `1px dashed ${c.accent}`, background: c.soft, fontFamily: FONT }}
                className="goal-press w-full rounded-lg px-3 py-2.5 mb-3 flex items-center justify-between text-left">
                <div>
                  <div style={{ color: c.accentText }} className="text-xs uppercase tracking-wide">Transition</div>
                  <div style={{ color: c.faint }} className="text-xs mt-0.5">Tap to start now</div>
                </div>
                <div style={{ color: c.accentText, fontSize: TYPE.numeral, fontWeight: 600 }}>{transition}</div>
              </button>
            )}

            {active && (() => {
              const sc = paceScore(Math.max(1, elapsed), active);
              const full = active.slow * 1.4;
              const w = (n) => clamp((n / full) * 100, 0, 100);
              return (
                <div style={{ ...panel, opacity: inTransition ? 0.6 : 1,
                  transition: "opacity 220ms ease" }} className="rounded-lg p-3 mb-3">
                  <div style={{ ...head, marginBottom: "4px" }}>{active.area.toUpperCase()}</div>
                  <div style={{ fontSize: TYPE.strong, fontWeight: 600, lineHeight: 1.25 }} className="mb-2">{active.name}</div>

                  <div style={{ position: "relative", height: "30px", borderRadius: "6px",
                    border: `1px solid ${c.line}`, overflow: "hidden", marginBottom: "8px" }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: `${w(active.fast)}%`,
                      width: `${w(active.slow) - w(active.fast)}%`, background: c.band }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: `${w(active.real)}%`,
                      width: "1px", background: c.ring, opacity: 0.8 }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${w(elapsed)}%`,
                      background: elapsed > active.slow ? c.danger : elapsed > active.real ? c.warn : c.accent,
                      opacity: 0.4, transition: "width 0.9s linear" }} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                      justifyContent: "space-between", padding: "0 10px", gap: "8px" }}>
                      <span style={{ fontSize: TYPE.numeral, fontWeight: 600, flexShrink: 0,
                        color: elapsed > active.slow ? c.danger : elapsed > active.real ? c.warn : c.accentText }}>
                        {mmss(elapsed)}
                      </span>
                      <span style={{ color: c.faint, fontSize: TYPE.micro, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis" }}>
                        {mmss(active.fast)} / {mmss(active.real)} / {mmss(active.slow)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-baseline gap-3 mb-2" style={{ fontSize: TYPE.micro }}>
                    <span style={{ color: c.faint, minWidth: 0 }}>
                      {sc > BAND_HIGH ? "Outside the outer ring"
                        : sc >= BAND_MID ? "Outer half of the band"
                        : sc >= BAND_LOW ? "Inner half of the band"
                        : "Inside the inner ring"}
                    </span>
                    <span style={{ flexShrink: 0, fontWeight: 600,
                      color: taskPoints(Math.max(1, elapsed), active.real) >= 0 ? c.accentText : c.danger }}>
                      {taskPoints(Math.max(1, elapsed), active.real) >= 0 ? "+" : ""}
                      {taskPoints(Math.max(1, elapsed), active.real)}
                    </span>
                  </div>

                  <button onClick={inTransition ? skipTransition : completeActive}
                    style={{ ...primaryBtn, fontSize: TYPE.body }}
                    className="goal-press w-full rounded py-3 uppercase tracking-widest">
                    {inTransition ? "Start now" : "Complete"}
                  </button>
                </div>
              );
            })()}

            {pending.filter((t) => t.id !== activeId).length > 0 && (
              <div className="mb-3">
                <div className="flex justify-between items-baseline mb-1.5">
                  <div style={head}>OR JUMP TO</div>
                  <div style={{ color: c.faint, fontSize: TYPE.micro }}>swipe left to remove</div>
                </div>
                {pending.filter((t) => t.id !== activeId).map((t) => (
                  <SwipeRow key={t.id} c={c} onDelete={() => removeTask(t.id)}>
                    <button onClick={() => switchTo(t.id)}
                      style={{ ...panel, fontFamily: FONT, color: c.text }}
                      className="goal-press w-full rounded px-3 py-2.5 flex items-center justify-between gap-2 text-left">
                      <span className="text-sm truncate" style={{ minWidth: 0 }}>{t.name}</span>
                      <span style={{ color: c.faint, fontSize: TYPE.micro, flexShrink: 0 }}>{mmss(t.real)}</span>
                    </button>
                  </SwipeRow>
                ))}
              </div>
            )}

            <div style={panel} className="rounded p-3 mb-4">
              <div style={{ ...head, marginBottom: "8px" }}>ADD TASK</div>
              <div className="flex gap-2">
                <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })}
                  placeholder="Task" style={{ ...input, minWidth: 0 }}
                  className="flex-1 rounded px-2 py-2" />
                <input value={manual.real} onChange={(e) => setManual({ ...manual, real: e.target.value })}
                  placeholder="min" type="number" inputMode="numeric"
                  style={{ ...input, width: "72px" }} className="shrink-0 rounded px-2 py-2" />
                <button onClick={addManual} disabled={!manual.name.trim()}
                  style={{ ...primaryBtn, opacity: manual.name.trim() ? 1 : 0.4 }}
                  className="goal-press shrink-0 rounded px-3 text-xs uppercase">Add</button>
              </div>
              <div style={{ color: c.faint }} className="text-xs mt-1.5">
                A new spoke opens for it. Anything already finished keeps its place.
              </div>
            </div>

            {done.length > 0 && (
              <div>
                <div style={{ ...head, marginBottom: "6px" }}>DONE</div>
                {done.map((t) => {
                  const pts = taskPoints(t.actual, t.real);
                  return (
                    <div key={t.id} style={{ ...panel, opacity: 0.75 }}
                      className="rounded px-3 py-2 mb-1.5 flex items-center justify-between gap-2 goal-fade">
                      <span className="text-sm truncate" style={{ minWidth: 0 }}>{t.name}</span>
                      <span style={{ fontSize: TYPE.micro, color: c.faint, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {mmss(t.actual)} vs {mmss(t.real)}{" "}
                        <span style={{ color: pts >= t.real ? c.good : pts >= 0 ? c.warn : c.danger }}>
                          {pts >= 0 ? "+" : ""}{pts}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------------- REVIEW ---------------- */}
        {phase === "review" && (
          <div>
            <div style={panel} data-zoomable className="rounded-lg p-3 mb-4"><ZoomFrame key={phase} c={c}><Chart /></ZoomFrame></div>

            <div style={panel} className="rounded p-4 mb-4">
              <div style={{ ...head, marginBottom: "10px" }}>RUN COMPLETE</div>
              <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                <span className="goal-pop" style={{ fontSize: TYPE.hero, fontWeight: 700,
                  color: totalScore >= 0 ? c.accentText : c.danger }}>
                  {totalScore >= 0 ? "+" : ""}{totalScore}
                </span>
                <span style={{ color: c.faint }} className="text-xs">
                  {tasks.length} tasks · {mmss(spentSeconds)} spent · {mmss(plannedSeconds)} estimated
                </span>
              </div>
              {multiplier > 1 && (
                <div style={{ color: c.good }} className="text-xs mb-1">
                  {rawScore} raised to {totalScore} at {multiplier}x, for starting on {energy} out of 5.
                </div>
              )}
              <div style={{ color: spentSeconds <= plannedSeconds ? c.good : c.warn }} className="text-xs">
                {spentSeconds <= plannedSeconds
                  ? `${mmss(plannedSeconds - spentSeconds)} under the estimate.`
                  : `${mmss(spentSeconds - plannedSeconds)} over the estimate.`}
              </div>
              {best && (
                <div style={{ color: c.faint, borderTop: `1px solid ${c.line}` }} className="text-xs mt-3 pt-3">
                  {best.score === totalScore && best.tasks === tasks.length
                    ? "Best run so far."
                    : `Best run so far is ${best.score} across ${best.tasks} tasks. This one is ${totalScore >= best.score ? "ahead" : `${best.score - totalScore} behind`}.`}
                </div>
              )}
            </div>

            {standouts && (() => {
              const blocks = [
                { key: "helped", otherKey: "helpedOther", label: "Fastest against its estimate",
                  task: standouts.best, tone: c.good, options: HELPED },
                { key: "hindered", otherKey: "hinderedOther", label: "Slowest against its estimate",
                  task: standouts.worst, tone: c.danger, options: HINDERED },
              ];
              const answered = (b) => debrief[b.key] && (debrief[b.key] !== OTHER || debrief[b.otherKey].trim());
              return (
                <div style={panel} className="rounded p-4 mb-4">
                  <div style={{ ...head, marginBottom: "12px" }}>THE TWO THAT STOOD OUT</div>

                  {blocks.map((b, bi) => (
                    <div key={b.key} style={{ borderTop: bi ? `1px solid ${c.line}` : "none",
                      paddingTop: bi ? "16px" : 0, marginBottom: "16px" }}>
                      <div style={{ color: c.faint, fontSize: TYPE.micro }}>{b.label}</div>
                      <div className="flex justify-between items-baseline gap-2 mb-2">
                        <span style={{ fontWeight: 600, minWidth: 0, fontSize: TYPE.strong }} className="truncate">
                          {b.task.name}
                        </span>
                        <span style={{ color: b.tone, flexShrink: 0, fontSize: TYPE.body }}>
                          {mmss(b.task.actual)} vs {mmss(b.task.real)}
                        </span>
                      </div>

                      {debrief.saved ? (
                        <div style={{ color: c.muted, fontSize: TYPE.small }}>
                          {debrief[b.key] === OTHER ? debrief[b.otherKey] : debrief[b.key] || "No factor given"}
                        </div>
                      ) : (
                        <>
                          <div style={{ color: c.muted, fontSize: TYPE.small, marginBottom: "8px" }}>
                            Main contributing factor
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {[...b.options, OTHER].map((opt) => {
                              const on = debrief[b.key] === opt;
                              return (
                                <button key={opt} onClick={() => setDebrief({ ...debrief, [b.key]: on ? null : opt })}
                                  style={on
                                    ? { border: `1px solid ${c.accent}`, background: c.soft, color: c.accentText, fontFamily: FONT }
                                    : { border: `1px solid ${c.line}`, color: c.muted, fontFamily: FONT }}
                                  className="goal-press w-full text-left rounded px-3 py-2.5">
                                  <span style={{ fontSize: TYPE.body }}>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                          {debrief[b.key] === OTHER && (
                            <input value={debrief[b.otherKey]}
                              onChange={(e) => setDebrief({ ...debrief, [b.otherKey]: e.target.value })}
                              placeholder="What was it?"
                              style={{ ...input, marginTop: "8px" }}
                              className="w-full rounded px-3 py-2.5 goal-fade" />
                          )}
                        </>
                      )}
                    </div>
                  ))}

                  {!debrief.saved ? (
                    <button onClick={saveDebrief} disabled={!blocks.some(answered)}
                      style={{ ...primaryBtn, opacity: blocks.some(answered) ? 1 : 0.4 }}
                      className="goal-press w-full rounded py-2.5 text-xs uppercase tracking-wide">
                      Save for next time
                    </button>
                  ) : (
                    <div style={{ color: c.accentText }} className="text-xs goal-fade">
                      Saved. This will show when you set up the next run.
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={panel} className="rounded p-4 mb-4">
              <div style={{ ...head, marginBottom: "8px" }}>PER TASK</div>
              {tasks.map((t) => {
                const pts = taskPoints(t.actual, t.real);
                const diff = t.real - t.actual;
                return (
                  <div key={t.id} style={{ borderTop: `1px solid ${c.line}` }} className="py-2">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-sm truncate" style={{ minWidth: 0, fontWeight: 500 }}>{t.name}</span>
                      <span style={{ flexShrink: 0, fontWeight: 600, fontSize: TYPE.body,
                        color: pts >= t.real ? c.good : pts >= 0 ? c.warn : c.danger }}>
                        {pts >= 0 ? "+" : ""}{pts}
                      </span>
                    </div>
                    <div style={{ color: c.faint }} className="text-xs mt-0.5">
                      {mmss(t.actual)} against {mmss(t.real)},{" "}
                      {diff >= 0 ? `${mmss(diff)} under` : `${mmss(-diff)} over`}
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={reset} style={primaryBtn}
              className="goal-press w-full rounded py-3 text-xs uppercase tracking-widest">Run it again</button>
          </div>
        )}
      </div>
    </div>
  );
}
