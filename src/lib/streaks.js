/*
  Pure streak math for Health and Wellness — giving them the same
  motivation mechanics Goals shipped on 2026-08-08 (streaks, milestone
  toasts, celebration moments), using data already being logged rather
  than any new table or write. A streak is just "consecutive calendar days
  with a real entry," computed from each module's own date index
  (fetchHealthIndex / fetchWellnessIndex both already return plain date
  arrays/objects with a `date`-shaped key).

  No milestone-already-celebrated flag is persisted anywhere. Instead,
  milestoneHit() is meant to be called ONLY right after a save (not on
  every render) — it fires once per real crossing because a save only
  happens once, not because state remembers it fired before. Simpler than
  a persisted flag, and there's nowhere obviously right to put that flag
  for Wellness anyway (unlike Health, it has no settings blob today).
*/

export const MILESTONES = [7, 14, 30, 60, 100, 365]

function localDateKey(d = new Date()) {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

/** Consecutive days ending today (or yesterday, if nothing's logged yet
    today — so a fresh morning doesn't read as a broken streak). `dates` is
    any iterable of "YYYY-MM-DD" strings; duplicates are fine. Mirrors
    lib/goals.js's goalStreak, same anchoring rule, different data source. */
export function currentStreak(dates) {
  const set = new Set(dates)
  const todayKey = localDateKey()
  let n = 0
  const d = new Date()
  for (;;) {
    const iso = localDateKey(d)
    if (set.has(iso)) { n++; d.setDate(d.getDate() - 1) }
    else if (n === 0 && iso === todayKey) d.setDate(d.getDate() - 1)
    else break
  }
  return n
}

/** Longest run of consecutive days anywhere in the history — the "longest
    clean stretch" figure. Distinct from currentStreak: this can be bigger
    (a past run beats today's) and never resets just because today is quiet. */
export function longestStreak(dates) {
  const sorted = [...new Set(dates)].sort()
  if (!sorted.length) return 0
  let best = 1, run = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00')
    const cur = new Date(sorted[i] + 'T12:00:00')
    const diffDays = Math.round((cur - prev) / 86400000)
    run = diffDays === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

/** The milestone `streak` just landed on, or null. Call this once, right
    after a save, with the freshly recomputed streak — never from a render
    effect, or it would refire every time the page opens with a streak that
    happens to equal a milestone. */
export function milestoneHit(streak) {
  return MILESTONES.includes(streak) ? streak : null
}
