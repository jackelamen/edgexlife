/*
  Focus Cycle mechanics, ported verbatim from goals.html's execution-scoring
  engine. This is the part of Goals that's actually a program, not just a
  form — a 12-week cycle has weekly checkpoints per tactic, and the "how am
  I doing" number is computed from how many of those checkpoints landed.

  Adapted for the normalized schema: the original kept phases+tactics
  embedded inside the sprint's own JSON; here they're real rows
  (sprint_phases, sprint_tactics with phase_index) joined in JS instead.
*/

export const AREA_META = {
  health: { label: 'Health', color: '#26C281' },
  work: { label: 'Career', color: '#29B6F6' },   // schema calls it "work", original UI called it "Career"
  family: { label: 'Family', color: '#EF5350' },
  personal: { label: 'Personal', color: '#F59E0B' },
}
export const areaLabel = (id) => AREA_META[id]?.label || id
export const areaColor = (id) => AREA_META[id]?.color || '#7C4DFF'

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Mon-based day index (0=Mon…6=Sun), unlike JS's native Sun=0. */
export function todayDayIdx() {
  return (new Date().getDay() + 6) % 7
}

/** Which week (1–12) of a cycle "today" falls in, clamped to the cycle length. */
export function sprintCurrentWeek(sp) {
  if (!sp.start_date) return 1
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(sp.start_date + 'T00:00:00'); start.setHours(0, 0, 0, 0)
  const daysDiff = Math.floor((today - start) / (24 * 3600 * 1000))
  const week = Math.floor(daysDiff / 7) + 1
  return Math.min(Math.max(week, 1), 12)
}
export const sprintProgressPct = (sp) => Math.round((sprintCurrentWeek(sp) / 12) * 100)

export function isSprintActive(sp) {
  if (!sp.start_date || !sp.end_date) return false
  const now = new Date(), s = new Date(sp.start_date + 'T12:00'), e = new Date(sp.end_date + 'T12:00')
  return s <= now && now <= e
}
export function isSprintUpcoming(sp) {
  return sp.start_date ? new Date(sp.start_date + 'T12:00') > new Date() : false
}

/** Weeks 1-4 -> phase 0, 5-8 -> phase 1, 9-12 -> phase 2 (fixed 3-phase structure). */
export const phaseIdxForWeek = (w) => (w <= 4 ? 0 : w <= 8 ? 1 : 2)

/** Tactics scoped to a given week, from the phase that owns that week. */
export function tacticsForWeek(phases, tactics, week) {
  const phase = [...phases].sort((a, b) => a.phase_index - b.phase_index)[phaseIdxForWeek(week)]
  if (!phase) return []
  return tactics.filter((t) => t.phase_id === phase.id)
}

/** The stable identity used as a checks-object key — see saveTactic in data.js. */
export const tacticKeyId = (t) => t.local_id || t.id

export const xpwTarget = (t) => Math.max(1, parseInt(t.times_per_week) || 1)
export function xpwDoneCount(t, checks) {
  const n = xpwTarget(t)
  let c = 0
  for (let i = 0; i < n; i++) if (checks[`${tacticKeyId(t)}_${i}`]) c++
  return c
}
export function xpwDoneToday(t, checks) {
  const n = xpwTarget(t)
  const today = localDateKey()
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

export function localDateKey() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

/**
 * Execution score for one week: ratio of checked to possible checkpoints.
 * Weekly/onetime tactics are excluded from the CURRENT (in-progress) week's
 * score until it's over, so a not-yet-due weekly task doesn't drag down a
 * mid-week score.
 */
export function execScore(phases, tactics, sp, week) {
  const weekTactics = tacticsForWeek(phases, tactics, week)
  if (!weekTactics.length) return null
  const checks = (sp.week_checks || {})[week] || {}
  const isCurrentWeek = week === sprintCurrentWeek(sp)
  let possible = 0, done = 0
  weekTactics.forEach((t) => {
    const freq = t.freq || 'weekly'
    if (freq === 'daily') {
      for (let d = 0; d < 7; d++) { possible++; if (checks[checkKey(t, d)]) done++ }
    } else if (freq === 'custom') {
      ;(t.days || []).forEach((d) => { possible++; if (checks[checkKey(t, d)]) done++ })
    } else if (freq === 'xperweek') {
      const n = xpwTarget(t), c = xpwDoneCount(t, checks)
      possible += n; done += Math.min(c, n)
    } else if (!isCurrentWeek) {
      possible++; if (checks[tacticKeyId(t)]) done++
    } else if (checks[tacticKeyId(t)]) {
      possible++; done++
    }
  })
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
  const weekTactics = tacticsForWeek(phases, tactics, wk)
  const checks = (sp.week_checks || {})[wk] || {}
  const todayIdx = todayDayIdx()
  const isSunday = todayIdx === 6
  let done = 0, total = 0
  weekTactics.forEach((t) => {
    const freq = t.freq || 'weekly'
    if (freq === 'daily') {
      total++; if (checks[checkKey(t, todayIdx)]) done++
    } else if (freq === 'custom') {
      if ((t.days || []).includes(todayIdx)) { total++; if (checks[checkKey(t, todayIdx)]) done++ }
    } else if (freq === 'xperweek') {
      const n = xpwTarget(t), c = xpwDoneCount(t, checks)
      const didToday = xpwDidToday(t, checks)
      if (didToday || c < n) { total++; if (didToday) done++ }
    } else {
      const checked = Boolean(checks[tacticKeyId(t)])
      if (isSunday || checked) { total++; if (checked) done++ }
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

/** 12 weeks -> phase-name-and-date shell for a brand-new cycle. */
export function autoEndDate(startDate) {
  if (!startDate) return ''
  const d = new Date(startDate + 'T12:00:00')
  d.setDate(d.getDate() + 7 * 12 - 1)
  return d.toISOString().slice(0, 10)
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
   start_date. xperweek checks already store the ISO date they were
   completed on. weekly/onetime checks are a bare boolean with no date
   attached and can't contribute to a day-level streak — that's a known,
   acceptable gap (they're the least common tactic type). */
export function completedCheckDates(sprints) {
  const dates = new Set()
  for (const sp of sprints || []) {
    if (!sp.start_date) continue
    const start = new Date(sp.start_date + 'T12:00:00')
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
        const d = new Date(start)
        d.setDate(d.getDate() + (week - 1) * 7 + Number(m[1]))
        dates.add(d.toISOString().slice(0, 10))
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
  const t = localDateKey()
  let n = 0
  const d = new Date()
  for (;;) {
    const iso = d.toISOString().slice(0, 10)
    if (dates.has(iso)) { n++; d.setDate(d.getDate() - 1) }
    else if (n === 0 && iso === t) d.setDate(d.getDate() - 1)
    else break
  }
  return n
}
