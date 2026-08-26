/** Whether a Pulse habit is due today. `cadence` + `cadence_config.days`
    are Pulse's own scheduling fields (already selected by fetchHabits):
    'daily' habits are due every day; 'custom'/'weekly' habits carry an
    explicit days array (JS Date.getDay() indices, Sun=0..Sat=6 —
    confirmed against real data: a Mon/Wed/Fri habit stores days:[1,3,5])
    and are only due when today matches one of them. Any cadence shape
    this doesn't recognize defaults to "due" rather than silently hiding
    a habit — Pulse's own due-today algorithm isn't available to copy
    verbatim from this repo, so this is a best-effort mirror of it, not a
    guaranteed 1:1 match. Shared by TodayPage's due-today list and
    IntentionCard's habit picker so the two can't disagree about which
    habits count as "today's." */
export function isHabitDueToday(h) {
  if (h.cadence === 'daily') return true
  const days = h.cadence_config?.days
  if (Array.isArray(days) && days.length) return days.includes(new Date().getDay())
  return true
}
