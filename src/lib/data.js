/*
  Every read in EdgeX Life goes through this file.

  Two hard rules, both enforced here rather than left to call sites:
    - never `select('*')` — columns are always named explicitly
    - never read a legacy traction_data blob directly; go through the
      `life_*` RPCs, which slice server-side so the heavy JSON never
      crosses the wire

  Legacy shapes (from the flat HTML modules) are normalised at this
  boundary so components never learn the old key names.
*/
import { supabase } from './supabase'
import { cachedQuery, invalidate } from './egress'

const MIN = 60 * 1000
const HOUR = 60 * MIN

/*
 * TTLs are set by how volatile the data actually is, not by habit.
 *
 * Health logs and wellness check-ins are, in this app, read-only history
 * written by the legacy modules — they do not change under us. A short TTL
 * would mean re-pulling the same immutable rows all day, and the wellness
 * "Year" window is ~360 kB (four early dates carry almost all of it), so
 * that is precisely the query that must not repeat casually.
 */
const TTL = {
  goals: 10 * MIN,
  vision: 24 * HOUR, // metadata only; images are cached separately, forever
  health: 24 * HOUR,
  wellness: 24 * HOUR,
  pulse: 3 * MIN, // tasks and habits DO change from Pulse while you work
}

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

// ── Goals ─────────────────────────────────────────────────────
export function fetchGoals(opts) {
  return cachedQuery(
    'goals',
    async () =>
      unwrap(
        await supabase
          .from('goals')
          .select('id,title,area,why,status,created_at,updated_at')
          .order('created_at', { ascending: false })
      ),
    { ttlMs: TTL.goals, ...opts }
  )
}

export function fetchVisions(opts) {
  return cachedQuery(
    'visions',
    async () =>
      unwrap(await supabase.from('visions').select('id,area,content,updated_at')),
    { ttlMs: TTL.goals, ...opts }
  )
}

export function fetchGoalMetrics(opts) {
  return cachedQuery(
    'goal-metrics',
    async () =>
      unwrap(
        await supabase
          .from('goal_metrics')
          .select('id,goal_id,name,type,target,sort_order')
          .order('sort_order')
      ),
    { ttlMs: TTL.goals, ...opts }
  )
}

export function fetchMetricLogs(opts) {
  return cachedQuery(
    'metric-logs',
    async () =>
      unwrap(
        await supabase
          .from('metric_logs')
          .select('id,metric_id,goal_id,log_date,value,note')
          .order('log_date', { ascending: false })
          .limit(500)
      ),
    { ttlMs: TTL.goals, ...opts }
  )
}

export function fetchSprints(opts) {
  return cachedQuery(
    'sprints',
    async () =>
      unwrap(
        await supabase
          .from('sprints')
          .select('id,goal_id,name,outcome,start_date,end_date,week_checks,reflections,retro')
          .order('start_date', { ascending: false, nullsFirst: false })
      ),
    { ttlMs: TTL.goals, ...opts }
  )
}

export function fetchSprintPhases(opts) {
  return cachedQuery(
    'sprint-phases',
    async () =>
      unwrap(
        await supabase
          .from('sprint_phases')
          .select('id,sprint_id,phase_index,name,description')
          .order('phase_index')
      ),
    { ttlMs: TTL.goals, ...opts }
  )
}

export function fetchSprintTactics(opts) {
  return cachedQuery(
    'sprint-tactics',
    async () =>
      unwrap(
        await supabase
          .from('sprint_tactics')
          .select('id,phase_id,sprint_id,text,freq,days,times_per_week,sort_order')
          .order('sort_order')
      ),
    { ttlMs: TTL.goals, ...opts }
  )
}

export function fetchGoalRollup(opts) {
  return cachedQuery(
    'goal-rollup',
    async () => unwrap(await supabase.rpc('life_goal_rollup')),
    { ttlMs: TTL.pulse, ...opts }
  )
}

/**
 * Vision board METADATA only — id, area, caption, and the byte size of the
 * image we are deliberately not fetching. ~2 kB instead of 1.55 MB.
 */
export function fetchVisionBoard(opts) {
  return cachedQuery(
    'vision-board',
    async () => {
      const rows = unwrap(await supabase.rpc('life_vision_board'))
      return (rows || []).map((r) => ({
        id: r.item_id,
        area: r.area,
        caption: r.caption,
        addedAt: r.added_at,
        bytes: r.src_bytes,
      }))
    },
    { ttlMs: TTL.vision, ...opts }
  )
}

// ── Health ────────────────────────────────────────────────────
/** Legacy per-day log object -> stable camelCase shape. */
function normalizeHealthLog(date, p) {
  const types = p.exerciseTypes || (p.exerciseType ? [p.exerciseType] : [])
  return {
    date,
    sleepHours: num(p.sleepHours),
    sleepQuality: num(p.sleepQuality),
    steps: num(p.steps),
    weight: num(p.weight),
    water: num(p.water),
    energy: num(p.energy),
    pain: num(p.pain),
    exerciseMins: num(p.exerciseMins),
    exerciseTypes: Array.isArray(types) ? types : [types].filter(Boolean),
    nutrition: p.nutrition ?? null,
    notes: p.notes || '',
    savedAt: p.savedAt || null,
  }
}

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

export function fetchHealthLogs(from, to, opts) {
  return cachedQuery(
    `health-logs:${from}:${to}`,
    async () => {
      const rows = unwrap(
        await supabase.rpc('life_health_logs', { p_from: from, p_to: to })
      )
      return (rows || []).map((r) => normalizeHealthLog(r.log_date, r.payload || {}))
    },
    { ttlMs: TTL.health, ...opts }
  )
}

/**
 * Dates only — lets a page size its window to where the data actually is.
 * Costs a few hundred bytes and saves rendering an empty view.
 */
export function fetchHealthIndex(opts) {
  return cachedQuery(
    'health-index',
    async () => {
      const rows = unwrap(await supabase.rpc('life_health_index'))
      return (rows || []).map((r) => r.log_date)
    },
    { ttlMs: TTL.health, ...opts }
  )
}

export function fetchHealthSettings(opts) {
  return cachedQuery(
    'health-settings',
    async () => {
      const s = unwrap(await supabase.rpc('life_health_settings')) || {}
      return {
        stepTarget: s.stepTarget ?? 10000,
        sleepTarget: s.sleepTarget ?? 7.5,
        waterTarget: s.waterTarget ?? 2,
        weeklyExerciseTarget: s.weeklyExerciseTarget ?? 150,
      }
    },
    { ttlMs: 60 * MIN, ...opts }
  )
}

// ── Wellness ──────────────────────────────────────────────────
/**
 * Calendar index: which dates hold check-ins, and how many. A few hundred
 * bytes, so the journal view can render its whole timeline before deciding
 * which day's text to actually pull.
 */
export function fetchWellnessIndex(opts) {
  return cachedQuery(
    'wellness-index',
    async () => {
      const rows = unwrap(await supabase.rpc('life_wellness_index'))
      return (rows || []).map((r) => ({ date: r.checkin_date, entries: r.entries }))
    },
    { ttlMs: TTL.wellness, ...opts }
  )
}

function normalizeCheckin(c) {
  return {
    id: c.id,
    date: c.date,
    mood: num(c.mood),
    stress: num(c.stress),
    clarity: num(c.clarity),
    state: c.state || null,
    loop: c.loop || '',
    reframe: c.reframe || '',
    grounded: c.grounded ?? null,
    present: c.present ?? null,
    lighter: c.lighter ?? null,
    sleepImpact: c.sleepImpact ?? null,
    savedAt: c.savedAt || null,
  }
}

export function fetchWellnessCheckins(from, to, opts) {
  return cachedQuery(
    `wellness-checkins:${from}:${to}`,
    async () => {
      const rows = unwrap(
        await supabase.rpc('life_wellness_checkins', { p_from: from, p_to: to })
      )
      return (rows || []).flatMap((r) =>
        (Array.isArray(r.payload) ? r.payload : []).map((c) =>
          normalizeCheckin({ ...c, date: c.date || r.checkin_date })
        )
      )
    },
    { ttlMs: TTL.wellness, ...opts }
  )
}

export function fetchWellnessNotes(opts) {
  return cachedQuery(
    'wellness-notes',
    async () => {
      const v = unwrap(await supabase.rpc('life_wellness_notes')) || {}
      return {
        thoughts: (v.thoughts || []).map((t) => ({
          id: t.id,
          text: t.text || '',
          type: t.type || null,
          done: Boolean(t.done),
          createdAt: t.createdAt || null,
        })),
        practices: (v.practices || []).map((p) => ({
          id: p.id,
          date: p.date,
          type: p.type || null,
          minutes: num(p.minutes),
          note: p.note || '',
          after: p.after ?? null,
        })),
      }
    },
    { ttlMs: TTL.wellness, ...opts }
  )
}

// ── Pulse bridge ──────────────────────────────────────────────
export function fetchHabits(opts) {
  return cachedQuery(
    'habits',
    async () =>
      unwrap(
        await supabase
          .from('habits')
          .select('id,name,cadence,cadence_config,target_per_period,color,icon,sort_order,goal_id')
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('sort_order')
      ),
    { ttlMs: TTL.pulse, ...opts }
  )
}

export function fetchHabitLogs(from, to, opts) {
  return cachedQuery(
    `habit-logs:${from}:${to}`,
    async () =>
      unwrap(
        await supabase
          .from('habit_logs')
          .select('id,habit_id,logged_on,count')
          .is('deleted_at', null)
          .gte('logged_on', from)
          .lte('logged_on', to)
      ),
    { ttlMs: TTL.pulse, ...opts }
  )
}

/** Open Pulse tasks attached to a goal. Capped — this is a summary, not a list view. */
export function fetchGoalTasks(goalId, opts) {
  return cachedQuery(
    `goal-tasks:${goalId}`,
    async () =>
      unwrap(
        await supabase
          .from('tasks')
          .select('id,title,due_at,priority,status,completed_at')
          .eq('goal_id', goalId)
          .is('deleted_at', null)
          .is('completed_at', null)
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(25)
      ),
    { ttlMs: TTL.pulse, ...opts }
  )
}

/** Unlinked open tasks, for the "attach to goal" picker. */
export function fetchUnlinkedTasks(opts) {
  return cachedQuery(
    'unlinked-tasks',
    async () =>
      unwrap(
        await supabase
          .from('tasks')
          .select('id,title,due_at,priority')
          .is('goal_id', null)
          .is('deleted_at', null)
          .is('archived_at', null)
          .is('completed_at', null)
          .is('parent_task_id', null)
          .not('status', 'in', '(done,cancelled)')
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(60)
      ),
    { ttlMs: TTL.pulse, ...opts }
  )
}

// ── Writes ────────────────────────────────────────────────────
export async function linkTaskToGoal(taskId, goalId) {
  const { error } = await supabase.from('tasks').update({ goal_id: goalId }).eq('id', taskId)
  if (error) throw error
  invalidate('goal-tasks')
  invalidate('unlinked-tasks')
  invalidate('goal-rollup')
}

export async function linkHabitToGoal(habitId, goalId) {
  const { error } = await supabase.from('habits').update({ goal_id: goalId }).eq('id', habitId)
  if (error) throw error
  invalidate('habits')
  invalidate('goal-rollup')
}

/**
 * Tick a habit for a day.
 *
 * Deliberately select-then-write rather than `.upsert()`: the uniqueness
 * guard on habit_logs is a PARTIAL index (`where deleted_at is null`), and
 * Postgres cannot infer a partial index from a plain ON CONFLICT (a, b),
 * which PostgREST has no way to qualify. So we look first.
 */
export async function logHabit(habitId, dateISO, count = 1) {
  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes?.user?.id

  const { data: existing, error: findErr } = await supabase
    .from('habit_logs')
    .select('id')
    .eq('habit_id', habitId)
    .eq('logged_on', dateISO)
    .is('deleted_at', null)
    .maybeSingle()
  if (findErr) throw findErr

  const { error } = existing
    ? await supabase.from('habit_logs').update({ count }).eq('id', existing.id)
    : await supabase
        .from('habit_logs')
        .insert({ user_id: uid, habit_id: habitId, logged_on: dateISO, count })
  if (error) throw error
  invalidate('habit-logs')
}

export function refreshAll() {
  ;['goals', 'visions', 'goal-metrics', 'metric-logs', 'sprints', 'sprint-phases',
    'sprint-tactics', 'goal-rollup', 'vision-board', 'health-logs', 'health-settings',
    'wellness-index', 'wellness-checkins', 'wellness-notes', 'habits', 'habit-logs',
    'goal-tasks', 'unlinked-tasks'].forEach(invalidate)
}
