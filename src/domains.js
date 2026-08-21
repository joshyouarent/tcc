// ============================================================
// Domains and metrics
//
// A metric is anything measurable. Each declares its own landmarks, shape,
// window and rollup, so adding one is a data change rather than a code change.
// The library can grow indefinitely; you switch on the few you are focusing on.
// ============================================================

export const DOMAINS = [
  { id: "health", name: "HEALTH", app: "HEALTHIER",
    definition: "Investing in internal capacity",
    measure: "How you feel and what you can achieve by yourself",
    question: "Does this build or restore what my body and mind can do?" },
  { id: "wealth", name: "WEALTH", app: "WEALTHIER",
    definition: "Investing in external capacity",
    measure: "What you have and what you can achieve with others",
    question: "Does this build something outside me, or that I share with someone?" },
  { id: "wisdom", name: "WISDOM", app: "WISER",
    definition: "Alignment with objective reality",
    measure: "Doing what you need to do to sustain the game",
    question: "Does this only stop things getting worse?" },
  { id: "play", name: "PLAY", app: "PLAY",
    definition: "Alignment with subjective reality",
    measure: "Doing what you want to do to enjoy the game",
    question: "Am I doing this because I want to, not because I should?" },
];

// A starter library. Every field is editable and more can be added.
const BASE_LIBRARY = [
  // HEALTH
  { id: "h.sets", domain: "health", name: "Hard sets", unit: "sets",
    shape: "peak", floor: 10, ceiling: 20, falloff: "moderate", window: "week", rollup: "sum", on: true },
  { id: "h.sleep", domain: "health", name: "Sleep", unit: "hours",
    shape: "peak", floor: 6.5, ceiling: 8.5, falloff: "gentle", window: "week", rollup: "mean", on: true },
  { id: "h.steps", domain: "health", name: "Steps", unit: "steps",
    shape: "rising", floor: 6000, ceiling: 12000, window: "week", rollup: "mean", on: true },
  { id: "h.rhr", domain: "health", name: "Resting heart rate", unit: "bpm",
    shape: "falling", floor: 48, ceiling: 62, window: "week", rollup: "mean", on: false },
  { id: "h.protein", domain: "health", name: "Protein", unit: "g",
    shape: "rising", floor: 100, ceiling: 160, window: "week", rollup: "mean", on: false },
  { id: "h.alcohol", domain: "health", name: "Alcohol", unit: "drinks",
    shape: "falling", floor: 0, ceiling: 4, window: "week", rollup: "sum", on: false },

  // WEALTH
  { id: "w.saved", domain: "wealth", name: "Saved", unit: "$",
    shape: "rising", floor: 400, ceiling: 1200, window: "month", rollup: "sum", on: true },
  { id: "w.spend", domain: "wealth", name: "Discretionary spend", unit: "$",
    shape: "falling", floor: 300, ceiling: 900, window: "month", rollup: "sum", on: true },
  { id: "w.deepwork", domain: "wealth", name: "Deep work", unit: "hours",
    shape: "rising", floor: 8, ceiling: 20, window: "week", rollup: "sum", on: true },
  { id: "w.contacts", domain: "wealth", name: "People contacted", unit: "people",
    shape: "rising", floor: 3, ceiling: 10, window: "week", rollup: "sum", on: false },

  // WISDOM
  { id: "s.upkeep", domain: "wisdom", name: "Upkeep tasks cleared", unit: "tasks",
    shape: "rising", floor: 10, ceiling: 25, window: "week", rollup: "sum", on: true },
  { id: "s.reading", domain: "wisdom", name: "Reading", unit: "minutes",
    shape: "rising", floor: 60, ceiling: 210, window: "week", rollup: "sum", on: true },
  { id: "s.backlog", domain: "wisdom", name: "Things left undone", unit: "items",
    shape: "falling", floor: 0, ceiling: 6, window: "day", rollup: "latest", on: true },
  { id: "s.declined", domain: "wisdom", name: "Turned down", unit: "times",
    shape: "rising", floor: 1, ceiling: 4, window: "month", rollup: "sum", on: false },

  // PLAY
  { id: "p.flow", domain: "play", name: "Time in flow", unit: "minutes",
    shape: "rising", floor: 90, ceiling: 300, window: "week", rollup: "sum", on: true },
  { id: "p.made", domain: "play", name: "Made something", unit: "times",
    shape: "rising", floor: 1, ceiling: 4, window: "week", rollup: "sum", on: true },
  { id: "p.screens", domain: "play", name: "Passive screen time", unit: "minutes",
    shape: "falling", floor: 60, ceiling: 180, window: "week", rollup: "mean", on: false },
];

// ============================================================
// HEALTHIER: weekly volume per muscle
//
// From the standalone Healthier app. Spokes are body parts and the dose is
// weekly hard sets. MEV is the floor, MRV the ceiling. The shape is "peak",
// so pushing past MRV turns the dot back toward the centre rather than
// plotting further out: overshooting is not better than getting it right.
//
// Landmarks are starting points, not truths. Every one is editable in Setup,
// because the right dose is the one that works for the person doing it.
// ============================================================

export const MUSCLE_GROUPS = ["Push", "Pull", "Legs", "Accessory"];

// group, then MEV and MRV in hard sets per week.
const MUSCLES = [
  ["Chest",       "Push",      8, 22],
  ["Front delts", "Push",      6, 16],
  ["Side delts",  "Push",      8, 26],
  ["Triceps",     "Push",      6, 24],
  ["Upper back",  "Pull",     10, 25],
  ["Lats",        "Pull",     10, 22],
  ["Rear delts",  "Pull",      6, 24],
  ["Biceps",      "Pull",      8, 26],
  ["Quads",       "Legs",      8, 20],
  ["Hamstrings",  "Legs",      6, 20],
  ["Glutes",      "Legs",      4, 16],
  ["Calves",      "Legs",      8, 20],
  ["Lower back",  "Accessory", 4, 14],
  ["Traps",       "Accessory", 4, 20],
  ["Forearms",    "Accessory", 4, 20],
  ["Abs",         "Accessory", 6, 25],
];

const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, "");

// Off by default. Switch on the few you are actually training, the same as
// every other metric: the library can grow without the chart getting busier.
export const MUSCLE_METRICS = MUSCLES.map(([name, group, mev, mrv]) => ({
  id: `h.sets.${slug(name)}`,
  domain: "health",
  group,
  name,
  unit: "sets",
  shape: "peak",
  floor: mev,
  ceiling: mrv,
  falloff: "moderate",
  window: "week",
  rollup: "sum",
  on: false,
}));

export const LIBRARY = [...BASE_LIBRARY, ...MUSCLE_METRICS];

// ---- keeping saved setups current --------------------------
//
// A saved config is a snapshot of the library at the time it was saved, so
// metrics added later would never appear. Merge on load instead: the library
// supplies anything new, your saved copy wins for anything you have already
// edited or switched on. Nothing you have changed is overwritten, and nothing
// you have logged is affected, because entries are keyed by metric id.

export function mergeLibrary(saved) {
  if (!saved || !Array.isArray(saved.metrics)) return defaultConfig();
  const mine = new Map(saved.metrics.map((m) => [m.id, m]));
  const merged = LIBRARY.map((lib) => {
    const own = mine.get(lib.id);
    // Keep the library's structural fields, keep the person's choices.
    return own ? { ...lib, ...own, group: lib.group } : { ...lib };
  });
  // Anything the person added that is not in the library survives untouched.
  for (const m of saved.metrics) if (!merged.some((x) => x.id === m.id)) merged.push(m);
  return { ...saved, metrics: merged };
}

export const defaultConfig = () => ({
  metrics: LIBRARY.map((m) => ({ ...m })),
});
