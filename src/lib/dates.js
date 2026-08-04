import { format, subDays } from 'date-fns'

export const iso = (d) => format(d, 'yyyy-MM-dd')
export const today = () => iso(new Date())
export const daysAgo = (n) => iso(subDays(new Date(), n))

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
