/*
  Weekly review: week identity, prompts, and the auto-gathered summary.

  Why this module exists
  ----------------------
  xLife records continuously and reflects never. `sprints.reflections` is
  written on every cycle save and read by nothing; `retro.carry` is written
  once and never read again. The 12-week system's actual engine is the
  weekly review, and until now the app had no surface for it.

  It is also not a new idea here: `weekly_reviews` already held two real
  reviews from April and May 2026, written in an earlier surface and then
  abandoned. This module is deliberately built against that existing
  schema, column for column, rather than inventing a parallel one — the
  old entries show up in History on day one.

  Week identity
  -------------
  A week is keyed by the ISO date of its MONDAY, matching the two existing
  rows ("2026-04-27", "2026-05-11"). All date maths here goes through
  date-fns in LOCAL time. That is load-bearing: much of the app derives
  date keys via `new Date().toISOString().slice(0, 10)`, which is UTC, and
  in Asia/Seoul (UTC+9) that returns YESTERDAY between midnight and 09:00.
  A review filed on Monday morning would land in the previous week. None
  of that class of bug is reachable from here.
*/
import { addDays, format, startOfWeek } from 'date-fns'
import { iso, today } from './dates'

/** Monday of the week containing `dateStr` (or today), as an ISO date. */
export function weekIdFor(dateStr) {
  const d = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date()
  return iso(startOfWeek(d, { weekStartsOn: 1 }))
}

/** Inclusive Mon..Sun bounds for a week id, for date-bounded history reads. */
export function weekRange(weekId) {
  const from = weekId
  const to = iso(addDays(new Date(`${weekId}T12:00:00`), 6))
  return { from, to }
}

/** The week before this one. */
export const prevWeekId = (weekId) => iso(addDays(new Date(`${weekId}T12:00:00`), -7))
export const nextWeekId = (weekId) => iso(addDays(new Date(`${weekId}T12:00:00`), 7))

/** "18 – 24 Aug 2026", collapsing the month when both ends share one. */
export function prettyWeek(weekId) {
  try {
    const a = new Date(`${weekId}T12:00:00`)
    const b = addDays(a, 6)
    const sameMonth = a.getMonth() === b.getMonth()
    return sameMonth
      ? `${format(a, 'd')} – ${format(b, 'd MMM yyyy')}`
      : `${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}`
  } catch { return weekId }
}

/** Most recent N week ids, newest first, starting from the current week. */
export function recentWeekIds(n = 12, fromWeekId) {
  const start = fromWeekId || weekIdFor()
  return Array.from({ length: n }, (_, i) => iso(addDays(new Date(`${start}T12:00:00`), -7 * i)))
}

/*
  When the review becomes due.

  A weekly review written on Wednesday is not a weekly review, it's a
  status check. The window opens Saturday and stays open through Tuesday
  so a late review is still possible without the prompt nagging all week.
  Day indexes are JS-native (Sun=0), read from a LOCAL Date.
*/
export function isReviewWindow(d = new Date()) {
  const day = d.getDay()
  return day === 6 || day === 0 || day === 1 || day === 2
}

/** The week a due-now prompt should be about: last week once Monday lands. */
export function reviewTargetWeekId(d = new Date()) {
  const day = d.getDay()
  // Threaded through `d` rather than calling weekIdFor() bare: the bare
  // call reads the wall clock and silently ignores the argument, which
  // makes the function untestable and wrong for any date but today.
  const thisWeek = weekIdFor(iso(d))
  // Sat/Sun close out the week you are still in; Mon/Tue close out the
  // week that just ended.
  return (day === 1 || day === 2) ? prevWeekId(thisWeek) : thisWeek
}

/*
  The prompts, in the order they are asked.

  Deliberately matches the existing `weekly_reviews` columns rather than a
  fresh set: `wins`, `challenges`, `learning`, `gratitude`, `energy`,
  `other`. Order matters — wins first is not decoration, it's so the
  review does not become a weekly self-criticism ritual, which is the most
  common way this habit dies.
*/
export const REVIEW_PROMPTS = [
  { key: 'wins', label: 'What went well', icon: 'trending_up',
    hint: 'Name it specifically. "Trained 4 times" beats "was consistent".' },
  { key: 'challenges', label: 'What did not', icon: 'error_outline',
    hint: 'What actually got in the way, not how you feel about it.' },
  { key: 'learning', label: 'What you learned', icon: 'lightbulb',
    hint: 'One thing you would tell yourself at the start of the week.' },
  { key: 'energy', label: 'Energy and capacity', icon: 'bolt',
    hint: 'What drained you, what restored you.' },
  { key: 'gratitude', label: 'Grateful for', icon: 'favorite',
    hint: 'Optional, and worth it on the bad weeks especially.' },
  { key: 'other', label: 'Anything else', icon: 'notes', hint: null },
]

/** Forward-looking fields, asked after the retrospective ones. */
export const PLAN_PROMPTS = [
  { key: 'priority_1', label: 'Priority 1' },
  { key: 'priority_2', label: 'Priority 2' },
  { key: 'priority_3', label: 'Priority 3' },
]

export const EMPTY_REVIEW = {
  week_id: null, score: null, wins: '', challenges: '', learning: '',
  gratitude: '', energy: '', other: '', module_notes: '', theme_word: '',
  priority_1: '', priority_2: '', priority_3: '', protect: '', let_go: '',
  ai_insight: '',
}

/** Has anything actually been written? Drives "drafted" vs "not started". */
export function isReviewStarted(r) {
  if (!r) return false
  const text = [...REVIEW_PROMPTS, ...PLAN_PROMPTS].map((p) => p.key)
    .concat(['theme_word', 'protect', 'let_go', 'module_notes'])
  return r.score != null || text.some((k) => String(r[k] || '').trim())
}

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
const round = (v) => (v == null ? null : Math.round(v))

/*
  Everything the week can tell you about itself, computed from data the
  app already holds. The point is that you arrive at the reflection with
  the facts already on the page: the review asks what happened, and the
  numbers stop you answering from memory, which is reliably wrong about
  the week you just had.

  Every argument is already-fetched data — this function issues no
  queries and is safe to run on every render.
*/
export function gatherWeek({ weekId, healthLogs, checkins, sessions, habitLogs, practices, scoreOf, clarityOf }) {
  const { from, to } = weekRange(weekId)
  const inWeek = (d) => d >= from && d <= to

  const hl = (healthLogs || []).filter((l) => inWeek(l.date))
  const ck = (checkins || []).filter((c) => inWeek(c.date))
  const ws = (sessions || []).filter((s) => inWeek(s.date))
  const hb = (habitLogs || []).filter((l) => inWeek(l.logged_on) && l.count > 0)
  const pr = (practices || []).filter((p) => inWeek(p.date))

  const healthScores = hl.map((l) => scoreOf?.(l)).filter((v) => v != null)
  const clarityScores = ck.map((c) => clarityOf?.(c)).filter((v) => v != null)
  const sleep = hl.map((l) => Number(l.sleepHours)).filter((v) => v > 0)

  return {
    weekId, from, to,
    daysLogged: hl.length,
    checkins: ck.length,
    health: round(avg(healthScores)),
    clarity: round(avg(clarityScores)),
    sleepAvg: sleep.length ? Math.round(avg(sleep) * 10) / 10 : null,
    workouts: ws.length,
    trainingMinutes: ws.reduce((s, x) => s + Math.round((x.durationSec || 0) / 60), 0),
    habitsDone: hb.length,
    practiceMinutes: pr.reduce((s, p) => s + (Number(p.minutes) || 0), 0),
    practices: pr.length,
  }
}

/*
  Per-tactic completion for one week of one cycle.

  This is the number the retro form could never ask for: a cycle scoring
  68% tells you nothing actionable, but "Run 5/5, Journal 1/7" names the
  single commitment that is dragging it. Takes the already-derived
  checkpoint list so the week/day/swap semantics stay owned by lib/goals.
*/
export function tacticBreakdown(rows) {
  return (rows || [])
    .map((r) => ({ ...r, pct: r.possible ? Math.round((r.done / r.possible) * 100) : null }))
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101))
}

/** Weeks since the last written review, or null if there has never been one. */
export function weeksSinceLastReview(reviews) {
  const ids = (reviews || []).map((r) => r.week_id).filter(Boolean).sort()
  if (!ids.length) return null
  const last = new Date(`${ids[ids.length - 1]}T12:00:00`)
  const now = new Date(`${weekIdFor()}T12:00:00`)
  return Math.max(0, Math.round((now - last) / (7 * 86400000)))
}

export { today }
