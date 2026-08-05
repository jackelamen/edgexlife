/*
  EdgeX Life — the design system, as data.
  ================================================================
  This file is the single source of truth for what every colour in the app
  MEANS. Components import from here instead of hardcoding hex, so the
  system can't drift, and the legend shown in Settings is generated from
  these same objects — the documentation cannot go stale.

  Four rules, in priority order:

    1. HUE = IDENTITY.   Every tracked metric owns one hue permanently.
       Sleep is indigo on its tile, on its score bar, on its chart line and
       on its log chip — always, in every view. You learn to read the app
       by colour without reading labels.

    2. FILL = QUANTITY.  How full a tile or bar is, is literally how close
       you are to that target. Nothing is filled for decoration.

    3. STATUS IS RESERVED. Green / amber / red never identify anything.
       They appear only on performance indicators (the percent pill, the
       day dots, a score ring). So a colour shift always means your
       numbers changed — never that a designer wanted variety. This is why
       no metric below is green, amber or red, even the ones you'd expect
       (movement, pain): those hues are spoken for.

    4. MODULE HUE = LOCATION. Each module owns a deep, desaturated hue for
       its hero and active nav, drawn from a deliberately darker band than
       any metric hue so the two can never be confused.
*/

/* ── 3. Status ramp (RESERVED — identity never uses these) ───── */

export const STATUS = {
  good: { color: '#17915c', bg: '#e2f2ea', label: 'On track' },
  short: { color: '#c98a12', bg: '#fbeed6', label: 'Short' },
  risk: { color: '#c8452f', bg: '#f9e3df', label: 'At risk' },
}

/** The only place performance→colour happens. Everything else is identity. */
export function statusFor(pct) {
  if (pct == null) return null
  if (pct >= 85) return STATUS.good
  if (pct >= 60) return STATUS.short
  return STATUS.risk
}
export const statusColor = (pct) => statusFor(pct)?.color ?? 'var(--ink-3)'

/* ── 4. Module identity (deep band, never collides with metrics) ── */

export const MODULES = {
  today: { label: 'Today', color: '#2f3a44', tint: '#e8eaec' },
  health: { label: 'Health', color: '#0e5f52', tint: '#dceceA' },
  goals: { label: 'Goals', color: '#8a4b1f', tint: '#f3e6da' },
  wellness: { label: 'Wellness', color: '#5b2c63', tint: '#eee2f0' },
}

/* ── 1. Metric identity ──────────────────────────────────────────
   Keys match the `key` field of the component objects returned by
   healthDetails() / clarityDetails() in lib/scores.js, so a component can
   go straight from a score breakdown to its colour with no mapping table.

   Deliberately contains no green / amber / red — see rule 3. Related
   metrics share a family (sleep duration + sleep quality are both indigo,
   one lighter) because that relationship is real and worth showing. */

export const METRICS = {
  /* Health */
  sleepHours: { label: 'Sleep', icon: 'bedtime', color: '#5b53c9', tint: '#e6e4fb', family: 'sleep' },
  sleepQuality: { label: 'Sleep quality', icon: 'nights_stay', color: '#8b84e0', tint: '#eceafc', family: 'sleep' },
  steps: { label: 'Steps', icon: 'footprint', color: '#0e7c86', tint: '#dbeff1' },
  exercise: { label: 'Movement', icon: 'exercise', color: '#6b3fa0', tint: '#eae1f5' },
  water: { label: 'Water', icon: 'water_drop', color: '#2b83c9', tint: '#dcebf8' },
  energy: { label: 'Energy', icon: 'bolt', color: '#c2477e', tint: '#fbe1ed' },
  pain: { label: 'Low pain', icon: 'healing', color: '#8a5a4a', tint: '#f0e5e1' },

  /* Wellness */
  mood: { label: 'Mood', icon: 'sentiment_satisfied', color: '#d1568c', tint: '#fbe3ee' },
  stress: { label: 'Stress ease', icon: 'air', color: '#3f6fd8', tint: '#e0e8fa' },
  clarity: { label: 'Clarity', icon: 'lightbulb', color: '#7b5cd6', tint: '#eae4fa' },
  grounded: { label: 'Groundedness', icon: 'spa', color: '#0e7c86', tint: '#dbeff1' },
}

const FALLBACK = { label: '', icon: 'circle', color: '#6f6a60', tint: '#eceae4' }

export const metric = (key) => METRICS[key] || FALLBACK
export const metricColor = (key) => metric(key).color
export const metricTint = (key) => metric(key).tint

/* ── Goal life-areas ─────────────────────────────────────────────
   `health` intentionally reuses the Health module's own hue: a health
   goal and the Health module are the same thing to you, so they should
   look like it. The rest sit in the same deep band. */

export const AREA_COLORS = {
  health: MODULES.health.color,
  work: '#2b6fb5',
  family: '#b23a5f',
  personal: '#8a6b1d',
}

/* ── Generated legend (Settings renders this — can't go stale) ── */

export const DESIGN_RULES = [
  {
    title: 'Hue is identity',
    body: 'Every metric owns one colour permanently — sleep is always indigo, water always blue, energy always magenta. The same hue marks its tile, its score bar, its chart line and its chips, in every view. You can read the dashboard by colour alone.',
  },
  {
    title: 'Fill is quantity',
    body: 'How full a tile or bar appears is exactly how close you are to that target. Nothing is filled for decoration.',
  },
  {
    title: 'Green, amber and red are reserved',
    body: 'Those three never identify anything — they only report performance, on the percent pills, the day dots and the score ring. So a colour change always means your numbers moved. It is also why movement is violet and pain is brown rather than the obvious green and red.',
  },
  {
    title: 'Module hue is location',
    body: 'Health, Goals and Wellness each own a deep hue for their hero and active nav, taken from a darker band than any metric colour, so the two can never be mistaken for each other.',
  },
]
