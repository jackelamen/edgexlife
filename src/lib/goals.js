/*
  Focus Cycle mechanics, ported verbatim from goals.html's execution-scoring
  engine. This is the part of Goals that's actually a program, not just a
  form — a cycle (1 to 12 weeks, see CYCLE_LENGTHS) has weekly checkpoints
  per tactic, and the "how am I doing" number is computed from how many of
  those checkpoints landed.

  Adapted for the normalized schema: the original kept phases+tactics
  embedded inside the sprint's own JSON; here they're real rows
  (sprint_phases, sprint_tactics with phase_index) joined in JS instead.
*/

import { startOfWeek } from 'date-fns'
import { AREA_COLORS, statusFor } from './design'
import { dateKey } from './dates'

// Colour is sourced from lib/design.js's AREA_COLORS, not hardcoded here.
// The old hex (health #26C281, family #EF5350) sat almost on top of the
// RESERVED status ramp (STATUS.good/STATUS.risk in design.js) — a health-area
// badge and a "goal is on track" badge were nearly the same green, and a
// family-area badge and an "at risk" badge were nearly the same red. That's
// a real violation of design.js's own rule 3, not just a taste mismatch.
// Reading through AREA_COLORS fixes it at the one place every consumer
// (GoalsPage, VisionBoard) already reads from.
export const AREA_META = {
  health: { label: 'Health', color: AREA_COLORS.health },
  work: { label: 'Career', color: AREA_COLORS.work },   // schema calls it "work", original UI called it "Career"
  family: { label: 'Family', color: AREA_COLORS.family },
  personal: { label: 'Personal', color: AREA_COLORS.personal },
}
export const areaLabel = (id) => AREA_META[id]?.label || id
export const areaColor = (id) => AREA_META[id]?.color || '#7C4DFF'

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Mon-based day index (0=Mon…6=Sun), unlike JS's native Sun=0. */
export function todayDayIdx() {
  return (new Date().getDay() + 6) % 7
}

/** Preset cycle lengths offered when creating a Focus Cycle. Not every goal
    needs the full 12 weeks — a "clean my room" habit and a "run a 10k"
    program don't belong on the same clock. */
export const CYCLE_LENGTHS = [1, 2, 4, 6, 8, 12]
export const DEFAULT_CYCLE_LENGTH = 12

/** sp.weeks is the source of truth (stored at creation — see saveSprint /
    autoEndDate); this fallback only matters for rows written before that
    column existed, which were all 12-week cycles, the only length ever
    offered until now. */
export const sprintWeeks = (sp) => sp.weeks || DEFAULT_CYCLE_LENGTH

/** Which week of a cycle "today" falls in, clamped to the cycle's own
    length (sprintWeeks). Monday-anchored, same as Review's weekIdFor: week
    1 starts the Monday on/before start_date, not start_date itself. A
    cycle that kicks off mid-week (Saturday, say) still gets a real week 1
    that runs Mon-Sun like every other week in the app, rather than a
    "week" that's really a same-length-but-offset 7-day counter from an
    arbitrary start day. Before this, a cycle starting on a Sat/Sun could
    show "Week 3" on a day Review would call the third Monday-anchored
    week's *second* week, because the two systems disagreed about where
    week boundaries fall. */
export function sprintCurrentWeek(sp) {
  if (!sp.start_date) return 1
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(sp.start_date + 'T00:00:00'); start.setHours(0, 0, 0, 0)
  const anchor = startOfWeek(start, { weekStartsOn: 1 })
  const daysDiff = Math.floor((today - anchor) / (24 * 3600 * 1000))
  const week = Math.floor(daysDiff / 7) + 1
  return Math.min(Math.max(week, 1), sprintWeeks(sp))
}
export const sprintProgressPct = (sp) => Math.round((sprintCurrentWeek(sp) / sprintWeeks(sp)) * 100)

/** Whether "today" (calendar day, not exact timestamp) falls within the
    cycle's date range. Deliberately a plain string comparison of the
    YYYY-MM-DD dates rather than constructing Date objects anchored at
    T12:00 and comparing against `new Date()` — that anchoring meant a
    cycle starting "today" only counted as active from noon onward, so
    anyone checking before noon on day one (or, worse, checking overnight,
    when the clock has already rolled to a new calendar date but the
    session still feels like "last night") saw their brand-new cycle as
    not live yet. Plain ISO-date strings sort correctly lexicographically,
    so this can't drift out of sync with sprintCurrentWeek's own
    local-midnight math below. */
export function isSprintActive(sp) {
  if (!sp.start_date || !sp.end_date) return false
  const t = dateKey()
  return sp.start_date <= t && t <= sp.end_date
}
export function isSprintUpcoming(sp) {
  return sp.start_date ? sp.start_date > dateKey() : false
}

/** [startWeek, endWeek] (1-indexed, inclusive) that phase `pi` of
    `phaseCount` owns within a `totalWeeks`-long cycle, evenly split — a
    12-week cycle with 3 phases still gets the original 4/4/4 split, a
    3-week cycle with 3 phases gets 1 week each. When phaseCount exceeds
    totalWeeks (3 phases on a 1-week cycle, say) the ranges legitimately
    overlap rather than leaving any phase's tactics permanently
    unreachable — every phase gets at least the single week it can fit
    in, even if that means sharing a week with another phase. */
export function phaseWeekRange(pi, totalWeeks, phaseCount) {
  if (!phaseCount || !totalWeeks) return [1, 1]
  const start = Math.floor((pi * totalWeeks) / phaseCount) + 1
  const end = Math.max(start, Math.floor(((pi + 1) * totalWeeks) / phaseCount))
  return [start, end]
}

/** The single phase a given week "belongs to" for display purposes (a
    ring's sub-label, say) where naming more than one would be awkward —
    the last phase whose range has already started. Agrees with
    phaseWeekRange in the normal non-overlapping case; tacticsForWeek
    below doesn't use this, since it needs every overlapping phase, not
    just one. */
export function phaseIdxForWeek(week, totalWeeks, phaseCount) {
  let idx = 0
  for (let pi = 0; pi < phaseCount; pi++) {
    if (phaseWeekRange(pi, totalWeeks, phaseCount)[0] <= week) idx = pi
  }
  return idx
}

/** Tactics scoped to a given week, from every phase whose range covers
    that week — plural, not "the" phase, because a short cycle can
    compress multiple phases onto the same week (see phaseWeekRange). */
export function tacticsForWeek(phases, tactics, week, sp) {
  const sorted = [...phases].sort((a, b) => a.phase_index - b.phase_index)
  const totalWeeks = sprintWeeks(sp)
  const phaseCount = sorted.length
  const phaseIds = sorted
    .filter((_, pi) => {
      const [start, end] = phaseWeekRange(pi, totalWeeks, phaseCount)
      return week >= start && week <= end
    })
    .map((p) => p.id)
  if (!phaseIds.length) return []
  return tactics.filter((t) => phaseIds.includes(t.phase_id))
}

/** The stable identity used as a checks-object key — see saveTactic in data.js. */
export const tacticKeyId = (t) => t.local_id || t.id

/* ── Day swaps ──────────────────────────────────────────────
   A custom-day tactic (say, MWF) has one obligation attached to each of
   its native days. Day swaps let a specific week reassign one of those
   obligations to a different day — "F got busy, I'll do it Saturday
   instead" — WITHOUT touching the tactic's default schedule going
   forward, and without rewriting history: completion is still recorded
   under the ORIGINAL day's checkKey (see checkKey above), only the day it
   visually shows up on for that one week changes. This means execScore
   (week-level, day-blind) needs no changes at all — an obligation is
   still "1 of N possible checkpoints," full stop, regardless of which
   calendar day displays it. Only the day-specific reads (today's due
   list, the dot row) need to consult a swap.

   Storage shape, on sprint.day_swaps: { [week]: { [tacticKeyId]: {
   [fromDayIdx]: toDayIdx } } } — snake_case column used directly as the
   JS property, same pattern as week_checks/archived, no camelCase
   mapping layer. */

function swapMapFor(sprint, week, tactic) {
  const raw = (sprint.day_swaps || {})[week]?.[tacticKeyId(tactic)] || {}
  const map = {}
  for (const k of Object.keys(raw)) map[Number(k)] = Number(raw[k])
  return map
}

/** This week's custom-day list with any active swaps applied, in the same
    order as tactic.days — the day each dot/obligation visually sits on.
    Completion is still keyed by the ORIGINAL day (tactic.days[i]), never
    by this display day, so callers that need to read/write a checkmark
    should zip the two arrays together rather than using this alone. */
export function effectiveCustomDays(tactic, sprint, week) {
  const swaps = swapMapFor(sprint, week, tactic)
  return (tactic.days || []).map((d) => (d in swaps ? swaps[d] : d))
}

/** Inverse lookup for "what original obligation, if any, is showing up on
    `displayDay` today" — used where the caller starts from today's day
    index rather than iterating the tactic's own days (Mission Control's
    due-today list). Returns null if `displayDay` is itself a native day
    that got swapped away (nothing displays there this week). */
export function originalDayFor(tactic, sprint, week, displayDay) {
  const swaps = swapMapFor(sprint, week, tactic)
  const hit = Object.keys(swaps).find((k) => swaps[k] === displayDay)
  if (hit != null) return Number(hit)
  return displayDay in swaps ? null : displayDay
}

/** Pure data transform: returns a new day_swaps object with `tactic`'s
    `fromDay` in `week` pointed at `toDay`. Passing `toDay == null` (or
    equal to `fromDay`) clears the swap and reverts that day to its native
    schedule. Callers pass the result straight to saveSprint. */
export function withDaySwap(sprint, week, tactic, fromDay, toDay) {
  const all = { ...(sprint.day_swaps || {}) }
  const wk = { ...(all[week] || {}) }
  const forTactic = { ...(wk[tacticKeyId(tactic)] || {}) }
  if (toDay == null || toDay === fromDay) delete forTactic[fromDay]
  else forTactic[fromDay] = toDay
  if (Object.keys(forTactic).length) wk[tacticKeyId(tactic)] = forTactic
  else delete wk[tacticKeyId(tactic)]
  if (Object.keys(wk).length) all[week] = wk
  else delete all[week]
  return all
}

export const xpwTarget = (t) => Math.max(1, parseInt(t.times_per_week) || 1)
export function xpwDoneCount(t, checks) {
  const n = xpwTarget(t)
  let c = 0
  for (let i = 0; i < n; i++) if (checks[`${tacticKeyId(t)}_${i}`]) c++
  return c
}
export function xpwDoneToday(t, checks) {
  const n = xpwTarget(t)
  const today = dateKey()
  let c = 0
  for (let i = 0; i < n; i++) if (checks[`${tacticKeyId(t)}_${i}`] === today) c++
  return c
}
export const xpwDidToday = (t, checks) => xpwDoneToday(t, checks) > 0

/** How many checkpoints exist in a week for this tactic. */
export function tacticCheckpointCount(t) {
  if (t.freq === 'daily') return 7
  if (t.freq === 'custom') return (t.days || []).length || 1
  if (t.freq === 'xperweek') return xpwTarget(t)
  return 1 // weekly, onetime
}

/** Storage key for a single checkpoint within a week's checks object. */
export function checkKey(t, dayIdx) {
  const id = tacticKeyId(t)
  if (t.freq === 'daily' || t.freq === 'custom') return `${id}_${dayIdx}`
  return id
}

export function tacticActiveToday(t) {
  if (t.freq === 'daily' || t.freq === 'weekly' || t.freq === 'onetime' || t.freq === 'xperweek') return true
  if (t.freq === 'custom') return (t.days || []).includes(todayDayIdx())
  return true
}

// localDateKey removed — use dateKey() from lib/dates.js (imported above).

/** The actual calendar date a (week, dayIdx) grid slot falls on, using the
    same Monday-anchored reconstruction sprintCurrentWeek does. Week 1's
    grid always runs a full Mon-Sun even when the cycle itself started
    mid-week (a Saturday start, say) — this is what lets callers tell
    "this slot is before the cycle even began" apart from "this slot
    hasn't happened yet." */
function dateKeyForWeekDay(sp, week, dayIdx) {
  if (!sp.start_date) return null
  const start = new Date(sp.start_date + 'T12:00:00')
  const anchor = startOfWeek(start, { weekStartsOn: 1 })
  const d = new Date(anchor)
  d.setDate(d.getDate() + (week - 1) * 7 + dayIdx)
  return dateKey(d)
}

/** Whether a (week, dayIdx) checkpoint should count toward the possible/
    done totals at all — true only for dates that both (a) fall on or
    after the cycle's own start_date, so a Mon/Tue that happened before a
    Saturday-start cycle even began can't drag week 1's score down for
    something there was never a chance to do, and (b) have actually
    arrived (capped at end_date once the cycle's over, so a finished
    cycle's history doesn't grow extra "not yet due" gaps). Past weeks
    and the current week are handled by the exact same rule — there's no
    separate isCurrentWeek branch here, because "hasn't happened yet" and
    "happened before this cycle started" are the same kind of gap. */
function dayIsCountable(sp, week, dayIdx) {
  const d = dateKeyForWeekDay(sp, week, dayIdx)
  if (!d || !sp.start_date) return true
  const today = dateKey()
  const cap = sp.end_date && sp.end_date < today ? sp.end_date : today
  return d >= sp.start_date && d <= cap
}

/** Whether `week` ever had all 7 of its calendar days actually belong to
    the cycle — false for a week truncated by the cycle's own start_date
    or end_date (a Saturday start means week 1 only really had 2 days,
    Sat+Sun). A flexible weekly/xperweek/onetime target still expects its
    FULL amount even in a week like that unless this says otherwise —
    dayIsCountable alone doesn't help those, since they aren't tied to
    any particular day the way daily/custom tactics are. */
function weekIsPartial(sp, week) {
  for (let d = 0; d < 7; d++) if (!dayIsCountable(sp, week, d)) return true
  return false
}

/**
 * Execution score for one week: ratio of checked to possible checkpoints.
 * Daily/custom-day checkpoints only count once their actual calendar date
 * has both arrived AND falls within the cycle's own [start_date, end_date]
 * — a Mon/Wed/Fri tactic only owes a Wednesday checkpoint once Wednesday
 * gets here, and a cycle that started on a Saturday never owed anything
 * for the Monday-Friday before it began, so week 1 isn't punished for a
 * week that was really only 2 days long. Flexible weekly/xperweek/onetime
 * targets only count once the week is over, same as always, so "3x this
 * week" doesn't read as behind on day one. This is what keeps the live
 * number honest: it answers "how am I doing on what's actually been due,"
 * not "how much of the eventual week is done right now."
 */
/*
 * The same checkpoint counting as execScore, but returned PER TACTIC
 * instead of summed. A cycle scoring 68% tells you nothing you can act
 * on; "Run 5/5, Journal 1/7" names the single commitment dragging it.
 * execScore is defined in terms of this rather than repeating the
 * frequency rules, so the headline number and the breakdown under it can
 * never disagree.
 */
export function tacticWeekRows(phases, tactics, sp, week) {
  const weekTactics = tacticsForWeek(phases, tactics, week, sp)
  const checks = (sp.week_checks || {})[week] || {}
  // isSprintActive matters here, not just the week number: sprintCurrentWeek
  // clamps at 12 forever once a cycle's end_date has passed, so a finished
  // cycle's last week would otherwise look permanently "current" and get
  // its future days excluded — cutting off real history in Retros for a
  // week that's fully over. Requiring the sprint to still be live is what
  // keeps that clamp from leaking into completed-cycle scoring. (Only the
  // weekly/xperweek branches below still need this — daily/custom use
  // dayIsCountable, which folds the same idea into a plain date check.)
  const isCurrentWeek = week === sprintCurrentWeek(sp) && isSprintActive(sp)
  // A flexible target gets the "credit only, never penalised" treatment
  // either while its week is still in progress (isCurrentWeek) OR
  // permanently, if that week was truncated by the cycle's own start/end
  // date — a week that only ever had 2 real days in it was never a fair
  // shot at a full weekly target, current or not.
  const lenient = isCurrentWeek || weekIsPartial(sp, week)
  return weekTactics.map((t) => {
    const freq = t.freq || 'weekly'
    let possible = 0, done = 0
    if (freq === 'daily') {
      for (let d = 0; d < 7; d++) {
        if (!dayIsCountable(sp, week, d)) continue
        possible++; if (checks[checkKey(t, d)]) done++
      }
    } else if (freq === 'custom') {
      ;(t.days || []).forEach((d) => {
        if (!dayIsCountable(sp, week, d)) return
        possible++; if (checks[checkKey(t, d)]) done++
      })
    } else if (freq === 'xperweek') {
      const target = xpwTarget(t)
      const doneCount = Math.min(xpwDoneCount(t, checks), target)
      if (!lenient) {
        possible = target; done = doneCount
      } else {
        // Credit for whatever's been done so far, no penalty for the
        // remaining flexible-day target — either the week isn't over
        // yet, or it never had a fair 7 days to hit the target in.
        possible = doneCount; done = doneCount
      }
    } else if (!lenient) {
      // A weekly/one-off tactic only counts against you once its week is
      // both over AND was a real full week — mid-week it isn't late yet,
      // and a truncated week never owed the full target to begin with.
      possible = 1; done = checks[tacticKeyId(t)] ? 1 : 0
    } else if (checks[tacticKeyId(t)]) {
      possible = 1; done = 1
    }
    return { tactic: t, text: t.text || '', freq, done, possible }
  })
}

export function execScore(phases, tactics, sp, week) {
  const rows = tacticWeekRows(phases, tactics, sp, week)
  if (!rows.length) return null
  let possible = 0, done = 0
  rows.forEach((r) => { possible += r.possible; done += r.done })
  return possible ? Math.round((done / possible) * 100) : null
}

export function avgExecScore(phases, tactics, sp) {
  const cw = sprintCurrentWeek(sp)
  let sum = 0, cnt = 0
  for (let w = 1; w <= cw; w++) {
    const s = execScore(phases, tactics, sp, w)
    if (s === null) continue
    const isPast = w < cw
    const hasSomeChecks = Object.keys((sp.week_checks || {})[w] || {}).length > 0
    if (isPast || hasSomeChecks) { sum += s; cnt++ }
  }
  return cnt ? Math.round(sum / cnt) : null
}

/** Obligations due TODAY across a cycle's active-week tactics. */
export function todayDoneTotals(phases, tactics, sp) {
  const wk = sprintCurrentWeek(sp)
  const weekTactics = tacticsForWeek(phases, tactics, wk, sp)
  const checks = (sp.week_checks || {})[wk] || {}
  const todayIdx = todayDayIdx()
  const isSunday = todayIdx === 6
  let done = 0, total = 0
  weekTactics.forEach((t) => {
    const freq = t.freq || 'weekly'
    if (freq === 'daily') {
      total++; if (checks[checkKey(t, todayIdx)]) done++
    } else if (freq === 'custom') {
      // Swap-aware: today counts as due either because it's a native day
      // that wasn't moved away, or because another day's obligation was
      // swapped onto today this week. Either way the checkmark itself
      // still lives under the ORIGINAL day's key.
      if (effectiveCustomDays(t, sp, wk).includes(todayIdx)) {
        const origDay = originalDayFor(t, sp, wk, todayIdx)
        total++; if (checks[checkKey(t, origDay)]) done++
      }
    } else if (freq === 'xperweek') {
      const n = xpwTarget(t), c = xpwDoneCount(t, checks)
      const didToday = xpwDidToday(t, checks)
      if (didToday || c < n) { total++; if (didToday) done++ }
    } else {
      // weekly/onetime now store the ISO date they were checked on (see
      // CycleCard's toggle), not a bare boolean — so "done today" can
      // mean exactly that, not "done on any day this week." A weekly
      // tactic finished on Monday shouldn't keep inflating every later
      // day's "done today" count through Saturday; it's just not part
      // of today's tally anymore once its own day has passed. Sunday is
      // still the deadline: unchecked-and-Sunday counts as owed today.
      const doneDate = checks[tacticKeyId(t)]
      const doneToday = doneDate === dateKey()
      if (doneToday) { total++; done++ }
      else if (!doneDate && isSunday) { total++ }
    }
  })
  return { done, total }
}

export function scoreColor(s) {
  if (s == null) return 'var(--text-3)'
  return s >= 85 ? '#10b981' : s >= 65 ? '#f97316' : '#ef4444'
}
export function scoreBadgeTone(s) {
  if (s == null) return 'muted'
  return s >= 85 ? 'green' : s >= 65 ? 'orange' : 'red'
}

/** Plain-language read on a week's execution score, in place of just a
    number — a bare percentage reads as a grade; this reads as a coach.
    Pulled from statusFor() (lib/design.js) rather than its own
    thresholds, so the words can never disagree with the colour the Ring
    is already showing for the same score. */
export function scoreMomentumLine(score) {
  const status = statusFor(score)
  if (!status) return null
  if (status.label === 'On track') return 'Crushing it this week'
  if (status.label === 'Short') return 'Solid pace this week'
  return 'This week needs a push'
}

/** End date for a new cycle of the given length, starting from `startDate`. */
export function autoEndDate(startDate, weeks = DEFAULT_CYCLE_LENGTH) {
  if (!startDate) return ''
  const d = new Date(startDate + 'T12:00:00')
  d.setDate(d.getDate() + 7 * weeks - 1)
  return dateKey(d)
}

export const DEFAULT_PHASES = [
  { name: 'Foundation', description: '' },
  { name: 'Build', description: '' },
  { name: 'Peak', description: '' },
]

/* ── Day streak ─────────────────────────────────────────────
   The Today view had no single "you've shown up N days running" number —
   only a per-cycle execution-score ring, which only moves once a week is
   over. week_checks doesn't store absolute dates for daily/custom
   tactics (just a week number + day index relative to that sprint's own
   grid), so a real date has to be reconstructed from the sprint's
   start_date via dateKeyForWeekDay (the SAME Monday-anchored reconstruction
   sprintCurrentWeek and dayIsCountable use — this used to anchor day-0
   directly at start_date instead of the Monday on/before it, which meant
   every daily/custom date reconstructed here was wrong by up to 6 days
   whenever a cycle didn't start on a Monday). xperweek and weekly/onetime
   checks store the ISO date they were completed on (see CycleCard's
   toggle/toggleXpw), so those need no reconstruction — the string-value
   branch below just adds it directly. */
export function completedCheckDates(sprints) {
  const dates = new Set()
  for (const sp of sprints || []) {
    if (!sp.start_date) continue
    const weeks = sp.week_checks || {}
    for (const wkStr of Object.keys(weeks)) {
      const week = Number(wkStr)
      const checks = weeks[wkStr] || {}
      for (const key of Object.keys(checks)) {
        const val = checks[key]
        if (!val) continue
        if (typeof val === 'string') { dates.add(val); continue } // xperweek stores the ISO date
        const m = key.match(/_(\d)$/) // daily/custom: `${tacticId}_${dayIdx}`
        if (!m) continue
        const d = dateKeyForWeekDay(sp, week, Number(m[1]))
        if (d) dates.add(d)
      }
    }
  }
  return dates
}

/** Consecutive days, ending today (or yesterday if nothing's checked off
    yet today so a fresh morning doesn't read as a broken streak), with at
    least one completed tactic across every cycle. */
export function goalStreak(sprints) {
  const dates = completedCheckDates(sprints)
  const t = dateKey()
  let n = 0
  const d = new Date()
  for (;;) {
    const iso = dateKey(d)
    if (dates.has(iso)) { n++; d.setDate(d.getDate() - 1) }
    else if (n === 0 && iso === t) d.setDate(d.getDate() - 1)
    else break
  }
  return n
}

/* ── Streak milestones ──────────────────────────────────────
   goalStreak() recomputes from scratch every render, so a milestone
   only matches on the single day the count actually lands on it — the
   day after, the streak has moved to n+1 and the banner clears itself
   with no extra bookkeeping. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 100, 150, 200, 365]

const STREAK_MILESTONE_COPY = {
  3: 'Three days in a row — the habit is starting to stick.',
  7: 'A full week, no misses.',
  14: 'Two weeks straight.',
  21: 'Three weeks — this is a habit now.',
  30: 'A month of showing up every day.',
  45: 'Six and a half weeks. Still going.',
  60: 'Two months, no gaps.',
  90: 'A full quarter, every single day.',
  100: 'Triple digits.',
  150: 'Five months straight.',
  200: '200 days. This is who you are now.',
  365: 'A full year, one day at a time.',
}

/** Whether today's streak count just landed on a milestone, and if so
    the plain-language line to show alongside it. Returns null on any
    other day. */
export function streakMilestone(streak) {
  if (!STREAK_MILESTONES.includes(streak)) return null
  return { days: streak, message: STREAK_MILESTONE_COPY[streak] }
}
