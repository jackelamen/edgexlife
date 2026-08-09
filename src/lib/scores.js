/*
  Score engines — ported verbatim from the original modules so the numbers
  EdgeX Life shows are continuous with your history. If you change a weight
  here, every past score silently re-reads differently, so don't (2026-08-09
  exception below is a deliberate, one-time, user-requested change — see
  the note on the `exercise` component).

  Health Score  (health.html readinessDetails, updated 2026-08-09)
    sleep .24  steps .15  water .11  energy .20  sleepQuality .15
    exercise .15  minus (pain * 7), clamped 0–100

  Exercise is new as of 2026-08-09. It didn't exist in the original formula
  at all — exerciseMins was captured on every log but never scored, so a
  hard training day and a day of nothing scored identically. Folding it in
  meant deciding what a REST day should do to the number: a rest day isn't
  a missed workout, and scoring it as 0/target would falsely tank the score
  on a day that's supposed to be low-effort by design. So this component
  reads a `restDay` flag (sourced from that date's workout-plan entry,
  `plan.data[date]?.rest === true` — see WorkoutModule.jsx, the one place
  in the app that already lets you mark a day as rest) and treats a
  confirmed rest day as fully met (100), not as a miss. A day with nothing
  logged and NO rest flag still reads as a miss — that's not a bug, that's
  the honest reading of "we don't know if this was rest or forgotten."
  Every call site that computes a score therefore now needs to know, per
  date, whether that date was marked a rest day; see fetchWorkoutPlan in
  lib/data.js, which every caller now fetches alongside the log data.

  Clarity Score (wellness.html clarityDetails)
    mood .22  stressEase .24  clarity .28  grounded .26
*/

const n = (v, fallback = 0) => {
  const x = parseFloat(v)
  return Number.isFinite(x) ? x : fallback
}
const i = (v, fallback = 0) => {
  const x = parseInt(v, 10)
  return Number.isFinite(x) ? x : fallback
}

/* ── Health ──────────────────────────────────────────────── */

export function healthScore(log, settings, restDay = false) {
  if (!log) return null
  return healthDetails(log, settings, restDay).score
}

/**
 * `restDay`: true when this log's date is marked `rest: true` in that
 * date's workout-plan entry (see the file header for why). Defaults to
 * false so every existing call site that doesn't yet know about rest days
 * keeps working — it just means those call sites read a rest day as a
 * miss on the exercise component until they're updated to pass it in.
 */
export function healthDetails(log, settings, restDay = false) {
  if (!log) return null
  const s = {
    sleepTarget: settings?.sleepTarget ?? 7.5,
    stepTarget: settings?.stepTarget ?? 10000,
    waterTarget: settings?.waterTarget ?? 2,
    weeklyExerciseTarget: settings?.weeklyExerciseTarget ?? 150,
  }
  const dailyExerciseTarget = s.weeklyExerciseTarget / 7

  const sleep = Math.min(100, (n(log.sleepHours) / s.sleepTarget) * 100)
  const steps = Math.min(100, (i(log.steps) / s.stepTarget) * 100)
  const water = Math.min(100, (n(log.water) / s.waterTarget) * 100)
  const energy = (i(log.energy, 3) / 5) * 100
  const quality = (i(log.sleepQuality, 3) / 5) * 100
  const pain = i(log.pain, 0)
  const painScore = Math.max(0, 100 - pain * 20)
  const exercise = restDay ? 100 : Math.min(100, (n(log.exerciseMins) / dailyExerciseTarget) * 100)

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
    { key: 'exercise', label: 'Movement', value: exercise, weight: 0.15,
      detail: restDay ? 'Rest day (marked in Workouts)' : `${Math.round(n(log.exerciseMins))} / ${Math.round(dailyExerciseTarget)} min`,
      advice: METRIC_ADVICE.exercise },
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

  const score = Math.max(0, Math.min(100, Math.round(
    sleep * 0.24 + steps * 0.15 + water * 0.11 + energy * 0.20 + quality * 0.15 + exercise * 0.15 - pain * 7
  )))

  return { score, components }
}

export function healthLabel(score) {
  if (score == null) return ['Log today to calculate your Health Score',
    'Capture sleep, movement, hydration, energy, sleep quality, and pain to see what needs attention.']
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

/**
 * Per-driver averages and hit rates across a set of logs (Trends view).
 * `restDates` — a Set (or array) of "YYYY-MM-DD" strings marked as rest
 * days in the workout plan — excludes those dates from the Movement
 * driver's average and hit rate entirely, rather than averaging in a 0.
 * Averaging a rest day's exerciseMins in with training days would drag
 * the "average minutes" figure down in a way that misrepresents effort on
 * the days that were actually meant for training; excluding it keeps the
 * driver honest about training days specifically, and the `detail` string
 * says how many rest days were set aside so the number isn't a mystery.
 */
export function healthDrivers(logs, settings, restDates) {
  const restSet = restDates instanceof Set ? restDates : new Set(restDates || [])
  const s = {
    sleepTarget: settings?.sleepTarget ?? 7.5,
    stepTarget: settings?.stepTarget ?? 10000,
    waterTarget: settings?.waterTarget ?? 2,
    weeklyExerciseTarget: settings?.weeklyExerciseTarget ?? 150,
  }
  const dailyExerciseTarget = s.weeklyExerciseTarget / 7
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

  const trainingLogs = logs.filter((l) => !restSet.has(l.date))
  const restCount = logs.length - trainingLogs.length
  const exVals = trainingLogs.map((l) => n(l.exerciseMins, NaN)).filter((v) => Number.isFinite(v))
  const exAvg = exVals.length ? exVals.reduce((a, b) => a + b, 0) / exVals.length : null
  const exHits = exVals.filter((v) => v >= dailyExerciseTarget).length
  const exerciseDriver = {
    label: 'Movement',
    score: exAvg == null ? 0 : Math.min(100, (exAvg / dailyExerciseTarget) * 100),
    hitRate: exVals.length ? Math.round((exHits / exVals.length) * 100) : 0,
    detail: exAvg == null
      ? (restCount ? `No training days logged (${restCount} rest)` : 'No logged values')
      : `${exAvg.toFixed(0)}min avg on training days${restCount ? ` · ${restCount} rest excluded` : ''}`,
  }

  return [
    driver('Sleep', (l) => n(l.sleepHours, NaN), s.sleepTarget, (v) => v >= s.sleepTarget, (v) => `${v.toFixed(1)}h avg`),
    driver('Steps', (l) => i(l.steps, NaN), s.stepTarget, (v) => v >= s.stepTarget, (v) => `${Math.round(v).toLocaleString()} avg`),
    driver('Water', (l) => n(l.water, NaN), s.waterTarget, (v) => v >= s.waterTarget, (v) => `${v.toFixed(1)}L avg`),
    driver('Energy', (l) => i(l.energy, NaN), 4, (v) => v >= 4, (v) => `${v.toFixed(1)}/5 avg`, 5),
    driver('Sleep quality', (l) => i(l.sleepQuality, NaN), 4, (v) => v >= 4, (v) => `${v.toFixed(1)}/5 avg`, 5),
    exerciseDriver,
    driver('Pain', (l) => i(l.pain, NaN), 2, (v) => v <= 2, (v) => `${v.toFixed(1)}/5 avg`, 5, true),
  ].sort((a, b) => a.score - b.score)
}

export const METRIC_ADVICE = {
  sleep: 'Move the first sleep action earlier: caffeine cutoff, screen boundary, or room setup.',
  steps: 'Attach walking to something already happening: after food, before work, or between tasks.',
  water: 'Put water in reach and use meals as anchors. Do not rely on remembering later.',
  exercise: 'Use a minimum viable session: 10 minutes still keeps the identity alive.',
  // 'movement' alias: the healthDrivers() Trends label is 'Movement' (matches
  // METRICS.exercise.label in design.js), but the lookup in HealthPage's
  // TrendsView keys off the lower-cased first word of that label — so this
  // needs to exist under both keys for the coach card to find it.
  movement: 'Use a minimum viable session: 10 minutes still keeps the identity alive.',
  energy: 'Reduce the plan to the essentials and look for sleep, food, light, or overload as the lever.',
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
