import { useEffect, useMemo, useState } from 'react'
import { WINDOWS, iso } from '../lib/dates'

/**
 * Picks the smallest window that still contains the most recent record.
 *
 * The Health and Wellness modules were last written to in May, so a fixed
 * 30-day default would open on an empty page and read as "the migration lost
 * my data". This walks up 30d -> 90d -> year -> all until something is in
 * range, using a cheap dates-only index rather than fetching payloads to
 * find out.
 */
export function useDataWindow(latestDate) {
  const [manual, setManual] = useState(null)

  const auto = useMemo(() => {
    if (!latestDate) return WINDOWS[0]
    const ageDays = Math.floor(
      (Date.now() - new Date(`${latestDate}T00:00:00`).getTime()) / 86400000
    )
    return WINDOWS.find((w) => w.days >= ageDays + 1) || WINDOWS[WINDOWS.length - 1]
  }, [latestDate])

  // Once the index arrives, adopt the auto window unless the user has chosen.
  useEffect(() => { setManual(null) }, [latestDate])

  const win = manual || auto
  const from = iso(new Date(Date.now() - win.days * 86400000))
  const to = iso(new Date())

  const stale = Boolean(
    latestDate && new Date(`${latestDate}T00:00:00`).getTime() < Date.now() - 45 * 86400000
  )

  return { win, setWin: setManual, from, to, stale, latestDate }
}
