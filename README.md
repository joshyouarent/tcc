# T.C.C.

A spider chart that gamifies effective action, built for The Conditioning Co.

Four apps, one charting kernel. Every app plots progress on a radial chart
derived from the TCC icon. The icon is not decoration: its two rings and four
arms are the scale.

## The framework

| | Definition | Measured by | Clarifying question |
| --- | --- | --- | --- |
| **HEALTH** | Investing in internal capacity | How you feel and what you can achieve by yourself | Does this build or restore what my body and mind can do? |
| **WEALTH** | Investing in external capacity | What you have and what you can achieve with others | Does this build something that exists outside me, or that I share with someone? |
| **WISDOM** | Alignment with objective reality | Doing what you need to do to sustain the game | Does this only stop things getting worse? |
| **PLAY** | Alignment with subjective reality | Doing what you want to do to enjoy the game | Am I doing this because I want to, not because I should? |

**Sorting rule.** If it advances a capacity, it goes to that capacity. If it only
holds the line, it is Wisdom.

**Time rule.** Health, Wealth and Wisdom are future-focused. Play is now-focused.

**Worked examples.** Training, sleep, cooking a meal, physio and bloodwork are
Health. Tax return, saving, qualifications, teaching a skill and keeping a
relationship alive are Wealth. Dishes, cleaning the house, fixing the drain,
bins out, reading and turning down work you should not take are Wisdom. Guitar
alone, flow states and making something for no reason are Play.

These definitions came from sorting twenty four measurable cases and resolving
the contradictions between them. The current wording is the result of that work,
so do not rebuild it from first principles.

## Apps

| Path | App | Domain | Status |
| --- | --- | --- | --- |
| `apps/healthier.jsx` | HEALTHIER | Health | Built. Spokes are body parts, the dose is weekly hard sets. Builds sessions from available equipment, logs them set by set, and resolves prescribed loads against what is actually in the room. |
| `apps/wiser.jsx` | WISER | Wisdom | Built. A list becomes an ordered run of tasks, each with three time estimates. Finishing one plots it: faster is further out. One lap is a finished job. |
| `apps/wealthier.jsx` | WEALTHIER | Wealth | Not started |
| `apps/play.jsx` | PLAY | Play | Not started |

A combined view showing performance across all four over time is still to build.

## The kernel

Roughly 230 lines, domain-agnostic, pasted into each app with a version header.
Artifacts cannot import, so the repo is the source of truth and each app file is
a build output. When the kernel changes it must be copied across.

- **Radial scale.** Centre is nothing done, the outer edge is the ceiling. More
  is further out. The scale is anchored to the icon rather than running
  linearly, because the mark's rings sit at 0.538 and 0.896 of its radius, a
  ratio of 0.601 where linear would give 0.667.
- **Three landmarks.** A floor below which the work does not register, an ideal
  at the midpoint, and a ceiling past which the curve turns back inward, so
  overshooting never plots better than doing the right amount. In HEALTHIER
  these are MEV, IED and MRV.
- **A non-linear band.** Returns arrive early and flatten toward the ceiling, so
  an even step in radius is not an even step in the underlying unit.
- **Spokes are data.** A spoke can be a focus area, a task, or a unit of time.
  Same geometry either way. Quadrant dividers stay fixed at 45, 135, 225 and 315
  degrees whatever the spoke count.
- **The mark.** Two C shapes from the rings, each broken by a gap at 315
  degrees, and a T from three fixed arms plus one arrow whose length is the mean
  across the chart. Together they read as the TCC initials. The arrow shaft
  matches the three short arms in thickness.
- **Theme tokens.** Primary `#36aecb`, secondary `#828384`, light and dark.

None of these numbers are arbitrary. They were measured off the icon.

## Chart views

The kernel takes spokes and one or more series, so every view is the same code
with different data.

| View | Spokes | Series |
| --- | --- | --- |
| Live | Focus areas | One, points not joined |
| Week | Days | Current lap, plus past laps at 50%, 25% and 12.5% opacity |
| Month | Days or weeks | As above |
| Quarter | Weeks | As above |
| Year | Months | As above |
| Life | Years | Optionally compared against percentiles for your decade and sex |

Faded past laps show patterns across previous laps and give you something to
beat. The fade can be toggled off.

## Conventions

- Australian English. No em dashes.
- Section headers are uppercase, letterspaced, bold and terse, following verb
  plus noun: ADD TASK, ADD TASK LIST, RUN COMPLETE, PER TASK. Never mix a
  sentence-case label with uppercase headers in the same view.
- Prefer the shortest wording that names the thing.
- Copy describes what a thing is and what it does. No analogy, no encouragement,
  no implied praise, no motivational framing.
- Sentence case for exercise names, body parts and equipment, with proper nouns
  preserved.
- Seven font sizes, no more. Inputs are 16px, because Safari on iOS zooms the
  page when you focus anything smaller.
- Raw values are stored, never scores. Compliance, volume and points are
  computed on read, so the model can change without invalidating history.
- Claims a user will act on are checked against the literature, and the wording
  says what the evidence supports rather than what is reassuring.

## Open questions

**WISER spans domains.** Its tasks scatter under the sorting rule: dishes to
Wisdom, tax to Wealth, cooking to Health. It may need to tag each task with the
capacity it maintains rather than assuming everything in it is Wisdom.

**Wisdom and Play do not accumulate.** They are alignment readings, not stocks.
The three landmarks assume a dose you build toward, which fits Health and Wealth
but not the other two. This needs solving before those apps are built.

**Wisdom and Health blur on upkeep.** For the body, maintaining and building are
often the same action at a different dose. Stretching currently sits in Health.

**Queued for HEALTHIER.** Load rounding by equipment, a capacity model inferred
from logged sets, and individualised programming built on it.
