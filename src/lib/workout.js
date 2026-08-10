/* Workout constants ported verbatim from health.html. */

export const WK_TYPES = [
  { id: 'Strength', label: 'Strength', em: '🏋️' },
  { id: 'Cardio', label: 'Cardio', em: '🏃' },
  { id: 'Mobility', label: 'Mobility', em: '🧘' },
  { id: 'HIIT', label: 'HIIT', em: '⚡' },
  { id: 'Sport', label: 'Sport', em: '🏅' },
  { id: 'Other', label: 'Other', em: '💪' },
]

export const DEFAULT_EXERCISE_DB = {
  Chest: ['Barbell Bench Press', 'Dumbbell Bench Press', 'Incline Dumbbell Press', 'Push-Up', 'Chest Fly', 'Cable Crossover', 'Dips'],
  Back: ['Deadlift', 'Pull-Up', 'Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Single-Arm Dumbbell Row', 'Face Pull'],
  Shoulders: ['Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Rear Delt Fly', 'Arnold Press', 'Upright Row', 'Farmer Carry'],
  Legs: ['Back Squat', 'Front Squat', 'Leg Press', 'Walking Lunge', 'Romanian Deadlift', 'Leg Curl', 'Leg Extension', 'Calf Raise'],
  Glutes: ['Hip Thrust', 'Glute Bridge', 'Bulgarian Split Squat', 'Cable Kickback', 'Step-Up', 'Kettlebell Swing'],
  Arms: ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Triceps Pushdown', 'Skull Crusher', 'Close-Grip Bench Press', 'Overhead Triceps Extension'],
  Core: ['Plank', 'Side Plank', 'Dead Bug', 'Hanging Knee Raise', 'Cable Crunch', 'Pallof Press', 'Russian Twist'],
  Cardio: ['Walk', 'Run', 'Bike', 'Rowing Machine', 'Elliptical', 'Jump Rope', 'Stair Climber', 'Swimming'],
  Mobility: ['Hip Flexor Stretch', 'Thoracic Rotation', 'Ankle Mobility', 'Cat-Cow', 'Worlds Greatest Stretch', 'Childs Pose', 'Hamstring Stretch'],
  FullBody: ['Burpee', 'Turkish Get-Up', 'Clean and Press', 'Sled Push', 'Battle Ropes', 'Medicine Ball Slam', 'Bear Crawl'],
}

export const WK_TEMPLATES = {
  Strength: ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Row'],
  Cardio: ['Run', 'Bike', 'Row'],
  Mobility: ['Hip Flexor Stretch', 'Thoracic Rotation', 'Cat-Cow'],
  HIIT: ['Burpee', 'Kettlebell Swing', 'Jump Rope'],
  Sport: ['Warm-up', 'Play', 'Cool-down'],
  Other: [],
}

export const bodypartLabel = (k) => (k === 'FullBody' ? 'Full Body' : k)

/* Exercises where the meaningful "getting stronger" signal is reps, not
   load — curated from DEFAULT_EXERCISE_DB's own bodyweight movements.
   Matched by exact name so a session's exercise entries (free-typed or
   picked from the DB) line up without a schema change to the DB itself. */
export const BODYWEIGHT_EXERCISES = new Set([
  'Push-Up', 'Pull-Up', 'Dips', 'Plank', 'Side Plank', 'Dead Bug',
  'Hanging Knee Raise', 'Burpee', 'Bear Crawl', 'Chin-Up', 'Air Squat',
])

/** True if an exercise's progress should be tracked by reps rather than
    weight — either it's a known bodyweight movement, or every logged set
    for it across all sessions has no weight recorded (covers exercises
    Jack adds himself that aren't in the curated list above). Only ever
    used as a DEFAULT; the Progress tab lets it be overridden per exercise
    since some moves (weighted pull-ups, a loaded plank) are genuinely
    tracked either way depending on how they were logged. */
export function isBodyweightExercise(name, sessions) {
  if (BODYWEIGHT_EXERCISES.has(name)) return true
  let sawAnySet = false
  for (const s of sessions) {
    const ex = (s.exercises || []).find((e) => e.name === name)
    if (!ex) continue
    for (const set of ex.sets || []) {
      sawAnySet = true
      if ((parseFloat(set.weight) || 0) > 0) return false
    }
  }
  return sawAnySet
}

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Monday of the week containing `d`, offset by `weeks`. */
export function weekMonday(d = new Date(), weeks = 0) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - day + weeks * 7)
  x.setHours(12, 0, 0, 0)
  return x
}

export function weekDates(weeks = 0) {
  const mon = weekMonday(new Date(), weeks)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

/** The actual load moved on one set. For bodyweight exercises (Push-Up,
    Pull-Up, Dips, etc. — see BODYWEIGHT_EXERCISES) any weight entered is
    ADDED weight on top of bodyweight, e.g. a weighted dip with "20" logged
    is bodyweightKg + 20, not just 20 — leaving it as just 20 undercounts
    every unweighted rep of a hard bodyweight move. Everything else is
    unaffected: the entered weight is the load, same as always. */
export function setLoadKg(exerciseName, weightInput, bodyweightKg = 70) {
  const w = parseFloat(weightInput) || 0
  return BODYWEIGHT_EXERCISES.has(exerciseName) ? bodyweightKg + w : w
}

/** Total volume (reps × load) for a session — drives the heatmap shading.
    bodyweightKg defaults to 70 so old call sites that haven't been updated
    with a real settings value still return a sane number rather than NaN. */
export function sessionVolume(session, bodyweightKg = 70) {
  return (session.exercises || []).reduce((total, ex) =>
    total + (ex.sets || []).reduce((s, set) => {
      const reps = parseFloat(set.reps) || 0
      const load = setLoadKg(ex.name, set.weight, bodyweightKg)
      return s + reps * load
    }, 0), 0)
}

export function sessionSetCount(session) {
  return (session.exercises || []).reduce((n, ex) =>
    n + (ex.sets || []).filter((s) => s.done).length, 0)
}

/* ── CSV import for the Plan grid ──────────────────────────────
   Lets a whole week (or more) be planned in one upload instead of one day
   at a time through DayModal. Expected columns (header row required, any
   order): date, type, exercise, sets, reps, weight, rest, notes. Multiple
   rows share a date to build that day's exercise list; a row with
   rest=true (or yes/1/y) marks the whole day as rest regardless of any
   exercise columns on that row. No CSV library is used — the format is
   simple enough that a small hand-rolled parser avoids adding a
   dependency the app doesn't otherwise need. */

export const WORKOUT_CSV_TEMPLATE =
`date,type,exercise,sets,reps,weight,rest,notes
2026-08-10,Strength,Barbell Bench Press,4,8,60,,Focus on form
2026-08-10,Strength,Barbell Row,4,10,50,,
2026-08-11,Cardio,Run,,,,,"30 min easy pace"
2026-08-12,,,,,,true,Rest day
`

/** RFC4180-ish row splitter: handles quoted fields, embedded commas, and
    "" as an escaped quote. Good enough for a hand-edited or Excel/Sheets
    export without pulling in a CSV library. */
function parseCSVRows(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const s = String(text).replace(/\r\n/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

/** Parses CSV text into { days, errors }. `days` is keyed by date, in the
    exact shape savePlanDay expects — ready to upsert one call per date. */
export function parseWorkoutCSV(text) {
  const rows = parseCSVRows(text)
  if (!rows.length) return { days: {}, errors: ['File is empty.'] }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name) => header.indexOf(name)
  const iDate = col('date'), iType = col('type'), iExercise = col('exercise'),
    iSets = col('sets'), iReps = col('reps'), iWeight = col('weight'),
    iRest = col('rest'), iNotes = col('notes')

  if (iDate === -1) return { days: {}, errors: ['CSV must have a "date" column (YYYY-MM-DD).'] }

  const days = {}
  const errors = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row.length || row.every((c) => !c.trim())) continue

    const date = (row[iDate] || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Row ${r + 1}: "${date || '(blank)'}" isn't a valid date (want YYYY-MM-DD) — skipped.`)
      continue
    }

    const isRest = iRest !== -1 && /^(true|yes|1|y)$/i.test((row[iRest] || '').trim())
    const typeRaw = iType !== -1 ? (row[iType] || '').trim() : ''
    const type = WK_TYPES.find((t) => t.id.toLowerCase() === typeRaw.toLowerCase())?.id || null
    const notes = iNotes !== -1 ? (row[iNotes] || '').trim() : ''
    const exerciseName = iExercise !== -1 ? (row[iExercise] || '').trim() : ''

    if (!days[date]) days[date] = { type: null, exercises: [], notes: '', rest: false, goalIds: [] }
    const day = days[date]

    if (isRest) day.rest = true
    if (type && !day.type) day.type = type
    if (notes && !day.notes) day.notes = notes

    if (exerciseName && !isRest) {
      day.exercises.push({
        name: exerciseName,
        sets: iSets !== -1 && row[iSets]?.trim() ? Math.max(1, parseInt(row[iSets], 10) || 3) : 3,
        reps: iReps !== -1 ? (row[iReps] || '').trim() : '',
        weight: iWeight !== -1 ? (row[iWeight] || '').trim() : '',
      })
    } else if (!exerciseName && !isRest) {
      errors.push(`Row ${r + 1}: no exercise and not marked rest — skipped.`)
    }
  }

  Object.values(days).forEach((d) => {
    if (!d.type) d.type = 'Other'
    if (d.rest) d.exercises = []
  })

  return { days, errors }
}

export const fmtDuration = (secs) => {
  const s = Math.max(0, Math.floor(secs || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
