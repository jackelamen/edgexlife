/*
  Outcome side of Goals.

  lib/goals.js scores ADHERENCE: did you do the actions you committed to.
  That is a lead measure. It says nothing about whether the thing you are
  actually after moved. This file is the other half, the lag measure, and
  the join between the two:

    metricProgress   (current - start) / (target - start), clamped. Works
                     for metrics that go down (weight, a 10k time, spend)
                     as well as up, because the sign of target - start
                     carries the direction.
    metricPace       where that metric SHOULD be today on a straight line
                     from its start to its target across the cycle, and
                     whether you are ahead of, on, or behind that line.
    cycleDiagnosis   adherence x pace. The same behind-pace reading means
                     opposite things depending on whether you did the work.
    phaseMilestone   a measurable checkpoint at the end of a phase.
    goalProgress     one number per goal, from metrics, milestones or tasks.
    goalTime         how much of the goal's time has elapsed, to set beside
                     how much of its outcome has.

  Everything here is pure: callers pass already-fetched rows.
*/

import { dateKey } from './dates'
import { dateKeyForWeekDay, phaseWeekRange, sprintWeeks } from './goals'

/** Within this many fractional points of the expected line counts as on pace. */
export const PACE_TOLERANCE = 0.1
/** The 12-week-year execution bar. Matches the green threshold in design.js. */
export const ADHERENCE_BAR = 85

const DAY = 86400000
const clamp01 = (n) => Math.max(0, Math.min(1, n))
const dayNum = (iso) => Math.round(new Date(`${iso}T00:00:00`).getTime() / DAY)

/** "$10,000", "82%", "52:00"-style strings are not numbers; strip the
    decoration people type and refuse the rest. */
export function num(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/* ── Metrics ──────────────────────────────────────────────── */

/** A bare "10000" next to a Currency metric or "80" next to a Percentage one
    carries no unit; this is the difference between a tracker and an instrument. */
export function fmtMetricValue(type, val) {
  if (val == null || val === '') return val
  if (type === 'Currency') return `$${Number(val).toLocaleString()}`
  if (type === 'Percentage') return `${val}%`
  return val
}

/** Status colour for a pace reading. Pace is a performance read, so it uses
    the reserved status ramp and nothing else. */
export function paceColor(pace) {
  if (!pace || pace.status === 'none') return 'var(--text-3)'
  if (pace.status !== 'behind') return 'var(--s-good)'
  return pace.delta < -PACE_TOLERANCE * 2 ? 'var(--s-risk)' : 'var(--s-short)'
}

/** Most recent logged value for a metric, or null. */
export function metricLatest(metric, logs) {
  let best = null
  for (const l of logs || []) {
    if (l.metric_id !== metric.id) continue
    if (!best || l.log_date > best.log_date) best = l
  }
  return best
}

/** 'up' or 'down', from the sign of target - start. A metric with no
    baseline is treated as starting at 0, which is what the app assumed
    before baselines existed, so old metrics keep reading the same. */
export function metricDirection(metric) {
  const target = num(metric.target)
  if (target == null) return null
  const start = num(metric.start_value) ?? 0
  return target >= start ? 'up' : 'down'
}

export function metricProgress(metric, current) {
  const target = num(metric.target)
  const cur = num(current)
  if (target == null || cur == null) return null
  const start = num(metric.start_value) ?? 0
  if (target === start) return cur === target ? 1 : 0
  return clamp01((cur - start) / (target - start))
}

/** Has `value` reached `threshold`, in this metric's own direction. */
export function reached(metric, value, threshold) {
  const v = num(value), t = num(threshold)
  if (v == null || t == null) return false
  return metricDirection(metric) === 'down' ? v <= t : v >= t
}

/** How far through its time window a cycle is, 0..1. Day 1 is 0, past the
    end is 1. Plain date maths on ISO strings, no clock-time drift. */
export function cycleElapsed(sprint, onDate = dateKey()) {
  if (!sprint?.start_date || !sprint?.end_date) return null
  const total = dayNum(sprint.end_date) - dayNum(sprint.start_date) + 1
  if (total <= 0) return null
  return clamp01((dayNum(onDate) - dayNum(sprint.start_date)) / total)
}

/**
 * Pace for a metric that is attached to a cycle (metric.sprint_id).
 *   status 'none'   no target, no cycle link, or nothing logged yet
 *   'ahead'|'on'|'behind'  actual progress vs expected, within PACE_TOLERANCE
 * `expectedValue` is the value the straight line says you should be at today.
 */
export function metricPace(metric, logs, sprint) {
  const none = { status: 'none', actual: null, expected: null, expectedValue: null, current: null }
  if (!sprint || metric.sprint_id !== sprint.id) return none
  const target = num(metric.target)
  if (target == null) return none
  const start = num(metric.start_value) ?? 0
  const expected = cycleElapsed(sprint)
  if (expected == null) return none
  const expectedValue = start + (target - start) * expected
  const latest = metricLatest(metric, logs)
  if (!latest) return { ...none, expected, expectedValue }
  const actual = metricProgress(metric, latest.value)
  const delta = actual - expected
  const status = delta > PACE_TOLERANCE ? 'ahead' : delta < -PACE_TOLERANCE ? 'behind' : 'on'
  return { status, actual, expected, expectedValue, current: Number(latest.value), delta }
}

export const PACE_LABEL = { ahead: 'Ahead of pace', on: 'On pace', behind: 'Behind pace', none: 'No data yet' }

/**
 * Adherence x outcome. The point of showing both: effort and results fail
 * for different reasons and need different fixes.
 *   did the work + behind  -> the plan is wrong, change the actions
 *   skipped it  + behind   -> consistency first, the plan is untested
 *   skipped it  + ahead    -> actions may be overbuilt, or the target soft
 * Needs an adherence percentage (null until enough sample) and at least one
 * paced metric with data; otherwise there is nothing honest to say.
 */
export function cycleDiagnosis(adherencePct, paces) {
  if (adherencePct == null) return null
  const live = (paces || []).filter((p) => p.status !== 'none')
  if (!live.length) return null
  const order = { behind: 0, on: 1, ahead: 2 }
  const worst = live.reduce((a, b) => (order[b.status] < order[a.status] ? b : a)).status
  const did = adherencePct >= ADHERENCE_BAR
  if (worst === 'behind') {
    return did
      ? { tone: 'orange', title: 'Doing the work, outcome is behind',
          text: 'Your actions are landing but the number is not moving fast enough. Change the plan, not the effort.' }
      : { tone: 'red', title: 'Behind on both',
          text: 'The actions are not happening consistently, so the plan has not really been tested. Fix consistency first.' }
  }
  if (worst === 'ahead' && !did) {
    return { tone: 'blue', title: 'Ahead despite missed actions',
      text: 'The outcome is ahead of pace even with gaps in the actions. The actions may be overbuilt, or the target soft.' }
  }
  return { tone: 'green', title: did ? 'On plan' : 'On pace',
    text: did ? 'Actions and outcome are both where they should be.' : 'The outcome is on pace, though the actions have slipped. Keep an eye on it.' }
}

/** What each metric attached to a finished cycle ended at, as plain lines:
    "Weight 90 → 83 (target 82)". For the retro, so a cycle closes on its
    result and not only on how many actions got ticked. */
export function cycleOutcomeSummary(sprint, metrics, logs) {
  const out = []
  for (const m of metrics || []) {
    if (m.sprint_id !== sprint.id || num(m.target) == null) continue
    const inCycle = (logs || []).filter((l) => l.metric_id === m.id && l.log_date >= sprint.start_date && l.log_date <= sprint.end_date)
    const last = inCycle.reduce((a, b) => (!a || b.log_date > a.log_date ? b : a), null)
    const start = num(m.start_value)
    const f = (v) => fmtMetricValue(m.type, v)
    if (!last) { out.push(`${m.name}: nothing logged (target ${f(m.target)})`); continue }
    const hit = reached(m, last.value, m.target)
    out.push(`${m.name} ${start != null ? `${f(start)} → ` : ''}${f(last.value)} (target ${f(m.target)})${hit ? ', reached' : ''}`)
  }
  return out
}

/* ── Phase milestones ─────────────────────────────────────── */

/** The date a phase ends: the Sunday of its last week, capped at the cycle end. */
export function phaseDueDate(sprint, phaseIdx, phaseCount) {
  const [, endWeek] = phaseWeekRange(phaseIdx, sprintWeeks(sprint), phaseCount)
  const due = dateKeyForWeekDay(sprint, endWeek, 6)
  if (!due) return null
  return sprint.end_date && sprint.end_date < due ? sprint.end_date : due
}

/** A phase counts as having a milestone if it has text or a metric threshold. */
export const hasMilestone = (p) => Boolean(p.milestone_text?.trim() || (p.milestone_metric_id && p.milestone_target != null))

/** Milestone label when the user left the text blank but set a metric threshold. */
export function milestoneText(phase, metric) {
  if (phase.milestone_text?.trim()) return phase.milestone_text.trim()
  if (!metric) return 'Milestone'
  const sym = metricDirection(metric) === 'down' ? '≤' : '≥'
  return `${metric.name} ${sym} ${phase.milestone_target}`
}

/**
 * Status of one phase's milestone as of today.
 *   met       reached (metric threshold hit, or ticked off by hand)
 *   missed    the phase is over and it was not reached
 *   due       the phase ends within the next 7 days
 *   upcoming  further out
 * A metric milestone is met the moment the latest value reaches the
 * threshold, even before the phase ends. A manual one is met when ticked.
 */
export function phaseMilestone(phase, phaseIdx, phaseCount, sprint, metrics, logs, onDate = dateKey()) {
  if (!hasMilestone(phase)) return null
  const metric = phase.milestone_metric_id ? (metrics || []).find((m) => m.id === phase.milestone_metric_id) : null
  const dueOn = phaseDueDate(sprint, phaseIdx, phaseCount)
  const latest = metric ? metricLatest(metric, logs) : null
  let met = false
  if (metric && phase.milestone_target != null) met = latest ? reached(metric, latest.value, phase.milestone_target) : false
  if (!met && phase.milestone_done_on) met = true
  let status = 'upcoming'
  if (met) status = 'met'
  else if (dueOn && dueOn < onDate) status = 'missed'
  else if (dueOn && dayNum(dueOn) - dayNum(onDate) <= 7) status = 'due'
  return {
    phase, phaseIdx, metric, dueOn, met, status,
    text: milestoneText(phase, metric),
    manual: !metric,
    current: latest ? Number(latest.value) : null,
    target: phase.milestone_target != null ? Number(phase.milestone_target) : null,
  }
}

export function sprintMilestones(sprint, phases, metrics, logs) {
  const sorted = [...(phases || [])].sort((a, b) => a.phase_index - b.phase_index)
  return sorted.map((p, i) => phaseMilestone(p, i, sorted.length, sprint, metrics, logs)).filter(Boolean)
}

/* ── Goal-level progress and time ─────────────────────────── */

/**
 * One progress figure for a goal, from whichever source applies.
 * goal.progress_mode picks the source explicitly; null means auto, which
 * takes the first source that has data: metrics, then milestones, then
 * tasks. Returns { source, pct, label, detail } or null when nothing at all
 * can speak for the goal. An explicit mode with no data yet returns
 * pct: null plus a `hint`, so the card can say what to do rather than lie.
 */
export function goalProgress({ goal, metrics, logs, sprints, phases, roll }) {
  const mine = (metrics || []).filter((m) => m.goal_id === goal.id)
  const fromMetrics = () => {
    const parts = []
    for (const m of mine) {
      if (num(m.target) == null) continue
      const latest = metricLatest(m, logs)
      const cur = latest ? latest.value : num(m.start_value)
      const p = metricProgress(m, cur)
      if (p != null) parts.push(p)
    }
    if (!parts.length) return null
    const pct = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100)
    return { source: 'metric', pct, label: parts.length === 1 ? 'of the metric target' : `across ${parts.length} metrics` }
  }
  const fromMilestones = () => {
    const mySprints = (sprints || []).filter((s) => s.goal_id === goal.id && !s.archived)
    let met = 0, total = 0
    for (const sp of mySprints) {
      for (const m of sprintMilestones(sp, (phases || []).filter((p) => p.sprint_id === sp.id), metrics, logs)) {
        total++; if (m.met) met++
      }
    }
    if (!total) return null
    return { source: 'milestones', pct: Math.round((met / total) * 100), label: `${met} of ${total} milestones met` }
  }
  const fromTasks = () => {
    const done = roll?.done_tasks ?? 0, open = roll?.open_tasks ?? 0
    if (!done && !open) return null
    return { source: 'tasks', pct: Math.round((done / (done + open)) * 100), label: `${done} of ${done + open} tasks done` }
  }
  const sources = { metric: fromMetrics, milestones: fromMilestones, tasks: fromTasks }
  const HINT = {
    metric: 'Add a metric with a target and log a value to track progress.',
    milestones: 'Add a milestone to a phase to track progress.',
    tasks: 'Link Pulse tasks to this goal to track progress.',
  }
  if (goal.progress_mode && sources[goal.progress_mode]) {
    return sources[goal.progress_mode]() || { source: goal.progress_mode, pct: null, label: '', hint: HINT[goal.progress_mode] }
  }
  return fromMetrics() || fromMilestones() || fromTasks()
}

/**
 * How much of the goal's time has gone. The deadline is the goal's own
 * target date if set, else the end of its live cycle, else its latest
 * cycle. The clock starts at its earliest cycle (or, with none, when the
 * goal was created). Null when there is no deadline or it is not after the
 * start, so a card never shows a nonsense percentage.
 */
export function goalTime({ goal, sprints, onDate = dateKey() }) {
  const mine = (sprints || []).filter((s) => s.goal_id === goal.id && !s.archived && s.start_date && s.end_date)
  const live = mine.find((s) => s.start_date <= onDate && onDate <= s.end_date)
  const latestEnd = mine.length ? mine.reduce((a, b) => (b.end_date > a.end_date ? b : a)).end_date : null
  const deadline = goal.target_date || live?.end_date || latestEnd
  if (!deadline) return null
  const earliest = mine.length ? mine.reduce((a, b) => (b.start_date < a.start_date ? b : a)).start_date : null
  const start = earliest || (goal.created_at ? goal.created_at.slice(0, 10) : null)
  if (!start) return null
  const total = dayNum(deadline) - dayNum(start)
  if (total <= 0) return null
  const elapsedPct = Math.round(clamp01((dayNum(onDate) - dayNum(start)) / total) * 100)
  return { deadline, elapsedPct, daysLeft: dayNum(deadline) - dayNum(onDate) }
}

/** Outcome progress vs time elapsed, same tolerance as metric pace. */
export function goalStanding(progress, time) {
  if (!progress || progress.pct == null || !time) return null
  const delta = progress.pct / 100 - time.elapsedPct / 100
  return delta > PACE_TOLERANCE ? 'ahead' : delta < -PACE_TOLERANCE ? 'behind' : 'on'
}

/* ── Review: actions that need a decision ─────────────────── */

/**
 * Actions below the adherence bar in EACH of the last two weeks, counting
 * `lastDone` (the week being closed out) and the one before it. One bad week
 * is noise; two in a row is a pattern that deserves a keep, change or drop
 * decision. Only actions that also run the week AFTER `lastDone` are
 * returned, so a decision always has somewhere to land.
 * `rowsForWeek(w)` is tacticWeekRows for that week, passed in so this file
 * stays free of cycle internals.
 */
export function flaggedTactics(sprint, rowsForWeek, lastDone) {
  const total = sprintWeeks(sprint)
  if (!lastDone || lastDone < 2 || lastDone >= total) return []
  const byWeek = (w) => new Map(rowsForWeek(w).map((r) => [r.tactic.id, r]))
  const w1 = byWeek(lastDone), w2 = byWeek(lastDone - 1), next = byWeek(lastDone + 1)
  const out = []
  for (const [id, a] of w1) {
    const b = w2.get(id)
    if (!b || !next.has(id)) continue
    if (!a.possible || !b.possible) continue
    const pa = Math.round((a.done / a.possible) * 100), pb = Math.round((b.done / b.possible) * 100)
    if (pa < ADHERENCE_BAR && pb < ADHERENCE_BAR) out.push({ sprint, tactic: a.tactic, weeks: [pb, pa], lastDone })
  }
  return out
}
