/*
  Score engines — ported verbatim from the original modules so the numbers
  EdgeX Life shows are continuous with your history. If you change a weight
  here, every past score silently re-reads differently, so don't.

  Health Score  (health.html readinessDetails, updated 2026-08-09)
    weighted base: sleep .24  steps .15  water .11  energy .20  sleepQuality
    .15  nutrition .15, minus (pain * 7) — then Movement, BELOW, adds up to
    MOVEMENT_BONUS_POINTS on top. Clamped 0–100 only at the very end.

  Movement is intentionally NOT one of the six weighted components above —
  it's a flat bonus, added after the weighted base is computed, worth
  MOVEMENT_BONUS_POINTS if `log.exercisedToday` is checked and worth
  exactly 0 (never negative) if it isn't. This was a deliberate ask: a
  weighted "% of exerciseMins target" component was tried twice before
  (2026-08-09) and reverted both times, partly because Steps already
  covers movement, and partly because ANY weighted component necessarily
  penalizes an unlogged/rest day — which is the wrong shape for something
  that should only ever help. A pure additive bonus can't do that: leaving
  the box unchecked is neutral, not a miss, by construction rather than by
  a rest-day exception that needs its own plumbing (contrast with the
  rest-day design from the reverted attempt, still described in git
  history if that approach is ever wanted for a different component).

  `nutritionScore` (1–10, self-rated) fills the weighted slot exercise used
  to occupy. `isFastingDay` and `nutritionNotes` ride along on the same log
  but are deliberately NOT scored — context for reading the number, not an
  input to it, same principle as Fasting's own module-level note.

  Clarity Score (wellness.html clarityDetails)
    mood .22  stressEase .24  clarity .28  grounded .26
*/

/** Flat points added to the base score when `exercisedToday` is checked.
    Never subtracted when unchecked — see the header note above for why. */
export const MOVEMENT_BONUS_POINTS = 5

const n = (v, fallback = 0) => {
  const x = parseFloat(v)
  return Number.isFinite(x) ? x : fallback
}
const i = (v, fallback = 0) => {
  const x = parseInt(v, 10)
  return Number.isFinite(x) ? x : fallback
}

/* ── Health ──────────────────────────────────────────────── */

export function healthScore(log, settings) {
  if (!log) return null
  return healthDetails(log, settings).score
}

export function healthDetails(log, settings) {
  if (!log) return null
  const s = {
    sleepTarget: settings?.sleepTarget ?? 7.5,
    stepTarget: settings?.stepTarget ?? 10000,
    waterTarget: settings?.waterTarget ?? 2,
  }

  const sleep = Math.min(100, (n(log.sleepHours) / s.sleepTarget) * 100)
  const steps = Math.min(100, (i(log.steps) / s.stepTarget) * 100)
  const water = Math.min(100, (n(log.water) / s.waterTarget) * 100)
  const energy = (i(log.energy, 3) / 5) * 100
  const quality = (i(log.sleepQuality, 3) / 5) * 100
  const pain = i(log.pain, 0)
  const painScore = Math.max(0, 100 - pain * 20)
  // Fallback of 6/10 (not 5) intentionally reads as slightly-above-neutral
  // on an unrated day — same relative positioning as energy/quality's own
  // "3 of 5" default, which is 60% too.
  const nutritionRating = i(log.nutritionScore, 6)
  const nutrition = (nutritionRating / 10) * 100

  const components = [
    { key: 'sleepHours', label: 'Sleep', value: sleep, weight: 0.24,
      detail: `${n(log.sleepHours)}h / ${s.sleepTarget}h`,
      advice: 'Add an earlier shutdown cue or protect tomorrow morning from late-night drift.' },
    { key: 'steps', label: 'Steps', value: steps, weight: 0.15,
      detail: `${i(log.steps).toLocaleString()} / ${s.stepTarget.toLocaleString()}`,
      advice: 'Add a 10-minute walk to a transition you already have.' },
    { key: 'water', label: 'Water', value: water, weight: 0.11,
      detail: `${n(log.water).toFixed(1)}L / ${s.waterTarget}L`,
      advice: 'Put water in reach and pair the next glass with food or a work start.' },
    { key: 'energy', label: 'Energy', value: energy, weight: 0.20,
      detail: `${i(log.energy, 3)} / 5`,
      advice: 'Reduce friction: food, daylight, a short walk, or a lower-demand plan.' },
    { key: 'sleepQuality', label: 'Sleep quality', value: quality, weight: 0.15,
      detail: `${i(log.sleepQuality, 3)} / 5`,
      advice: 'Improve the pre-sleep environment before adding more effort tomorrow.' },
    { key: 'nutrition', label: 'Nutrition', value: nutrition, weight: 0.15,
      detail: `${nutritionRating} / 10${log.isFastingDay ? ' · fasting day' : ''}`,
      advice: METRIC_ADVICE.nutrition },
    // Label is 'Pain', not 'Low pain' — this is the one driver where the
    // raw metric and the 0-100 "goodness" value move in OPPOSITE
    // directions (high pain -> low value, unlike every other driver where
    // more of the raw thing -> a higher value). A label phrased as the
    // desirable direction reads backwards in any auto-generated sentence
    // built for the other five drivers ("Low pain is dragging your score"
    // sounds like having low pain is bad). Naming it after the raw thing,
    // like every other driver, keeps those sentences correct — pair with
    // `detail` (the raw "N / 5 strain" reading) rather than `value` in any
    // UI that surfaces this driver by itself, since `value` alone doesn't
    // carry the inversion.
    { key: 'pain', label: 'Pain', value: painScore, weight: 0.14,
      detail: `${pain} / 5 strain`,
      advice: 'De-load today: mobility, easy walking, or rest instead of forcing intensity.' },
  ]

  const base = sleep * 0.24 + steps * 0.15 + water * 0.11 + energy * 0.20 + quality * 0.15 + nutrition * 0.15 - pain * 7
  const exercised = Boolean(log.exercisedToday)
  const bonusAwarded = exercised ? MOVEMENT_BONUS_POINTS : 0
  const score = Math.max(0, Math.min(100, Math.round(base + bonusAwarded)))

  // Not in `components` — it isn't a weighted driver, it's a flat add-on,
  // and mixing it into that list would make it look like it's averaged in
  // like everything else (and could get picked as the "weakest lever",
  // which makes no sense for something that only ever helps). UI reads
  // this separately; see the "Movement" row in HealthPage's TodayView.
  const bonus = {
    key: 'exercise', label: 'Movement', checked: exercised,
    points: MOVEMENT_BONUS_POINTS, awarded: bonusAwarded,
  }

  return { score, components, bonus }
}

export function healthLabel(score) {
  if (score == null) return ['Log today to calculate your Health Score',
    'Capture sleep, steps, hydration, energy, sleep quality, nutrition, and pain to see what needs attention.']
  if (score >= 85) return ['High Health Score',
    'Maintain the basics that created this: sleep, movement, water, steady energy, and low pain.']
  if (score >= 70) return ['Build toward 85+',
    'You are in a workable range. Raise the weakest lever before adding intensity.']
  if (score >= 50) return ['Stabilize the score',
    'Bias toward lighter training, better hydration, easier movement, and an earlier shutdown.']
  return ['Recovery priority',
    'The goal today is not a heroic score. Restore the basics so tomorrow has a better floor.']
}

/** Weakest weighted component — drives the coach card. */
export function weakestComponent(details) {
  if (!details) return null
  return [...details.components].sort((a, b) => a.value - b.value)[0]
}

/** Per-driver averages and hit rates across a set of logs (Trends view). */
export function healthDrivers(logs, settings) {
  const s = {
    sleepTarget: settings?.sleepTarget ?? 7.5,
    stepTarget: settings?.stepTarget ?? 10000,
    waterTarget: settings?.waterTarget ?? 2,
  }
  const driver = (label, valueFn, target, hitFn, fmt, maxOverride, lowerIsBetter = false) => {
    const values = logs.map(valueFn).filter((v) => Number.isFinite(v))
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    const max = maxOverride || target
    const raw = avg == null ? 0
      : lowerIsBetter ? Math.max(0, 100 - (avg / max) * 100)
        : Math.min(100, (avg / max) * 100)
    const hits = values.filter(hitFn).length
    return {
      label,
      score: raw,
      hitRate: values.length ? Math.round((hits / values.length) * 100) : 0,
      detail: avg == null ? 'No logged values' : fmt(avg),
    }
  }

  return [
    driver('Sleep', (l) => n(l.sleepHours, NaN), s.sleepTarget, (v) => v >= s.sleepTarget, (v) => `${v.toFixed(1)}h avg`),
    driver('Steps', (l) => i(l.steps, NaN), s.stepTarget, (v) => v >= s.stepTarget, (v) => `${Math.round(v).toLocaleString()} avg`),
    driver('Water', (l) => n(l.water, NaN), s.waterTarget, (v) => v >= s.waterTarget, (v) => `${v.toFixed(1)}L avg`),
    driver('Energy', (l) => i(l.energy, NaN), 4, (v) => v >= 4, (v) => `${v.toFixed(1)}/5 avg`, 5),
    driver('Sleep quality', (l) => i(l.sleepQuality, NaN), 4, (v) => v >= 4, (v) => `${v.toFixed(1)}/5 avg`, 5),
    driver('Nutrition', (l) => i(l.nutritionScore, NaN), 8, (v) => v >= 8, (v) => `${v.toFixed(1)}/10 avg`, 10),
    driver('Pain', (l) => i(l.pain, NaN), 2, (v) => v <= 2, (v) => `${v.toFixed(1)}/5 avg`, 5, true),
  ].sort((a, b) => a.score - b.score)
}

export const METRIC_ADVICE = {
  sleep: 'Move the first sleep action earlier: caffeine cutoff, screen boundary, or room setup.',
  steps: 'Attach walking to something already happening: after food, before work, or between tasks.',
  water: 'Put water in reach and use meals as anchors. Do not rely on remembering later.',
  energy: 'Reduce the plan to the essentials and look for sleep, food, light, or overload as the lever.',
  nutrition: 'Plan the next meal before you are actually hungry — most low-rated days start from a gap, not a bad choice.',
}

/* ── Wellness ────────────────────────────────────────────── */

export function clarityScore(c) {
  if (!c) return null
  return clarityDetails(c).score
}

export function clarityDetails(c) {
  if (!c) return null
  const mood = i(c.mood, 3)
  const clarity = i(c.clarity, 3)
  const grounded = i(c.grounded, 3)
  const stress = i(c.stress, 3)
  const stressEase = 6 - stress

  const moodScore = (mood / 5) * 100
  const stressScore = (stressEase / 5) * 100
  const clarityVal = (clarity / 5) * 100
  const groundedScore = (grounded / 5) * 100

  const score = Math.max(0, Math.min(100, Math.round(
    moodScore * 0.22 + stressScore * 0.24 + clarityVal * 0.28 + groundedScore * 0.26
  )))

  return {
    score,
    components: [
      { key: 'mood', label: 'Mood', value: moodScore, weight: 0.22, detail: MOOD_LABELS[mood] || '--',
        advice: 'Do one small thing that changes emotional tone: light, music, food, movement, or honest contact.' },
      { key: 'stress', label: 'Stress ease', value: stressScore, weight: 0.24, detail: `${stress} / 5 stress`,
        advice: 'Downshift before deciding: longer exhales, fewer inputs, or a ten-minute pause.' },
      { key: 'clarity', label: 'Clarity', value: clarityVal, weight: 0.28, detail: `${clarity} / 5`,
        advice: 'Externalize the fog. Write the next three concerns as separate lines.' },
      { key: 'grounded', label: 'Groundedness', value: groundedScore, weight: 0.26, detail: `${grounded} / 5`,
        advice: 'Use the body as the anchor: walk, stretch, breathe, or name five things you see.' },
    ],
  }
}

export function clarityLabel(score) {
  if (score == null) return ['Come back to center',
    'Log mood, stress, clarity, and what is present to see your inner-state signal.']
  if (score >= 85) return ['Clear and grounded',
    'A good window for decision-making, creative work, and meaningful conversations.']
  if (score >= 70) return ['Steady enough', 'Keep moving, but protect focus and reduce needless inputs.']
  if (score >= 50) return ['A little noisy', 'Use a reset before asking more from yourself.']
  return ['Nervous system first', 'Lower demands, create quiet, and take the next small stabilizing step.']
}

export const MOOD_LABELS = { 1: 'Heavy', 2: 'Low', 3: 'Neutral', 4: 'Good', 5: 'Bright' }
export const STATES = ['Calm', 'Focused', 'Scattered', 'Overwhelmed', 'Anxious', 'Restless', 'Confident', 'Flat', 'Grateful']
export const SLEEP_IMPACTS = [
  { value: 'helped', label: 'Helped' }, { value: 'neutral', label: 'Neutral' }, { value: 'hurt', label: 'Hurt' },
]
export const THOUGHT_TYPES = ['Hold', 'Work task', 'Goal action', 'Finance action', 'Life admin', 'Journal', 'Release']
