import { format, subDays } from 'date-fns'

export const iso = (d) => format(d, 'yyyy-MM-dd')

/*
 * THE single date-key helper. `format()` reads a Date's Y/M/D directly in
 * the browser's local timezone — no UTC conversion happens anywhere in
 * this call. That makes it safe by construction, unlike
 * `d.toISOString().slice(0, 10)`, which converts to UTC first and returns
 * YESTERDAY for anyone east of Greenwich between midnight and their UTC
 * offset (e.g. Asia/Seoul, UTC+9, is wrong from 00:00 to 09:00 daily).
 *
 * Every "what day is this" computation in the app must go through this
 * function (or `iso`, its twin) — never construct a date key with
 * `toISOString()`. Banned by the `no-restricted-syntax` rule in
 * eslint.config.js.
 */
export const dateKey = (d = new Date()) => iso(d)
export const today = () => dateKey()
export const daysAgo = (n) => iso(subDays(new Date(), n))

/** Shift an arbitrary ISO date by N days (positive or negative), not just "from today". */
export const shiftDate = (dateStr, days) => iso(subDays(new Date(`${dateStr}T12:00:00`), -days))

/**
 * All history reads are date-bounded. Defaults are deliberately short —
 * "everything ever" is exactly the query pattern that ran the egress bill up.
 */
export const WINDOWS = [
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '1y', label: 'Year', days: 365 },
]

export const pretty = (dateStr) => {
  try {
    return format(new Date(`${dateStr}T00:00:00`), 'EEE d MMM yyyy')
  } catch {
    return dateStr
  }
}

export const prettyShort = (dateStr) => {
  try {
    return format(new Date(`${dateStr}T00:00:00`), 'd MMM')
  } catch {
    return dateStr
  }
}

/** Decimal hours (7.5) -> "7h 30m" for display. Rounds to the nearest
    minute rather than showing raw decimal noise (7.4166666...h). */
export function hmLabel(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return null
  const totalMin = Math.round(Number(hours) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}
