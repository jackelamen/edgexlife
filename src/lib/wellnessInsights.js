/*
  What the Wellness data says back to you.

  Everything here is a plain comparison of averages with its sample size
  attached, same voice and same honesty rules as correlations.js: a
  self-rated number over a handful of days is noisy, so every read is
  labelled "early" until it has enough days behind it, and the bucket-gap
  tests reuse correlations.js's standard-error gate rather than a second,
  looser one.

  Nothing here is stored. It is all derived from check-ins and practices
  that already exist, so it can be re-run over any window.
*/
import { clarityDetails } from './scores'
import { bucketAvg, isSignificant } from './correlations'
import { shiftDate } from './dates'

/* ── Vocabulary ──────────────────────────────────────────────────
   Each emotion carries the legacy `state` it rolls up to, so the older
   single-word field (still read by the breath/reset routing and by Today's
   "Felt ..." line) keeps working without a second question in the form. */
export const EMOTIONS = [
  { label: 'Calm', tone: 'pleasant', state: 'Calm' },
  { label: 'Content', tone: 'pleasant', state: 'Calm' },
  { label: 'Peaceful', tone: 'pleasant', state: 'Calm' },
  { label: 'Focused', tone: 'pleasant', state: 'Focused' },
  { label: 'Motivated', tone: 'pleasant', state: 'Focused' },
  { label: 'Curious', tone: 'pleasant', state: 'Focused' },
  { label: 'Confident', tone: 'pleasant', state: 'Confident' },
  { label: 'Hopeful', tone: 'pleasant', state: 'Confident' },
  { label: 'Proud', tone: 'pleasant', state: 'Confident' },
  { label: 'Energized', tone: 'pleasant', state: 'Confident' },
  { label: 'Grateful', tone: 'pleasant', state: 'Grateful' },
  { label: 'Loved', tone: 'pleasant', state: 'Grateful' },
  { label: 'Joyful', tone: 'pleasant', state: 'Grateful' },
  { label: 'Scattered', tone: 'hard', state: 'Scattered' },
  { label: 'Distracted', tone: 'hard', state: 'Scattered' },
  { label: 'Confused', tone: 'hard', state: 'Scattered' },
  { label: 'Overwhelmed', tone: 'hard', state: 'Overwhelmed' },
  { label: 'Pressured', tone: 'hard', state: 'Overwhelmed' },
  { label: 'Stretched thin', tone: 'hard', state: 'Overwhelmed' },
  { label: 'Anxious', tone: 'hard', state: 'Anxious' },
  { label: 'Worried', tone: 'hard', state: 'Anxious' },
  { label: 'Afraid', tone: 'hard', state: 'Anxious' },
  { label: 'Guilty', tone: 'hard', state: 'Anxious' },
  { label: 'Restless', tone: 'hard', state: 'Restless' },
  { label: 'Irritable', tone: 'hard', state: 'Restless' },
  { label: 'Frustrated', tone: 'hard', state: 'Restless' },
  { label: 'Angry', tone: 'hard', state: 'Restless' },
  { label: 'Flat', tone: 'hard', state: 'Flat' },
  { label: 'Tired', tone: 'hard', state: 'Flat' },
  { label: 'Sad', tone: 'hard', state: 'Flat' },
  { label: 'Lonely', tone: 'hard', state: 'Flat' },
  { label: 'Bored', tone: 'hard', state: 'Flat' },
]

export const TRIGGERS = [
  'Work', 'Family', 'Relationship', 'Money', 'Health', 'Sleep',
  'Social', 'Future / uncertainty', 'Self-criticism', 'Nothing specific',
]

/** The legacy single-word state, rolled up from the first emotion picked. */
export const stateFromEmotions = (emotions) =>
  EMOTIONS.find((e) => e.label === (emotions || [])[0])?.state || null

/** What to show for "how you felt" on any entry, old or new. */
export const feelLabel = (c) =>
  c?.emotions?.length ? c.emotions.slice(0, 3).join(', ') : (c?.state || 'Unlabeled')

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
const rated = (c) => c && c.mood != null && c.clarity != null && c.grounded != null && c.stress != null
const scoreOf = (c) => (rated(c) ? clarityDetails(c)?.score ?? null : null)
const round1 = (v) => Math.round(v * 10) / 10

/* ── Practices: which ones actually move you ─────────────────────── */

const GOOD_AFTER = new Set(['Clearer', 'Calmer', 'Grounded'])
export const MIN_SESSIONS = 3
export const RELIABLE_SESSIONS = 6

/** Per practice type, the average before -> after change in "how settled".
    Only sessions with BOTH ratings count toward the delta; the older
    after-state word is a weaker, secondary read shown alongside. */
export function practiceEffects(practices) {
  const by = new Map()
  ;(practices || []).forEach((p) => {
    if (!p.type) return
    if (!by.has(p.type)) by.set(p.type, { type: p.type, sessions: 0, deltas: [], good: 0, worded: 0, minutes: 0 })
    const g = by.get(p.type)
    g.sessions += 1
    g.minutes += Number(p.minutes) || 0
    if (p.settledBefore != null && p.settledAfter != null) g.deltas.push(p.settledAfter - p.settledBefore)
    if (p.after) { g.worded += 1; if (GOOD_AFTER.has(p.after)) g.good += 1 }
  })
  return [...by.values()].map((g) => ({
    type: g.type, sessions: g.sessions, minutes: g.minutes,
    n: g.deltas.length,
    avgDelta: g.deltas.length ? round1(avg(g.deltas)) : null,
    helpedPct: g.deltas.length ? Math.round((g.deltas.filter((d) => d > 0).length / g.deltas.length) * 100) : null,
    goodPct: g.worded ? Math.round((g.good / g.worded) * 100) : null,
    reliable: g.deltas.length >= RELIABLE_SESSIONS,
  })).sort((a, b) => (b.avgDelta ?? -99) - (a.avgDelta ?? -99) || b.sessions - a.sessions)
}

/** The practice with the best proven effect, if there's enough behind it. */
export function bestPractice(effects) {
  return (effects || []).find((e) => e.n >= MIN_SESSIONS && e.avgDelta >= 0.5) || null
}

/* ── Check-ins: triggers, feelings, time of day ──────────────────── */

/** Average clarity on days a trigger was named vs the whole window. */
export function triggerInsights(checkins) {
  const base = avg((checkins || []).map(scoreOf).filter((v) => v != null))
  if (base == null) return []
  const withTriggers = (checkins || []).filter((c) => (c.triggers || []).length && rated(c))
  const names = new Set()
  withTriggers.forEach((c) => c.triggers.forEach((t) => names.add(t)))
  const out = []
  names.forEach((name) => {
    if (name === 'Nothing specific') return
    const vals = withTriggers.filter((c) => c.triggers.includes(name)).map(scoreOf)
    if (vals.length < 4) return
    out.push({ name, n: vals.length, avg: Math.round(avg(vals)), diff: Math.round(avg(vals) - base) })
  })
  return out.sort((a, b) => a.diff - b.diff)
}

export function emotionCounts(checkins, top = 6) {
  const m = new Map()
  ;(checkins || []).forEach((c) => (c.emotions || []).forEach((e) => m.set(e, (m.get(e) || 0) + 1)))
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, n]) => ({ label, n }))
}

const PARTS = [['morning', 0, 12], ['afternoon', 12, 17], ['evening', 17, 24]]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Best and worst time of day and weekday for clarity, when the gap is big
    enough over enough entries to be worth saying. */
export function rhythmInsights(checkins) {
  const rows = (checkins || []).filter((c) => c.savedAt && rated(c))
  const out = []
  const rank = (groups, unit) => {
    const g = groups.filter((x) => x.vals.length >= 4).map((x) => ({ ...x, avg: avg(x.vals) }))
    if (g.length < 2) return
    g.sort((a, b) => a.avg - b.avg)
    const lo = g[0], hi = g[g.length - 1]
    if (hi.avg - lo.avg >= 8) {
      out.push({ unit, high: hi.label, low: lo.label, gap: Math.round(hi.avg - lo.avg), nHigh: hi.vals.length, nLow: lo.vals.length })
    }
  }
  rank(PARTS.map(([label, a, b]) => ({
    label, vals: rows.filter((c) => { const h = new Date(c.savedAt).getHours(); return h >= a && h < b }).map(scoreOf),
  })), 'time of day')
  rank(DAYS.map((label, d) => ({
    label, vals: rows.filter((c) => new Date(`${c.date}T12:00:00`).getDay() === d).map(scoreOf),
  })), 'day of week')
  return out
}

/** Clarity on days with any logged practice vs days without. */
export function practiceDayInsight(checkins, practices) {
  const practiced = new Set((practices || []).map((p) => p.date))
  const byDate = new Map()
  ;(checkins || []).forEach((c) => { const s = scoreOf(c); if (s != null) byDate.set(c.date, s) })
  const rows = [...byDate.entries()].map(([date, s]) => ({ date, s }))
  const split = bucketAvg(rows, (r) => practiced.has(r.date), (r) => r.s)
  if (split.yesAvg == null || split.noAvg == null) return null
  const diff = Math.round(split.yesAvg - split.noAvg)
  if (!isSignificant(split, diff, 5)) return null
  return { diff, yesN: split.yesN, noN: split.noN, yesAvg: Math.round(split.yesAvg), noAvg: Math.round(split.noAvg) }
}

/** Reframes you rated helpful, most recent first. */
export function helpfulReframes(checkins, limit = 3) {
  return (checkins || []).filter((c) => c.reframe && c.reframeHelpful === true)
    .sort((a, b) => String(b.savedAt || b.date).localeCompare(String(a.savedAt || a.date)))
    .slice(0, limit).map((c) => ({ loop: c.loop, reframe: c.reframe, date: c.date }))
}

/* ── One insight for the dashboard ───────────────────────────────── */

export function weeklyInsight({ checkins, practices }) {
  const best = bestPractice(practiceEffects(practices))
  if (best) {
    return {
      icon: 'self_improvement', kicker: 'What works for you', title: `${best.type} settles you`,
      body: `Across ${best.n} rated sessions it moved you ${best.avgDelta > 0 ? '+' : ''}${best.avgDelta} on the 1 to 5 settled scale, and helped in ${best.helpedPct}% of them.${best.reliable ? '' : ' Early read: a few more sessions will firm it up.'}`,
      cta: { label: 'See what works', view: 'insights' },
    }
  }
  const pd = practiceDayInsight(checkins, practices)
  if (pd && pd.diff > 0) {
    return {
      icon: 'trending_up', kicker: 'Pattern', title: `Clarity runs ${pd.diff} higher on practice days`,
      body: `${pd.yesAvg} on days you practiced vs ${pd.noAvg} on days you didn't, over ${pd.yesN} vs ${pd.noN} days.`,
      cta: { label: 'Start a practice', view: 'reset' },
    }
  }
  const tr = triggerInsights(checkins)[0]
  if (tr && tr.diff <= -6) {
    return {
      icon: 'bolt', kicker: 'Trigger', title: `${tr.name} pulls your clarity down`,
      body: `Check-ins tagged ${tr.name.toLowerCase()} averaged ${tr.avg}, ${Math.abs(tr.diff)} points under your usual, across ${tr.n} entries.`,
      cta: { label: 'See triggers', view: 'insights' },
    }
  }
  const rh = rhythmInsights(checkins)[0]
  if (rh) {
    const s = rh.unit === 'day of week' ? 's' : ''
    return {
      icon: 'schedule', kicker: 'Rhythm', title: `You are clearest on ${rh.high.toLowerCase()}${s}`,
      body: `${rh.gap} points above your ${rh.low.toLowerCase()}${s}. Put the decisions that matter there.`,
      cta: { label: 'See rhythm', view: 'insights' },
    }
  }
  return null
}

/* ── Experiments ─────────────────────────────────────────────────── */

export const EXPERIMENT_LENGTHS = [7, 14, 21]
const BASELINE_DAYS = 14

/** Adherence and before/after clarity for one experiment. */
export function evaluateExperiment(exp, checkins, practices, todayStr) {
  const end = shiftDate(exp.start, exp.days - 1)
  const inRun = (d) => d >= exp.start && d <= end
  const days = new Set((practices || []).filter((p) => p.type === exp.practiceType && inRun(p.date)).map((p) => p.date))
  const dayMs = 86400000
  const sinceStart = Math.round((new Date(`${todayStr}T12:00:00`) - new Date(`${exp.start}T12:00:00`)) / dayMs) + 1
  const elapsed = Math.min(exp.days, Math.max(0, sinceStart))
  const baseFrom = shiftDate(exp.start, -BASELINE_DAYS)
  const during = (checkins || []).filter((c) => inRun(c.date)).map(scoreOf).filter((v) => v != null)
  const before = (checkins || []).filter((c) => c.date >= baseFrom && c.date < exp.start).map(scoreOf).filter((v) => v != null)
  const enough = during.length >= 3 && before.length >= 3
  return {
    end, done: days.size, elapsed, complete: todayStr > end,
    adherence: elapsed ? Math.round((days.size / elapsed) * 100) : 0,
    duringAvg: during.length ? Math.round(avg(during)) : null,
    beforeAvg: before.length ? Math.round(avg(before)) : null,
    duringN: during.length, beforeN: before.length,
    delta: enough ? Math.round(avg(during) - avg(before)) : null,
    onToday: days.has(todayStr),
  }
}

/* ── One week, for the weekly review ─────────────────────────────── */

/** What the inner side of a week looked like: the feelings named most,
    what was behind them, and whether the things you said you'd do got
    done. Inputs are already week-bounded by the caller. */
export function wellnessWeek(checkins, practices) {
  const ck = checkins || []
  const commits = ck.filter((c) => c.commit)
  const kept = commits.filter((c) => c.commit.status === 'done').length
  const trig = new Map()
  ck.forEach((c) => (c.triggers || []).forEach((t) => { if (t !== 'Nothing specific') trig.set(t, (trig.get(t) || 0) + 1) }))
  const effects = practiceEffects(practices).filter((e) => e.n > 0)
  return {
    checkins: ck.length,
    feelings: emotionCounts(ck, 4),
    triggers: [...trig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, n]) => ({ label, n })),
    commitsMade: commits.length, commitsKept: kept,
    settled: effects.length ? round1(avg(effects.flatMap((e) => Array(e.n).fill(e.avgDelta)))) : null,
  }
}
