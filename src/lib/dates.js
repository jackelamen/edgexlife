import { format, subDays } from 'date-fns'

export const iso = (d) => format(d, 'yyyy-MM-dd')
export const today = () => iso(new Date())
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
