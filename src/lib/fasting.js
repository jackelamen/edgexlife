/*
  Fasting — sessions, not a daily metric. A fast can run past midnight, so
  it doesn't fit the "one row per date" shape the rest of Health uses; see
  fetchFastingSessions in lib/data.js for the storage side.
*/
import { weekMonday } from './workout'
import { iso } from './dates'

/* Common presets plus a free-entry option. `hours` is the target window,
   used only to pre-fill the timer and to judge "did you hit the target" —
   the actual tracked value is always the real elapsed time. */
export const FAST_METHODS = [
  { id: '16:8', label: '16:8', hours: 16 },
  { id: '18:6', label: '18:6', hours: 18 },
  { id: '20:4', label: '20:4', hours: 20 },
  { id: 'omad', label: 'OMAD', hours: 23 },
  { id: '24h', label: '24 hour', hours: 24 },
  { id: '36h', label: '36 hour', hours: 36 },
  { id: 'custom', label: 'Custom', hours: null },
]

export const methodLabel = (id) => FAST_METHODS.find((m) => m.id === id)?.label || id

/** The hours a session should be judged against. Prefers the session's own
    stored targetHours, but falls back to the method's default — sessions
    saved through the "log a past fast" / edit flow before this fix never
    had targetHours written at all, which silently made every one of them
    read as "under target" no matter how long the fast actually ran. This
    fallback makes those older records correct again without needing to
    re-edit each one by hand. */
export function targetHoursFor(session) {
  if (session?.targetHours != null) return session.targetHours
  return FAST_METHODS.find((m) => m.id === session?.method)?.hours ?? null
}

export const isActive = (s) => !!s && s.endedAt == null

/** Elapsed time in ms — from start to now if running, start to end if not. */
export function elapsedMs(session, now = new Date()) {
  if (!session?.startedAt) return 0
  const start = new Date(session.startedAt).getTime()
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime()
  return Math.max(0, end - start)
}

export const elapsedHours = (session, now) => elapsedMs(session, now) / 3600000

/** Progress against the session's own target — caps at 100 so a fast run
    long doesn't blow out a tile's fill past what "full" means. */
export function progressPct(session, now) {
  const target = targetHoursFor(session)
  if (!target) return null
  return Math.max(0, Math.min(100, (elapsedHours(session, now) / target) * 100))
}

export function formatDuration(ms) {
  if (ms == null || ms < 0) return '--'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Week identifier (Monday, ISO date) a session's start falls in — used to
    count "did you fast this week" without caring how many times. */
export const sessionWeekKey = (session) => iso(weekMonday(new Date(session.startedAt)))

/**
 * Consecutive weeks with at least one *completed* fast. The current week is
 * given grace: if you have not fasted yet this week it is simply still open,
 * so the count starts from last week instead of reading 0 on a Wednesday for
 * someone who fasts on weekends. It only breaks once a week has fully passed
 * with no fast. An in-progress fast counts once it ends, not before.
 */
export function weekStreak(sessions, today = new Date()) {
  const doneWeeks = new Set(
    sessions.filter((s) => s.endedAt).map((s) => sessionWeekKey(s))
  )
  let streak = 0
  let cursor = weekMonday(today)
  if (!doneWeeks.has(iso(cursor))) cursor.setDate(cursor.getDate() - 7)
  while (doneWeeks.has(iso(cursor))) {
    streak += 1
    cursor = new Date(cursor); cursor.setDate(cursor.getDate() - 7)
  }
  return streak
}

/**
 * The last `n` weeks (oldest first, current week last), each with how many
 * completed fasts started in it, the longest one, and whether any of them
 * met its own target. Powers the weekly rhythm strip, which reads the same
 * for someone who fasts once a week as for someone who fasts daily.
 */
export function weeklySeries(sessions, n = 12, today = new Date()) {
  const done = sessions.filter((s) => s.endedAt)
  const thisMonday = weekMonday(today)
  return Array.from({ length: n }, (_, i) => {
    const monday = new Date(thisMonday)
    monday.setDate(monday.getDate() - (n - 1 - i) * 7)
    const key = iso(monday)
    const inWeek = done.filter((s) => sessionWeekKey(s) === key)
    const longestMs = inWeek.reduce((m, s) => Math.max(m, elapsedMs(s)), 0)
    const hit = inWeek.some((s) => {
      const t = targetHoursFor(s)
      return t && elapsedMs(s) / 3600000 >= t
    })
    return { key, monday, count: inWeek.length, longestMs, hit, current: i === n - 1 }
  })
}

/** Average length and target-hit count over the most recent `n` completed fasts. */
export function recentFasts(sessions, n = 8) {
  const recent = sessions.filter((s) => s.endedAt)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, n)
  if (!recent.length) return null
  const hits = recent.filter((s) => {
    const t = targetHoursFor(s)
    return t && elapsedMs(s) / 3600000 >= t
  }).length
  const avgMs = recent.reduce((sum, s) => sum + elapsedMs(s), 0) / recent.length
  return { count: recent.length, hits, avgMs }
}

/** The weekday (0 = Sunday) you most often start a fast, or null until there are enough to say. */
export function usualWeekday(sessions, min = 3, sample = 12) {
  const days = sessions.filter((s) => s.endedAt)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, sample)
    .map((s) => new Date(s.startedAt).getDay())
  if (days.length < min) return null
  const tally = {}
  days.forEach((d) => { tally[d] = (tally[d] || 0) + 1 })
  const [day, count] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
  return count >= 2 ? Number(day) : null
}

/** Completed fasts whose start falls in the current week. */
export function thisWeekCount(sessions, today = new Date()) {
  const wk = iso(weekMonday(today))
  return sessions.filter((s) => s.endedAt && sessionWeekKey(s) === wk).length
}

export function longestFast(sessions) {
  const done = sessions.filter((s) => s.endedAt)
  if (!done.length) return null
  return done.reduce((max, s) => Math.max(max, elapsedMs(s)), 0)
}

/* ── datetime-local <-> ISO ───────────────────────────────────
   <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time,
   with no timezone; startedAt/endedAt are stored as real ISO instants.
   These convert between the two without going through UTC math that
   would shift the displayed time. */
export function toLocalInputValue(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(localString) {
  if (!localString) return null
  const [datePart, timePart] = localString.split('T')
  const [y, mo, da] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return new Date(y, mo - 1, da, h, mi).toISOString()
}
