// ============================================================
// T.C.C. kernel: storage
//
// Raw values only. Nothing scored is ever written, so the scoring model can
// change without invalidating anything already logged.
//
// Two keys: the config you set up, and one entry per metric per day.
// Everything persists in the browser and survives closing the app.
// ============================================================

const CONFIG_KEY = "tcc:config:v1";
const ENTRY_KEY = "tcc:entries:v1";

const read = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
};

export const loadConfig = (fallback) => read(CONFIG_KEY, fallback);
export const saveConfig = (config) => write(CONFIG_KEY, config);

// { "2026-08-19": { "sets:chest": 12, "sleep": 7.5 } }
export const loadEntries = () => read(ENTRY_KEY, {});
export const saveEntries = (entries) => write(ENTRY_KEY, entries);

export function setEntry(entries, date, metricId, value) {
  const day = { ...(entries[date] || {}) };
  if (value === "" || value == null) delete day[metricId];
  else day[metricId] = Number(value);
  const next = { ...entries, [date]: day };
  if (!Object.keys(day).length) delete next[date];
  saveEntries(next);
  return next;
}

// ---- dates, local rather than UTC so an evening entry lands on the right day
const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return isoDate(dt);
}

export function daysBack(n, from = today()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(from, -i));
  return out;
}

// A metric reads a window matched to its rhythm, so the chart shows current
// state rather than everything you have ever done.
export const WINDOWS = {
  day: { name: "Today", days: 1 },
  week: { name: "Rolling week", days: 7 },
  month: { name: "Rolling month", days: 30 },
  quarter: { name: "Rolling quarter", days: 90 },
};

// How the days in a window combine into one number.
export const ROLLUPS = {
  sum: { name: "Total", fn: (vals) => vals.reduce((a, b) => a + b, 0) },
  mean: { name: "Average", fn: (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0) },
  latest: { name: "Most recent", fn: (vals) => (vals.length ? vals[vals.length - 1] : 0) },
  max: { name: "Best", fn: (vals) => (vals.length ? Math.max(...vals) : 0) },
};

export function valueFor(entries, metric, endDate = today()) {
  const win = WINDOWS[metric.window] || WINDOWS.week;
  const days = daysBack(win.days, endDate);
  const vals = days.map((d) => entries[d] && entries[d][metric.id]).filter((v) => v != null);
  if (!vals.length) return metric.rollup === "latest" ? null : 0;
  return (ROLLUPS[metric.rollup] || ROLLUPS.sum).fn(vals);
}
