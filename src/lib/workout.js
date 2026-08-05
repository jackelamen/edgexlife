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

/** Total volume (reps × weight) for a session — drives the heatmap shading. */
export function sessionVolume(session) {
  return (session.exercises || []).reduce((total, ex) =>
    total + (ex.sets || []).reduce((s, set) => {
      const reps = parseFloat(set.reps) || 0
      const weight = parseFloat(set.weight) || 0
      return s + reps * weight
    }, 0), 0)
}

export function sessionSetCount(session) {
  return (session.exercises || []).reduce((n, ex) =>
    n + (ex.sets || []).filter((s) => s.done).length, 0)
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
