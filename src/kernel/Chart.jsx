import React from "react";
import {
  SIZE, CENTER, MAX_R, RING_THICKNESS, C_GAP_CENTRE, C_GAP_INNER, C_GAP_OUTER,
  ARM_ANGLES, ARM_SHORT, ARM_WIDTH, ARROW_SHAFT_W, ARROW_HEAD_W, ARROW_HEAD_LEN,
  radiusFor, axisPoint, arcPath, smoothPath, wrapLabel,
} from "./geometry.js";
import { BAND_LOW, BAND_HIGH, zoneOf } from "./scoring.js";

// One chart for every view. Spokes are labels, series are lines. A live view is
// one series with join off; a week view is one series per lap with the older
// ones faded. Nothing here knows what is being measured.
export default function Chart({
  spokes = [],
  series = [],
  c,
  join = true,
  showQuadrants = true,
  showArrow = true,
  maxHeight = "44vh",
}) {
  const n = spokes.length;
  if (!n) return null;

  const front = series.find((s) => !s.faded) || series[0] || { values: [] };
  const shown = (front.values || []).map((v, i) => ({ v, i })).filter((p) => p.v != null);
  const mean = shown.length ? shown.reduce((a, p) => a + p.v, 0) / shown.length : 0;

  const arrowA = (C_GAP_CENTRE * Math.PI) / 180;
  const ca = Math.cos(arrowA), sa = Math.sin(arrowA);
  const shaft = radiusFor(mean);
  const tip = shaft + MAX_R * ARROW_HEAD_LEN;
  const hw = (MAX_R * ARROW_HEAD_W) / 2;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", maxHeight, display: "block", margin: "0 auto" }}>
      <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_HIGH)} fill={c.band} />
      <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_LOW)} fill={c.panel} />

      {showQuadrants && [0, 1, 2, 3].map((q) => {
        const a = ((-45 + 90 * q) * Math.PI) / 180;
        return (
          <line key={q}
            x1={CENTER + MAX_R * 0.29 * Math.cos(a)} y1={CENTER + MAX_R * 0.29 * Math.sin(a)}
            x2={CENTER + (MAX_R + 30) * Math.cos(a)} y2={CENTER + (MAX_R + 30) * Math.sin(a)}
            stroke={c.ring} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 7" strokeLinecap="round" />
        );
      })}

      {ARM_ANGLES.map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <line key={deg} x1={CENTER} y1={CENTER}
            x2={CENTER + MAX_R * ARM_SHORT * Math.cos(a)} y2={CENTER + MAX_R * ARM_SHORT * Math.sin(a)}
            stroke={c.accent} strokeWidth={MAX_R * ARM_WIDTH} strokeLinecap="round" />
        );
      })}

      {showArrow && shown.length > 0 && (
        <g>
          <line x1={CENTER} y1={CENTER} x2={CENTER + shaft * ca} y2={CENTER + shaft * sa}
            stroke={c.accent} strokeWidth={MAX_R * ARROW_SHAFT_W} strokeLinecap="round"
            style={{ transition: "all 500ms cubic-bezier(.34,1.1,.64,1)" }} />
          <polygon fill={c.accent} style={{ transition: "all 500ms cubic-bezier(.34,1.1,.64,1)" }}
            points={`${CENTER + tip * ca},${CENTER + tip * sa} ${CENTER + shaft * ca + hw * sa},${CENTER + shaft * sa - hw * ca} ${CENTER + shaft * ca - hw * sa},${CENTER + shaft * sa + hw * ca}`} />
        </g>
      )}

      {spokes.map((sp, i) => {
        const edge = axisPoint(i, n, MAX_R);
        const lp = axisPoint(i, n, MAX_R + 32);
        const anchor = Math.abs(lp.x - CENTER) < 14 ? "middle" : lp.x > CENTER ? "start" : "end";
        const lines = wrapLabel(sp.label);
        return (
          <g key={sp.label + i}>
            <line x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y} stroke={c.accent} strokeOpacity={0.13} />
            <text x={lp.x} y={lp.y - (lines.length - 1) * 7.5} fontSize="13.5" fontWeight="500"
              fill={c.accent} fillOpacity={0.8} textAnchor={anchor} dominantBaseline="middle">
              {lines.map((ln, k) => <tspan key={k} x={lp.x} dy={k === 0 ? 0 : 15}>{ln}</tspan>)}
            </text>
          </g>
        );
      })}

      {[[BAND_LOW, C_GAP_INNER], [BAND_HIGH, C_GAP_OUTER]].map(([pct, gap]) => (
        <path key={pct} d={arcPath(radiusFor(pct), C_GAP_CENTRE + gap / 2, 360 - gap)}
          fill="none" stroke={c.ring} strokeOpacity={0.5}
          strokeWidth={MAX_R * RING_THICKNESS} strokeLinecap="round" />
      ))}

      {series.map((s, si) => {
        const pts = (s.values || []).map((v, i) => (v == null ? null : { ...axisPoint(i, n, radiusFor(v)), v }))
          .filter(Boolean);
        if (!pts.length) return null;
        const opacity = s.opacity != null ? s.opacity : 1;
        return (
          <g key={s.label || si} style={{ opacity }}>
            {join && pts.length > 1 && (
              <path d={smoothPath(pts, !!s.closed)} fill="none" stroke={s.colour || c.accent}
                strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {pts.map((p, k) => {
              const zone = zoneOf(p.v);
              const tone = zone === "beyond" ? c.good : zone === "in" ? c.accent : c.danger;
              return (
                <circle key={k} cx={p.x} cy={p.y} r={s.faded ? 3 : 6}
                  fill={zone === "under" ? c.bg : tone} stroke={tone}
                  strokeWidth={zone === "under" ? 2.5 : 0}
                  style={{ transition: "cx 480ms cubic-bezier(.34,1.1,.64,1), cy 480ms cubic-bezier(.34,1.1,.64,1)" }} />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
