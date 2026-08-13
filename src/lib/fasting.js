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
 * Consecutive weeks (including this one) with at least one *completed*
 * fast, walking backward from the current week. An in-progress fast counts
 * for the week it started in once it ends, not before — a streak shouldn't
 * hinge on a fast you haven't finished yet.
 */
export function weekStreak(sessions, today = new Date()) {
  const doneWeeks = new Set(
    sessions.filter((s) => s.endedAt).map((s) => sessionWeekKey(s))
  )
  let streak = 0
  let cursor = weekMonday(today)
  while (doneWeeks.has(iso(cursor))) {
    streak += 1
    cursor = new Date(cursor); cursor.setDate(cursor.getDate() - 7)
  }
  return streak
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
