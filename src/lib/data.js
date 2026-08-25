/*
  Every read and write in EdgeX Life goes through this file.

  Hard rules, enforced here rather than left to call sites:
    - never `select('*')` — columns are always named
    - never touch a `traction_data` blob directly; the `life_*` functions
      slice on read and MERGE on write, so saving a check-in uploads a few
      hundred bytes instead of re-writing a 363 kB blob
    - every history read is date-bounded
*/
import { supabase } from './supabase'
import { cachedQuery, invalidate } from './egress'

const MIN = 60 * 1000
const HOUR = 60 * MIN

/*
 * TTLs reflect how volatile the data actually is. Pulse tasks change while
 * you work; your logged history from last May does not.
 */
const TTL = {
  goals: 5 * MIN,
  vision: 12 * HOUR,
  health: 2 * MIN,
  wellness: 2 * MIN,
  history: 12 * HOUR, // closed date windows that can no longer change
  pulse: 3 * MIN,
}

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args))

export const uid = async () => (await supabase.auth.getUser()).data?.user?.id

/** Cheap id for entries living inside JSONB arrays (matches legacy format). */
export const newId = (prefix = 'x') =>
  `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)}`

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

/* ═══════════════════════ GOALS ═══════════════════════ */

export const AREAS = ['health', 'work', 'family', 'personal']
export const GOAL_STATUSES = ['active', 'completed', 'paused', 'archived']
export const METRIC_TYPES = ['Number', 'Percentage', 'Duration', 'Frequency', 'Currency']
export const TACTIC_FREQS = ['daily', 'weekly', 'xperweek', 'custom', 'onetime']

export const fetchGoals = (o) => cachedQuery('goals', async () =>
  unwrap(await supabase.from('goals')
    .select('id,title,area,why,status,identity_thread,featured,featured_photo_kind,featured_photo_ref,created_at,updated_at')
    .order('created_at', { ascending: false })), { ttlMs: TTL.goals, ...o })

export async function saveGoal(goal) {
  const payload = {
    title: goal.title, area: goal.area, why: goal.why || null,
    status: goal.status || 'active', identity_thread: goal.identity_thread || null,
    featured: Boolean(goal.featured),
    featured_photo_kind: goal.featured_photo_kind || null,
    featured_photo_ref: goal.featured_photo_ref || null,
    updated_at: new Date().toISOString(),
  }
  if (payload.featured) {
    // The DB enforces at most one featured goal per user (a partial unique
    // index), so the previous featured goal has to be cleared BEFORE this
    // one is set true — the other order would collide with it.
    const { error: clearErr } = await supabase.from('goals').update({ featured: false }).eq('featured', true)
    if (clearErr) throw clearErr
  }
  const { error } = goal.id
    ? await supabase.from('goals').update(payload).eq('id', goal.id)
    : await supabase.from('goals').insert({ ...payload, user_id: await uid() })
  if (error) throw error
  invalidate('goals'); invalidate('goal-rollup')
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
  invalidate('goals'); invalidate('goal-rollup'); invalidate('sprints')
}

export const fetchVisions = (o) => cachedQuery('visions', async () =>
  unwrap(await supabase.from('visions').select('id,area,content,updated_at')), { ttlMs: TTL.goals, ...o })

export async function saveVision(area, content) {
  const { error } = await supabase.from('visions')
    .upsert({ user_id: await uid(), area, content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,area' })
  if (error) throw error
  invalidate('visions')
}

export const fetchGoalMetrics = (o) => cachedQuery('goal-metrics', async () =>
  unwrap(await supabase.from('goal_metrics')
    .select('id,goal_id,name,type,target,sort_order').order('sort_order')), { ttlMs: TTL.goals, ...o })

export async function saveMetric(m) {
  const payload = { goal_id: m.goal_id, name: m.name, type: m.type, target: m.target ?? null,
    sort_order: m.sort_order ?? 0 }
  const { error } = m.id
    ? await supabase.from('goal_metrics').update(payload).eq('id', m.id)
    : await supabase.from('goal_metrics').insert({ ...payload, user_id: await uid() })
  if (error) throw error
  invalidate('goal-metrics')
}

export async function deleteMetric(id) {
  const { error } = await supabase.from('goal_metrics').delete().eq('id', id)
  if (error) throw error
  invalidate('goal-metrics'); invalidate('metric-logs')
}

export const fetchMetricLogs = (o) => cachedQuery('metric-logs', async () =>
  unwrap(await supabase.from('metric_logs')
    .select('id,metric_id,goal_id,log_date,value,note')
    .order('log_date', { ascending: false }).limit(400)), { ttlMs: TTL.goals, ...o })

export async function logMetric(metricId, goalId, logDate, value, note) {
  const { error } = await supabase.from('metric_logs')
    .insert({ user_id: await uid(), metric_id: metricId, goal_id: goalId,
      log_date: logDate, value, note: note || null })
  if (error) throw error
  invalidate('metric-logs')
}

export async function deleteMetricLog(id) {
  const { error } = await supabase.from('metric_logs').delete().eq('id', id)
  if (error) throw error
  invalidate('metric-logs')
}

export const fetchSprints = (o) => cachedQuery('sprints', async () =>
  unwrap(await supabase.from('sprints')
    .select('id,goal_id,name,outcome,start_date,end_date,weeks,week_checks,reflections,retro,archived,day_swaps')
    .order('start_date', { ascending: false, nullsFirst: false })), { ttlMs: TTL.goals, ...o })

export async function saveSprint(s) {
  const payload = {
    goal_id: s.goal_id, name: s.name, outcome: s.outcome || null,
    start_date: s.start_date || null, end_date: s.end_date || null,
    weeks: s.weeks || 12,
    week_checks: s.week_checks ?? {}, reflections: s.reflections ?? {},
    retro: s.retro ?? null, archived: s.archived ?? false, day_swaps: s.day_swaps ?? {},
    updated_at: new Date().toISOString(),
  }
  const { data, error } = s.id
    ? await supabase.from('sprints').update(payload).eq('id', s.id).select('id').single()
    : await supabase.from('sprints').insert({ ...payload, user_id: await uid() }).select('id').single()
  if (error) throw error
  invalidate('sprints')
  return data.id
}

/**
 * A single week's checkpoint toggles, merged into `week_checks` in one
 * atomic server-side UPDATE (see the `life_merge_sprint_week_checks`
 * migration). Use this — never `saveSprint` — for a checkbox tap.
 *
 * Why: saveSprint writes the WHOLE row from whatever the client happened
 * to hold in state. Two rapid checkbox taps race: the second tap's React
 * closure still has the pre-first-tap snapshot of week_checks, so its
 * save silently reverts the first tap the instant it lands. Rare in a
 * single click, easy to hit on a real "check off today's list" pass.
 * Routing checkbox writes through this RPC instead means each toggle is
 * a read-merge-write done by Postgres in one statement — there is no
 * client-held snapshot to go stale.
 */
export async function mergeSprintWeekChecks(sprintId, week, checks) {
  const { error } = await supabase.rpc('life_merge_sprint_week_checks', {
    p_sprint_id: sprintId, p_week: week, p_checks: checks,
  })
  if (error) throw error
  invalidate('sprints')
}

export async function deleteSprint(id) {
  const { error } = await supabase.from('sprints').delete().eq('id', id)
  if (error) throw error
  invalidate('sprints'); invalidate('sprint-')
}

/** Archive is a lightweight toggle, separate from the full saveSprint
    payload — tucking a cycle away (or bringing it back) shouldn't require
    re-sending week_checks/retro/etc. */
export async function setSprintArchived(id, archived) {
  const { error } = await supabase.from('sprints')
    .update({ archived, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  invalidate('sprints')
}

export const fetchSprintPhases = (o) => cachedQuery('sprint-phases', async () =>
  unwrap(await supabase.from('sprint_phases')
    .select('id,sprint_id,phase_index,name,description').order('phase_index')), { ttlMs: TTL.goals, ...o })

export async function savePhase(p) {
  const payload = { sprint_id: p.sprint_id, phase_index: p.phase_index, name: p.name,
    description: p.description || null }
  const { data, error } = p.id
    ? await supabase.from('sprint_phases').update(payload).eq('id', p.id).select('id').single()
    : await supabase.from('sprint_phases').insert({ ...payload, user_id: await uid() }).select('id').single()
  if (error) throw error
  invalidate('sprint-phases')
  return data.id
}

export async function deletePhase(id) {
  const { error } = await supabase.from('sprint_phases').delete().eq('id', id)
  if (error) throw error
  invalidate('sprint-phases'); invalidate('sprint-tactics')
}

export const fetchSprintTactics = (o) => cachedQuery('sprint-tactics', async () =>
  unwrap(await supabase.from('sprint_tactics')
    .select('id,local_id,phase_id,sprint_id,text,freq,days,times_per_week,sort_order')
    .order('sort_order')), { ttlMs: TTL.goals, ...o })

/**
 * Historical week_checks (on the sprint row) are keyed by each tactic's
 * `local_id` — the client-generated id from the original goals.html, which
 * survived the migration into this table as its own column precisely so
 * old checkmarks keep resolving. New tactics set local_id = id at creation
 * so the checkKey lookup in src/lib/goals.js never needs to branch on it.
 */
export async function saveTactic(t) {
  const payload = { phase_id: t.phase_id, sprint_id: t.sprint_id, text: t.text,
    freq: t.freq || 'daily', days: t.days ?? null,
    times_per_week: t.times_per_week ?? null, sort_order: t.sort_order ?? 0 }
  if (t.id) {
    const { error } = await supabase.from('sprint_tactics').update(payload).eq('id', t.id)
    if (error) throw error
  } else {
    // id must be a real uuid (column type), so it — not the "tac-" prefixed
    // newId() form — is what doubles as local_id.
    const id = crypto.randomUUID()
    const { error } = await supabase.from('sprint_tactics')
      .insert({ ...payload, id, local_id: id, user_id: await uid() })
    if (error) throw error
  }
  invalidate('sprint-tactics')
}

export async function deleteTactic(id) {
  const { error } = await supabase.from('sprint_tactics').delete().eq('id', id)
  if (error) throw error
  invalidate('sprint-tactics')
}

export const fetchGoalRollup = (o) => cachedQuery('goal-rollup',
  () => rpc('life_goal_rollup'), { ttlMs: TTL.pulse, ...o })

/* ── Momentum ────────────────────────────────────────
   Work-side rollup, same standing as Review/Identity: a surface that
   sits above Pulse/xPM/xFocus rather than beside them, scoped strictly to
   goal-linked work. Task/habit counts per goal already exist via
   fetchGoalRollup above (xPM is bridged into Pulse's tasks, so that one
   rollup already covers both) — this adds the trailing-7-day focus
   signal. See migration add_life_momentum_functions. */

export const fetchMomentumFocus = (o) => cachedQuery('momentum-focus',
  () => rpc('life_momentum_focus'), { ttlMs: TTL.pulse, ...o })

/** Read-only: savings goals are created from the Finance app, just shown here. */
export const fetchSavingsGoals = (o) => cachedQuery('savings-goals', async () =>
  unwrap(await supabase.from('finance_savings_goals')
    .select('id,name,target,current,due_date').order('due_date', { ascending: true, nullsFirst: false })),
  { ttlMs: TTL.goals, ...o })

/* ── Vision board ────────────────────────────────────────
   Two sources, merged: legacy base64 images still inside the gs2_vb blob,
   and new uploads in the `life-vision` Storage bucket. */

export const fetchLegacyVision = (o) => cachedQuery('vision-board', async () => {
  const rows = await rpc('life_vision_board')
  return (rows || []).map((r) => ({
    id: r.item_id, area: r.area, caption: r.caption,
    addedAt: r.added_at, bytes: r.src_bytes, legacy: true,
  }))
}, { ttlMs: TTL.vision, ...o })

export const fetchVisionItems = (o) => cachedQuery('vision-items', async () =>
  unwrap(await supabase.from('vision_items')
    .select('id,area,caption,storage_path,sort_order,created_at')
    .order('sort_order').order('created_at', { ascending: false })), { ttlMs: TTL.vision, ...o })

export async function uploadVisionImage(file, { area, caption }) {
  const id = await uid()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${id}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await supabase.storage.from('life-vision')
    .upload(path, file, { cacheControl: '31536000', upsert: false })
  if (upErr) throw upErr
  const { error } = await supabase.from('vision_items')
    .insert({ user_id: id, area, caption: caption || null, storage_path: path })
  if (error) throw error
  invalidate('vision-items')
}

export async function deleteVisionItem(item) {
  await supabase.storage.from('life-vision').remove([item.storage_path])
  const { error } = await supabase.from('vision_items').delete().eq('id', item.id)
  if (error) throw error
  invalidate('vision-items')
}

export async function updateVisionItem(id, patch) {
  const { error } = await supabase.from('vision_items').update(patch).eq('id', id)
  if (error) throw error
  invalidate('vision-items')
}

/** Signed URL for a stored photo. Long expiry so it caches in the browser. */
export async function signVisionUrl(path) {
  const { data, error } = await supabase.storage.from('life-vision')
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (error) throw error
  return data.signedUrl
}

export const dropLegacyVision = (itemId) => rpc('life_drop_legacy_vision', { p_item_id: itemId })

/* ═══════════════════════ HEALTH ═══════════════════════ */

function normalizeHealthLog(date, p) {
  const types = p.exerciseTypes || (p.exerciseType ? [p.exerciseType] : [])
  return {
    date,
    sleepHours: num(p.sleepHours), sleepQuality: num(p.sleepQuality),
    steps: num(p.steps), weight: num(p.weight), water: num(p.water),
    energy: num(p.energy), pain: num(p.pain), exerciseMins: num(p.exerciseMins),
    exerciseTypes: Array.isArray(types) ? types : [types].filter(Boolean),
    // Bonus-only signal for the score (lib/scores.js MOVEMENT_BONUS_POINTS)
    // — separate from exerciseMins/exerciseTypes above, which stay
    // unscored, informational minute/type tracking either way.
    exercisedToday: Boolean(p.exercisedToday),
    // `nutrition` (legacy, freeform) is unrelated to the two below — it was
    // never surfaced in this app's UI, kept only so old imported data isn't
    // silently dropped. `nutritionScore`/`nutritionNotes`/`isFastingDay`
    // are the new, actually-edited fields (see LogEditor in HealthPage.jsx
    // and the score formula in lib/scores.js).
    nutrition: p.nutrition ?? null,
    nutritionScore: num(p.nutritionScore), nutritionNotes: p.nutritionNotes || '',
    isFastingDay: Boolean(p.isFastingDay),
    notes: p.notes || '', savedAt: p.savedAt || null,
  }
}

export const fetchHealthIndex = (o) => cachedQuery('health-index', async () => {
  const rows = await rpc('life_health_index')
  return (rows || []).map((r) => r.log_date)
}, { ttlMs: TTL.health, ...o })

export const fetchHealthLogs = (from, to, o) => cachedQuery(`health-logs:${from}:${to}`, async () => {
  const rows = await rpc('life_health_logs', { p_from: from, p_to: to })
  return (rows || []).map((r) => normalizeHealthLog(r.log_date, r.payload || {}))
}, { ttlMs: TTL.health, ...o })

export async function saveHealthLog(date, payload) {
  await rpc('life_save_health_log', {
    p_date: date,
    p_payload: { ...payload, savedAt: new Date().toISOString() },
  })
  invalidate('health-logs'); invalidate('health-index')
}

export async function deleteHealthLog(date) {
  await rpc('life_delete_health_log', { p_date: date })
  invalidate('health-logs'); invalidate('health-index')
}

export const fetchHealthSettings = (o) => cachedQuery('health-settings', async () => {
  const s = (await rpc('life_health_settings')) || {}
  return {
    stepTarget: s.stepTarget ?? 10000,
    sleepTarget: s.sleepTarget ?? 7.5,
    waterTarget: s.waterTarget ?? 2,
    weeklyExerciseTarget: s.weeklyExerciseTarget ?? 150,
    bodyweightKg: s.bodyweightKg ?? 70,
    targetWeightKg: s.targetWeightKg ?? null,
  }
}, { ttlMs: HOUR, ...o })

export async function saveHealthSettings(settings) {
  await rpc('life_save_health_settings', { p_settings: settings })
  invalidate('health-settings')
}

export const fetchRoutines = (o) => cachedQuery('routines',
  async () => (await rpc('life_get_routines')) || [], { ttlMs: TTL.health, ...o })

export async function saveRoutines(routines) {
  await rpc('life_save_routines', { p_routines: routines })
  invalidate('routines')
}

export const fetchChecks = (from, to, o) => cachedQuery(`checks:${from}:${to}`, async () => {
  const rows = await rpc('life_get_checks', { p_from: from, p_to: to })
  const m = {}
  ;(rows || []).forEach((r) => { m[r.check_date] = r.payload || {} })
  return m
}, { ttlMs: TTL.health, ...o })

export async function setRoutineCheck(date, routineId, done) {
  await rpc('life_set_routine_check', { p_date: date, p_routine_id: routineId, p_done: done })
  invalidate('checks')
}

/* ── Fasting ──────────────────────────────────────────────
   Sessions, not daily logs: a fast can span midnight and doesn't map to
   "one row per date" the way sleep/steps/water do. Same shape as workout
   sessions — a capped jsonb array, upsert-by-id.
   Session: { id, startedAt, endedAt|null, targetHours, method, notes }
   endedAt === null means the fast is still running. */
// p_limit was 60 while every UI consumer's stat labels say "all time" —
// silently wrong after ~3 months at a handful of fasts/workouts a week.
// 365 covers a full year of real use; still bounded (not literally
// "everything ever"), which matters here specifically because this app
// already blew through a Supabase egress allowance once — see egress.js.
export const fetchFastingSessions = (o) => cachedQuery('fasting-sessions',
  async () => (await rpc('life_get_fasting_sessions', { p_limit: 365 })) || [], { ttlMs: TTL.health, ...o })

export async function saveFastingSession(session) {
  await rpc('life_save_fasting_session', { p_session: session })
  invalidate('fasting-sessions')
}

export async function deleteFastingSession(id) {
  await rpc('life_delete_fasting_session', { p_id: id })
  invalidate('fasting-sessions')
}

export const fetchWorkoutPlan = (o) => cachedQuery('workout-plan',
  async () => (await rpc('life_get_workout_plan')) || {}, { ttlMs: TTL.health, ...o })

export async function saveWorkoutPlan(plan) {
  await rpc('life_save_workout_plan', { p_plan: plan })
  invalidate('workout-plan')
}

export const fetchWorkoutSessions = (o) => cachedQuery('workout-sessions',
  async () => (await rpc('life_get_workout_sessions', { p_limit: 365 })) || [], { ttlMs: TTL.health, ...o })

/** Write one day of the plan rather than the whole object. */
export async function savePlanDay(date, day) {
  await rpc('life_save_plan_day', { p_date: date, p_day: day })
  invalidate('workout-plan')
}

export async function clearPlanDay(date) {
  await rpc('life_clear_plan_day', { p_date: date })
  invalidate('workout-plan')
}

export const fetchExerciseDB = (o) => cachedQuery('exercise-db', async () => {
  const db = (await rpc('life_get_exercise_db')) || {}
  return Object.keys(db).length ? db : null // null => caller falls back to defaults
}, { ttlMs: HOUR, ...o })

export async function saveExerciseDB(db) {
  await rpc('life_save_exercise_db', { p_db: db })
  invalidate('exercise-db')
}

/** Upsert by id — finishing a session replaces the in-progress copy. */
export async function saveWorkoutSession(session) {
  await rpc('life_save_workout_session', { p_session: session })
  invalidate('workout-sessions')
}

export async function addWorkoutSession(session) {
  await rpc('life_add_workout_session', { p_session: { id: newId('w'), ...session } })
  invalidate('workout-sessions')
}

/* ── Exercise goals ───────────────────────────────────────
   Same shape as fasting/workout sessions: a capped jsonb array,
   upsert-by-id. A goal targets one exercise with a single number — a
   weight for loaded lifts, a rep count for bodyweight moves — tracked
   from the day it was started until it's hit.
   Goal: { id, exercise, mode: 'weight'|'reps', target, startedAt,
     startingValue, achievedAt|null, celebratedAt|null, createdAt, notes } */
export const fetchExerciseGoals = (o) => cachedQuery('exercise-goals',
  async () => (await rpc('life_get_exercise_goals', { p_limit: 200 })) || [], { ttlMs: TTL.health, ...o })

export async function saveExerciseGoal(goal) {
  await rpc('life_save_exercise_goal', { p_goal: goal })
  invalidate('exercise-goals')
}

export async function deleteExerciseGoal(id) {
  await rpc('life_delete_exercise_goal', { p_id: id })
  invalidate('exercise-goals')
}

/**
 * Finishing a session feeds its minutes back into that day's health log, so
 * training shows up in the Health Score. Mirrors wkAdjustHealthExerciseMinutes
 * in the original.
 *
 * Two things fixed here that used to make a finished workout invisible to
 * the Health Score:
 *  - `exercisedToday` (the ONLY field scores.js reads for the movement
 *    bonus — see lib/scores.js:113) was never set by this path at all.
 *    Only the manual checkbox on the Health page ever set it, so a
 *    logged, saved workout session earned zero movement credit unless
 *    you ALSO went and ticked an unrelated box.
 *  - `if (!deltaMins) return` skipped this function entirely for a
 *    session with no timed duration (e.g. logged sets without running
 *    the clock), which meant exercisedToday never got set for that
 *    session either — "I did a workout" and "I logged 0 minutes" were
 *    being treated as the same as "nothing happened".
 */
export async function addExerciseMinutes(date, deltaMins, type) {
  const [existing] = await fetchHealthLogs(date, date, { force: true })
  const current = existing?.exerciseMins || 0
  const types = new Set(existing?.exerciseTypes || [])
  if (type) types.add(type)
  await saveHealthLog(date, {
    exerciseMins: Math.max(0, current + (deltaMins || 0)),
    exerciseTypes: [...types],
    exercisedToday: true,
  })
}

export async function deleteWorkoutSession(id) {
  await rpc('life_delete_workout_session', { p_id: id })
  invalidate('workout-sessions')
}

/* ═══════════════════════ WELLNESS ═══════════════════════ */

function normalizeCheckin(c, fallbackDate) {
  return {
    id: c.id, date: c.date || fallbackDate,
    mood: num(c.mood), stress: num(c.stress), clarity: num(c.clarity),
    grounded: num(c.grounded), present: c.present ?? null, lighter: c.lighter ?? null,
    sleepImpact: c.sleepImpact ?? null, state: c.state || null,
    loop: c.loop || '', reframe: c.reframe || '', savedAt: c.savedAt || null,
  }
}

export const fetchWellnessIndex = (o) => cachedQuery('wellness-index', async () => {
  const rows = await rpc('life_wellness_index')
  return (rows || []).map((r) => ({ date: r.checkin_date, entries: r.entries }))
}, { ttlMs: TTL.wellness, ...o })

export const fetchWellnessCheckins = (from, to, o) =>
  cachedQuery(`wellness-checkins:${from}:${to}`, async () => {
    const rows = await rpc('life_wellness_checkins', { p_from: from, p_to: to })
    return (rows || []).flatMap((r) =>
      (Array.isArray(r.payload) ? r.payload : []).map((c) => normalizeCheckin(c, r.checkin_date)))
  }, { ttlMs: TTL.wellness, ...o })

export async function saveCheckin(date, checkin) {
  await rpc('life_save_checkin', {
    p_date: date,
    p_checkin: { ...checkin, id: checkin.id || newId('c'), date, savedAt: new Date().toISOString() },
  })
  invalidate('wellness-checkins'); invalidate('wellness-index')
}

export async function deleteCheckin(date, id) {
  await rpc('life_delete_checkin', { p_date: date, p_id: id })
  invalidate('wellness-checkins'); invalidate('wellness-index')
}

export const fetchWellnessNotes = (o) => cachedQuery('wellness-notes', async () => {
  const v = (await rpc('life_wellness_notes')) || {}
  return {
    thoughts: (v.thoughts || []).map((t) => ({
      id: t.id, text: t.text || '', type: t.type || null,
      done: Boolean(t.done), createdAt: t.createdAt || null,
    })),
    practices: (v.practices || []).map((p) => ({
      id: p.id, date: p.date, type: p.type || null,
      minutes: num(p.minutes), note: p.note || '', after: p.after ?? null,
    })),
  }
}, { ttlMs: TTL.wellness, ...o })

export async function saveThought(t) {
  await rpc('life_save_thought', {
    p_thought: { id: t.id || newId('t'), text: t.text, type: t.type || null,
      done: Boolean(t.done), createdAt: t.createdAt || new Date().toISOString() },
  })
  invalidate('wellness-notes')
}

export async function deleteThought(id) {
  await rpc('life_delete_thought', { p_id: id })
  invalidate('wellness-notes')
}

export async function addPractice(p) {
  await rpc('life_add_practice', {
    p_practice: { id: newId('p'), date: p.date, type: p.type, minutes: p.minutes,
      note: p.note || '', after: p.after ?? null, savedAt: new Date().toISOString() },
  })
  invalidate('wellness-notes')
}

export async function deletePractice(id) {
  await rpc('life_delete_practice', { p_id: id })
  invalidate('wellness-notes')
}

/* ═══════════════════════ PULSE BRIDGE ═══════════════════════ */

export const fetchHabits = (o) => cachedQuery('habits', async () =>
  unwrap(await supabase.from('habits')
    .select('id,name,cadence,cadence_config,target_per_period,color,icon,sort_order,goal_id')
    .is('deleted_at', null).is('archived_at', null).order('sort_order')), { ttlMs: TTL.pulse, ...o })

export const fetchHabitLogs = (from, to, o) => cachedQuery(`habit-logs:${from}:${to}`, async () =>
  unwrap(await supabase.from('habit_logs')
    .select('id,habit_id,logged_on,count')
    .is('deleted_at', null).gte('logged_on', from).lte('logged_on', to)), { ttlMs: TTL.pulse, ...o })

export const fetchGoalTasks = (goalId, o) => cachedQuery(`goal-tasks:${goalId}`, async () =>
  unwrap(await supabase.from('tasks')
    .select('id,title,due_at,priority,status,completed_at')
    .eq('goal_id', goalId).is('deleted_at', null).is('completed_at', null)
    .order('due_at', { ascending: true, nullsFirst: false }).limit(25)), { ttlMs: TTL.pulse, ...o })

export const fetchUnlinkedTasks = (o) => cachedQuery('unlinked-tasks', async () =>
  unwrap(await supabase.from('tasks')
    .select('id,title,due_at,priority')
    .is('goal_id', null).is('deleted_at', null).is('archived_at', null)
    .is('completed_at', null).is('parent_task_id', null)
    .not('status', 'in', '(done,cancelled)')
    .order('due_at', { ascending: true, nullsFirst: false }).limit(60)), { ttlMs: TTL.pulse, ...o })

export async function linkTaskToGoal(taskId, goalId) {
  const { error } = await supabase.from('tasks').update({ goal_id: goalId }).eq('id', taskId)
  if (error) throw error
  invalidate('goal-tasks'); invalidate('unlinked-tasks'); invalidate('goal-rollup')
}

export async function linkHabitToGoal(habitId, goalId) {
  const { error } = await supabase.from('habits').update({ goal_id: goalId }).eq('id', habitId)
  if (error) throw error
  invalidate('habits'); invalidate('goal-rollup')
}

/* ═══════════════════════ DAILY INTENTIONS ═══════════════════════
   One row per calendar day (daily_intentions, unique on user_id+date):
   a short intention tied to an identity thread, closed out that evening
   with an outcome + reflection. Pulse tasks "committed to today" live in
   a separate join table (daily_intention_tasks) rather than a column on
   `tasks` — tasks is shared with Pulse/xFocus (same Supabase project,
   same user id), and a task being committed today is independent of it
   being goal-linked (tasks.goal_id, used elsewhere in this file). */

export const fetchDailyIntention = (dateISO, o) => cachedQuery(`daily-intention:${dateISO}`, async () =>
  unwrap(await supabase.from('daily_intentions')
    .select('id,date,identity_thread,intention,outcome,reflection,closed_at')
    .eq('date', dateISO).maybeSingle()), { ttlMs: TTL.pulse, ...o })

export async function saveDailyIntention(intention) {
  const payload = {
    date: intention.date, user_id: await uid(),
    identity_thread: intention.identity_thread || null,
    intention: intention.intention || '',
    outcome: intention.outcome || null,
    reflection: intention.reflection || null,
    closed_at: intention.closed_at || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('daily_intentions')
    .upsert(payload, { onConflict: 'user_id,date' })
  if (error) throw error
  invalidate(`daily-intention:${intention.date}`)
}

/** Open Pulse tasks eligible to attach to today's intention — every open
    task, not just unlinked ones (fetchUnlinkedTasks below is scoped to
    goal-linking specifically): "must get done today" is independent of
    whether a task already belongs to a goal. */
export const fetchTodayCandidateTasks = (o) => cachedQuery('today-candidate-tasks', async () =>
  unwrap(await supabase.from('tasks')
    .select('id,title,due_at,priority,goal_id,completed_at')
    .is('deleted_at', null).is('archived_at', null).is('parent_task_id', null)
    .not('status', 'in', '(done,cancelled)')
    .order('due_at', { ascending: true, nullsFirst: false }).limit(60)), { ttlMs: TTL.pulse, ...o })

/** Caller is responsible for only invoking this once intentionId is real
    (see useAsync's `enabled` option) — there's no intention row yet on a
    brand-new day, and querying with an undefined id would just error. */
export const fetchIntentionTasks = (intentionId, o) => cachedQuery(`intention-tasks:${intentionId}`, async () =>
  unwrap(await supabase.from('daily_intention_tasks')
    .select('id,task_id,tasks(id,title,completed_at)')
    .eq('intention_id', intentionId)), { ttlMs: TTL.pulse, ...o })

export async function attachIntentionTask(intentionId, taskId) {
  const { error } = await supabase.from('daily_intention_tasks')
    .insert({ intention_id: intentionId, task_id: taskId, user_id: await uid() })
  if (error) throw error
  invalidate(`intention-tasks:${intentionId}`)
}

export async function detachIntentionTask(rowId, intentionId) {
  const { error } = await supabase.from('daily_intention_tasks').delete().eq('id', rowId)
  if (error) throw error
  invalidate(`intention-tasks:${intentionId}`)
}

/** Reuses the same `tasks.completed_at` column Pulse itself reads —
    checking a committed task off here is the same action as completing
    it in Pulse, not a shadow "done in xLife only" state. */
export async function toggleTaskDone(taskId, done) {
  const { error } = await supabase.from('tasks')
    .update({ completed_at: done ? new Date().toISOString() : null }).eq('id', taskId)
  if (error) throw error
  invalidate('today-candidate-tasks'); invalidate('intention-tasks'); invalidate('goal-tasks'); invalidate('unlinked-tasks')
}

/**
 * Tick a habit for a day. Deliberately select-then-write rather than
 * `.upsert()`: the uniqueness guard is a PARTIAL index
 * (`where deleted_at is null`) and Postgres cannot infer a partial index
 * from a plain ON CONFLICT (a, b), which PostgREST has no way to qualify.
 */
export async function logHabit(habitId, dateISO, count = 1) {
  const { data: existing, error: findErr } = await supabase.from('habit_logs')
    .select('id').eq('habit_id', habitId).eq('logged_on', dateISO)
    .is('deleted_at', null).maybeSingle()
  if (findErr) throw findErr

  const { error } = existing
    ? await supabase.from('habit_logs').update({ count }).eq('id', existing.id)
    : await supabase.from('habit_logs')
        .insert({ user_id: await uid(), habit_id: habitId, logged_on: dateISO, count })
  if (error) throw error
  invalidate('habit-logs')
}

export async function unlogHabit(habitId, dateISO) {
  const { error } = await supabase.from('habit_logs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('habit_id', habitId).eq('logged_on', dateISO).is('deleted_at', null)
  if (error) throw error
  invalidate('habit-logs')
}

/* ═══════════════════════ REMINDERS ═══════════════════════
   life_reminder_prefs is a real per-user table (like goals/sprints), read
   and written directly under RLS rather than through a life_* RPC — RPCs
   in this file exist specifically to slice/merge the traction_data JSONB
   blobs, which this table isn't. The life-send-reminders edge function
   reads this same table with the service role (bypassing RLS) on a
   pg_cron schedule; see supabase/functions/life-send-reminders. */

const REMINDER_DEFAULTS = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
  health_enabled: true, health_time: '20:00',
  wellness_enabled: true, wellness_time: '20:00',
}

export const fetchReminderPrefs = (o) => cachedQuery('reminder-prefs', async () => {
  const row = unwrap(await supabase.from('life_reminder_prefs')
    .select('timezone,health_enabled,health_time,wellness_enabled,wellness_time')
    .maybeSingle())
  return row ? { ...REMINDER_DEFAULTS, ...row, health_time: row.health_time?.slice(0, 5),
    wellness_time: row.wellness_time?.slice(0, 5) } : REMINDER_DEFAULTS
}, { ttlMs: HOUR, ...o })

export async function saveReminderPrefs(prefs) {
  const id = await uid()
  const { error } = await supabase.from('life_reminder_prefs')
    .upsert({
      user_id: id,
      timezone: prefs.timezone || REMINDER_DEFAULTS.timezone,
      health_enabled: Boolean(prefs.health_enabled),
      health_time: prefs.health_time || '20:00',
      wellness_enabled: Boolean(prefs.wellness_enabled),
      wellness_time: prefs.wellness_time || '20:00',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) throw error
  invalidate('reminder-prefs')
}

/** Registers this browser's push subscription so life-send-reminders can
    reach it. Upsert-by-endpoint: re-subscribing (e.g. after clearing site
    data) just refreshes the row rather than creating a duplicate. */
export async function savePushSubscription(row) {
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ user_id: await uid(), ...row }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function removePushSubscription(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

/* ═══════════════════════ REVIEW ═══════════════════════

   `weekly_reviews` predates this module: two reviews from April and May
   2026 were written in an earlier surface and the table came across with
   the rest of the schema. Everything here is built against those exact
   columns so the old entries load as first-class history.

   Plain PostgREST rather than a life_* RPC, and deliberately so: the RPC
   layer exists to slice and MERGE the shared `traction_data` blob, and
   this is a real table with its own row per week, RLS scoped to
   `auth.uid() = user_id`, `user_id` defaulting to auth.uid(), and a
   unique index on (user_id, week_id) that makes the upsert exact. There
   is no blob to protect here, so there is nothing for an RPC to add. */

const REVIEW_COLS =
  'id,week_id,score,wins,challenges,learning,gratitude,energy,other,' +
  'module_notes,theme_word,priority_1,priority_2,priority_3,protect,let_go,ai_insight,updated_at'

/* Date-bounded like every other history read. `from`/`to` are week ids
   (Mondays), compared as text, which sorts correctly for ISO dates. */
export const fetchWeeklyReviews = (from, to, o) =>
  cachedQuery(`weekly-reviews:${from}:${to}`, async () =>
    unwrap(await supabase.from('weekly_reviews')
      .select(REVIEW_COLS)
      .gte('week_id', from).lte('week_id', to)
      .order('week_id', { ascending: false })), { ttlMs: TTL.goals, ...o })

/* The index is week ids only — enough to render "which weeks exist" and
   to drive the due prompt without pulling any prose. Same shape of trick
   as fetchHealthIndex: ask what days exist before asking what is in them. */
export const fetchReviewIndex = (o) =>
  cachedQuery('review-index', async () =>
    (unwrap(await supabase.from('weekly_reviews')
      .select('week_id,updated_at')
      .order('week_id', { ascending: false })) || []), { ttlMs: TTL.goals, ...o })

export async function saveWeeklyReview(review) {
  const payload = {
    week_id: review.week_id,
    score: num(review.score),
    wins: review.wins || null,
    challenges: review.challenges || null,
    learning: review.learning || null,
    gratitude: review.gratitude || null,
    energy: review.energy || null,
    other: review.other || null,
    module_notes: review.module_notes || null,
    theme_word: review.theme_word || null,
    priority_1: review.priority_1 || null,
    priority_2: review.priority_2 || null,
    priority_3: review.priority_3 || null,
    protect: review.protect || null,
    let_go: review.let_go || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('weekly_reviews')
    .upsert({ ...payload, user_id: await uid() }, { onConflict: 'user_id,week_id' })
    .select('id').single()
  if (error) throw error
  invalidate('weekly-reviews'); invalidate('review-index')
  return data.id
}

export async function deleteWeeklyReview(weekId) {
  const { error } = await supabase.from('weekly_reviews').delete().eq('week_id', weekId)
  if (error) throw error
  invalidate('weekly-reviews'); invalidate('review-index')
}

export function refreshAll() {
  ;['goals', 'visions', 'goal-metrics', 'metric-logs', 'sprints', 'sprint-phases',
    'sprint-tactics', 'goal-rollup', 'vision-board', 'vision-items', 'health-logs',
    'health-index', 'health-settings', 'routines', 'checks', 'workout-plan',
    'workout-sessions', 'wellness-index', 'wellness-checkins', 'wellness-notes',
    'habits', 'habit-logs', 'goal-tasks', 'unlinked-tasks', 'reminder-prefs',
    'weekly-reviews', 'review-index'].forEach(invalidate)
}
