import React, { useState, useMemo } from "react";

// ============================================================
// T.C.C. // Healthier
// Spokes are body parts, the dose is weekly hard sets. Centre is nothing done,
// the inner ring is MEV, the outer ring is MRV. Past MRV the curve turns back
// inward, so overshooting never plots further out than being in the band.
// Only completed sets count toward the dose.
// ============================================================

const SIZE = 800, CENTER = 400, MAX_R = 235, SCALE_MAX = 130;
const BAND_LOW = 60, BAND_HIGH = 90;
// The ideal effective dose sits at the radial midpoint of the band. No line is
// drawn for it; it is a reference point for progress and prescription.
const BAND_MID = (BAND_LOW + BAND_HIGH) / 2;
// Dose response is not linear. Most of the return from added volume arrives
// early in the band and flattens as you approach MRV, so an even radial step
// is not an even step in sets. BAND_CURVE below 1 front-loads the returns:
// at 0.65 the halfway score lands at roughly a third of the way from MEV to MRV.
const BAND_CURVE = 0.65;

// Ring positions taken from The Conditioning Co. icon, measured at 0.538 and
// 0.896 of its radius with matching thickness. The radial scale is anchored to
// those two rings rather than running linearly from the centre, because a
// linear scale would put them at a 60:90 ratio (0.667) and the mark uses 0.601.
const RING_INNER_FRAC = 0.538;
const RING_OUTER_FRAC = 0.896;
const RING_THICKNESS = 0.0335;   // half the icon weight, per request

// The mark is the initials: a T from the blue arms, and two C shapes from the
// grey rings, each broken by a gap centred on 315 degrees where the arrow
// exits. Measured off the icon at 50 and 30 degrees.
const C_GAP_CENTRE = -45;
const C_GAP_INNER = 50;
const C_GAP_OUTER = 30;

// Blue arms, proportions measured off the icon.
const ARM_SHORT = 0.25;        // three stubs, reach
const ARM_WIDTH = 0.026;       // stub thickness
const ARROW_SHAFT_W = 0.12;
const ARROW_HEAD_W = 0.103;
// The shaft length is radiusFor(mean), so crossing a ring keeps its meaning.
// The head adds a fixed length on top. At half the icon's head size a perfect
// average now tips at 1.06R rather than 1.20R, since the shaft cannot stretch
// without breaking what the ring crossings mean.
const ARROW_HEAD_LEN = 0.139;
const ARM_ANGLES = [45, 135, 225];

const GROUPS = [
  { name: "Push", muscles: ["Chest", "Front delts", "Side delts", "Triceps"] },
  { name: "Pull", muscles: ["Upper back", "Lats", "Rear delts", "Biceps"] },
  { name: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Calves"] },
  { name: "Accessory", muscles: ["Lower back", "Traps", "Forearms", "Abs"] },
];
const MAJOR = ["Chest", "Upper back", "Lats", "Quads", "Hamstrings", "Glutes"];

const DEFAULT_LANDMARKS = {
  "Chest": { mev: 8, mrv: 22 }, "Front delts": { mev: 6, mrv: 16 },
  "Side delts": { mev: 8, mrv: 26 }, "Triceps": { mev: 6, mrv: 24 },
  "Upper back": { mev: 10, mrv: 25 }, "Lats": { mev: 10, mrv: 22 },
  "Rear delts": { mev: 6, mrv: 24 }, "Biceps": { mev: 8, mrv: 26 },
  "Quads": { mev: 8, mrv: 20 }, "Hamstrings": { mev: 6, mrv: 20 },
  "Glutes": { mev: 4, mrv: 16 }, "Calves": { mev: 8, mrv: 20 },
  "Lower back": { mev: 4, mrv: 14 }, "Traps": { mev: 4, mrv: 20 },
  "Forearms": { mev: 4, mrv: 20 }, "Abs": { mev: 6, mrv: 25 },
};
const MUSCLE_ORDER = Object.keys(DEFAULT_LANDMARKS);

// Centre is nothing done, outer edge is the ceiling. More is further out.
function radiusFor(v) {
  const x = Math.max(0, Math.min(Number(v) || 0, SCALE_MAX));
  let f;
  if (x <= BAND_LOW) f = (x / BAND_LOW) * RING_INNER_FRAC;
  else if (x <= BAND_HIGH) f = RING_INNER_FRAC + ((x - BAND_LOW) / (BAND_HIGH - BAND_LOW)) * (RING_OUTER_FRAC - RING_INNER_FRAC);
  else f = RING_OUTER_FRAC + ((x - BAND_HIGH) / (SCALE_MAX - BAND_HIGH)) * (1 - RING_OUTER_FRAC);
  return MAX_R * f;
}
// An arc drawn clockwise from a start angle, used to break each ring into a C.
function arcPath(r, fromDeg, sweepDeg) {
  const a0 = (fromDeg * Math.PI) / 180;
  const a1 = ((fromDeg + sweepDeg) * Math.PI) / 180;
  const x0 = CENTER + r * Math.cos(a0), y0 = CENTER + r * Math.sin(a0);
  const x1 = CENTER + r * Math.cos(a1), y1 = CENTER + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

// Spokes are laid out per chart, so a session chart with four spokes and the
// full chart with sixteen both keep their quadrants aligned.
function axisPoint(i, total, r) {
  const step = (Math.PI * 2) / total;
  const offset = ((45 * Math.PI) / 180) + step / 2;
  const a = step * i - Math.PI / 2 + offset;
  return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) };
}

const EQUIPMENT = [
  { id: "bodyweight", name: "Bodyweight",
    what: "Just you and the floor. Enough room to lie down, kneel and press." },
  { id: "chair", name: "Chair / ledge",
    what: "Any stable surface around knee height you could squat down to, prop your feet on, or dip off. A dining chair, a low wall, a park bench, a bed frame." },
  { id: "flat_bench", name: "Flat bench",
    what: "A stable padded bench you can lie flat on or sit on, and that takes your full weight." },
  { id: "incline_bench", name: "Incline bench",
    what: "A bench that sets to roughly 30 to 45 degrees. Most adjustable benches count, a fixed flat one does not." },
  { id: "barbell", name: "Barbell",
    what: "An olympic or standard bar with loadable plates." },
  { id: "squat_rack", name: "Squat rack",
    what: "A rack or stands you can un-rack a loaded bar from at shoulder height, with safeties." },
  { id: "db_light", name: "Dumbbells 1-10kg",
    what: "A light pair, enough for lateral raises, curls and rear delt work." },
  { id: "db_heavy", name: "Dumbbells 12.5kg+",
    what: "Heavier pairs for pressing, rowing and loaded legs. Selecting this assumes the lighter end of the rack is there too." },
  { id: "kettlebell", name: "Kettlebells",
    what: "At least one bell you can swing, clean and carry." },
  { id: "cable", name: "Cable machine",
    what: "An adjustable pulley stack. This is what makes drop sets quick." },
  { id: "machine", name: "Weights machines",
    what: "Pin-loaded or plate-loaded resistance machines: leg press, pec deck, hamstring curl and the like." },
  { id: "pullup_bar", name: "Pull up bar",
    what: "Anything you can hang from with full extension: a fixed bar, a doorway bar, a playground frame." },
  { id: "dip_station", name: "Dip bars",
    what: "Parallel bars at hip height or above that let you dip with your feet off the ground." },
  { id: "sled", name: "Sled",
    what: "A push or drag sled, or a prowler, with room to run it out. Great for legs with almost no eccentric fatigue." },
  { id: "battle_ropes", name: "Battle ropes",
    what: "Heavy ropes anchored at one end, long enough to make waves from a quarter squat." },
  { id: "cardio", name: "Cardio",
    what: "Access to conditioning machines. Which ones you pick below." },
];

// Locations preselect a sensible kit, which stays editable afterwards.
const LOCATIONS = [
  { id: "outdoor_space", name: "Outdoor open space", kit: ["bodyweight"],
    what: "A park, a beach, a field. Nothing but ground and your own bodyweight." },
  { id: "outdoor_gym", name: "Outdoor gym", kit: ["bodyweight", "chair", "pullup_bar", "dip_station"],
    what: "A calisthenics park or playground: bars, dip stations, benches, no loadable weight." },
  { id: "home_gym", name: "Home gym", kit: ["bodyweight", "chair", "flat_bench", "db_light", "db_heavy", "kettlebell", "pullup_bar"],
    what: "Dumbbells, a bench and a bar at home. No cable stack or machine circuit." },
  { id: "hotel_gym", name: "Hotel gym", kit: ["bodyweight", "chair", "flat_bench", "incline_bench", "db_light", "db_heavy", "machine", "cardio"],
    what: "A small fitness room: a dumbbell rack to about 30kg, a bench, a couple of machines, treadmills." },
  { id: "commercial_gym", name: "Commercial gym",
    kit: ["bodyweight", "chair", "flat_bench", "incline_bench", "barbell", "squat_rack", "db_light", "db_heavy", "kettlebell", "cable", "machine", "pullup_bar", "dip_station", "sled", "battle_ropes", "cardio"],
    what: "A full facility. Everything on the list." },
];

const EQUIP_NAME = {};
EQUIPMENT.forEach((e) => (EQUIP_NAME[e.id] = e.name));

// Every exercise declares the equipment it needs. An empty list means
// bodyweight only. metric drives which columns the set rows show.
const EXERCISES = [
  { name: "Barbell bench press", primary: ["Chest"], secondary: ["Front delts", "Triceps"], equip: ["barbell", "flat_bench"], metric: "load" },
  { name: "Incline barbell press", primary: ["Chest"], secondary: ["Front delts", "Triceps"], equip: ["barbell", "incline_bench"], metric: "load" },
  { name: "Close grip bench press", primary: ["Triceps"], secondary: ["Chest", "Front delts"], equip: ["barbell", "flat_bench"], metric: "load" },
  { name: "Overhead press", primary: ["Front delts"], secondary: ["Triceps", "Side delts"], equip: ["barbell"], metric: "load" },
  { name: "Machine chest press", primary: ["Chest"], secondary: ["Front delts", "Triceps"], equip: ["machine"], metric: "load" },
  { name: "Pec deck", primary: ["Chest"], secondary: [], equip: ["machine"], metric: "load" },
  { name: "Cable fly", primary: ["Chest"], secondary: [], equip: ["cable"], metric: "load" },
  { name: "Cable lateral raise", primary: ["Side delts"], secondary: [], equip: ["cable"], metric: "load" },
  { name: "Tricep pushdown", primary: ["Triceps"], secondary: [], equip: ["cable"], metric: "load" },
  { name: "Incline dumbbell press", primary: ["Chest"], secondary: ["Front delts", "Triceps"], equip: ["db_heavy", "incline_bench"], metric: "load" },
  { name: "Flat dumbbell press", primary: ["Chest"], secondary: ["Front delts", "Triceps"], equip: ["db_heavy", "flat_bench"], metric: "load" },
  { name: "Dumbbell floor press", primary: ["Chest"], secondary: ["Triceps", "Front delts"], equip: ["db_heavy"], metric: "load" },
  { name: "Dumbbell chest fly", primary: ["Chest"], secondary: ["Front delts"], equip: ["db_light", "flat_bench"], metric: "load" },
  { name: "Dumbbell pullover", primary: ["Lats"], secondary: ["Chest", "Triceps"], equip: ["db_heavy", "flat_bench"], hands: 1, metric: "load" },
  { name: "Seated dumbbell press", primary: ["Front delts"], secondary: ["Triceps", "Side delts"], equip: ["db_heavy"], metric: "load" },
  { name: "Arnold press", primary: ["Front delts"], secondary: ["Side delts", "Triceps"], equip: ["db_heavy"], metric: "load" },
  { name: "Dumbbell thruster", primary: ["Front delts"], secondary: ["Quads", "Glutes", "Triceps"], equip: ["db_heavy"], metric: "load" },
  { name: "Dumbbell lateral raise", primary: ["Side delts"], secondary: [], equip: ["db_light"], metric: "load" },
  { name: "Dumbbell front raise", primary: ["Front delts"], secondary: [], equip: ["db_light"], metric: "load" },
  { name: "Dumbbell upright row", primary: ["Side delts"], secondary: ["Traps", "Biceps"], equip: ["db_light"], metric: "load" },
  { name: "Overhead tricep extension", primary: ["Triceps"], secondary: [], equip: ["db_light"], hands: 1, metric: "load" },
  { name: "Dumbbell skullcrusher", primary: ["Triceps"], secondary: [], equip: ["db_light", "flat_bench"], metric: "load" },
  { name: "Tricep kickback", primary: ["Triceps"], secondary: [], equip: ["db_light"], hands: 1, metric: "load" },
  { name: "Kettlebell push press", primary: ["Front delts"], secondary: ["Triceps", "Quads"], equip: ["kettlebell"], hands: 1, metric: "load" },
  { name: "Push up", primary: ["Chest"], secondary: ["Triceps", "Front delts"], equip: ["bodyweight"], metric: "load" },
  { name: "Wide push up", primary: ["Chest"], secondary: ["Front delts"], equip: ["bodyweight"], metric: "load" },
  { name: "Diamond push up", primary: ["Triceps"], secondary: ["Chest", "Front delts"], equip: ["bodyweight"], metric: "load" },
  { name: "Pike push up", primary: ["Front delts"], secondary: ["Triceps", "Side delts"], equip: ["bodyweight"], metric: "load" },
  { name: "Incline push up", primary: ["Chest"], secondary: ["Triceps", "Front delts"], equip: ["chair"], metric: "load" },
  { name: "Decline push up", primary: ["Chest"], secondary: ["Front delts", "Triceps"], equip: ["chair"], metric: "load" },
  { name: "Dips", primary: ["Chest"], secondary: ["Triceps", "Front delts"], equip: ["dip_station"], metric: "load" },
  { name: "Bench dip", primary: ["Triceps"], secondary: ["Chest", "Front delts"], equip: ["chair"], metric: "load" },
  { name: "Barbell row", primary: ["Upper back"], secondary: ["Lats", "Biceps", "Rear delts", "Lower back"], equip: ["barbell"], metric: "load" },
  { name: "T-bar row", primary: ["Upper back"], secondary: ["Lats", "Biceps", "Lower back"], equip: ["barbell"], metric: "load" },
  { name: "Barbell curl", primary: ["Biceps"], secondary: ["Forearms"], equip: ["barbell"], metric: "load" },
  { name: "Shrug", primary: ["Traps"], secondary: ["Forearms"], equip: ["barbell"], metric: "load" },
  { name: "Lat pulldown", primary: ["Lats"], secondary: ["Biceps", "Upper back"], equip: ["cable"], metric: "load" },
  { name: "Seated cable row", primary: ["Upper back"], secondary: ["Lats", "Biceps", "Rear delts"], equip: ["cable"], metric: "load" },
  { name: "Straight arm pulldown", primary: ["Lats"], secondary: [], equip: ["cable"], metric: "load" },
  { name: "Face pull", primary: ["Rear delts"], secondary: ["Upper back", "Traps"], equip: ["cable"], metric: "load" },
  { name: "Cable curl", primary: ["Biceps"], secondary: ["Forearms"], equip: ["cable"], metric: "load" },
  { name: "Chest supported row", primary: ["Upper back"], secondary: ["Lats", "Biceps", "Rear delts"], equip: ["machine"], metric: "load" },
  { name: "Reverse pec deck", primary: ["Rear delts"], secondary: ["Upper back"], equip: ["machine"], metric: "load" },
  { name: "Preacher curl", primary: ["Biceps"], secondary: [], equip: ["flat_bench", "barbell"], metric: "load" },
  { name: "Dumbbell row", primary: ["Upper back"], secondary: ["Lats", "Biceps"], equip: ["db_heavy", "flat_bench"], hands: 1, metric: "load" },
  { name: "Dumbbell shrug", primary: ["Traps"], secondary: ["Forearms"], equip: ["db_heavy"], metric: "load" },
  { name: "Renegade row", primary: ["Upper back"], secondary: ["Lats", "Biceps", "Abs"], equip: ["db_light"], metric: "load" },
  { name: "Dumbbell rear delt fly", primary: ["Rear delts"], secondary: ["Upper back"], equip: ["db_light"], metric: "load" },
  { name: "Dumbbell curl", primary: ["Biceps"], secondary: ["Forearms"], equip: ["db_light"], metric: "load" },
  { name: "Hammer curl", primary: ["Biceps"], secondary: ["Forearms"], equip: ["db_light"], metric: "load" },
  { name: "Concentration curl", primary: ["Biceps"], secondary: [], equip: ["db_light"], hands: 1, metric: "load" },
  { name: "Zottman curl", primary: ["Biceps"], secondary: ["Forearms"], equip: ["db_light"], metric: "load" },
  { name: "Kettlebell row", primary: ["Upper back"], secondary: ["Lats", "Biceps"], equip: ["kettlebell"], hands: 1, metric: "load" },
  { name: "Kettlebell high pull", primary: ["Traps"], secondary: ["Side delts", "Upper back"], equip: ["kettlebell"], hands: 1, metric: "load" },
  { name: "Pull up", primary: ["Lats"], secondary: ["Biceps", "Upper back", "Forearms"], equip: ["pullup_bar"], metric: "load" },
  { name: "Chin up", primary: ["Lats"], secondary: ["Biceps", "Upper back"], equip: ["pullup_bar"], metric: "load" },
  { name: "Inverted row", primary: ["Upper back"], secondary: ["Lats", "Biceps", "Rear delts"], equip: ["pullup_bar"], metric: "load" },
  { name: "Bodyweight bicep curl", primary: ["Biceps"], secondary: ["Upper back", "Forearms"], equip: ["pullup_bar"], metric: "load" },
  { name: "Dead hang", primary: ["Forearms"], secondary: ["Lats", "Traps"], equip: ["pullup_bar"], metric: "time" },
  { name: "Towel grip hang", primary: ["Forearms"], secondary: ["Lats"], equip: ["pullup_bar"], metric: "time" },
  { name: "Doorway row", primary: ["Upper back"], secondary: ["Lats", "Biceps"], equip: ["bodyweight"], metric: "load" },
  { name: "Prone Y raise", primary: ["Rear delts"], secondary: ["Traps", "Upper back"], equip: ["bodyweight"], metric: "load" },
  { name: "Prone T raise", primary: ["Rear delts"], secondary: ["Traps", "Upper back"], equip: ["bodyweight"], metric: "load" },
  { name: "Reverse snow angel", primary: ["Traps"], secondary: ["Rear delts", "Lower back"], equip: ["bodyweight"], metric: "load" },
  { name: "Back squat", primary: ["Quads"], secondary: ["Glutes", "Hamstrings", "Lower back"], equip: ["barbell", "squat_rack"], metric: "load" },
  { name: "Front squat", primary: ["Quads"], secondary: ["Glutes", "Lower back"], equip: ["barbell", "squat_rack"], metric: "load" },
  { name: "Conventional deadlift", primary: ["Hamstrings"], secondary: ["Glutes", "Lower back", "Upper back", "Traps", "Quads"], equip: ["barbell"], metric: "load" },
  { name: "Romanian deadlift", primary: ["Hamstrings"], secondary: ["Glutes", "Lower back"], equip: ["barbell"], metric: "load" },
  { name: "Hip thrust", primary: ["Glutes"], secondary: ["Hamstrings"], equip: ["barbell", "flat_bench"], metric: "load" },
  { name: "Hack squat", primary: ["Quads"], secondary: ["Glutes"], equip: ["machine"], plateLoaded: true, metric: "load" },
  { name: "Leg press", primary: ["Quads"], secondary: ["Glutes", "Hamstrings"], equip: ["machine"], plateLoaded: true, metric: "load" },
  { name: "Leg extension", primary: ["Quads"], secondary: [], equip: ["machine"], metric: "load" },
  { name: "Lying leg curl", primary: ["Hamstrings"], secondary: [], equip: ["machine"], metric: "load" },
  { name: "Seated leg curl", primary: ["Hamstrings"], secondary: [], equip: ["machine"], metric: "load" },
  { name: "Standing calf raise", primary: ["Calves"], secondary: [], equip: ["machine"], metric: "load" },
  { name: "Seated calf raise", primary: ["Calves"], secondary: [], equip: ["machine"], metric: "load" },
  { name: "Goblet squat", primary: ["Quads"], secondary: ["Glutes", "Abs"], equip: ["db_heavy"], hands: 1, metric: "load" },
  { name: "Dumbbell Romanian deadlift", primary: ["Hamstrings"], secondary: ["Glutes", "Lower back"], equip: ["db_heavy"], metric: "load" },
  { name: "Bulgarian split squat", primary: ["Quads"], secondary: ["Glutes", "Hamstrings"], equip: ["db_heavy", "chair"], metric: "load" },
  { name: "Walking lunge", primary: ["Quads"], secondary: ["Glutes", "Hamstrings"], equip: ["db_heavy"], metric: "load" },
  { name: "Step up", primary: ["Quads"], secondary: ["Glutes"], equip: ["db_heavy", "chair"], metric: "load" },
  { name: "Reverse lunge", primary: ["Quads"], secondary: ["Glutes", "Hamstrings"], equip: ["db_light"], metric: "load" },
  { name: "Single leg Romanian deadlift", primary: ["Hamstrings"], secondary: ["Glutes", "Lower back"], equip: ["db_light"], hands: 1, metric: "load" },
  { name: "Dumbbell good morning", primary: ["Hamstrings"], secondary: ["Lower back", "Glutes"], equip: ["db_light"], metric: "load" },
  { name: "Kettlebell swing", primary: ["Glutes"], secondary: ["Hamstrings", "Lower back"], equip: ["kettlebell"], hands: 1, metric: "load" },
  { name: "Kettlebell goblet squat", primary: ["Quads"], secondary: ["Glutes", "Abs"], equip: ["kettlebell"], hands: 1, metric: "load" },
  { name: "Kettlebell Romanian deadlift", primary: ["Hamstrings"], secondary: ["Glutes", "Lower back"], equip: ["kettlebell"], hands: 1, metric: "load" },
  { name: "Bodyweight squat", primary: ["Quads"], secondary: ["Glutes"], equip: ["bodyweight"], metric: "load" },
  { name: "Jump squat", primary: ["Quads"], secondary: ["Glutes", "Calves"], equip: ["bodyweight"], metric: "load" },
  { name: "Wall sit", primary: ["Quads"], secondary: [], equip: ["bodyweight"], metric: "time" },
  { name: "Arabesque", primary: ["Hamstrings"], secondary: ["Glutes", "Lower back"], equip: ["bodyweight"], metric: "load" },
  { name: "Nordic curl", primary: ["Hamstrings"], secondary: ["Glutes"], equip: ["bodyweight"], metric: "load" },
  { name: "Glute bridge", primary: ["Glutes"], secondary: ["Hamstrings"], equip: ["bodyweight"], metric: "load" },
  { name: "Single leg glute bridge", primary: ["Glutes"], secondary: ["Hamstrings"], equip: ["bodyweight"], metric: "load" },
  { name: "Bodyweight calf raise", primary: ["Calves"], secondary: [], equip: ["bodyweight"], metric: "load" },
  { name: "Single leg calf raise", primary: ["Calves"], secondary: [], equip: ["bodyweight"], metric: "load" },
  { name: "Cable crunch", primary: ["Abs"], secondary: [], equip: ["cable"], metric: "load" },
  { name: "Back extension", primary: ["Lower back"], secondary: ["Glutes", "Hamstrings"], equip: ["machine"], metric: "load" },
  { name: "Farmer carry", primary: ["Forearms"], secondary: ["Traps", "Abs"], equip: ["db_heavy"], metric: "time" },
  { name: "Dumbbell wrist curl", primary: ["Forearms"], secondary: [], equip: ["db_light"], metric: "load" },
  { name: "Dumbbell side bend", primary: ["Abs"], secondary: ["Lower back"], equip: ["db_heavy"], hands: 1, metric: "load" },
  { name: "Kettlebell Turkish get up", primary: ["Abs"], secondary: ["Front delts", "Glutes"], equip: ["kettlebell"], hands: 1, metric: "load" },
  { name: "Kettlebell farmer carry", primary: ["Forearms"], secondary: ["Traps", "Abs"], equip: ["kettlebell"], metric: "time" },
  { name: "Hanging leg raise", primary: ["Abs"], secondary: ["Forearms"], equip: ["pullup_bar"], metric: "load" },
  { name: "Russian twist", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "load" },
  { name: "Bicycle ab curl", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "load" },
  { name: "Lying leg raise", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "load" },
  { name: "Hollow hold", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "time" },
  { name: "Plank", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "time" },
  { name: "Side plank", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "time" },
  { name: "Mountain climber", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "load" },
  { name: "Superman", primary: ["Lower back"], secondary: ["Glutes"], equip: ["bodyweight"], metric: "load" },
  { name: "Bird dog", primary: ["Lower back"], secondary: ["Abs", "Glutes"], equip: ["bodyweight"], metric: "load" },
  { name: "Dead bug", primary: ["Abs"], secondary: [], equip: ["bodyweight"], metric: "load" },
  { name: "Sled push", primary: ["Quads"], secondary: ["Glutes", "Calves"], equip: ["sled"], metric: "time" },
  { name: "Sled drag", primary: ["Quads"], secondary: ["Glutes", "Hamstrings"], equip: ["sled"], metric: "time" },
  { name: "Sled row", primary: ["Upper back"], secondary: ["Lats", "Biceps"], equip: ["sled"], metric: "time" },
  { name: "Battle rope waves", primary: ["Front delts"], secondary: ["Abs", "Forearms"], equip: ["battle_ropes"], metric: "time" },
  { name: "Battle rope slams", primary: ["Abs"], secondary: ["Lats", "Front delts"], equip: ["battle_ropes"], metric: "time" },
  { name: "Battle rope alternating waves", primary: ["Side delts"], secondary: ["Abs", "Forearms"], equip: ["battle_ropes"], metric: "time" },
];

// Coaching cues, one set per exercise. Start position, the cue that actually
// changes the outcome for that specific movement, and the finish position.
const CUES = {
  "Barbell bench press": ["Shoulder blades pinned down and back, feet driving into the floor, bar over the lower chest.", "Break the bar apart as you press; keep the elbows around 45 degrees, not flared to 90.", "Bar locked over the shoulder joint, ribs still down, blades still retracted."],
  "Incline barbell press": ["Bench at 30 degrees, bar over the collarbone, blades set into the pad.", "Touch high, just below the collarbone, or the upper chest never takes the load.", "Bar over the eyes at lockout, without the shoulders rolling forward."],
  "Close grip bench press": ["Hands just inside shoulder width, elbows tucked close to the ribs.", "Keep the wrists stacked over the elbows so the triceps hold the load, not the shoulders.", "Full elbow lockout with the bar over the lower sternum."],
  "Overhead press": ["Bar on the front delts, ribs down, glutes squeezed, elbows just in front of the bar.", "Pull the head back out of the way, then push it back through as the bar clears.", "Bar over the mid foot with the biceps beside the ears."],
  "Machine chest press": ["Seat set so the handles sit at lower chest height, back flat to the pad.", "Let the handles travel until you feel a stretch, do not stop short at the frame.", "Arms extended without the shoulders lifting off the pad."],
  "Pec deck": ["Elbows at chest height, slight bend held constant, back pinned to the pad.", "Think about squeezing your elbows together rather than your hands.", "Handles almost touching, chest tall, elbows still at chest height."],
  "Cable fly": ["Split stance, slight forward lean, arms wide with a soft elbow.", "Lead with the elbows and finish with the hands crossing slightly past each other.", "Hands together in front of the sternum, chest hollowed forward."],
  "Cable lateral raise": ["Cable behind you at the low pulley, arm across the body, torso still.", "Lead with the elbow and stop at shoulder height, thumb no higher than the little finger.", "Arm out to the side at shoulder level, traps quiet."],
  "Tricep pushdown": ["Elbows pinned to the ribs, forearms just above parallel, torso upright.", "Only the forearm moves; if the elbows drift forward the lats have taken over.", "Arms straight, a hard squeeze, elbows still glued to the sides."],
  "Incline dumbbell press": ["Bench at 30 degrees, dumbbells at the outer chest, wrists stacked over elbows.", "Press slightly inward so the bells finish closer together than they started.", "Bells over the upper chest, arms long, shoulders still down in the pad."],
  "Flat dumbbell press": ["Blades pinned, bells at the outer chest, elbows about 45 degrees from the ribs.", "Control the descent until you feel the chest stretch, do not bounce off the bottom.", "Bells over the shoulder joint, chest proud, blades still back."],
  "Dumbbell floor press": ["Lying on the floor, knees bent, upper arms resting lightly on the ground.", "Pause where the triceps touch the floor rather than bouncing, it kills the stretch reflex.", "Arms locked over the chest, lower back still flat."],
  "Dumbbell chest fly": ["Flat on the bench, arms wide, elbows softly bent and held there.", "Keep the elbow angle fixed the whole way, the moment it opens it becomes a press.", "Bells above the chest, not touching, tension still on the pecs."],
  "Dumbbell pullover": ["Lying across or along the bench, bell held over the chest, ribs down.", "Reach back with straight-ish arms and let the ribcage expand, do not arch the lower back.", "Bell back over the chest with the lats still loaded."],
  "Seated dumbbell press": ["Bells at ear height, palms forward, back against the pad, ribs down.", "Keep the bells stacked over the elbows the whole way, do not let them drift behind the head.", "Arms locked overhead, biceps near the ears, ribs still down."],
  "Arnold press": ["Bells at chest height, palms facing you, elbows in front of the ribs.", "Rotate as you press, finishing palms forward, so the front delt works through the turn.", "Arms overhead, palms facing forward, shoulders down away from the ears."],
  "Dumbbell thruster": ["Bells racked on the shoulders, feet hip width, chest tall in a front squat.", "Drive the legs and press in one continuous movement, no pause at the top of the squat.", "Standing tall with the bells locked overhead."],
  "Dumbbell lateral raise": ["Bells at the sides, slight forward lean, small bend in the elbow.", "Lead with the elbows and imagine pouring a jug slightly at the top.", "Arms at shoulder height, no higher, traps relaxed."],
  "Dumbbell front raise": ["Bells in front of the thighs, palms facing you, ribs down.", "Stop at eye level and resist the swing on the way down, no hip drive.", "Arms straight out in front at eye height."],
  "Dumbbell upright row": ["Bells in front of the thighs, hands about shoulder width.", "Lead with the elbows and stay below shoulder height to keep the shoulder happy.", "Elbows level with the shoulders, bells near the lower ribs."],
  "Overhead tricep extension": ["Bell held overhead in both hands, elbows close to the ears, ribs down.", "Keep the elbows pointing forward, they will want to flare out and shorten the range.", "Arms locked overhead, ribs still down, no lower back arch."],
  "Dumbbell skullcrusher": ["Lying flat, arms vertical, bells above the forehead.", "Let the bells travel past the ears for the long head, not just to the forehead.", "Arms vertical again with the elbows fully locked."],
  "Tricep kickback": ["Torso near parallel to the floor, upper arm pinned alongside the ribs.", "Hold the upper arm still and rotate the palm up at lockout for a harder contraction.", "Arm straight behind you, in line with the torso."],
  "Kettlebell push press": ["Bell racked in the front of the shoulder, elbow tucked, feet hip width.", "Use a short dip and drive from the legs, then finish the last third with the shoulder.", "Bell locked overhead, wrist neutral, ribs down."],
  "Push up": ["Hands under the shoulders, body one line from head to heels, ribs down.", "Push the floor away at the top and let the shoulder blades spread, most people skip this.", "Arms locked, hips still level with the shoulders."],
  "Wide push up": ["Hands about one and a half shoulder widths apart, body in one line.", "Keep elbows at 45 degrees rather than flared straight out to protect the shoulder.", "Arms locked with the chest still leading the movement."],
  "Diamond push up": ["Hands together under the sternum, index fingers and thumbs touching.", "Keep the elbows brushing the ribs, the moment they flare the chest takes over.", "Arms locked with the sternum directly over the hands."],
  "Pike push up": ["Hips high, body in an inverted V, hands slightly wider than shoulders.", "Aim the crown of your head just in front of your hands, not between them.", "Arms locked with the hips still stacked high."],
  "Incline push up": ["Hands on a chair or ledge, body in one line, feet on the floor.", "The higher the hands, the easier it gets, so drop the surface as you get stronger.", "Arms locked, hips level, chest away from the surface."],
  "Decline push up": ["Feet elevated on a chair or ledge, hands under the shoulders.", "Keep the ribs pulled down, the higher the feet the more the lower back wants to sag.", "Arms locked with the body still in one line."],
  "Dips": ["Arms locked on the bars, chest slightly forward, legs tucked or straight.", "Lean the torso forward about 30 degrees to shift the work onto the chest.", "Elbows locked with the shoulders down, not shrugged up by the ears."],
  "Bench dip": ["Hands on the edge behind you, fingers forward, hips just off the surface.", "Keep the hips close to the surface, drifting forward turns it into a shoulder stretch.", "Arms locked with the shoulders pulled down and back."],
  "Barbell row": ["Hips hinged to about 45 degrees, bar hanging at the shins, back flat.", "Pull to the belly button, not the sternum, and keep the torso angle fixed the whole set.", "Bar at the lower ribs with the shoulder blades squeezed together."],
  "T-bar row": ["Chest over the bar, knees soft, back flat, arms long.", "Drive the elbows past the ribs and hold the top for a beat.", "Handle at the lower chest, blades pulled together."],
  "Barbell curl": ["Bar at arms length, elbows at the sides, shoulders back.", "Keep the elbows still, if they travel forward the front delt is doing the work.", "Bar at chest height with the wrists neutral, not curled in."],
  "Shrug": ["Bar at arms length in front of the thighs, chest tall.", "Shrug straight up toward the ears, no rolling, and pause at the top.", "Shoulders as high as they will go with the arms still straight."],
  "Lat pulldown": ["Thighs locked under the pad, arms long overhead, slight backward lean.", "Start by pulling the shoulder blades down, then bend the elbows.", "Bar at the collarbone, chest lifted to meet it, elbows beside the ribs."],
  "Seated cable row": ["Chest tall, knees soft, arms long, torso vertical.", "Let the shoulder blades travel forward at the stretch, then pull the elbows past the ribs.", "Handle at the belly button, blades squeezed, torso still upright."],
  "Straight arm pulldown": ["Bar at chest height, arms straight, hips hinged slightly.", "Fix the elbow angle and think about pushing the bar down and back through the thighs.", "Bar at the thighs with the lats fully shortened."],
  "Face pull": ["Rope at eye height, arms long, thumbs pointing back.", "Pull the rope apart toward your forehead and finish with the knuckles beside the ears.", "Hands beside the head, elbows high, rear delts squeezed."],
  "Cable curl": ["Standing tall, cable at the low pulley, elbows at the sides.", "Step back slightly so tension stays on the biceps at the bottom of the rep.", "Handle at chest height with the elbows still pinned."],
  "Chest supported row": ["Chest on the pad, arms hanging long, feet planted.", "Let the pad take the torso so you cannot cheat with the lower back.", "Elbows past the ribs, blades squeezed, chest still on the pad."],
  "Reverse pec deck": ["Chest on the pad, arms at shoulder height, slight elbow bend.", "Lead with the elbows and think about opening the chest, not pulling with the hands.", "Arms out wide in line with the shoulders."],
  "Preacher curl": ["Armpits over the top of the pad, arms long, chest against the bench.", "Do not fully lock out at the bottom under heavy load, it strains the elbow.", "Bar at the top with the biceps fully shortened."],
  "Dumbbell row": ["One hand and knee on the bench, back flat, bell hanging long.", "Row to the hip rather than the shoulder and avoid twisting the torso to gain range.", "Bell at the hip, elbow past the ribs, torso square."],
  "Dumbbell shrug": ["Bells at the sides, arms long, chest tall.", "Shrug straight up and hold for a full second at the top.", "Shoulders high toward the ears, arms still straight."],
  "Renegade row": ["Top of a push up on the bells, feet wide, hips square to the floor.", "Push hard through the non-rowing hand to stop the hips rotating.", "Bell at the hip with the hips still level."],
  "Dumbbell rear delt fly": ["Hinged forward to near parallel, bells hanging, soft elbows.", "Think about the elbows sweeping out and back, not the hands lifting.", "Arms out in line with the shoulders, thumbs down."],
  "Dumbbell curl": ["Bells at the sides, palms forward, elbows pinned.", "Curl one at a time if you tend to swing, and keep the shoulder still.", "Bell at shoulder height with the elbow beneath it."],
  "Hammer curl": ["Bells at the sides, palms facing in, elbows at the ribs.", "Keep the neutral grip the whole way, the brachialis is the target here.", "Bell at shoulder height, thumb up, elbow still."],
  "Concentration curl": ["Seated, elbow braced on the inner thigh, bell hanging long.", "Let the elbow act as a hinge only, and supinate hard at the top.", "Bell at the shoulder with the biceps fully squeezed."],
  "Zottman curl": ["Bells at the sides, palms forward, elbows pinned.", "Curl palms up, rotate at the top, lower palms down slowly, that eccentric is the point.", "Back at the start with palms facing forward again."],
  "Kettlebell row": ["Hinged forward, bell hanging between the feet, back flat.", "Pull the bell to the hip and drive the elbow behind the ribs.", "Bell at the hip, blade retracted, torso still."],
  "Kettlebell high pull": ["Bell between the feet, hips hinged, back flat.", "Drive with the hips first, the arm just guides the bell up.", "Bell at chest height with the elbow above the wrist."],
  "Pull up": ["Hanging at full extension, hands just outside shoulder width, ribs down.", "Start by pulling the shoulders down away from the ears before the arms bend.", "Chin clearly over the bar, chest toward it, elbows beside the ribs."],
  "Chin up": ["Hanging at full extension, palms facing you, shoulder width.", "Drive the elbows down into your pockets rather than thinking about pulling up.", "Chin over the bar with the chest close to your hands."],
  "Inverted row": ["Under a bar, body in one line, arms long, heels on the floor.", "Keep the hips up in line with the shoulders, they will want to sag as you fatigue.", "Chest to the bar with the blades squeezed and hips still level."],
  "Bodyweight bicep curl": ["Under a low bar, underhand grip, body at an angle, arms long.", "Keep the upper arms fixed in space and curl your body up to your hands.", "Forehead near the bar with the elbows still high and still."],
  "Dead hang": ["Hanging from the bar, arms straight, shoulders relaxed up by the ears.", "Grip the bar hard rather than hanging passively, that is what trains the forearms.", "Still hanging with a full grip, controlled dismount."],
  "Towel grip hang": ["Two towels over the bar, one in each hand, arms long.", "Crush the towel, the thickness is the whole stimulus here.", "Still hanging with the towels held, feet down under control."],
  "Doorway row": ["Hands gripping a doorframe, feet close to it, body leaning back, arms long.", "Walk the feet closer to the frame to make it harder, further away to make it easier.", "Chest near the frame with the blades pulled together."],
  "Prone Y raise": ["Face down, arms overhead in a Y, thumbs up, forehead down.", "Lift from the shoulder blades, not the hands, and keep the neck long.", "Arms off the floor in the Y with the traps and rear delts holding."],
  "Prone T raise": ["Face down, arms straight out to the sides in a T, thumbs up.", "Squeeze the shoulder blades together first, then lift the arms.", "Arms off the floor level with the shoulders."],
  "Reverse snow angel": ["Face down, arms by the sides, palms down, forehead resting.", "Keep the hands hovering off the floor the entire sweep, that is the hard part.", "Arms overhead having travelled the full arc without touching down."],
  "Back squat": ["Bar on the upper back, feet shoulder width, toes slightly out, ribs down.", "Push the knees out over the toes as you descend and keep the whole foot loaded.", "Standing tall, hips and knees locked, ribs still down."],
  "Front squat": ["Bar on the front delts, elbows high, chest tall, feet shoulder width.", "Keep the elbows up, the second they drop the bar rolls and the torso folds.", "Standing tall with the elbows still high and the bar secure."],
  "Conventional deadlift": ["Bar over mid foot, shins near the bar, hips higher than knees, flat back.", "Take the slack out of the bar before you pull, no jerking off the floor.", "Standing tall, hips locked, shoulders back, bar against the thighs."],
  "Romanian deadlift": ["Standing tall, bar at the thighs, soft knees, chest up.", "Push the hips backward rather than bending down, and stop when the hamstrings run out.", "Standing tall with the glutes squeezed, bar against the thighs."],
  "Hip thrust": ["Upper back on the bench, bar over the hips, feet flat, shins vertical at the top.", "Tuck the ribs down and finish with the hips, not by arching the lower back.", "Hips fully extended, body flat from knee to shoulder, chin tucked."],
  "Hack squat": ["Back and hips flat to the pad, feet mid platform, shoulders under the pads.", "Keep the heels down through the whole descent, lifting them shifts it to the knees.", "Legs extended without snapping the knees into lockout."],
  "Leg press": ["Feet mid platform, hips flat to the seat, knees tracking over the toes.", "Stop the descent before the lower back rounds off the pad.", "Legs nearly straight with the knees soft, hips still down."],
  "Leg extension": ["Back to the pad, knee joint in line with the machine pivot, shins under the roller.", "Pause and squeeze at the top for a beat rather than swinging through.", "Legs straight, quads fully contracted, hips still on the seat."],
  "Lying leg curl": ["Face down, hips flat, roller just above the heels, knees off the pad edge.", "Keep the hips pinned to the pad, lifting them is the most common cheat here.", "Heels near the glutes with the hips still flat."],
  "Seated leg curl": ["Seated, thigh pad low and firm, knees at the pivot, legs extended.", "Point the toes toward the shins to keep the calves out of it.", "Heels tucked under the seat with the hips still back."],
  "Standing calf raise": ["Balls of the feet on the platform, heels hanging, legs straight.", "Pause at the bottom stretch for a beat, calves respond to that lengthened position.", "Up as high as the ankle allows, knees still straight."],
  "Seated calf raise": ["Seated, pad on the lower thighs, balls of the feet on the platform.", "The bent knee targets the soleus, so slow it down and hold the top.", "Heels raised as high as possible with the pad still on the thighs."],
  "Goblet squat": ["Bell held at the chest, elbows in, feet shoulder width, chest tall.", "Let the elbows track inside the knees at the bottom to keep the torso upright.", "Standing tall with the bell still tight to the chest."],
  "Dumbbell Romanian deadlift": ["Bells at the thighs, soft knees, chest tall, blades set.", "Keep the bells brushing the legs the whole way, they drift forward as you tire.", "Standing tall with the glutes squeezed and the bells at the thighs."],
  "Bulgarian split squat": ["Rear foot on a chair or bench, front foot far enough forward, torso tall.", "Put the weight through the front heel, if the front knee runs way past the toes step further out.", "Front leg straight, hips level, torso still upright."],
  "Walking lunge": ["Standing tall with bells at the sides, core braced.", "Step long enough that the front shin stays near vertical at the bottom.", "Standing tall on the front leg with the rear foot stepped through."],
  "Step up": ["One foot flat on a chair or box at about knee height, bells at the sides.", "Drive through the top foot and resist pushing off the bottom leg.", "Standing tall on the box, hips level, no rear leg swing."],
  "Reverse lunge": ["Standing tall, bells at the sides, feet hip width.", "Step back rather than forward to keep the load off the front knee.", "Standing tall with the feet back together."],
  "Single leg Romanian deadlift": ["Standing on one leg, soft knee, bell in the opposite hand.", "Let the free leg travel back as a counterweight and keep the hips square to the floor.", "Standing tall on one leg with the hip fully extended."],
  "Dumbbell good morning": ["Bells on the shoulders or at the chest, soft knees, chest tall.", "Hinge the hips back and keep the spine in one line, this is not a squat.", "Standing tall with the hips locked out."],
  "Kettlebell swing": ["Bell a foot in front, hips hinged, back flat, shoulders over the bell.", "Snap the hips forward, the arms are just ropes, do not lift with the shoulders.", "Standing tall, bell floating at chest height, glutes hard."],
  "Kettlebell goblet squat": ["Bell at the chest by the horns, feet shoulder width, chest tall.", "Sit straight down between the feet rather than back, the bell counterweights you.", "Standing tall with the bell still at the chest."],
  "Kettlebell Romanian deadlift": ["Bell in both hands at the thighs, soft knees, chest tall.", "Keep the bell close to the legs, letting it drift loads the lower back.", "Standing tall with the glutes squeezed."],
  "Bodyweight squat": ["Feet shoulder width, toes slightly out, arms forward for balance.", "Sit down between your feet and keep the heels planted the whole time.", "Standing tall with the hips and knees locked."],
  "Jump squat": ["Feet shoulder width, quarter squat, arms back ready to swing.", "Land quietly through the whole foot and absorb into the next rep.", "Landed in a soft quarter squat, ready to go again."],
  "Wall sit": ["Back flat on the wall, thighs parallel to the floor, knees over the ankles.", "Push the whole back into the wall and keep the weight in the heels.", "Still holding the position without the hips creeping up the wall."],
  "Arabesque": ["Standing on one leg, soft knee, hands at the chest or reaching forward.", "Keep the hips square, the lifted hip will want to open toward the ceiling.", "Torso and rear leg near parallel to the floor in one line."],
  "Nordic curl": ["Kneeling with the ankles anchored, torso upright, hips extended.", "Lower as slowly as you can control and keep the hips straight, no folding at the waist.", "Chest near the floor, or caught on the hands, hips still extended."],
  "Glute bridge": ["On your back, knees bent, feet flat close to the glutes, arms at the sides.", "Tuck the ribs down and push through the heels, not the toes.", "Hips level with the knees and shoulders, glutes squeezed hard."],
  "Single leg glute bridge": ["On your back, one foot flat, the other knee pulled to the chest.", "Keep the hips level, the free side will want to drop as you fatigue.", "Hips fully extended and square, weight through one heel."],
  "Bodyweight calf raise": ["Standing tall, feet hip width, weight on the balls of the feet.", "Pause at the bottom to load the stretch instead of bouncing.", "Up on the toes as high as possible, ankles stacked."],
  "Single leg calf raise": ["Standing on one foot, hand on a wall for balance only.", "Use the hand for balance, not for lifting, and control the way down.", "Fully up on the toes of one foot."],
  "Cable crunch": ["Kneeling under the rope, hands at the ears, hips fixed.", "Curl the ribs toward the pelvis, the hips must not hinge or it becomes a hip flexor drill.", "Elbows toward the thighs with the spine flexed, hips still in place."],
  "Back extension": ["Hips on the pad, ankles secure, torso hanging down, spine neutral.", "Finish in a straight line, do not hyperextend past it.", "Body in one straight line from head to heels."],
  "Farmer carry": ["Bells at the sides, chest tall, shoulders down and back.", "Walk with quiet, short steps and refuse to let the shoulders round forward.", "Finished the distance with the posture unchanged."],
  "Dumbbell wrist curl": ["Forearms resting on the thighs, wrists past the knees, palms up.", "Let the bell roll to the fingertips at the bottom for full range.", "Wrists fully curled up with the forearms still on the thighs."],
  "Dumbbell side bend": ["One bell at the side, feet hip width, chest tall.", "Only bend sideways, no twisting, and do not use a bell on both sides at once.", "Back upright with the obliques squeezed."],
  "Kettlebell Turkish get up": ["On your back, bell locked overhead, same side knee bent, other arm out at 45.", "Keep your eyes on the bell for the whole ascent and descent.", "Standing tall with the bell still locked directly overhead."],
  "Kettlebell farmer carry": ["Bells at the sides, chest tall, shoulders packed down.", "Brace the ribs down so you do not lean away from the load.", "Finished the distance standing tall with the grip intact."],
  "Hanging leg raise": ["Hanging at full extension, legs straight, shoulders packed down.", "Tilt the pelvis under first, otherwise the hip flexors do all of it.", "Legs at or above hip height with the pelvis tucked, minimal swing."],
  "Russian twist": ["Seated, torso leaning back to about 45 degrees, feet up or down.", "Rotate from the ribcage and let the eyes follow the hands.", "Torso rotated fully to one side with the back still at 45 degrees."],
  "Bicycle ab curl": ["On your back, hands light at the ears, shoulders off the floor, legs up.", "Rotate the shoulder toward the knee, not the elbow, and keep the lower back down.", "Opposite elbow and knee near each other with the shoulders still off the floor."],
  "Lying leg raise": ["Flat on your back, hands under the hips, legs straight.", "Press the lower back into the floor and stop lowering before it lifts.", "Legs vertical with the lower back still flat."],
  "Hollow hold": ["On your back, lower back pressed flat, arms and legs extended.", "Raise the arms and legs until you find the point where the back stays flat, and hold there.", "Still holding with the lower back glued to the floor."],
  "Plank": ["Elbows under the shoulders, body one line, ribs down, glutes on.", "Push the floor away and tuck the pelvis, sagging hips make it a lower back hold.", "Still one straight line from head to heels."],
  "Side plank": ["Elbow under the shoulder, feet stacked, hips lifted, body in one line.", "Push the bottom shoulder down away from the ear and keep the hips stacked.", "Hips still high with the body in one line from head to feet."],
  "Mountain climber": ["Top of a push up, hands under the shoulders, hips level.", "Keep the hips low and still, the legs move underneath a stable torso.", "Back in the plank with the hips level and shoulders stacked."],
  "Superman": ["Face down, arms overhead, legs straight, forehead resting.", "Lift arms and legs together and think long rather than high.", "Arms and legs off the floor with the neck long and relaxed."],
  "Bird dog": ["On hands and knees, spine neutral, hips and shoulders square.", "Reach long in both directions and do not let the hips tilt.", "Opposite arm and leg straight and level with the torso."],
  "Dead bug": ["On your back, arms up, knees at 90, lower back pressed flat.", "Move slowly and stop the moment the lower back lifts off the floor.", "Opposite arm and leg extended with the lower back still flat."],
  "Sled push": ["Low handles, arms long, body at a forward angle, feet behind the hips.", "Keep the arms locked and drive through long, powerful steps rather than short choppy ones.", "Finished the distance with the torso angle held."],
  "Sled drag": ["Facing away from the sled, strap at the hips or handles in hand, body leaning forward.", "Lean into the strap and stay low, standing upright kills the leg drive.", "Finished the distance with the hips still low."],
  "Sled row": ["Facing the sled, straps in hand, arms long, hips back, chest tall.", "Row the elbows past the ribs then step back to take up the slack.", "Handles at the ribs with the blades squeezed."],
  "Battle rope waves": ["Feet hip width, quarter squat, a rope end in each hand, arms long.", "Drive from the hips and keep the waves reaching all the way to the anchor.", "Still in the quarter squat with the ropes moving under control."],
  "Battle rope slams": ["Ropes overhead, tall stance, core braced.", "Slam with the whole torso and catch the rebound rather than lifting with the arms only.", "Hips hinged with the ropes at the floor."],
  "Battle rope alternating waves": ["Quarter squat, ropes at the hips, one hand slightly higher.", "Keep the shoulders level and let the arms alternate independently.", "Still braced with alternating waves reaching the anchor."],
  "Run": ["Standing tall, eyes forward, shoulders relaxed.", "Land under your hips rather than reaching out in front, and keep the cadence quick.", "Finished the effort still upright, breathing under control."],
  "Treadmill": ["Standing on the belt, upright posture, hands off the rails.", "Let go of the handles, holding on changes the mechanics and inflates the numbers.", "Effort complete, walk it down rather than jumping straight off."],
  "Curved treadmill": ["Standing on the front of the curve, upright, hands free.", "Move higher up the curve to speed up, drift back to slow down.", "Slowed to the back of the belt and stepped off under control."],
  "Row machine": ["Straps snug, shins vertical, arms long, shoulders in front of the hips.", "Legs, then hips, then arms on the drive, and exactly the reverse on the recovery.", "Handle at the lower ribs, legs flat, torso leaning slightly back."],
  "Assault bike": ["Seated with a slight knee bend at full extension, hands on the handles.", "Drive and pull the handles rather than just pushing the legs, the arms are half the machine.", "Effort complete, keep the legs spinning easily to clear the lactate."],
  "Cross trainer": ["Standing tall on the pedals, hands on the moving handles.", "Push through the whole foot and avoid leaning your weight into the handles.", "Effort complete, slowing gradually rather than stopping dead."],
  "Exercise bike": ["Seat height so the knee is slightly bent at the bottom, hands on the bars.", "Set the saddle so the knee stays soft at full extension, too low kills the power.", "Effort complete, spinning easy to cool down."],
  "Ski machine": ["Standing tall, handles overhead, arms long, slight knee bend.", "Drive down with the trunk and hips first, the arms finish the stroke.", "Handles at the hips, hips hinged, ready to stand back up."],
  "Arm bike": ["Seated square to the machine, chest tall, shoulders down.", "Keep the torso still and let the shoulders do the work, no rocking.", "Effort complete with the posture unchanged."],
};
const CUE_LABELS = ["Start position", "Key cue", "Finish position"];

// ---- Profile ----
const SEXES = ["Female", "Male", "Intersex", "Prefer not to say"];
const EXPERIENCE = [
  { id: "new", name: "New to lifting", what: "Under six months of consistent training." },
  { id: "developing", name: "Developing", what: "Six months to two years, technique is settling." },
  { id: "experienced", name: "Experienced", what: "Two to five years, you know your lifts." },
  { id: "advanced", name: "Advanced", what: "Five years plus, progress comes slowly and deliberately." },
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const INJURY_SITES = ["Neck", "Shoulder", "Elbow", "Wrist or hand", "Lower back",
  "Hip or groin", "Knee", "Ankle or foot"];
const CONDITIONS = ["High blood pressure", "Heart condition", "Diabetes", "Asthma",
  "Pregnant or postpartum", "Osteoporosis or low bone density", "Joint or autoimmune condition"];

const GOALS = {
  STRONGER: { name: "Stronger", what: "Move more weight. Progress is measured in load, not size or wind." },
  BIGGER:   { name: "Bigger", what: "Add muscle. Volume and progressive tension are the levers." },
  FITTER:   { name: "Fitter", what: "Work harder for longer and recover faster between efforts." },
  HEALTHIER:{ name: "Healthier", what: "Move the markers a doctor cares about, and feel better day to day." },
  FASTER:   { name: "Faster", what: "Produce force quickly. Sprint, change direction, hold a pace." },
  LEANER:   { name: "Leaner", what: "Change body composition. Less fat mass, muscle held onto." },
};
// Several ways to measure each goal. The point is picking the one that means
// something to you, not tracking all of them.
const MEASURES = {
  STRONGER: ["Estimated 1RM on a main lift", "Reps at a fixed load", "Total tonnage per session",
    "Load at a given RIR", "Grip strength"],
  BIGGER: ["Body mass", "Arm girth", "Chest girth", "Thigh girth", "Progress photos",
    "Weekly hard sets completed"],
  FITTER: ["Resting heart rate", "Heart rate recovery after one minute", "Distance in a fixed time",
    "Time for a benchmark session", "Sessions completed per week"],
  HEALTHIER: ["Blood pressure", "Resting heart rate", "Sleep hours", "Daily steps",
    "Bloodwork markers", "How you feel out of ten"],
  FASTER: ["10m sprint time", "40m sprint time", "5km time", "Peak power on a bike", "Time trial on a set distance"],
  LEANER: ["Body mass", "Waist circumference", "Skinfolds or body fat percent", "Progress photos",
    "How clothes fit"],
};

// ---- Cardio ----
// Each modality is its own selectable option. Outdoor running needs nothing;
// the rest sit behind the Cardio equipment toggle.
const CARDIO_MODES = [
  { id: "run", name: "Run", equip: ["bodyweight"] },
  { id: "treadmill", name: "Treadmill", equip: ["cardio"] },
  { id: "curved", name: "Curved treadmill", equip: ["cardio"] },
  { id: "row", name: "Row machine", equip: ["cardio"] },
  { id: "assault", name: "Assault bike", equip: ["cardio"] },
  { id: "cross", name: "Cross trainer", equip: ["cardio"] },
  { id: "bike", name: "Exercise bike", equip: ["cardio"] },
  { id: "ski", name: "Ski machine", equip: ["cardio"] },
  { id: "armbike", name: "Arm bike", equip: ["cardio"] },
];
CARDIO_MODES.forEach((m) => EXERCISES.push({
  name: m.name, primary: [], secondary: [], equip: m.equip, metric: "cardio", cardioMode: m.id,
}));

// Conditioning formats, offered once a cardio modality is selected.
const CONDITIONING = {
  steady: { name: "Steady state", prescribe: "20 to 45 min continuous",
    note: "One unbroken effort at a pace you could hold a conversation through. Builds the aerobic base without adding much fatigue to your lifting." },
  threshold: { name: "Threshold", prescribe: "2 to 3 x 8 to 12 min, 3 min easy between",
    note: "Held just under the point where breathing breaks down, roughly a pace you could sustain for an hour. Raises the ceiling of what stays comfortable." },
  long_intervals: { name: "Long intervals", prescribe: "4 to 6 x 3 to 4 min hard, equal time easy",
    note: "Hard efforts long enough to sit at near maximum oxygen uptake. The most direct way to lift aerobic power." },
  short_intervals: { name: "Short intervals", prescribe: "10 to 20 x 30s hard, 30s easy",
    note: "Repeated short efforts with incomplete recovery. High stimulus for less total fatigue than long intervals." },
  hiit: { name: "HIIT", prescribe: "8 to 12 x 20s maximal, 10s rest",
    note: "All out efforts against short rest. Very time efficient and very fatiguing, so keep it away from heavy leg days." },
  fartlek: { name: "Fartlek", prescribe: "25 to 40 min, surge 30s to 3 min on feel",
    note: "Unstructured surges through a steady effort, changing pace by feel rather than a clock. Good when you want the work without the maths." },
};

function exerciseAvailable(ex, kit, modes) {
  if (ex.metric === "cardio") {
    if (!modes || modes.indexOf(ex.cardioMode) < 0) return false;
  }
  return available(ex, kit);
}

// A heavy dumbbell rack implies the light end of it is there too.
function hasEquip(kit, id) {
  if (kit.indexOf(id) >= 0) return true;
  // A heavy dumbbell rack implies the light end of it is there too.
  if (id === "db_light" && kit.indexOf("db_heavy") >= 0) return true;
  // Any bench also works as a stable knee-height surface.
  if (id === "chair" && (kit.indexOf("flat_bench") >= 0 || kit.indexOf("incline_bench") >= 0)) return true;
  return false;
}
const available = (ex, kit) => ex.equip.every((e) => hasEquip(kit, e));
const kitLabel = (ex) => (!ex.equip || ex.equip.length === 0 ? "Bodyweight" : ex.equip.map((e) => EQUIP_NAME[e]).join(" + "));

const isCompound = (e) => e.secondary.length >= 2;
const isBodyweight = (ex) => !ex.equip || ex.equip.length === 0
  || (ex.equip.length === 1 && ex.equip[0] === "bodyweight");
const isLoaded = (ex) => !isBodyweight(ex) && ex.metric === "load";

// Load can only be stripped mid-set where the equipment allows it.
function canDropSet(ex, kit) {
  if (ex.equip.indexOf("cable") >= 0 || ex.equip.indexOf("machine") >= 0) return true;
  if (ex.equip.indexOf("db_light") >= 0 || ex.equip.indexOf("db_heavy") >= 0) {
    return hasEquip(kit, "db_light") && hasEquip(kit, "db_heavy");
  }
  return false;
}

// RIR is recorded as a band rather than a single integer. Estimation accuracy
// is high close to failure and falls away past about 3 reps in reserve, so
// asking for a precise 4 vs 5 produces confident numbers that are not true.
// Bands keep the data honest and are still granular enough to drive the model.
const RIR_BANDS = [
  { id: "0-1", name: "0-1", label: "At the edge",
    what: "The last rep was a grind, or you failed. You had a rep left at most.",
    detail: "Estimates here are the most reliable, around 90% accurate in the research.", factor: 1 },
  { id: "2-3", name: "2-3", label: "Hard",
    what: "Bar speed slowed noticeably and form was starting to work for it. A couple left.",
    detail: "Still the productive hypertrophy zone, and still reasonably accurate to judge.", factor: 1 },
  { id: "4-5", name: "4-5", label: "Comfortable",
    what: "You could clearly have kept going. Speed barely changed.",
    detail: "Accuracy drops below about 50% out here, so it counts as a half set.", factor: 0.5 },
  { id: "6+", name: "6+", label: "Easy",
    what: "Warm up territory. A long way from failure.",
    detail: "Too far from failure to drive growth, so it does not count toward your dose.", factor: 0 },
];
// A set is either a warm up, a numbered working set, or a technique set.
// Working numbers are assigned automatically from whatever is left.
// Shown when the room cannot supply the prescribed load and reps were moved to
// hold the RIR. Accurate rather than reassuring: hypertrophy is largely
// preserved, maximum strength is the part that is attenuated.
function loadSwapNote(prescribed, actual, fromReps, toReps) {
  return {
    title: "Reps moved to match the load",
    points: [
      `${prescribed}kg was prescribed. The heaviest available here is ${actual}kg.`,
      `Reps went from ${fromReps} to ${toReps} so the set still finishes at the same reps in reserve.`,
      "Sets taken a similar distance from failure produce similar muscle growth whether the load is heavy or light.",
      "Maximum strength is the part that suffers. Gains in a one rep max favour heavier loads, because handling a heavy bar is part of the skill being trained.",
      { text: "An occasional substitution costs little. If it happens most sessions, the load available is the limit rather than the programming." },
    ],
  };
}

const SET_KINDS = {
  warmup: { code: "W", name: "Warm up",
    what: "Preparing the movement, not driving growth. Counts toward volume only if you took it near failure." },
  failure: { code: "F", name: "To failure",
    what: "Taken until the rep cannot be completed. Prescribes 0-1 RIR, which you can still override." },
  dropset: { code: "D", name: "Drop set",
    what: "Strip 20 to 30% of the load at failure and continue without rest." },
  cluster: { code: "C", name: "Cluster set",
    what: "One set broken into 3 to 5 rep clusters with 15 seconds inside the set." },
  restpause: { code: "RP", name: "Rest-pause",
    what: "Reach failure, rest 15 seconds, go again. Twice." },
};

const RIR_BY_ID = {};
RIR_BANDS.forEach((b) => (RIR_BY_ID[b.id] = b));

// A warm up taken to 4-5 RIR or easier does nothing for the dose. Taken close
// to failure it is a working set in all but name, so it counts.
function setFactor(st) {
  const f = rirFactor(st.rir);
  if (st.kind === "warmup") return f === 1 ? f : 0;
  return f;
}

function rirFactor(rir) {
  if (rir == null || rir === "") return 1;
  if (RIR_BY_ID[rir]) return RIR_BY_ID[rir].factor;
  // tolerate older numeric entries
  const r = Number(rir);
  if (Number.isNaN(r)) return 1;
  if (r <= 3) return 1;
  if (r <= 5) return 0.5;
  return 0;
}
const bandForTarget = (n) => (n <= 1 ? "0-1" : n <= 3 ? "2-3" : n <= 5 ? "4-5" : "6+");

// Only sets ticked as done contribute. Primary full, secondary half.
function volumeByMuscle(entries) {
  const out = {};
  MUSCLE_ORDER.forEach((m) => (out[m] = 0));
  entries.forEach((e) => {
    if (e.metric === "cardio") return;
    const eff = (e.sets || []).reduce((n, s) => n + (s.done ? setFactor(s) : 0), 0);
    if (!eff) return;
    e.primary.forEach((m) => { if (out[m] !== undefined) out[m] += eff; });
    e.secondary.forEach((m) => { if (out[m] !== undefined) out[m] += eff * 0.5; });
  });
  return out;
}

const FALLOFF = { gentle: 2, moderate: 1, steep: 0.5 };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function scoreVolume(sets, mev, mrv, falloff) {
  if (sets <= 0) return 0;
  if (sets < mev) return clamp((sets / mev) * BAND_LOW, 0, BAND_LOW);
  if (sets <= mrv) {
    const frac = (sets - mev) / ((mrv - mev) || 1);
    return BAND_LOW + (BAND_HIGH - BAND_LOW) * Math.pow(frac, BAND_CURVE);
  }
  const width = (mrv - mev) || mrv || 1;
  return clamp(BAND_HIGH - (BAND_HIGH - BAND_LOW) * ((sets - mrv) / (width * (FALLOFF[falloff] || 1))), 0, BAND_HIGH);
}

// Inverse of the band curve: the set count sitting at a given score.
function setsAtScore(score, mev, mrv) {
  if (score <= BAND_LOW) return (score / BAND_LOW) * mev;
  const frac = Math.pow((score - BAND_LOW) / (BAND_HIGH - BAND_LOW), 1 / BAND_CURVE);
  return mev + frac * (mrv - mev);
}
const iedSets = (mev, mrv) => setsAtScore(BAND_MID, mev, mrv);

// Progress toward whichever landmark is next, always measured from zero.
function doseProgress(sets, mev, mrv) {
  const ied = iedSets(mev, mrv);
  if (sets < mev) return { label: "to MEV", pct: (sets / (mev || 1)) * 100, target: mev };
  if (sets < ied) return { label: "to IED", pct: (sets / ied) * 100, target: ied };
  if (sets < mrv) return { label: "to MRV", pct: (sets / (mrv || 1)) * 100, target: mrv };
  return { label: "past MRV", pct: (sets / (mrv || 1)) * 100, target: mrv };
}

// ============================================================
// Load resolution
//
// One principle: round each implement to what the room actually has, then
// multiply by how many you are holding. Barbell increments are not a fixed
// step, they come from the smallest plate you own, doubled when plates go on
// both ends. Everything else falls out of that.
//
// Specs belong to the location, not the person, because a hotel rack stops at
// 30kg and a commercial one runs to 60.
// ============================================================

const DEFAULT_GYM = {
  dbStepLow: 1, dbLowMax: 10, dbStepHigh: 2.5, dbMax: 60,
  kbStep: 4, kbMin: 8, kbMax: 48,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  barWeight: 20, ezBarWeight: 10, trapBarWeight: 20, smithCarriage: 15,
  stackStep: 5, stackMin: 5, stackMax: 100,
  machineCarriage: 0, sledWeight: 25,
};

const LOCATION_GYM = {
  outdoor_space: {}, outdoor_gym: {},
  home_gym: { dbMax: 32.5, plates: [20, 10, 5, 2.5, 1.25], kbMax: 32, stackMax: 60 },
  hotel_gym: { dbMax: 30, plates: [20, 10, 5, 2.5], stackMax: 80 },
  commercial_gym: {},
};
const gymFor = (location) => ({ ...DEFAULT_GYM, ...(LOCATION_GYM[location] || {}) });

const roundTo = (v, step) => Math.round(v / step) * step;
const smallestPlate = (g) => Math.min.apply(null, g.plates);

// How an exercise takes load, derived from what it needs.
function loadMode(ex) {
  if (!ex || !ex.equip) return "none";
  const has = (id) => ex.equip.indexOf(id) >= 0;
  if (has("db_light") || has("db_heavy")) return "dumbbell";
  if (has("kettlebell")) return "kettlebell";
  if (has("barbell")) return "barbell";
  if (has("cable")) return "stack";
  if (has("machine")) return ex.plateLoaded ? "plateMachine" : "stack";
  if (has("sled")) return "sled";
  if (has("pullup_bar") || has("dip_station")) return "belt";
  return "none";
}

// Plates on one end, heaviest first.
function plateBreakdown(perSide, plates) {
  const out = [];
  let left = perSide;
  plates.slice().sort((a, b) => b - a).forEach((pl) => {
    const n = Math.floor(left / pl + 1e-9);
    if (n > 0) { out.push({ n, pl }); left -= n * pl; }
  });
  return { out, left: Math.round(left * 100) / 100 };
}
const plateText = (bd) => bd.out.map((x) => `${x.n} x ${x.pl}`).join(" + ");

// The achievable load, whether it matched, and what to physically pick up.
function resolveLoad(target, ex, gym) {
  const g = gym || DEFAULT_GYM;
  const mode = loadMode(ex);
  const t = Number(target);
  if (!t || t <= 0 || mode === "none") return { load: t || 0, mode, exact: true, instruction: "" };
  const hands = ex.hands === 1 ? 1 : 2;

  if (mode === "dumbbell") {
    let per = t / hands;
    per = roundTo(per, per <= g.dbLowMax ? g.dbStepLow : g.dbStepHigh);
    let capped = false;
    if (per > g.dbMax) { per = g.dbMax; capped = true; }
    if (per < g.dbStepLow) per = g.dbStepLow;
    return { load: per * hands, mode, capped, exact: !capped && Math.abs(per * hands - t) < 0.01,
      instruction: hands === 2 ? `A pair of ${per}s` : `One ${per}kg dumbbell` };
  }

  if (mode === "kettlebell") {
    let per = roundTo(t / hands, g.kbStep);
    let capped = false;
    if (per < g.kbMin) per = g.kbMin;
    if (per > g.kbMax) { per = g.kbMax; capped = true; }
    return { load: per * hands, mode, capped, exact: !capped && Math.abs(per * hands - t) < 0.01,
      instruction: hands === 2 ? `Two ${per}kg kettlebells` : `One ${per}kg kettlebell` };
  }

  if (mode === "barbell" || mode === "plateMachine" || mode === "sled") {
    const bar = mode === "barbell" ? g.barWeight : mode === "sled" ? g.sledWeight : g.machineCarriage;
    const step = smallestPlate(g) * 2;
    if (t <= bar) {
      return { load: bar, mode, exact: Math.abs(bar - t) < 0.01,
        instruction: mode === "barbell" ? "Empty bar" : "No plates" };
    }
    const load = bar + roundTo(t - bar, step);
    const bd = plateBreakdown((load - bar) / 2, g.plates);
    const barLabel = mode === "barbell" ? `${bar}kg bar` : mode === "sled" ? `${bar}kg sled` : "Carriage";
    return { load, mode, exact: Math.abs(load - t) < 0.01,
      instruction: bd.out.length ? `${barLabel} + ${plateText(bd)} a side` : barLabel };
  }

  if (mode === "belt") {
    const load = Math.max(0, roundTo(t, smallestPlate(g)));
    return { load, mode, exact: Math.abs(load - t) < 0.01,
      instruction: load > 0 ? `${load}kg on the belt` : "Bodyweight" };
  }

  if (mode === "stack") {
    let load = roundTo(t, g.stackStep);
    let capped = false;
    if (load < g.stackMin) load = g.stackMin;
    if (load > g.stackMax) { load = g.stackMax; capped = true; }
    return { load, mode, capped, exact: !capped && Math.abs(load - t) < 0.01,
      instruction: `Pin at ${load}` };
  }

  return { load: t, mode, exact: true, instruction: "" };
}

// When the room cannot give the prescribed load, hold RIR and move reps so the
// set lands in the same place. Epley, unreliable past about 15 reps, so the
// answer is capped and flagged rather than left to drift.
function compensateReps(targetLoad, targetReps, rirBand, actualLoad) {
  const rir = rirBand === "0-1" ? 1 : rirBand === "2-3" ? 2.5 : rirBand === "4-5" ? 4.5 : 6;
  if (!targetLoad || !actualLoad || Math.abs(targetLoad - actualLoad) < 0.01) {
    return { reps: targetReps, shifted: false };
  }
  const toFail = targetReps + rir;
  const oneRM = targetLoad * (1 + toFail / 30);
  const newToFail = 30 * (oneRM / actualLoad - 1);
  const raw = Math.round(newToFail - rir);
  const reps = Math.max(1, Math.min(20, raw));
  return { reps, shifted: true, clipped: raw !== reps,
    drifted: Math.abs(reps - targetReps) > Math.max(4, targetReps * 0.5) };
}

const STRUCTURES = {
  straight: { name: "Straight set",
    note: "One exercise at a time, full rest between sets. Best for heavy compounds.",
    points: ["One exercise at a time.",
      "Complete every set before moving to the next exercise.",
      "Full rest between each set.",
      "Suits heavy compounds, where load matters more than density."] },
  superset: { name: "Superset",
    note: "Two exercises back to back with no rest between them, then rest.",
    points: ["Two exercises run back to back.",
      "No rest between the two.",
      "One rest period after the pair, then repeat.",
      "Halves the time cost. Expect slightly lower load on the second exercise."] },
  triset: { name: "Tri-set",
    note: "Three exercises back to back, then rest.",
    points: ["Three exercises run back to back.",
      "No rest between them.",
      "One rest period after the third, then repeat.",
      "Highest density of the three. Suits smaller muscles and isolation work."] },
  circuit: { name: "Circuit",
    note: "Short rest between every exercise, repeat the round.",
    points: ["One round covers every exercise in the group.",
      "Short rest between each exercise, not none.",
      "Repeat the round for the prescribed number of times.",
      "Works as a finisher. Load is usually the first thing to drop."] },
};
const TECHNIQUES = {
  dropset: { name: "Drop sets", short: "D", suits: "isolation",
    note: "On the last set, strip 20 to 30% of the load and go straight back to failure.",
    needs: "Somewhere to change load fast: cables, a machine, or a full dumbbell rack." },
  cluster: { name: "Cluster sets", short: "C", suits: "compound",
    note: "Break one set into 3 to 5 rep clusters with 15 seconds rest inside the set. Lets you hold a heavier load for the same reps.",
    needs: "A loaded compound lift." },
  restpause: { name: "Rest-pause", short: "RP", suits: "isolation",
    note: "Take the set to failure, rest 15 seconds, go again. Repeat twice. Three failure points in the time of one set.",
    needs: "Anything you can fail on safely." },
  amrap: { name: "AMRAP finisher", short: "F", suits: "any",
    note: "Final set taken to true failure with no rep target.",
    needs: "Anything." },
};
function techniqueApplies(key, ex, kit) {
  const t = TECHNIQUES[key], comp = isCompound(ex);
  if (t.suits === "compound" && !comp) return false;
  if (t.suits === "isolation" && comp) return false;
  if (key === "dropset") return canDropSet(ex, kit);
  if (key === "cluster") return isLoaded(ex);
  return true;
}

// A window rather than a single number, so the bar can show where you are
// against what is recommended rather than just counting down.
function restWindow(structure, compound) {
  if (structure === "circuit") return { min: 15, max: 45 };
  if (structure === "superset" || structure === "triset") return { min: 0, max: 20 };
  return compound ? { min: 120, max: 240 } : { min: 60, max: 120 };
}

function restFor(structure, compound, pos) {
  if (structure === "circuit") return pos === "within" ? 20 : 90;
  if (structure === "superset" || structure === "triset") return pos === "within" ? 0 : 120;
  return compound ? 150 : 90;
}
const fmtRest = (s) => (s === 0 ? "no rest" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

function repRangeFor(ex, m) {
  if (["Abs", "Calves", "Forearms"].indexOf(m) >= 0) return [12, 20];
  return isCompound(ex) ? [6, 10] : [10, 15];
}
function roundLoad(w) { const step = w >= 20 ? 2.5 : 1; return Math.round(w / step) * step; }
// Reps carry forward from the last time you did it, nudged up when you left
// something in the tank, and kept inside the range for the movement.
function prescribeReps(last, lo, hi) {
  if (!last || !last.reps) return lo;
  const r = Number(last.reps);
  if (Number.isNaN(r)) return lo;
  const bump = (last.rir === "0-1" || Number(last.rir) <= 1) ? 1 : 0;
  return Math.max(lo, Math.min(hi, r + bump));
}

function prescribeLoad(history, ex) {
  if (isBodyweight(ex) || ex.metric !== "load") return { load: "", note: "" };
  if (!history || !history.weight) return { load: "", note: "work up to RIR 2" };
  const w = Number(history.weight);
  const band = RIR_BY_ID[history.rir] ? history.rir : bandForTarget(Number(history.rir) || 2);
  if (band === "0-1") return { load: roundLoad(w), note: `hold ${w}, chase a rep` };
  if (band === "2-3") return { load: roundLoad(w * 1.025), note: `up from ${w}` };
  if (band === "4-5") return { load: roundLoad(w * 1.05), note: `up from ${w}, it was comfortable` };
  return { load: roundLoad(w * 1.1), note: `up from ${w}, that was a warm up` };
}
function setsNeeded(cur, mev, mrv) {
  const toMev = Math.max(0, mev - cur), head = Math.max(0, mrv - cur);
  const want = toMev > 0 ? toMev : Math.min(4, head);
  return Math.max(0, Math.min(Math.ceil(want), head, 9));
}
function shuffle(arr, seed) {
  const a = arr.slice();
  let r = seed * 9301 + 49297;
  for (let i = a.length - 1; i > 0; i--) {
    r = (r * 9301 + 49297) % 233280;
    const j = Math.floor((r / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Alternates respect the equipment you said you have.
function alternativesFor(exName, kit) {
  const ex = EXERCISES.find((e) => e.name === exName);
  if (!ex || !ex.primary.length) return [];
  const muscle = ex.primary[0];
  const pool = EXERCISES.filter((e) =>
    e.name !== ex.name && e.primary.indexOf(muscle) >= 0 && available(e, kit));
  const same = pool.filter((e) => isCompound(e) === isCompound(ex));
  return same.concat(pool.filter((e) => isCompound(e) !== isCompound(ex)));
}

function generateSession(o) {
  const { muscles, kit, volume, landmarks, structures, intensity, history, seed, cardioModes, conditioning, gym } = o;
  const pool = EXERCISES.filter((e) => e.metric !== "cardio" && available(e, kit));
  const blocks = [], skipped = [];

  muscles.forEach((m) => {
    const lm = landmarks[m];
    const need = setsNeeded(volume[m] || 0, lm.mev, lm.mrv);
    if (need === 0) { skipped.push(`${m} is already at MRV`); return; }
    const options = shuffle(pool.filter((e) => e.primary.indexOf(m) >= 0), seed + m.length);
    if (!options.length) { skipped.push(`${m} has no exercise for your equipment`); return; }
    const comps = options.filter(isCompound), isos = options.filter((e) => !isCompound(e));
    const picked = [];
    if (comps.length) picked.push(comps[0]);
    isos.forEach((e) => { if (picked.length < 3) picked.push(e); });
    options.forEach((e) => { if (picked.length < 2 && picked.indexOf(e) < 0) picked.push(e); });
    const count = Math.min(picked.length, need <= 4 ? 1 : need <= 7 ? 2 : 3);
    const chosen = picked.slice(0, count);
    const base = Math.floor(need / count);
    let extra = need - base * count;
    chosen.forEach((ex) => {
      const sets = base + (extra-- > 0 ? 1 : 0);
      if (sets <= 0) return;
      const [lo, hi] = repRangeFor(ex, m);
      const last = history[ex.name];
      const rir = isCompound(ex) ? "2-3" : "0-1";
      const wanted = prescribeLoad(last, ex);
      let target = prescribeReps(last, lo, hi);
      // Round to what the room can actually produce, then move reps so the set
      // still lands at the prescribed RIR.
      const res = resolveLoad(wanted.load, ex, gym);
      let comp = null;
      if (wanted.load && res.load && !res.exact) {
        comp = compensateReps(Number(wanted.load), target, rir, res.load);
        target = comp.reps;
      }
      blocks.push({ muscle: m, exercise: ex, sets, lo, hi, target,
        wanted: Number(wanted.load) || null, wantedReps: prescribeReps(last, lo, hi),
        lastSeen: last ? last.when : null, rir,
        load: { ...wanted, load: res.load || wanted.load },
        instruction: res.instruction, capped: res.capped, drifted: comp && comp.drifted });
    });
  });

  // Blend the chosen structures: compounds straight, isolations grouped,
  // a circuit becomes the finisher.
  const order = ["straight", "superset", "triset", "circuit"];
  const use = order.filter((s) => structures.indexOf(s) >= 0);
  const chosenStructures = use.length ? use : ["straight"];
  const comps = blocks.filter((b) => isCompound(b.exercise));
  const isos = blocks.filter((b) => !isCompound(b.exercise));
  const groups = [];
  const push = (items, structure) => {
    if (!items.length) return;
    const size = structure === "superset" ? 2 : structure === "triset" ? 3 : structure === "circuit" ? Math.max(items.length, 1) : 1;
    for (let i = 0; i < items.length; i += size) groups.push({ structure, items: items.slice(i, i + size) });
  };
  if (chosenStructures.length === 1) push(blocks, chosenStructures[0]);
  else {
    const main = chosenStructures.indexOf("straight") >= 0 ? "straight" : chosenStructures[0];
    const groupers = chosenStructures.filter((s) => s === "superset" || s === "triset");
    push(comps, main);
    let rest = isos.slice();
    if (chosenStructures.indexOf("circuit") >= 0 && rest.length > 1) {
      const cut = Math.max(2, Math.ceil(rest.length / 3));
      const tail = rest.slice(rest.length - cut);
      rest = rest.slice(0, rest.length - cut);
      push(rest, groupers.length ? groupers[0] : main);
      push(tail, "circuit");
    } else push(rest, groupers.length ? groupers[0] : main);
  }
  groups.forEach((g, i) => {
    const comp = g.items.some((b) => isCompound(b.exercise));
    g.restWithin = restFor(g.structure, comp, "within");
    g.restAfter = restFor(g.structure, comp, "after");
    g.id = `g${i}`;
    g.letter = String.fromCharCode(65 + i);
  });

  // Conditioning is appended as its own block once a modality is chosen.
  let cardioBlock = null;
  if (conditioning && cardioModes && cardioModes.length) {
    const modes = cardioModes.map((id) => CARDIO_MODES.find((m) => m.id === id)).filter(Boolean);
    const pickMode = modes[seed % modes.length] || modes[0];
    cardioBlock = { format: conditioning, mode: pickMode, spec: CONDITIONING[conditioning] };
  }

  // Techniques get their own section rather than being sprinkled through.
  const overload = [];
  intensity.forEach((key) => {
    const candidates = blocks.filter((b) => techniqueApplies(key, b.exercise, kit));
    if (!candidates.length) {
      overload.push({ key, exercise: null, reason: "nothing in this session suits it with your equipment" });
    } else {
      const pick = candidates[candidates.length - 1];
      overload.push({ key, exercise: pick.exercise.name, muscle: pick.muscle });
    }
  });
  return { groups, overload, skipped, cardioBlock, totalSets: blocks.reduce((n, b) => n + b.sets, 0) };
}

// ---- Personal records ----
function bestsFor(entries) {
  const out = {};
  entries.forEach((e) => {
    const done = (e.sets || []).filter((s) => s.done);
    if (!done.length) return;
    if (!out[e.exercise]) out[e.exercise] = { name: e.exercise, metric: e.metric, sessions: 0, lastDate: null,
      loaded: (e.equip || []).some((x) => x !== "bodyweight") };
    const b = out[e.exercise];
    b.sessions += 1;
    if (e.date && (!b.lastDate || e.date > b.lastDate)) b.lastDate = e.date;
    if (e.metric === "cardio") {
      const dist = done.reduce((n, s) => n + (Number(s.distance) || 0), 0);
      const cals = done.reduce((n, s) => n + (Number(s.calories) || 0), 0);
      const time = done.reduce((n, s) => n + (Number(s.reps) || 0), 0);
      b.totalDistance = Math.max(b.totalDistance || 0, dist);
      b.totalCalories = Math.max(b.totalCalories || 0, cals);
      b.longest = Math.max(b.longest || 0, time);
    } else if (e.metric === "time") {
      b.longestHold = Math.max(b.longestHold || 0, ...done.map((s) => Number(s.reps) || 0));
      b.totalTime = Math.max(b.totalTime || 0, done.reduce((n, s) => n + (Number(s.reps) || 0), 0));
    } else {
      const weights = done.map((s) => Number(s.weight) || 0);
      const reps = done.map((s) => Number(s.reps) || 0);
      // Unloaded work has no tonnage, so a set is worth its reps.
      const anyLoad = weights.some((w) => w > 0);
      const setVol = done.map((s, i) => (anyLoad ? (Number(s.weight) || 0) * (reps[i] || 0) : reps[i] || 0));
      b.anyLoad = b.anyLoad || anyLoad;
      b.maxWeight = Math.max(b.maxWeight || 0, ...weights);
      b.maxReps = Math.max(b.maxReps || 0, ...reps);
      b.bestSetVolume = Math.max(b.bestSetVolume || 0, ...setVol);
      b.totalReps = Math.max(b.totalReps || 0, reps.reduce((n, r) => n + r, 0));
      b.sessionVolume = Math.max(b.sessionVolume || 0, setVol.reduce((n, v) => n + v, 0));
    }
  });
  return Object.values(out).sort((a, b) => a.name.localeCompare(b.name));
}

const T = {
  dark: {
    bg: "#0b1013", panel: "#111a1e", accent: "#36aecb", accentText: "#36aecb",
    soft: "rgba(54,174,203,0.12)", border: "rgba(54,174,203,0.26)",
    borderStrong: "rgba(54,174,203,0.50)", text: "#e8f4f8",
    muted: "#a8b0b2", faint: "#828384", ring: "#828384",
    band: "rgba(130,131,132,0.09)", warn: "#e0a848", danger: "#e07a7a",
    line: "rgba(130,131,132,0.30)",
  },
  light: {
    bg: "#f5f8f9", panel: "#ffffff", accent: "#36aecb", accentText: "#1b7a91",
    soft: "rgba(54,174,203,0.10)", border: "rgba(54,174,203,0.35)",
    borderStrong: "rgba(54,174,203,0.60)", text: "#0d1a1e",
    muted: "#5d6668", faint: "#828384", ring: "#828384",
    band: "rgba(130,131,132,0.10)", warn: "#8a5d12", danger: "#a33a3a",
    line: "rgba(130,131,132,0.35)",
  },
};

const pad = (n) => String(n).padStart(2, "0");
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => localIso(new Date());
function daysAgo(iso, n) {
  const p = iso.split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const now = new Date();
  return (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - d) / 86400000 <= n;
}
function fmtDay(iso) {
  const p = iso.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

const newId = () => `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
// rir is what you actually recorded and is blank until you log it. targetRir is
// the prescription, shown greyed in the selector until then. Recording an RIR is
// what marks the set complete, so there is no separate tick.
function makeSets(n, weight, reps, rir) {
  return Array.from({ length: n }, () => ({
    weight: weight === "" || weight == null ? "" : String(weight),
    reps: String(reps), rir: "", targetRir: String(rir || "2-3"),
    distance: "", calories: "", done: false,
  }));
}

// Rest sits between groups as its own row. It starts counting the moment the
// last set above it is ticked, and ticks itself when it reaches zero.
// Rest sits under each set as part of it. A set is the work plus the recovery,
// so the row only reads as finished once the rest has run. The bar fills as the
// rest elapses and shows the recommended window as a band behind it.
function RestBar({ armed, window, c, onElapsed }) {
  const [elapsed, setElapsed] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    if (armed && !startedRef.current) {
      startedRef.current = true;
      setElapsed(0);
      setRunning(true);
    }
    if (!armed && startedRef.current) {
      startedRef.current = false;
      setRunning(false);
      setElapsed(0);
    }
  }, [armed]);

  React.useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setElapsed((e) => e + 1), 1000);
    return () => clearTimeout(id);
  }, [running, elapsed]);

  const stop = () => {
    setRunning(false);
    if (onElapsed) onElapsed(elapsed);
  };

  // The bar runs to the top of the window plus a margin, so overrunning is visible.
  const full = Math.max(window.max * 1.35, 30);
  const pct = (n) => Math.min(100, (n / full) * 100);
  const inWindow = elapsed >= window.min && elapsed <= window.max;
  const over = elapsed > window.max;
  const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 mb-2" style={{ opacity: armed ? 1 : 0.4 }}>
      <div style={{ width: "22px", color: c.faint, fontSize: "10px", letterSpacing: "1px" }}>R</div>
      <div style={{ position: "relative", flex: 1, height: "22px", borderRadius: "5px",
        border: `1px solid ${c.line}`, overflow: "hidden", background: "transparent" }}>
        {/* recommended window */}
        <div style={{ position: "absolute", top: 0, bottom: 0,
          left: `${pct(window.min)}%`, width: `${pct(window.max) - pct(window.min)}%`,
          background: c.band }} />
        {/* elapsed */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct(elapsed)}%`,
          background: over ? c.warn : c.accent, opacity: over ? 0.5 : 0.35,
          transition: "width 0.9s linear" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 7px",
          color: over ? c.warn : inWindow ? c.accentText : c.muted, fontSize: "11px" }}>
          <span>{running ? mmss(elapsed) : elapsed > 0 ? mmss(elapsed) : "Rest"}</span>
          <span style={{ color: c.faint }}>
            {window.max === 0 ? "no rest" : `${mmss(window.min)} to ${mmss(window.max)}`}
          </span>
        </div>
      </div>
      <button onClick={stop} disabled={!running}
        style={{ width: "34px", height: "26px", borderRadius: "5px",
          border: `1px solid ${running ? c.accent : c.line}`,
          background: "transparent", color: running ? c.accentText : c.faint,
          fontFamily: "inherit", fontSize: "11px" }}>
        {running ? "Stop" : "\u2713"}
      </button>
      <div style={{ width: "18px" }} />
    </div>
  );
}


export default function Healthier() {
  const [theme, setTheme] = useState("dark");
  React.useEffect(() => {
    if (window.matchMedia) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      setTheme(mql.matches ? "dark" : "light");
      const h = (e) => setTheme(e.matches ? "dark" : "light");
      mql.addEventListener?.("change", h);
      return () => mql.removeEventListener?.("change", h);
    }
  }, []);
  const c = T[theme];

  const [tab, setTab] = useState("overview");
  const [entries, setEntries] = useState([]);
  const [history, setHistory] = useState([]);
  const [tickSeq, setTickSeq] = useState(0);
  const [pending, setPending] = useState(null);   // generated session waiting on a decision
  const [confirmLog, setConfirmLog] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);

  const [landmarks, setLandmarks] = useState(DEFAULT_LANDMARKS);
  const [falloff, setFalloff] = useState("moderate");
  const [hover, setHover] = useState(null);

  const [genMuscles, setGenMuscles] = useState([]);
  const [location, setLocation] = useState("");
  const [kit, setKit] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [profile, setProfile] = useState({
    name: "", sex: "", dob: "", experience: "",
    availDays: [], availNote: "", injuries: [], injuryNote: "",
    conditions: [], conditionNote: "", goals: [], measures: {},
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [genStructures, setGenStructures] = useState(["straight"]);
  const [cardioModes, setCardioModes] = useState([]);
  const [conditioning, setConditioning] = useState("");
  const [genIntensity, setGenIntensity] = useState([]);
  const [session, setSession] = useState(null);
  const [overload, setOverload] = useState([]);
  const [seed, setSeed] = useState(1);

  const [form, setForm] = useState({ exercise: "Push up", sets: "3", reps: "10", weight: "", rir: "2-3" });
  const [addFilter, setAddFilter] = useState("kit");
  const [openCues, setOpenCues] = useState([]);
  const [rirInfo, setRirInfo] = useState(false);
  const [info, setInfo] = useState(null);
  const [kindPicker, setKindPicker] = useState(null);
  const [exerciseNotes, setExerciseNotes] = useState({});   // { exercise: [{date, text}] }
  const [noteDraft, setNoteDraft] = useState({});
  const [openNotes, setOpenNotes] = useState([]);
  const [doseInfo, setDoseInfo] = useState(false);

  // Profile persists the setup you rarely change. Storage is best effort, so a
  // failure just means the defaults come back next time.
  React.useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("goal:profile");
        if (res && res.value) {
          const p = JSON.parse(res.value);
          if (p.location) setLocation(p.location);
          if (Array.isArray(p.kit)) setKit(p.kit);
          if (Array.isArray(p.cardioModes)) setCardioModes(p.cardioModes);
          if (Array.isArray(p.pinned)) setPinned(p.pinned);
          if (p.profile) setProfile((prev) => ({ ...prev, ...p.profile }));
          if (p.exerciseNotes) setExerciseNotes(p.exerciseNotes);
        }
      } catch (err) {
        // no saved profile, or storage unavailable
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!profileLoaded) return;
    (async () => {
      try {
        await window.storage.set("goal:profile", JSON.stringify({ location, kit, cardioModes, pinned, profile, exerciseNotes }));
      } catch (err) {
        // best effort only
      }
    })();
  }, [profileLoaded, location, kit, cardioModes, pinned, profile, exerciseNotes]);

  const setField = (k, v) => setProfile({ ...profile, [k]: v });
  const toggleIn = (k, v) => {
    const list = profile[k] || [];
    setField(k, list.indexOf(v) >= 0 ? list.filter((x) => x !== v) : [...list, v]);
  };
  const toggleGoal = (g) => {
    const on = profile.goals.indexOf(g) >= 0;
    const goals = on ? profile.goals.filter((x) => x !== g) : [...profile.goals, g];
    const measures = { ...profile.measures };
    if (on) delete measures[g];
    setProfile({ ...profile, goals, measures });
  };
  const moveGoal = (g, dir) => {
    const i = profile.goals.indexOf(g), j = i + dir;
    if (i < 0 || j < 0 || j >= profile.goals.length) return;
    const goals = profile.goals.slice();
    [goals[i], goals[j]] = [goals[j], goals[i]];
    setField("goals", goals);
  };
  const toggleMeasure = (g, m) => {
    const cur = profile.measures[g] || [];
    setProfile({ ...profile, measures: { ...profile.measures,
      [g]: cur.indexOf(m) >= 0 ? cur.filter((x) => x !== m) : [...cur, m] } });
  };

  const pickLocation = (id) => {
    setLocation(id);
    const loc = LOCATIONS.find((l) => l.id === id);
    if (loc) {
      setKit(loc.kit);
      if (loc.kit.indexOf("cardio") < 0) setCardioModes(cardioModes.filter((m) =>
        (CARDIO_MODES.find((cm) => cm.id === m) || { equip: [] }).equip.indexOf("cardio") < 0));
    }
  };


  // Weekly volume is the open session plus anything logged in the last 7 days.
  const weekRecords = useMemo(() => history.filter((h) => daysAgo(h.date, 7)), [history]);
  const volume = useMemo(() => volumeByMuscle([...entries, ...weekRecords]), [entries, weekRecords]);
  const bests = useMemo(() => bestsFor([...entries, ...history]), [entries, history]);

  // Most recent completed set per exercise. Deliberately recency, not all time:
  // coming back from injury or a layoff should pull the next session down, not
  // hold you to a peak you set six months ago.
  const lastEffort = useMemo(() => {
    const dated = history
      .map((r) => ({ ...r, when: r.date || "0000-00-00" }))
      .sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
    const h = {};
    [...dated, ...entries.map((e) => ({ ...e, when: todayIso() }))].forEach((e) => {
      const done = (e.sets || []).filter((s) => s.done);
      if (done.length) h[e.exercise] = { ...done[done.length - 1], when: e.when };
    });
    return h;
  }, [entries, history]);

  const addPool = useMemo(() => (
    addFilter === "kit"
      ? EXERCISES.filter((e) => exerciseAvailable(e, kit, cardioModes))
      : EXERCISES
  ), [addFilter, kit, cardioModes]);

  const rowsFor = (muscles) => muscles.map((m, i) => {
    const sets = volume[m] || 0;
    const { mev, mrv } = landmarks[m];
    const s = scoreVolume(sets, mev, mrv, falloff);
    const p = axisPoint(i, muscles.length, radiusFor(s));
    return { muscle: m, sets, mev, mrv, score: s, ...p,
      zone: sets === 0 ? "none" : sets < mev ? "under" : sets <= mrv ? "in" : "over" };
  });
  const rows = rowsFor(MUSCLE_ORDER);

  // Replay the ticked sets in the order they were done. Each one gets a point
  // on its primary muscle's spoke at the position that set moved the muscle to,
  // so you can see how much ground each individual set actually bought you.
  const setMarkers = useMemo(() => {
    // A set at 6+ RIR adds nothing to the dose, so it earns no marker and does
    // not take a number.
    const events = [];
    entries.forEach((e) => (e.sets || []).forEach((st) => {
      if (st.done && st.seq && e.primary.length && setFactor(st) > 0) {
        events.push({ seq: st.seq, entry: e, set: st });
      }
    }));
    events.sort((a, b) => a.seq - b.seq);
    const running = {};
    MUSCLE_ORDER.forEach((m) => (running[m] = volumeByMuscle(weekRecords)[m] || 0));
    return events.map((ev, i) => {
      const eff = setFactor(ev.set);
      ev.entry.primary.forEach((m) => { if (running[m] !== undefined) running[m] += eff; });
      ev.entry.secondary.forEach((m) => { if (running[m] !== undefined) running[m] += eff * 0.5; });
      const m = ev.entry.primary[0];
      const lm = landmarks[m];
      const pr = doseProgress(running[m], lm.mev, lm.mrv);
      return {
        num: i + 1, label: `Set ${i + 1}`, muscle: m, exercise: ev.entry.exercise,
        score: scoreVolume(running[m], lm.mev, lm.mrv, falloff),
        sets: running[m], pct: Math.round(pr.pct), toward: pr.label,
      };
    });
  }, [entries, weekRecords, landmarks, falloff]);

  // The session chart re-spokes itself around whatever this session targets.
  const sessionMuscles = useMemo(() => {
    const set = new Set();
    entries.forEach((e) => { e.primary.forEach((m) => set.add(m)); e.secondary.forEach((m) => set.add(m)); });
    genMuscles.forEach((m) => set.add(m));
    return MUSCLE_ORDER.filter((m) => set.has(m));
  }, [entries, genMuscles]);

  const updateSet = (id, i, patch) => setEntries(entries.map((e) => e.id !== id ? e
    : { ...e, sets: e.sets.map((s, j) => j === i ? { ...s, ...patch } : s) }));

  // Typing a weight or a rep count fills the sets below, since the next set
  // usually repeats the last one. Anything already logged is left alone.
  const updateSetAndBelow = (id, i, patch) => setEntries(entries.map((e) => {
    if (e.id !== id) return e;
    return { ...e, sets: e.sets.map((s, j) => {
      if (j === i) return { ...s, ...patch };
      if (j > i && !s.done) return { ...s, ...patch };
      return s;
    }) };
  }));

  // Recording an RIR logs the set. Clearing it un-logs it.
  const recordRir = (id, i, value) => {
    if (!value) {
      setEntries(entries.map((e) => e.id !== id ? e
        : { ...e, sets: e.sets.map((s, j) => j === i ? { ...s, rir: "", done: false, seq: null } : s) }));
      return;
    }
    const next = tickSeq + 1;
    setTickSeq(next);
    setEntries(entries.map((e) => e.id !== id ? e
      : { ...e, sets: e.sets.map((s, j) => j === i ? { ...s, rir: value, done: true, seq: next } : s) }));
  };

  // Ticking a set stamps it with the next sequence number, which is what the
  // session chart uses to label Set 1, Set 2 and so on in the order you did them.
  const toggleDone = (id, i) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const wasDone = entry.sets[i].done;
    if (wasDone) {
      updateSet(id, i, { done: false, seq: null });
    } else {
      const next = tickSeq + 1;
      setTickSeq(next);
      updateSet(id, i, { done: true, seq: next });
    }
  };

  // Commit the session: ticked sets go to the ledger, the rest are dropped.
  const commitSession = (list) => {
    const records = (list || entries)
      .map((e) => ({ ...e, date: todayIso(), sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length > 0);
    if (records.length) setHistory((h) => [...records, ...h]);
    return records.length;
  };

  const applyGenerated = (sess, mode) => {
    const added = [];
    // Each technique rides on the exercise it was assigned to, so it is logged
    // with the same set rows, rest bar and feedback as everything else.
    const techFor = {};
    (sess.overload || []).forEach((o) => { if (o.exercise) techFor[o.exercise] = o.key; });
    sess.groups.forEach((g) => g.items.forEach((b, bi) => {
      const tech = techFor[b.exercise.name] || null;
      added.push({
        id: newId(), exercise: b.exercise.name, technique: tech, instruction: b.instruction,
        swap: (b.capped || b.drifted)
          ? { wanted: b.wanted, actual: b.load.load, fromReps: b.wantedReps, toReps: b.target } : null,
        primary: b.exercise.primary, secondary: b.exercise.secondary,
        equip: b.exercise.equip, metric: b.exercise.metric,
        sets: (() => {
          const base = makeSets(b.sets, b.load.load, b.target || b.lo, b.rir);
          if (tech) {
            const last = base[base.length - 1] || { weight: "", reps: "", targetRir: "0-1" };
            base.push({ ...last, rir: "", done: false, seq: null, targetRir: "0-1", kind: tech });
          }
          return base;
        })(),
        structure: g.structure, groupId: `${mode === "add" ? Date.now() + "_" : ""}${g.id}`,
        groupLetter: g.letter, position: bi + 1, groupSize: g.items.length,
        restAfter: g.restAfter, restWithin: g.restWithin,
      });
    }));
    if (sess.cardioBlock) {
      const cm = EXERCISES.find((e) => e.cardioMode === sess.cardioBlock.mode.id);
      if (cm) added.push({
        id: newId(), exercise: cm.name, primary: [], secondary: [],
        equip: cm.equip, metric: "cardio", sets: makeSets(1, "", "", ""),
        structure: "conditioning", groupId: `cond_${Date.now()}`, groupLetter: "C",
        position: 1, groupSize: 1, conditioning: sess.cardioBlock.format,
      });
    }
    if (mode === "add") setEntries([...entries, ...added]);
    else { setEntries(added); setTickSeq(0); }
    setOverload(mode === "add" ? [...overload, ...sess.overload] : sess.overload);
    setSession(null);
    setPending(null);
    setConfirmLog(null);
    setTab("log");
  };
  const addSet = (id) => setEntries(entries.map((e) => {
    if (e.id !== id) return e;
    const last = e.sets[e.sets.length - 1] || { weight: "", reps: "10", rir: "2-3" };
    return { ...e, sets: [...e.sets, { ...last, done: false }] };
  }));
  const removeSet = (id, i) => setEntries(entries
    .map((e) => e.id !== id ? e : { ...e, sets: e.sets.filter((_, j) => j !== i) })
    .filter((e) => e.sets.length > 0));
  const swapExercise = (id, name) => {
    const ex = EXERCISES.find((x) => x.name === name);
    if (!ex) return;
    const load = prescribeLoad(lastEffort[ex.name], ex);
    const res = resolveLoad(load.load, ex, gymFor(location));
    setEntries(entries.map((e) => e.id !== id ? e : {
      ...e, exercise: ex.name, primary: ex.primary, secondary: ex.secondary,
      equip: ex.equip, metric: ex.metric, instruction: res.instruction,
      sets: e.sets.map((s) => s.done ? s : { ...s, weight: res.load ? String(res.load) : "" }),
    }));
  };
  const addExercise = () => {
    const ex = EXERCISES.find((e) => e.name === form.exercise);
    if (!ex || !form.sets) return;
    setEntries([...entries, {
      id: newId(), exercise: ex.name, primary: ex.primary, secondary: ex.secondary,
      equip: ex.equip, metric: ex.metric,
      sets: makeSets(Number(form.sets), form.weight, form.reps, form.rir),
    }]);
    setForm({ ...form, weight: "" });
  };

  // Entries keep the group identity the generator gave them, so the log
  // re-forms the same supersets, tri-sets and circuits.
  const logGroups = useMemo(() => {
    const out = [];
    entries.forEach((e) => {
      const key = e.groupId || `solo_${e.id}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(e);
      else out.push({ key, structure: e.structure || null, items: [e] });
    });
    return out;
  }, [entries]);

  // History grouped by day, filtered by the search box.
  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (r) => !q || r.exercise.toLowerCase().indexOf(q) >= 0
      || r.primary.some((m) => m.toLowerCase().indexOf(q) >= 0)
      || r.secondary.some((m) => m.toLowerCase().indexOf(q) >= 0)
      || r.date.indexOf(q) >= 0 || fmtDay(r.date).toLowerCase().indexOf(q) >= 0;
    const byDay = {};
    history.filter(match).forEach((r) => {
      if (!byDay[r.date]) byDay[r.date] = [];
      byDay[r.date].push(r);
    });
    return Object.keys(byDay).sort().reverse().map((date) => ({ date, records: byDay[date] }));
  }, [history, search]);

  // Which single set is the best for each exercise, so the ledger can star it.
  const bestSetKey = useMemo(() => {
    const best = {};
    [...history, ...entries].forEach((r) => {
      (r.sets || []).filter((st) => st.done).forEach((st) => {
        const score = r.metric === "cardio"
          ? Number(st.distance) || 0
          : (Number(st.weight) || 0) * (Number(st.reps) || 0) || Number(st.reps) || 0;
        if (!best[r.exercise] || score > best[r.exercise].score) {
          best[r.exercise] = { score, recId: r.id, idx: (r.sets || []).indexOf(st) };
        }
      });
    });
    return best;
  }, [history, entries]);
  const isBestSet = (rec, i) => {
    const b = bestSetKey[rec.exercise];
    return b && b.recId === rec.id && b.idx === i && b.score > 0;
  };

  const editHistorySet = (recId, i, patch) => setHistory(history.map((r) => r.id !== recId ? r
    : { ...r, sets: r.sets.map((s, j) => j === i ? { ...s, ...patch } : s) }));
  const removeHistorySet = (recId, i) => setHistory(history
    .map((r) => r.id !== recId ? r : { ...r, sets: r.sets.filter((_, j) => j !== i) })
    .filter((r) => r.sets.length > 0));

  // Work done per exercise. Loaded lifts report tonnage, unloaded report reps,
  // so a mixed session never adds kilos to repetitions.
  const sessionWork = useMemo(() => entries.map((e) => {
    const done = e.sets.filter((x) => x.done);
    const loaded = e.sets.some((x) => Number(x.weight) > 0);
    const amount = done.reduce((n, x) => {
      const reps = Number(x.reps) || 0;
      return n + (loaded ? (Number(x.weight) || 0) * reps : reps);
    }, 0);
    return {
      id: e.id, name: e.exercise, loaded, amount,
      unit: e.metric === "cardio" ? "" : loaded ? "kg" : " reps",
      done: done.length, planned: e.sets.length,
    };
  }).filter((x) => x.planned > 0), [entries]);

  const tonnage = sessionWork.filter((x) => x.loaded).reduce((n, x) => n + x.amount, 0);
  const repWork = sessionWork.filter((x) => !x.loaded).reduce((n, x) => n + x.amount, 0);

  // Working sets number themselves. Warm ups and technique sets sit outside
  // the count, so marking set one as a warm up renumbers the rest.
  const workingNumber = (sets, i) => {
    let n = 0;
    for (let j = 0; j <= i; j++) if (!sets[j].kind) n += 1;
    return sets[i].kind ? null : n;
  };

  const addNote = (exercise) => {
    const text = (noteDraft[exercise] || "").trim();
    if (!text) return;
    setExerciseNotes({ ...exerciseNotes,
      [exercise]: [{ date: todayIso(), text }, ...(exerciseNotes[exercise] || [])] });
    setNoteDraft({ ...noteDraft, [exercise]: "" });
  };
  const removeNote = (exercise, idx) => setExerciseNotes({ ...exerciseNotes,
    [exercise]: (exerciseNotes[exercise] || []).filter((_, i) => i !== idx) });

  const setKind = (id, i, kind) => setEntries(entries.map((e) => {
    if (e.id !== id) return e;
    return { ...e, sets: e.sets.map((s, j) => {
      if (j !== i) return s;
      const next = { ...s, kind: kind || undefined };
      // Choosing to failure prescribes 0-1 without locking it.
      if (kind === "failure" && !s.done) next.targetRir = "0-1";
      return next;
    }) };
  }));

  // Only the newest logged set is resting. Anything earlier has been moved on from.
  const latestSeq = useMemo(() => entries.reduce((m, e) =>
    e.sets.reduce((n, s) => (s.done && s.seq && s.seq > n ? s.seq : n), m), 0), [entries]);

  const totalSets = entries.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const effective = Object.values(volume).reduce((n, v) => n + v, 0);

  const input = { background: c.panel, border: `1px solid ${c.border}`, color: c.text, fontFamily: "inherit", fontSize: "15px" };
  const selectAll = (e) => e.target.select();
  const cell = { background: "transparent", border: `1px solid ${c.line}`, color: c.text, fontFamily: "inherit", fontSize: "14px", textAlign: "center", padding: "7px 2px", borderRadius: "5px", width: "100%" };
  const panel = { border: `1px solid ${c.border}`, background: c.panel };
  const lab = { color: c.muted, fontSize: "11px", marginBottom: "4px", display: "block" };
  const primaryBtn = { background: c.soft, border: `1px solid ${c.borderStrong}`, color: c.accentText, fontFamily: "inherit" };
  const chip = (on) => on
    ? { border: `1px solid ${c.accent}`, background: c.soft, color: c.accentText, fontFamily: "inherit" }
    : { border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit" };
  const zoneColour = (z) => (z === "in" ? c.accent : z === "over" ? c.warn : c.danger);
  const head = { color: c.ring, fontSize: "10px", letterSpacing: "2.5px", fontWeight: 700 };

  // ---- Shared chart ----
  const Radar = ({ muscles, showQuadrants, markers, compact }) => {
    const rr = rowsFor(muscles);
    const n = muscles.length;
    if (!n) return null;
    const meanScore = rr.reduce((t, r) => t + r.score, 0) / n;
    return (
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={compact ? "" : "w-full h-auto"}
        style={compact
          ? { height: "32vh", width: "32vh", maxWidth: "100%", maxHeight: "min(32vh, 100vw)", display: "block", margin: "0 auto" }
          : undefined}>
        {/* Target zone drawn as two circles so no stray arc can appear */}
        <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_HIGH)} fill={c.band} />
        <circle cx={CENTER} cy={CENTER} r={radiusFor(BAND_LOW)} fill={c.panel} />

        {/* The T. Three fixed stubs, and one arrow whose shaft length is the mean
            compliance across the body parts on this chart. */}
        {ARM_ANGLES.map((deg) => {
          const a = (deg * Math.PI) / 180;
          return (
            <line key={`arm${deg}`} x1={CENTER} y1={CENTER}
              x2={CENTER + MAX_R * ARM_SHORT * Math.cos(a)} y2={CENTER + MAX_R * ARM_SHORT * Math.sin(a)}
              stroke={c.accent} strokeWidth={MAX_R * ARM_WIDTH} strokeLinecap="round" />
          );
        })}

        {(() => {
          const a = (C_GAP_CENTRE * Math.PI) / 180;
          const cos = Math.cos(a), sin = Math.sin(a);
          const shaft = radiusFor(meanScore);
          const tip = shaft + MAX_R * ARROW_HEAD_LEN;
          const halfW = (MAX_R * ARROW_HEAD_W) / 2;
          // triangle: apex at the tip, base square across the end of the shaft
          const apex = [CENTER + tip * cos, CENTER + tip * sin];
          const bl = [CENTER + shaft * cos - halfW * -sin, CENTER + shaft * sin - halfW * cos];
          const br = [CENTER + shaft * cos + halfW * -sin, CENTER + shaft * sin + halfW * cos];
          return (
            <g>
              {shaft > 2 && (
                <line x1={CENTER} y1={CENTER} x2={CENTER + shaft * cos} y2={CENTER + shaft * sin}
                  stroke={c.accent} strokeWidth={MAX_R * ARROW_SHAFT_W} strokeLinecap="butt" />
              )}
              <polygon points={`${apex[0]},${apex[1]} ${bl[0]},${bl[1]} ${br[0]},${br[1]}`} fill={c.accent} />
            </g>
          );
        })()}

        {showQuadrants && [0, 1, 2, 3].map((q) => {
          const a = ((-45 + 90 * q) * Math.PI) / 180;
          return (
            <line key={`d${q}`} x1={CENTER + MAX_R * (ARM_SHORT + 0.04) * Math.cos(a)} y1={CENTER + MAX_R * (ARM_SHORT + 0.04) * Math.sin(a)}
              x2={CENTER + (MAX_R + 56) * Math.cos(a)} y2={CENTER + (MAX_R + 56) * Math.sin(a)}
              stroke={c.ring} strokeOpacity={0.57} strokeWidth={1} strokeDasharray="2 7" strokeLinecap="round" />
          );
        })}
        {showQuadrants && GROUPS.map((g, q) => {
          const a = (90 * q * Math.PI) / 180, r = MAX_R + 82;
          return (
            <text key={g.name} x={CENTER + r * Math.cos(a)} y={CENTER + r * Math.sin(a)}
              fontSize="15" fontWeight="700" fill={c.ring} letterSpacing="3.5"
              textAnchor="middle" dominantBaseline="middle">{g.name.toUpperCase()}</text>
          );
        })}

        {rr.map((r, i) => {
          const edge = axisPoint(i, n, MAX_R);
          const major = MAJOR.indexOf(r.muscle) >= 0;
          const lp = axisPoint(i, n, MAX_R + 30);
          const anchor = Math.abs(lp.x - CENTER) < 12 ? "middle" : lp.x > CENTER ? "start" : "end";
          return (
            <g key={r.muscle}>
              <line x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y}
                stroke={c.accent} strokeOpacity={major ? 0.28 : 0.13} strokeWidth={major ? 1.4 : 1} />
              <text x={lp.x} y={lp.y} fontSize={major ? "13.5" : "11.5"} fontWeight={major ? "700" : "400"}
                fill={c.accent} fillOpacity={major ? 1 : 0.62} textAnchor={anchor} dominantBaseline="middle">
                {r.muscle}
              </text>
            </g>
          );
        })}

        {[[BAND_LOW, C_GAP_INNER], [BAND_HIGH, C_GAP_OUTER]].map(([pct, gap]) => (
          <path key={pct} d={arcPath(radiusFor(pct), C_GAP_CENTRE + gap / 2, 360 - gap)}
            fill="none" stroke={c.ring} strokeOpacity={0.5}
            strokeWidth={MAX_R * RING_THICKNESS} strokeLinecap="round" />
        ))}

        {/* Brand geometry is drawn at fixed angles and fixed fractions of the
            radius, so the mark holds its shape whatever the spoke count. Spokes
            sit at -45 + step*(i+0.5), which clears the arms whenever the count
            is a multiple of four. Other counts can put one spoke along a short
            stub, so the arms are drawn underneath and the spoke still reads. */}
        {n > 2 && (
          <polygon points={rr.map((r) => `${r.x},${r.y}`).join(" ")}
            fill={c.accent} fillOpacity={0.16} stroke={c.accent} strokeWidth={2} strokeLinejoin="round" />
        )}
        {n <= 2 && rr.length === 2 && (
          <line x1={rr[0].x} y1={rr[0].y} x2={rr[1].x} y2={rr[1].y} stroke={c.accent} strokeWidth={2} />
        )}

        {/* Markers on the same spoke sit at increasing radius, but early sets land
            close together. Anything within a marker width of its neighbour is nudged
            sideways off the spoke, alternating sides, so nothing stacks. */}
        {markers && (() => {
          const R = 11, MINGAP = R * 2.1;
          const placed = [];
          const bySpoke = {};
          markers.forEach((mk) => {
            const idx = muscles.indexOf(mk.muscle);
            if (idx < 0) return;
            const r = radiusFor(mk.score);
            const prev = bySpoke[idx];
            let offset = 0;
            if (prev !== undefined && Math.abs(r - prev.r) < MINGAP) {
              offset = (prev.offset >= 0 ? -1 : 1) * (Math.abs(prev.offset) + MINGAP * 0.55);
            }
            bySpoke[idx] = { r, offset };
            const base = axisPoint(idx, n, r);
            const perpA = ((Math.PI * 2 * idx) / n) - Math.PI / 2 + ((45 + 360 / n / 2) * Math.PI) / 180;
            placed.push({ mk, x: base.x - offset * Math.sin(perpA), y: base.y + offset * Math.cos(perpA) });
          });
          return placed.map((pl, i) => (
            <g key={`mk${i}`}>
              <circle cx={pl.x} cy={pl.y} r={R} fill={c.bg} stroke={c.accent} strokeWidth={2} />
              <text x={pl.x} y={pl.y + 0.5} fontSize="12" fontWeight="700" fill={c.accent}
                textAnchor="middle" dominantBaseline="middle">{pl.mk.num}</text>
            </g>
          ));
        })()}

        {rr.map((r) => (
          <circle key={r.muscle} cx={r.x} cy={r.y} r={hover === r.muscle ? 8 : 6}
            fill={r.zone === "in" ? c.accent : c.bg} stroke={zoneColour(r.zone)}
            strokeWidth={r.zone === "in" ? 0 : 2.5}
            onMouseEnter={() => setHover(r.muscle)} onMouseLeave={() => setHover(null)}
            style={{ cursor: "pointer" }} />
        ))}
      </svg>
    );
  };

  return (
    <div style={{ background: c.bg, color: c.text, minHeight: "100vh" }} className="w-full font-mono p-5">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 style={{ color: c.accentText }} className="text-base sm:text-lg tracking-widest uppercase leading-tight">
            T.C.C. // Healthier
          </h1>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit" }}
            className="shrink-0 text-xs px-2 py-1 rounded uppercase tracking-wide">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
        <p style={{ color: c.faint }} className="text-xs mb-4">
          Centre is nothing done. Inner ring is MEV, outer ring is MRV. Only completed sets count.
        </p>

        <div className="flex gap-2 mb-5 text-xs flex-wrap">
          {[["profile", "Profile"], ["overview", "Overview"], ["generate", "Build"], ["log", "Log"], ["settings", "Targets"], ["history", "History"]].map(([k, n]) => (
            <button key={k} onClick={() => setTab(k)} style={chip(tab === k)}
              className="px-3 py-1.5 rounded uppercase tracking-wide">{n}</button>
          ))}
        </div>


        {kindPicker && (() => {
          const ent = entries.find((x) => x.id === kindPicker.id);
          const st = ent && ent.sets[kindPicker.i];
          if (!st) return null;
          const choose = (k) => { setKind(kindPicker.id, kindPicker.i, k); setKindPicker(null); };
          return (
            <div onClick={() => setKindPicker(null)} style={{ position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "center",
              justifyContent: "center", padding: "20px" }}>
              <div onClick={(e) => e.stopPropagation()} style={{ ...panel, maxWidth: "420px", width: "100%" }}
                className="rounded-lg p-4">
                <div className="text-sm mb-1">Set type</div>
                <div style={{ color: c.faint }} className="text-xs mb-3">{ent.exercise}</div>

                <button onClick={() => choose(null)}
                  style={{ ...(st.kind ? { border: `1px solid ${c.line}`, color: c.muted } : { border: `1px solid ${c.accent}`, background: c.soft, color: c.accentText }), fontFamily: "inherit" }}
                  className="w-full rounded px-3 py-2.5 mb-2 text-left">
                  <div style={{ fontSize: "13px" }}>Working set</div>
                  <div style={{ color: c.faint, fontSize: "11px" }}>Numbered automatically from the sets that are not warm ups or techniques.</div>
                </button>

                {Object.keys(SET_KINDS).map((k) => (
                  <button key={k} onClick={() => choose(k)}
                    style={{ ...(st.kind === k ? { border: `1px solid ${c.accent}`, background: c.soft, color: c.accentText } : { border: `1px solid ${c.line}`, color: c.muted }), fontFamily: "inherit" }}
                    className="w-full rounded px-3 py-2.5 mb-2 text-left">
                    <div style={{ fontSize: "13px" }}>
                      <span style={{ color: c.warn }}>{SET_KINDS[k].code}</span>  {SET_KINDS[k].name}
                    </div>
                    <div style={{ color: c.faint, fontSize: "11px" }}>{SET_KINDS[k].what}</div>
                  </button>
                ))}

                <button onClick={() => setKindPicker(null)} style={primaryBtn}
                  className="w-full rounded py-2.5 text-xs uppercase tracking-wide mt-2">Close</button>
              </div>
            </div>
          );
        })()}

        {info && (
          <div onClick={() => setInfo(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...panel, maxWidth: "440px", width: "100%" }}
              className="rounded-lg p-4">
              <div className="text-sm mb-2.5">{info.title}</div>
              <div className="space-y-1.5">
                {info.points.map((pt, i) => {
                  const sub = typeof pt === "object";
                  const text = sub ? pt.text : pt;
                  return (
                    <div key={i} className="flex gap-2"
                      style={{ color: sub ? c.faint : c.muted, fontSize: "12px",
                        paddingLeft: sub ? "16px" : 0 }}>
                      <span style={{ color: sub ? c.faint : c.accentText }}>{sub ? "\u2013" : "\u2022"}</span>
                      <span>{text}</span>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setInfo(null)} style={primaryBtn}
                className="w-full rounded py-2.5 text-xs uppercase tracking-wide mt-4">Close</button>
            </div>
          </div>
        )}

        {doseInfo && (
          <div onClick={() => setDoseInfo(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...panel, maxWidth: "440px", width: "100%" }}
              className="rounded-lg p-4">
              <div className="text-sm mb-3">Volume landmarks</div>
              {[["MEV", "Minimum effective volume", "The least weekly work that still produces growth. Below this you are maintaining at best."],
                ["IED", "Ideal effective dose", "The middle of the productive band. Enough to drive growth without spending recovery you need elsewhere."],
                ["MRV", "Maximum recoverable volume", "The most weekly work you can recover from. Past this, added sets cost more than they return."]].map(([k, n, w]) => (
                <div key={k} style={{ borderTop: `1px solid ${c.line}` }} className="py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span style={{ color: c.accentText, fontSize: "13px" }}>{k}</span>
                    <span style={{ color: c.muted, fontSize: "12px" }}>{n}</span>
                  </div>
                  <div style={{ color: c.faint }} className="text-xs mt-1">{w}</div>
                </div>
              ))}
              <div style={{ color: c.faint, borderTop: `1px solid ${c.line}` }} className="text-xs pt-2.5 mt-1">
                Returns are not even across the band. Added sets do more just above MEV than they do
                approaching MRV, so IED sits nearer the lower end than the halfway set count.
              </div>
              <button onClick={() => setDoseInfo(false)} style={primaryBtn}
                className="w-full rounded py-2.5 text-xs uppercase tracking-wide mt-3">Close</button>
            </div>
          </div>
        )}

        {/* ---------------- RIR EXPLAINER ---------------- */}
        {rirInfo && (
          <div onClick={() => setRirInfo(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...panel, maxWidth: "440px", width: "100%" }}
              className="rounded-lg p-4">
              <div className="text-sm mb-1">Reps in reserve</div>
              <div style={{ color: c.faint }} className="text-xs mb-3">
                How many more reps you could have done. Recorded as a band, because estimates are
                sharp near failure and get vague past about three reps out.
              </div>
              {RIR_BANDS.map((b) => (
                <div key={b.id} style={{ borderTop: `1px solid ${c.line}` }} className="py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span style={{ color: c.accentText, fontSize: "14px" }}>{b.name}</span>
                    <span style={{ color: c.muted, fontSize: "12px" }}>{b.label}</span>
                    <span style={{ color: c.faint, fontSize: "11px", marginLeft: "auto" }}>
                      counts {b.factor === 1 ? "in full" : b.factor === 0.5 ? "as a half set" : "not at all"}
                    </span>
                  </div>
                  <div style={{ color: c.faint }} className="text-xs mt-1">{b.what}</div>
                  <div style={{ color: c.faint, opacity: 0.75 }} className="text-xs mt-0.5">{b.detail}</div>
                </div>
              ))}
              <button onClick={() => setRirInfo(false)} style={primaryBtn}
                className="w-full rounded py-2.5 text-xs uppercase tracking-wide mt-3">Close</button>
            </div>
          </div>
        )}

        {/* ---------------- CONFIRMATIONS ---------------- */}
        {(pending || confirmLog) && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div style={{ ...panel, maxWidth: "420px", width: "100%" }} className="rounded-lg p-4">
              {pending && !confirmLog && (
                <>
                  <div className="text-sm mb-1">You already have a session in the log</div>
                  <div style={{ color: c.faint }} className="text-xs mb-4">
                    {entries.length} {entries.length === 1 ? "exercise" : "exercises"}, {doneSets} of {totalSets} sets ticked off.
                    Add this new session to it, or replace it?
                  </div>
                  <button onClick={() => applyGenerated(pending, "add")}
                    style={primaryBtn} className="w-full rounded py-2.5 text-xs uppercase tracking-wide mb-2">
                    Add to the existing session
                  </button>
                  <button onClick={() => {
                      if (doneSets > 0) setConfirmLog(pending);
                      else applyGenerated(pending, "replace");
                    }}
                    style={{ border: `1px solid ${c.line}`, color: c.warn, fontFamily: "inherit" }}
                    className="w-full rounded py-2.5 text-xs uppercase tracking-wide mb-2">
                    Replace it
                  </button>
                  <button onClick={() => setPending(null)}
                    style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit" }}
                    className="w-full rounded py-2 text-xs uppercase tracking-wide">
                    Cancel
                  </button>
                </>
              )}

              {confirmLog && (
                <>
                  <div className="text-sm mb-1">You have {doneSets} completed {doneSets === 1 ? "set" : "sets"}</div>
                  <div style={{ color: c.faint }} className="text-xs mb-4">
                    Replacing the session will clear them. Log that work to your history first, or throw it away?
                  </div>
                  <button onClick={() => { commitSession(); applyGenerated(confirmLog, "replace"); }}
                    style={primaryBtn} className="w-full rounded py-2.5 text-xs uppercase tracking-wide mb-2">
                    Log the completed work, then replace
                  </button>
                  <button onClick={() => applyGenerated(confirmLog, "replace")}
                    style={{ border: `1px solid ${c.line}`, color: c.danger, fontFamily: "inherit" }}
                    className="w-full rounded py-2.5 text-xs uppercase tracking-wide mb-2">
                    Discard it and replace
                  </button>
                  <button onClick={() => { setConfirmLog(null); setPending(null); }}
                    style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit" }}
                    className="w-full rounded py-2 text-xs uppercase tracking-wide">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---------------- PROFILE ---------------- */}
        {tab === "profile" && (
          <div>
            <p style={{ color: c.faint }} className="text-xs mb-3">
              Who you are, what you are working around, and what you are actually chasing.
            </p>

            <div style={panel} className="rounded p-4 mb-4 space-y-4">
              <div style={head}>ABOUT YOU</div>

              <div>
                <label style={lab}>Name</label>
                <input value={profile.name} onChange={(e) => setField("name", e.target.value)}
                  style={input} className="w-full rounded px-2 py-2" />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label style={lab}>Date of birth</label>
                  <input type="date" value={profile.dob} onChange={(e) => setField("dob", e.target.value)}
                    style={input} className="w-full rounded px-2 py-2" />
                </div>
                <div className="flex-1">
                  <label style={lab}>Biological sex</label>
                  <div className="flex gap-2 flex-wrap">
                    {SEXES.map((x) => (
                      <button key={x} onClick={() => setField("sex", profile.sex === x ? "" : x)}
                        style={chip(profile.sex === x)} className="px-2.5 py-1.5 rounded text-xs">{x}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label style={lab}>Training experience</label>
                <div className="flex gap-2 flex-wrap">
                  {EXPERIENCE.map((x) => (
                    <button key={x.id} onClick={() => setField("experience", profile.experience === x.id ? "" : x.id)}
                      style={chip(profile.experience === x.id)} className="px-2.5 py-1.5 rounded text-xs">{x.name}</button>
                  ))}
                </div>
                {profile.experience && (
                  <div style={{ color: c.faint }} className="text-xs mt-1">
                    {(EXPERIENCE.find((x) => x.id === profile.experience) || {}).what}
                  </div>
                )}
              </div>

              <div>
                <label style={lab}>Availability</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((d) => (
                    <button key={d} onClick={() => toggleIn("availDays", d)}
                      style={chip(profile.availDays.indexOf(d) >= 0)}
                      className="px-2.5 py-1.5 rounded text-xs">{d}</button>
                  ))}
                </div>
                <input value={profile.availNote} onChange={(e) => setField("availNote", e.target.value)}
                  placeholder="Anything else about your week, session length, travel"
                  style={{ ...input, marginTop: "8px", fontSize: "13px" }} className="w-full rounded px-2 py-2" />
                {profile.availDays.length > 0 && (
                  <div style={{ color: c.faint }} className="text-xs mt-1">
                    {profile.availDays.length} {profile.availDays.length === 1 ? "day" : "days"} a week.
                  </div>
                )}
              </div>

              <div>
                <label style={lab}>Injuries, current or ones you work around</label>
                <div className="flex gap-2 flex-wrap">
                  {INJURY_SITES.map((x) => (
                    <button key={x} onClick={() => toggleIn("injuries", x)}
                      style={chip(profile.injuries.indexOf(x) >= 0)}
                      className="px-2.5 py-1.5 rounded text-xs">{x}</button>
                  ))}
                </div>
                <input value={profile.injuryNote} onChange={(e) => setField("injuryNote", e.target.value)}
                  placeholder="What aggravates it, what you avoid, where it is at"
                  style={{ ...input, marginTop: "8px", fontSize: "13px" }} className="w-full rounded px-2 py-2" />
              </div>

              <div>
                <label style={lab}>Medical conditions</label>
                <div className="flex gap-2 flex-wrap">
                  {CONDITIONS.map((x) => (
                    <button key={x} onClick={() => toggleIn("conditions", x)}
                      style={chip(profile.conditions.indexOf(x) >= 0)}
                      className="px-2.5 py-1.5 rounded text-xs">{x}</button>
                  ))}
                </div>
                <input value={profile.conditionNote} onChange={(e) => setField("conditionNote", e.target.value)}
                  placeholder="Medications, clearances, anything a coach should know"
                  style={{ ...input, marginTop: "8px", fontSize: "13px" }} className="w-full rounded px-2 py-2" />
                {(profile.conditions.length > 0 || profile.injuries.length > 0) && (
                  <div style={{ color: c.faint }} className="text-xs mt-2">
                    This sits here as context. It does not filter exercises on its own, and it is not
                    a substitute for clearance from your doctor or physio.
                  </div>
                )}
              </div>
            </div>

            {/* ---- goals ---- */}
            <div style={panel} className="rounded p-4 mb-4 space-y-4">
              <div style={head}>WHAT YOU ARE CHASING</div>

              <div>
                <label style={lab}>Pick everything that applies</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.keys(GOALS).map((g) => (
                    <button key={g} onClick={() => toggleGoal(g)} style={chip(profile.goals.indexOf(g) >= 0)}
                      className="px-2.5 py-1.5 rounded text-xs tracking-wide">{g}</button>
                  ))}
                </div>
                <div className="mt-2 space-y-1">
                  {Object.keys(GOALS).filter((g) => profile.goals.indexOf(g) >= 0).map((g) => (
                    <div key={g} style={{ color: c.faint }} className="text-xs">
                      <span style={{ color: c.muted }}>{GOALS[g].name}:</span> {GOALS[g].what}
                    </div>
                  ))}
                </div>
              </div>

              {profile.goals.length > 1 && (
                <div>
                  <label style={lab}>Order them. The top one wins when they conflict.</label>
                  {profile.goals.map((g, i) => (
                    <div key={g} style={{ border: `1px solid ${c.line}` }}
                      className="flex items-center justify-between gap-2 rounded px-3 py-2 mb-1.5">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span style={{ color: c.accentText, fontSize: "13px" }}>{i + 1}</span>
                        <span className="text-sm truncate">{GOALS[g].name}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => moveGoal(g, -1)} disabled={i === 0}
                          style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit", opacity: i === 0 ? 0.3 : 1 }}
                          className="px-2 py-1 rounded text-xs">Up</button>
                        <button onClick={() => moveGoal(g, 1)} disabled={i === profile.goals.length - 1}
                          style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit", opacity: i === profile.goals.length - 1 ? 0.3 : 1 }}
                          className="px-2 py-1 rounded text-xs">Down</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {profile.goals.length > 0 && (
                <div>
                  <label style={lab}>How you want each one measured</label>
                  <div style={{ color: c.faint }} className="text-xs mb-2">
                    Pick the ones that mean something to you. One or two per goal beats all of them.
                  </div>
                  {profile.goals.map((g) => (
                    <div key={g} className="mb-3">
                      <div style={{ ...head, marginBottom: "6px" }}>{g}</div>
                      <div className="flex gap-2 flex-wrap">
                        {MEASURES[g].map((m) => (
                          <button key={m} onClick={() => toggleMeasure(g, m)}
                            style={chip((profile.measures[g] || []).indexOf(m) >= 0)}
                            className="px-2.5 py-1.5 rounded text-xs">{m}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ color: c.faint }} className="text-xs">
              Saved automatically and carried into future sessions.
            </div>
          </div>
        )}

        {/* ---------------- OVERVIEW ---------------- */}
        {tab === "overview" && (
          <div>
          <p style={{ color: c.faint }} className="text-xs mb-3">
            Where every body part sits against its weekly volume thresholds, right now.
          </p>
          <div style={panel} className="rounded-lg p-3 relative">
            <Radar muscles={MUSCLE_ORDER} showQuadrants />
            {hover && (() => {
              const r = rows.find((x) => x.muscle === hover);
              return r ? (
                <div style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
                  className="absolute top-3 right-3 text-xs rounded px-3 py-2">
                  <div>{r.muscle}</div>
                  <div style={{ color: c.faint }}>{r.sets} sets, MEV {r.mev}, MRV {r.mrv}</div>
                </div>
              ) : null;
            })()}
            <div style={{ color: c.muted }} className="flex justify-between text-xs mt-2 px-1">
              <span>{rows.filter((r) => r.zone === "in").length} of {MUSCLE_ORDER.length} in the zone</span>
              <span>{effective} effective sets</span>
            </div>
            <div style={{ color: c.faint }} className="text-xs mt-1 px-1">
              {rows.filter((r) => r.zone === "none").length} untouched, {rows.filter((r) => r.zone === "under").length} under MEV, {rows.filter((r) => r.zone === "over").length} past MRV
            </div>
          </div>
          </div>
        )}

        {/* ---------------- GENERATE ---------------- */}
        {tab === "generate" && (
          <div>
            <p style={{ color: c.faint }} className="text-xs mb-3">
              Build a session from what you need, what you have and how you want to train.
            </p>
            <div style={panel} className="rounded p-4 mb-4 space-y-5">
              <div>
                <label style={lab}>Focus</label>
                {GROUPS.map((g) => (
                  <div key={g.name} className="mb-2.5">
                    <div style={{ ...head, marginBottom: "6px" }}>{g.name.toUpperCase()}</div>
                    <div className="flex gap-2 flex-wrap">
                      {g.muscles.map((m) => {
                        const on = genMuscles.indexOf(m) >= 0;
                        return (
                          <button key={m} onClick={() => setGenMuscles(on ? genMuscles.filter((x) => x !== m) : [...genMuscles, m])}
                            style={chip(on)} className="px-2.5 py-1.5 rounded text-xs">{m}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="mt-3">
                  <div style={{ ...head, marginBottom: "6px" }}>CARDIO</div>
                  <div className="flex gap-2 flex-wrap">
                    {CARDIO_MODES.map((m) => {
                      const on = cardioModes.indexOf(m.id) >= 0;
                      return (
                        <button key={m.id}
                          onClick={() => {
                            setCardioModes(on ? cardioModes.filter((x) => x !== m.id) : [...cardioModes, m.id]);
                            if (!on && m.equip.indexOf("cardio") >= 0 && kit.indexOf("cardio") < 0) setKit([...kit, "cardio"]);
                          }}
                          style={chip(on)} className="px-2.5 py-1.5 rounded text-xs">{m.name}</button>
                      );
                    })}
                  </div>
                  <div style={{ color: c.faint }} className="text-xs mt-1">
                    Picking a machine switches on the cardio equipment for you.
                  </div>
                </div>
              </div>

              {genMuscles.length > 0 && (
                <div>
                  <label style={lab}>Location</label>
                  <div className="flex gap-2 flex-wrap">
                    {LOCATIONS.map((l) => (
                      <button key={l.id} onClick={() => pickLocation(l.id)} style={chip(location === l.id)}
                        className="px-2.5 py-1.5 rounded text-xs">{l.name}</button>
                    ))}
                  </div>
                  {location && (
                    <div style={{ color: c.faint }} className="text-xs mt-2">
                      {(LOCATIONS.find((l) => l.id === location) || {}).what} Equipment below is set to match, and stays editable.
                    </div>
                  )}
                </div>
              )}

              {location && (
                <div>
                  <label style={lab}>Equipment</label>
                  <div className="flex gap-2 flex-wrap">
                    {EQUIPMENT.map((e) => {
                      const on = kit.indexOf(e.id) >= 0;
                      return (
                        <button key={e.id} onClick={() => {
                          const next = on ? kit.filter((x) => x !== e.id) : [...kit, e.id];
                          setKit(next);
                          if (e.id === "cardio" && on) setCardioModes(cardioModes.filter((m) =>
                            (CARDIO_MODES.find((cm) => cm.id === m) || { equip: [] }).equip.indexOf("cardio") < 0));
                        }} style={chip(on)} className="px-2.5 py-1.5 rounded text-xs">{e.name}</button>
                      );
                    })}
                  </div>
                  <div style={{ color: c.faint }} className="text-xs mt-1">
                    {EXERCISES.filter((e) => e.metric !== "cardio" && available(e, kit)).length} lifts available.
                  </div>

                  {kit.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div style={head}>WHAT THESE MEAN</div>
                      {EQUIPMENT.filter((e) => kit.indexOf(e.id) >= 0).map((e) => (
                        <div key={e.id} style={{ color: c.faint }} className="text-xs">
                          <span style={{ color: c.muted }}>{e.name}:</span> {e.what}
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}

              {location && kit.length >= 0 && (
                <div>
                  <label style={lab}>Structure, pick as many as you want to blend</label>
                  <div className="flex gap-2 flex-wrap">
                    {Object.keys(STRUCTURES).map((k) => {
                      const on = genStructures.indexOf(k) >= 0;
                      return (
                        <button key={k} onClick={() => setGenStructures(on ? genStructures.filter((x) => x !== k) : [...genStructures, k])}
                          style={chip(on)} className="px-2.5 py-1.5 rounded text-xs">{STRUCTURES[k].name}</button>
                      );
                    })}
                  </div>
                  <div className="mt-2 space-y-1">
                    {genStructures.map((k) => (
                      <div key={k} style={{ color: c.faint }} className="text-xs">
                        <span style={{ color: c.muted }}>{STRUCTURES[k].name}:</span> {STRUCTURES[k].note}
                      </div>
                    ))}
                    {genStructures.length > 1 && (
                      <div style={{ color: c.accentText }} className="text-xs pt-1">
                        Blended: compounds run straight, isolations get grouped, a circuit lands as the finisher.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {location && cardioModes.length > 0 && (
                <div>
                  <label style={lab}>Conditioning format</label>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setConditioning("")} style={chip(conditioning === "")}
                      className="px-2.5 py-1.5 rounded text-xs">None</button>
                    {Object.keys(CONDITIONING).map((k) => (
                      <button key={k} onClick={() => setConditioning(k)} style={chip(conditioning === k)}
                        className="px-2.5 py-1.5 rounded text-xs">{CONDITIONING[k].name}</button>
                    ))}
                  </div>
                  {conditioning && (
                    <div style={{ color: c.faint }} className="text-xs mt-2">
                      <span style={{ color: c.muted }}>{CONDITIONING[conditioning].name}:</span> {CONDITIONING[conditioning].note}
                      <div style={{ color: c.accentText }} className="mt-0.5">{CONDITIONING[conditioning].prescribe}</div>
                    </div>
                  )}
                </div>
              )}

              {location && genStructures.length > 0 && (
                <div>
                  <label style={lab}>Overload techniques</label>
                  <div className="flex gap-2 flex-wrap">
                    {Object.keys(TECHNIQUES).map((k) => {
                      const on = genIntensity.indexOf(k) >= 0;
                      return (
                        <button key={k} onClick={() => setGenIntensity(on ? genIntensity.filter((x) => x !== k) : [...genIntensity, k])}
                          style={chip(on)} className="px-2.5 py-1.5 rounded text-xs">{TECHNIQUES[k].name}</button>
                      );
                    })}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {genIntensity.map((k) => (
                      <div key={k} style={{ color: c.faint }} className="text-xs">
                        <span style={{ color: c.muted }}>{TECHNIQUES[k].name}:</span> {TECHNIQUES[k].note}
                        <div style={{ color: c.faint, opacity: 0.8 }}>Needs: {TECHNIQUES[k].needs}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  const next = seed + 1;
                  setSeed(next);
                  setSession(generateSession({
                    muscles: genMuscles, kit, volume, landmarks,
                    structures: genStructures, intensity: genIntensity, history: lastEffort, seed: next,
                    cardioModes, conditioning, gym: gymFor(location),
                  }));
                }}
                disabled={!genMuscles.length || !location || !genStructures.length}
                style={{ ...primaryBtn, opacity: genMuscles.length && location && genStructures.length ? 1 : 0.4 }}
                className="w-full rounded py-3 text-xs uppercase tracking-wide">
                {session ? "Generate again" : "Generate session"}
              </button>
            </div>

            {session && (
              <div style={panel} className="rounded p-4">
                <div className="flex justify-between items-baseline mb-3">
                  <div style={{ color: c.muted }} className="text-xs uppercase tracking-wide">Your session</div>
                  <div style={{ color: c.faint }} className="text-xs">{session.totalSets} sets</div>
                </div>

                {session.groups.length === 0 && (
                  <div style={{ color: c.faint }} className="text-xs">Nothing to prescribe. Everything selected is at MRV.</div>
                )}

                {session.groups.map((g, gi) => (
                  <div key={gi} style={{ borderTop: gi ? `1px solid ${c.line}` : "none" }} className="py-3">
                    <div style={{ ...head, marginBottom: "6px" }}>
                      {STRUCTURES[g.structure].name.toUpperCase()}
                      {g.items.length > 1 && g.restWithin === 0 ? " · NO REST WITHIN" : g.items.length > 1 ? ` · ${fmtRest(g.restWithin)} WITHIN` : ""}
                    </div>
                    {g.items.map((b, bi) => {
                      const tag = g.structure === "straight" ? `${gi + 1}.` : `${String.fromCharCode(65 + gi)}${bi + 1}.`;
                      return (
                        <div key={bi} className={bi ? "mt-2" : ""}>
                          <div className="flex justify-between gap-3 text-sm">
                            <div className="min-w-0"><span style={{ color: c.faint }}>{tag} </span>{b.exercise.name}</div>
                            <div className="shrink-0" style={{ color: c.accentText }}>
                              {b.sets} x {b.target || b.lo}
                              <span style={{ color: c.faint }}> ({b.lo}-{b.hi})</span>
                            </div>
                          </div>
                          <div style={{ color: c.faint }} className="text-xs mt-0.5 pl-5">
                            {b.instruction || (b.load.load === "" ? kitLabel(b.exercise) : `${b.load.load}kg`)}
                            {" · RIR "}{b.rir} · {b.muscle}
                          </div>
                          {(b.capped || b.drifted) && (
                            <button onClick={() => setInfo(loadSwapNote(b.wanted, b.load.load, b.wantedReps, b.target))}
                              style={{ color: c.warn, background: "transparent", border: "none",
                                font: "inherit", padding: 0, textAlign: "left", cursor: "pointer" }}
                              className="text-xs mt-0.5 pl-5">
                              {b.capped ? "Heaviest available here" : "Reps adjusted for the load"} ⓘ
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ color: c.ring }} className="text-xs mt-2">
                      Rest {fmtRest(g.restAfter)} {g.structure === "circuit" ? "between rounds" : g.items.length > 1 ? "after the group" : "between sets"}
                    </div>
                  </div>
                ))}

                {session.cardioBlock && (
                  <div style={{ borderTop: `2px solid ${c.line}` }} className="pt-3 mt-1">
                    <div style={{ ...head, marginBottom: "6px" }}>CONDITIONING</div>
                    <div className="flex justify-between gap-3 text-sm">
                      <div>{session.cardioBlock.mode.name}</div>
                      <div style={{ color: c.accentText }}>{session.cardioBlock.spec.name}</div>
                    </div>
                    <div style={{ color: c.accentText }} className="text-xs mt-0.5">{session.cardioBlock.spec.prescribe}</div>
                    <div style={{ color: c.faint }} className="text-xs mt-0.5">{session.cardioBlock.spec.note}</div>
                  </div>
                )}

                {session.overload.length > 0 && (
                  <div style={{ borderTop: `2px solid ${c.line}` }} className="pt-3 mt-1">
                    <div style={{ ...head, marginBottom: "8px" }}>OVERLOAD</div>
                    {session.overload.map((o, i) => (
                      <div key={i} className={i ? "mt-2.5" : ""}>
                        {o.exercise ? (
                          <>
                            <div className="text-sm" style={{ color: c.warn }}>
                              {TECHNIQUES[o.key].name} on {o.exercise}
                            </div>
                            <div style={{ color: c.faint }} className="text-xs mt-0.5">{TECHNIQUES[o.key].note}</div>
                          </>
                        ) : (
                          <div style={{ color: c.faint }} className="text-xs">
                            {TECHNIQUES[o.key].name} skipped, {o.reason}. Needs: {TECHNIQUES[o.key].needs}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {session.skipped.length > 0 && (
                  <div style={{ color: c.faint, borderTop: `1px solid ${c.line}` }} className="text-xs pt-3 mt-3">
                    Skipped: {session.skipped.join(", ")}.
                  </div>
                )}

                {session.groups.length > 0 && (
                  <button
                    onClick={() => {
                      if (entries.length > 0) setPending(session);
                      else applyGenerated(session, "replace");
                    }}
                    style={primaryBtn} className="w-full rounded py-2.5 text-xs uppercase tracking-wide mt-4">
                    Send to log
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------------- LOG ---------------- */}
        {tab === "log" && (
          <div>
            <p style={{ color: c.faint }} className="text-xs mb-3">
              Only ticked sets count toward your volume.
            </p>
            {sessionMuscles.length > 0 && (
              <div style={{ ...panel, position: "sticky", top: 0, zIndex: 30,
                boxShadow: `0 8px 16px -8px ${c.bg}` }}
                className="rounded-lg px-2 pt-2 pb-2 mb-4">
                <div className="flex justify-between items-baseline px-1 pb-1">
                  <div style={head}>THIS SESSION</div>
                  <div style={{ color: c.faint }} className="text-xs">
                    {totalSets > 0 ? `${Math.round((doneSets / totalSets) * 100)}%` : ""}
                    {tonnage > 0 && ` \u00b7 ${Math.round(tonnage)}kg`}
                    {repWork > 0 && ` \u00b7 ${repWork} reps`}
                  </div>
                </div>
                <Radar muscles={sessionMuscles} showQuadrants={false} markers={setMarkers} compact />

                {totalSets > 0 && (
                  <div className="px-1 pt-1.5">
                    {/* One segment per exercise, sized by its share of the session.
                        The scale runs past 100 so going beyond the prescription shows. */}
                    <div style={{ position: "relative", height: "18px", borderRadius: "4px",
                      border: `1px solid ${c.line}`, overflow: "hidden", display: "flex" }}>
                      <div style={{ position: "absolute", left: `${(100 / 130) * 100}%`, top: 0, bottom: 0,
                        width: "1px", background: c.ring, opacity: 0.8, zIndex: 2 }} />
                      {sessionWork.map((x, i) => (
                        <div key={x.id}
                          title={`${x.name}: ${Math.round(x.amount)}${x.unit}`}
                          style={{ width: `${Math.min(100, ((x.done / totalSets) * 100 / 130) * 100)}%`,
                            background: c.accent, opacity: 0.9 - (i % 3) * 0.2,
                            borderRight: x.done > 0 ? `1px solid ${c.panel}` : "none",
                            transition: "width 0.35s ease" }} />
                      ))}
                    </div>
                    {sessionWork.some((x) => x.done > 0) && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1"
                        style={{ color: c.faint, fontSize: "10px" }}>
                        {setMarkers.length > 0 && (
                          <span style={{ color: c.accentText }}>
                            {setMarkers[setMarkers.length - 1].num}. {setMarkers[setMarkers.length - 1].muscle}{" "}
                            {setMarkers[setMarkers.length - 1].pct}% {setMarkers[setMarkers.length - 1].toward}
                          </span>
                        )}
                        {sessionWork.filter((x) => x.done > 0).map((x) => (
                          <span key={x.id}>{x.name} {Math.round(x.amount)}{x.unit}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {entries.length > 0 && (
              <div className="mb-5">

                {logGroups.map((grp) => (
                  <div key={grp.key} className="mb-4">
                    {grp.structure && (
                      <div style={{ ...head, marginBottom: "6px" }}>
                        {grp.structure === "conditioning" ? "CONDITIONING" : (
                          <button onClick={() => setInfo({
                            title: STRUCTURES[grp.structure].name,
                            points: STRUCTURES[grp.structure].points })}
                            style={{ background: "transparent", border: "none", color: c.ring,
                              font: "inherit", padding: 0, cursor: "pointer", letterSpacing: "2.5px" }}>
                            {STRUCTURES[grp.structure].name.toUpperCase()} ⓘ
                          </button>
                        )}
                        {grp.items.length > 1 && (grp.items[0].restWithin === 0 ? " · NO REST WITHIN" : ` · ${fmtRest(grp.items[0].restWithin)} WITHIN`)}
                      </div>
                    )}

                    {grp.items.map((e) => {
                      const alts = alternativesFor(e.exercise, kit);
                      const cardio = e.metric === "cardio";
                      const timed = e.metric === "time";
                      const label = e.groupLetter && e.groupSize > 1 ? `${e.groupLetter}${e.position}. ` : "";
                      return (
                        <div key={e.id} style={{ ...panel, position: "relative", overflow: "hidden" }}
                          className="rounded-lg p-3 mb-2">
                          {/* the card colours in as its sets are ticked */}
                          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0,
                            width: `${(e.sets.filter((x) => x.done).length / (e.sets.length || 1)) * 100}%`,
                            background: c.accent, opacity: 0.07, pointerEvents: "none",
                            transition: "width 0.35s ease" }} />
                          <div style={{ position: "relative" }}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <div style={{ fontSize: "16px", fontWeight: 700 }}>
                                {label && <span style={{ color: c.faint, fontWeight: 400 }}>{label}</span>}{e.exercise}
                              </div>
                              <div style={{ color: c.faint }} className="text-xs mt-0.5">
                                {e.equip && e.equip.length ? e.equip.map((x) => EQUIP_NAME[x]).join(" + ") : "Bodyweight"}
                                {e.primary.length > 0 && ` · ${e.primary.join(", ")}`}
                              </div>
                              {e.instruction && (
                                <div style={{ color: c.accentText }} className="text-xs mt-1">
                                  {e.instruction}
                                </div>
                              )}
                              {e.swap && (
                                <button onClick={() => setInfo(loadSwapNote(e.swap.wanted, e.swap.actual, e.swap.fromReps, e.swap.toReps))}
                                  style={{ color: c.warn, background: "transparent", border: "none",
                                    font: "inherit", padding: 0, textAlign: "left", cursor: "pointer" }}
                                  className="text-xs mt-0.5">
                                  Reps adjusted for the load ⓘ
                                </button>
                              )}
                              {e.conditioning && CONDITIONING[e.conditioning] && (
                                <div style={{ color: c.accentText }} className="text-xs mt-0.5">
                                  {CONDITIONING[e.conditioning].name}: {CONDITIONING[e.conditioning].prescribe}
                                </div>
                              )}

                            </div>
                            <button onClick={() => setEntries(entries.filter((x) => x.id !== e.id))}
                              style={{ border: `1px solid ${c.line}`, color: c.danger, fontFamily: "inherit" }}
                              className="shrink-0 px-2 py-1 rounded text-xs">Remove</button>
                          </div>

                          {e.technique && TECHNIQUES[e.technique] && (
                            <div style={{ border: `1px solid ${c.line}`, borderLeft: `2px solid ${c.warn}` }}
                              className="rounded px-2.5 py-1.5 mb-2">
                              <div style={{ color: c.warn, fontSize: "12px" }}>
                                {TECHNIQUES[e.technique].short}. {TECHNIQUES[e.technique].name}
                              </div>
                              <div style={{ color: c.faint }} className="text-xs mt-0.5">
                                {TECHNIQUES[e.technique].note}
                              </div>
                            </div>
                          )}

                          {CUES[e.exercise] && (
                            <div className="mb-2">
                              <div className="flex gap-2">
                                <button onClick={() => setOpenCues(openCues.indexOf(e.id) >= 0
                                    ? openCues.filter((x) => x !== e.id) : [...openCues, e.id])}
                                  style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit" }}
                                  className="flex-1 rounded py-1.5 text-xs">
                                  How to do it
                                </button>
                                <button onClick={() => setOpenNotes(openNotes.indexOf(e.id) >= 0
                                    ? openNotes.filter((x) => x !== e.id) : [...openNotes, e.id])}
                                  style={{ border: `1px solid ${c.line}`, color: c.muted, fontFamily: "inherit" }}
                                  className="flex-1 rounded py-1.5 text-xs">
                                  Notes{(exerciseNotes[e.exercise] || []).length > 0
                                    ? ` (${(exerciseNotes[e.exercise] || []).length})` : ""}
                                </button>
                              </div>
                              {openCues.indexOf(e.id) >= 0 && (
                                <div className="mt-2 space-y-1.5 px-1">
                                  {CUES[e.exercise].map((line, ci) => (
                                    <div key={ci} style={{ color: c.faint }} className="text-xs flex gap-2">
                                      <span style={{ color: c.accentText }}>•</span>
                                      <span><span style={{ color: c.muted }}>{CUE_LABELS[ci]}:</span> {line}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {openNotes.indexOf(e.id) >= 0 && (
                                <div className="mt-2">
                                  <div className="flex gap-2">
                                    <input value={noteDraft[e.exercise] || ""}
                                      onChange={(ev) => setNoteDraft({ ...noteDraft, [e.exercise]: ev.target.value })}
                                      placeholder="Note for this exercise"
                                      style={{ ...input, fontSize: "13px", padding: "7px 9px" }}
                                      className="flex-1 rounded" />
                                    <button onClick={() => addNote(e.exercise)}
                                      disabled={!(noteDraft[e.exercise] || "").trim()}
                                      style={{ ...primaryBtn, opacity: (noteDraft[e.exercise] || "").trim() ? 1 : 0.4 }}
                                      className="shrink-0 px-3 rounded text-xs uppercase">Save</button>
                                  </div>
                                  {(exerciseNotes[e.exercise] || []).length === 0 ? (
                                    <div style={{ color: c.faint }} className="text-xs mt-2">
                                      Nothing yet. Notes stay with this exercise and appear every time it comes up.
                                    </div>
                                  ) : (
                                    <div className="mt-2 space-y-1.5">
                                      {(exerciseNotes[e.exercise] || []).map((n, ni) => (
                                        <div key={ni} className="flex gap-2 items-start">
                                          <span style={{ color: c.faint, fontSize: "10px", whiteSpace: "nowrap", paddingTop: "2px" }}>
                                            {fmtDay(n.date)}
                                          </span>
                                          <span style={{ color: c.muted, fontSize: "12px" }} className="flex-1">{n.text}</span>
                                          <button onClick={() => removeNote(e.exercise, ni)}
                                            style={{ color: c.faint, background: "transparent", border: "none",
                                              fontFamily: "inherit", fontSize: "14px", padding: 0 }}>×</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {alts.length > 0 && (
                            <div className="mb-2">
                              <select value="" onChange={(ev) => { if (ev.target.value) swapExercise(e.id, ev.target.value); }}
                                style={{ ...input, fontSize: "12px", padding: "7px 8px" }} className="w-full rounded">
                                <option value="">Alternate Exercise(s)</option>
                                {alts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                              </select>
                            </div>
                          )}

                          <div className="flex gap-2 items-center px-1 pb-1" style={{ color: c.faint, fontSize: "10px", letterSpacing: "1px" }}>
                            <div style={{ width: "22px" }}>SET</div>
                            {cardio ? (
                              <><div className="flex-1 text-center">KM</div>
                                <div className="flex-1 text-center">MIN</div>
                                <div className="flex-1 text-center">CAL</div></>
                            ) : (
                              <><div style={{ width: "62px", textAlign: "center" }}>
                                  <button onClick={() => setInfo({ title: "Kg", points: [
                                    "Kilograms, written kg.",
                                    "The external load moved in one rep.",
                                    "Bodyweight is not included.",
                                    { text: "Push ups, chin ups and bodyweight squats are left blank." },
                                    "Bodyweight plus added load counts only what you added.",
                                    { text: "A dip wearing a 10kg belt reads 10kg." },
                                    "Dumbbells count both together.",
                                    { text: "A pair of 20kg dumbbells reads 40kg, not 20kg." },
                                    "Barbells count the bar plus every plate on it.",
                                    { text: "A 20kg bar with 20kg a side reads 60kg." },
                                    "Machines count the load you select.",
                                    { text: "Plate loaded machines count the carriage starting weight plus the plates added." },
                                    "Cable stacks vary between machines.",
                                    { text: "Use the same machine each time so the number means the same thing. If you cannot, go by RIR." },
                                  ] })}
                                    style={{ background: "transparent", border: "none", color: c.faint,
                                      fontFamily: "inherit", fontSize: "10px", letterSpacing: "1px", padding: 0, cursor: "pointer" }}>
                                    KG ⓘ
                                  </button>
                                </div>
                                <div className="flex-1 text-center">{timed ? "SEC" : "REPS"}</div>
                                <div className="flex-1 text-center">
                                  <button onClick={() => setRirInfo(true)}
                                    style={{ background: "transparent", border: "none", color: c.faint,
                                      fontFamily: "inherit", fontSize: "10px", letterSpacing: "1px", padding: 0, cursor: "pointer" }}>
                                    RIR ⓘ
                                  </button>
                                </div></>
                            )}
                            {cardio && <div style={{ width: "34px" }}></div>}
                            <div style={{ width: "18px" }}></div>
                          </div>

                          {e.sets.map((s, i) => (
                            <React.Fragment key={i}>
                            <div className="flex gap-2 items-center mb-1.5" style={{ opacity: s.done ? 0.55 : 1 }}>
                              <button onClick={() => setKindPicker({ id: e.id, i })}
                                style={{ width: "26px", height: "28px", borderRadius: "5px",
                                  border: `1px solid ${s.kind ? c.warn : c.line}`,
                                  background: "transparent", padding: 0,
                                  color: s.kind ? c.warn : c.muted,
                                  fontFamily: "inherit", fontSize: "12px" }}>
                                {s.kind ? SET_KINDS[s.kind].code : workingNumber(e.sets, i)}
                              </button>
                              {cardio ? (
                                <>
                                  <div className="flex-1"><input type="number" inputMode="decimal" value={s.distance} onFocus={selectAll}
                                    onChange={(ev) => updateSet(e.id, i, { distance: ev.target.value })} style={cell} /></div>
                                  <div className="flex-1"><input type="number" inputMode="decimal" value={s.reps} onFocus={selectAll}
                                    onChange={(ev) => updateSet(e.id, i, { reps: ev.target.value })} style={cell} /></div>
                                  <div className="flex-1"><input type="number" inputMode="numeric" value={s.calories} onFocus={selectAll}
                                    onChange={(ev) => updateSet(e.id, i, { calories: ev.target.value })} style={cell} /></div>
                                  <button onClick={() => toggleDone(e.id, i)}
                                    style={{ width: "34px", height: "30px", borderRadius: "5px",
                                      border: `1px solid ${s.done ? c.accent : c.line}`,
                                      background: s.done ? c.accent : "transparent",
                                      color: s.done ? c.bg : c.faint,
                                      fontFamily: "inherit", fontSize: "13px" }}>\u2713</button>
                                </>
                              ) : (
                                <>
                                  <div style={{ width: "62px" }}><input type="number" inputMode="decimal" value={s.weight} onFocus={selectAll}
                                    onChange={(ev) => updateSetAndBelow(e.id, i, { weight: ev.target.value })} style={cell} /></div>
                                  <div className="flex-1"><input type="number" inputMode="numeric" value={s.reps} onFocus={selectAll}
                                    onChange={(ev) => updateSetAndBelow(e.id, i, { reps: ev.target.value })} style={cell} /></div>
                                  <div className="flex-1">
                                    <select value={s.rir || ""}
                                      onChange={(ev) => recordRir(e.id, i, ev.target.value)}
                                      style={{ ...cell, appearance: "none", textAlignLast: "center",
                                        borderColor: s.done ? c.accent : c.line,
                                        color: s.done ? c.accentText : c.faint }}>
                                      <option value="">{s.targetRir || "-"}</option>
                                      {RIR_BANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                  </div>
                                </>
                              )}
                              <button onClick={() => removeSet(e.id, i)}
                                style={{ width: "18px", color: c.faint, background: "transparent", border: "none", fontFamily: "inherit", fontSize: "16px" }}>×</button>
                            </div>
                            {!cardio && (
                              <RestBar c={c} armed={!!s.done && s.seq === latestSeq && i < e.sets.length - 1}
                                window={restWindow(e.structure || "straight", (e.secondary || []).length >= 2)}
                                onElapsed={(secs) => updateSet(e.id, i, { rest: secs })} />
                            )}
                            </React.Fragment>
                          ))}

                          <button onClick={() => addSet(e.id)}
                            style={{ border: `1px dashed ${c.line}`, color: c.muted, fontFamily: "inherit" }}
                            className="w-full rounded py-1.5 text-xs mt-1">Add set</button>
                          </div>
                        </div>
                      );
                    })}


                  </div>
                ))}

              </div>
            )}

            {doneSets > 0 && (
              <button onClick={() => { commitSession(); setEntries([]); setOverload([]); setTickSeq(0); }}
                style={primaryBtn} className="w-full rounded py-3 text-xs uppercase tracking-wide mb-5">
                Log session, {doneSets} completed {doneSets === 1 ? "set" : "sets"}
              </button>
            )}

            {/* Add exercise sits below the session */}
            <div style={panel} className="rounded p-4 space-y-3">
              <div style={{ color: c.muted }} className="text-xs uppercase tracking-wide">Add an exercise</div>
              <div className="flex gap-2 flex-wrap">
                {[["kit", "My equipment"], ["all", "All equipment"]].map(([k, n]) => (
                  <button key={k} onClick={() => {
                    setAddFilter(k);
                    const pool = k === "kit" ? EXERCISES.filter((e) => exerciseAvailable(e, kit, cardioModes)) : EXERCISES;
                    if (!pool.find((x) => x.name === form.exercise) && pool.length) setForm({ ...form, exercise: pool[0].name });
                  }} style={chip(addFilter === k)} className="px-2.5 py-1 rounded text-xs">{n}</button>
                ))}
              </div>
              <div>
                <label style={lab}>Exercise</label>
                <select value={form.exercise} onChange={(e) => setForm({ ...form, exercise: e.target.value })}
                  style={input} className="w-full rounded px-2 py-2">
                  {GROUPS.map((g) => {
                    const inGroup = addPool.filter((e) => e.primary.length && g.muscles.indexOf(e.primary[0]) >= 0);
                    return inGroup.length ? (
                      <optgroup key={g.name} label={g.name}>
                        {inGroup.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
                      </optgroup>
                    ) : null;
                  })}
                  {(() => {
                    const cardioList = addPool.filter((e) => e.metric === "cardio");
                    return cardioList.length ? (
                      <optgroup label="Conditioning">
                        {cardioList.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
                      </optgroup>
                    ) : null;
                  })()}
                </select>
                {(() => {
                  const ex = EXERCISES.find((e) => e.name === form.exercise);
                  return ex ? (
                    <div style={{ color: c.faint }} className="text-xs mt-1">
                      {kitLabel(ex)}
                      {ex.primary.length > 0 && `. ${ex.primary.join(", ")} full`}
                      {ex.secondary.length > 0 && `, ${ex.secondary.join(", ")} half`}
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label style={lab}>Sets</label>
                  <input type="number" inputMode="numeric" value={form.sets} onFocus={selectAll}
                    onChange={(e) => setForm({ ...form, sets: e.target.value })} style={input} className="w-full rounded px-2 py-2" />
                </div>
                <div className="flex-1">
                  <label style={lab}>Reps</label>
                  <input type="number" inputMode="numeric" value={form.reps} onFocus={selectAll}
                    onChange={(e) => setForm({ ...form, reps: e.target.value })} style={input} className="w-full rounded px-2 py-2" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label style={lab}>Weight</label>
                  <input type="number" inputMode="decimal" value={form.weight} onFocus={selectAll}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })} style={input} className="w-full rounded px-2 py-2" />
                </div>
                <div className="flex-1">
                  <label style={lab}>RIR</label>
                  <select value={form.rir} onChange={(e) => setForm({ ...form, rir: e.target.value })}
                    style={input} className="w-full rounded px-2 py-2">
                    {RIR_BANDS.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}, {b.label.toLowerCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button onClick={addExercise} disabled={!form.sets}
                style={{ ...primaryBtn, opacity: form.sets ? 1 : 0.4 }}
                className="w-full rounded py-2.5 text-xs uppercase tracking-wide">Add exercise</button>
            </div>
          </div>
        )}

        {/* ---------------- HISTORY ---------------- */}
        {tab === "history" && (
          <div>
            <p style={{ color: c.faint }} className="text-xs mb-3">
              Every set you have logged.
            </p>

            {entries.some((e) => e.sets.some((s) => s.done)) && (
              <div style={panel} className="rounded p-3 mb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm">Session in progress</div>
                    <div style={{ color: c.faint }} className="text-xs mt-0.5">
                      {doneSets} completed {doneSets === 1 ? "set" : "sets"} not yet in the ledger.
                    </div>
                  </div>
                  <button onClick={() => { commitSession(); setEntries([]); setOverload([]); setTickSeq(0); }}
                    style={primaryBtn} className="shrink-0 px-3 py-2 rounded text-xs uppercase tracking-wide">
                    Finish session
                  </button>
                </div>
              </div>
            )}

            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercise, body part or date"
              style={{ ...input, marginBottom: "14px" }} className="w-full rounded px-3 py-2.5" />

            {bests.length > 0 && (
              <div style={panel} className="rounded p-3 mb-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div style={head}>BESTS</div>
                  <div style={{ color: c.faint }} className="text-xs">
                    {pinned.length > 0 ? `${pinned.length} pinned` : "tap the star to pin"}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="w-full" style={{ fontSize: "12px" }}>
                    <thead>
                      <tr style={{ color: c.faint, fontSize: "10px", letterSpacing: "1px" }}>
                        <th className="text-left pb-1.5" style={{ width: "24px" }}></th>
                        <th className="text-left pb-1.5">EXERCISE</th>
                        <th className="text-right pb-1.5">BEST SET</th>
                        <th className="text-right pb-1.5">SESSION</th>
                        <th className="text-right pb-1.5">WHEN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...bests].sort((a, b) => {
                        const pa = pinned.indexOf(a.name) >= 0, pb = pinned.indexOf(b.name) >= 0;
                        if (pa !== pb) return pa ? -1 : 1;
                        return a.name.localeCompare(b.name);
                      }).map((b) => {
                        const on = pinned.indexOf(b.name) >= 0;
                        return (
                          <tr key={b.name} style={{ borderTop: `1px solid ${c.line}` }}>
                            <td className="py-1.5">
                              <button onClick={() => setPinned(on ? pinned.filter((x) => x !== b.name) : [...pinned, b.name])}
                                style={{ background: "transparent", border: "none", fontFamily: "inherit",
                                  fontSize: "14px", color: on ? c.accentText : c.line,
                                  cursor: "pointer", padding: 0, lineHeight: 1 }}
                                title={on ? "Unpin" : "Pin"}>{on ? "\u2605" : "\u2606"}</button>
                            </td>
                            <td className="py-1.5" style={{ fontWeight: on ? 700 : 400 }}>{b.name}</td>
                            <td className="text-right" style={{ color: c.accentText }}>
                              {b.metric === "cardio" ? `${b.totalDistance || 0}km`
                                : b.metric === "time" ? `${b.longestHold || 0}s`
                                : b.anyLoad ? `${b.maxWeight || 0}kg x ${b.maxReps || 0}`
                                : `${b.maxReps || 0} reps`}
                            </td>
                            <td className="text-right" style={{ color: c.muted }}>
                              {b.metric === "cardio" ? `${b.totalCalories || 0}cal`
                                : b.metric === "time" ? `${b.totalTime || 0}s`
                                : b.anyLoad ? `${Math.round(b.sessionVolume || 0)}kg`
                                : `${Math.round(b.sessionVolume || 0)} reps`}
                            </td>
                            <td className="text-right" style={{ color: c.faint }}>{b.lastDate ? fmtDay(b.lastDate) : "in session"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div style={{ color: c.faint }} className="text-xs">
                {history.length === 0 ? "Nothing logged yet. Finish a session to build the ledger."
                  : "No records match that search."}
              </div>
            ) : (
              filteredHistory.map((day) => (
                <div key={day.date} className="mb-5">
                  <div style={{ ...head, marginBottom: "8px" }}>{fmtDay(day.date).toUpperCase()}</div>
                  {day.records.map((r) => {
                    const open = editing === r.id;
                    const cardio = r.metric === "cardio";
                    return (
                      <div key={r.id} style={panel} className="rounded-lg p-3 mb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm">{r.exercise}</div>
                            <div style={{ color: c.faint }} className="text-xs mt-0.5">
                              {r.sets.length} {r.sets.length === 1 ? "set" : "sets"}
                              {r.primary.length > 0 && ` · ${r.primary.join(", ")}`}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => setEditing(open ? null : r.id)}
                              style={{ border: `1px solid ${c.line}`, color: open ? c.accentText : c.muted, fontFamily: "inherit" }}
                              className="px-2.5 py-1 rounded text-xs">{open ? "Done" : "Edit"}</button>
                            {open && (
                              <button onClick={() => { setHistory(history.filter((h) => h.id !== r.id)); setEditing(null); }}
                                style={{ border: `1px solid ${c.line}`, color: c.danger, fontFamily: "inherit" }}
                                className="px-2.5 py-1 rounded text-xs">Delete</button>
                            )}
                          </div>
                        </div>

                        {!open ? (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2" style={{ color: c.muted, fontSize: "12px" }}>
                            {r.sets.map((st, i) => (
                              <span key={i} style={isBestSet(r, i) ? { color: c.accentText } : undefined}>
                                {cardio
                                  ? `${st.distance || 0}km / ${st.reps || 0}min / ${st.calories || 0}cal`
                                  : `${st.weight ? st.weight + "kg x " : ""}${st.reps || 0}${st.rir !== "" && st.rir != null ? ` @${st.rir}` : ""}`}
                                {isBestSet(r, i) && " \u2605"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2">
                            <div className="flex gap-2 items-center px-1 pb-1" style={{ color: c.faint, fontSize: "10px", letterSpacing: "1px" }}>
                              <div style={{ width: "22px" }}>SET</div>
                              <div className="flex-1 text-center">{cardio ? "KM" : "KG"}</div>
                              <div className="flex-1 text-center">{cardio ? "MIN" : "REPS"}</div>
                              <div className="flex-1 text-center">{cardio ? "CAL" : "RIR"}</div>
                              <div style={{ width: "18px" }}></div>
                            </div>
                            {r.sets.map((st, i) => (
                              <div key={i} className="flex gap-2 items-center mb-1.5">
                                <div style={{ width: "22px", color: c.faint, fontSize: "13px" }}>
                                  {i + 1}{isBestSet(r, i) && <span style={{ fontSize: "9px" }}>⭐</span>}
                                </div>
                                <div className="flex-1"><input type="number" inputMode="decimal" onFocus={selectAll}
                                  value={cardio ? st.distance : st.weight}
                                  onChange={(ev) => editHistorySet(r.id, i, cardio ? { distance: ev.target.value } : { weight: ev.target.value })}
                                  style={cell} /></div>
                                <div className="flex-1"><input type="number" inputMode="numeric" value={st.reps} onFocus={selectAll}
                                  onChange={(ev) => editHistorySet(r.id, i, { reps: ev.target.value })} style={cell} /></div>
                                <div className="flex-1">
                                  {cardio ? (
                                    <input type="number" inputMode="numeric" value={st.calories} onFocus={selectAll}
                                      onChange={(ev) => editHistorySet(r.id, i, { calories: ev.target.value })} style={cell} />
                                  ) : (
                                    <select value={RIR_BY_ID[st.rir] ? st.rir : bandForTarget(Number(st.rir) || 2)}
                                      onChange={(ev) => editHistorySet(r.id, i, { rir: ev.target.value })}
                                      style={{ ...cell, appearance: "none", textAlignLast: "center" }}>
                                      {RIR_BANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                  )}
                                </div>
                                <button onClick={() => removeHistorySet(r.id, i)}
                                  style={{ width: "18px", color: c.faint, background: "transparent", border: "none", fontFamily: "inherit", fontSize: "16px" }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {/* ---------------- THRESHOLDS ---------------- */}
        {tab === "settings" && (
          <div>
            <p style={{ color: c.faint }} className="text-xs mb-3">
              Where your volume sits against each body part's limits, and the limits themselves.
            </p>

            <div style={panel} className="rounded p-4 mb-4">
              <label style={lab}>How steeply does going past MRV degrade?</label>
              <select value={falloff} onChange={(e) => setFalloff(e.target.value)} style={input} className="w-full rounded px-2 py-2">
                <option value="gentle">Gentle</option>
                <option value="moderate">Moderate</option>
                <option value="steep">Steep, flagged fast</option>
              </select>
            </div>

            <div style={panel} className="rounded p-4">
              <div className="flex items-center gap-2 mb-3" style={head}>
                <div className="flex-1">BODY PART</div>
                <div style={{ width: "46px", textAlign: "center" }}>SETS</div>
                <div style={{ width: "62px", textAlign: "center" }}>
                  <button onClick={() => setDoseInfo(true)} style={{ background: "transparent", border: "none",
                    color: c.ring, fontFamily: "inherit", fontSize: "10px", letterSpacing: "2.5px",
                    fontWeight: 700, padding: 0, cursor: "pointer" }}>MEV ⓘ</button>
                </div>
                <div style={{ width: "62px", textAlign: "center" }}>
                  <button onClick={() => setDoseInfo(true)} style={{ background: "transparent", border: "none",
                    color: c.ring, fontFamily: "inherit", fontSize: "10px", letterSpacing: "2.5px",
                    fontWeight: 700, padding: 0, cursor: "pointer" }}>MRV ⓘ</button>
                </div>
                <div style={{ width: "78px", textAlign: "right" }}>PROGRESS</div>
              </div>

              {rows.map((r, i) => (
                <React.Fragment key={r.muscle}>
                  {i % 4 === 0 && (
                    <div style={{ ...head, marginTop: i ? "16px" : 0, marginBottom: "7px" }}>{GROUPS[i / 4].name.toUpperCase()}</div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 text-sm truncate" style={{ fontWeight: MAJOR.indexOf(r.muscle) >= 0 ? 700 : 400 }}>{r.muscle}</div>
                    <div style={{ width: "46px", textAlign: "center", fontSize: "13px",
                      color: r.zone === "over" ? c.warn : r.zone === "in" ? c.accentText : c.muted }}>
                      {Number.isInteger(r.sets) ? r.sets : r.sets.toFixed(2).replace(/0$/, "")}
                    </div>
                    <input type="number" onFocus={selectAll} value={landmarks[r.muscle].mev} style={{ ...input, width: "62px", fontSize: "13px", padding: "6px 4px", textAlign: "center" }}
                      className="rounded"
                      onChange={(e) => setLandmarks({ ...landmarks, [r.muscle]: { ...landmarks[r.muscle], mev: Number(e.target.value) } })} />
                    <input type="number" onFocus={selectAll} value={landmarks[r.muscle].mrv} style={{ ...input, width: "62px", fontSize: "13px", padding: "6px 4px", textAlign: "center" }}
                      className="rounded"
                      onChange={(e) => setLandmarks({ ...landmarks, [r.muscle]: { ...landmarks[r.muscle], mrv: Number(e.target.value) } })} />
                    {(() => {
                      const pr = doseProgress(r.sets, r.mev, r.mrv);
                      return (
                        <div style={{ width: "78px", textAlign: "right", fontSize: "11px",
                          color: pr.label === "past MRV" ? c.warn : c.faint }}>
                          {Math.round(pr.pct)}% {pr.label}
                        </div>
                      );
                    })()}
                  </div>
                </React.Fragment>
              ))}
              <div style={{ color: c.faint }} className="text-xs mt-3">
                Sets are what you have completed this week. MEV is the least that produces growth,
                MRV the most you can recover from, and the gap is what still needs doing. That gap
and To go is how many sets that still needs.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
