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
export const LIBRARY = [
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

export const defaultConfig = () => ({
  metrics: LIBRARY.map((m) => ({ ...m })),
});
