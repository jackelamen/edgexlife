import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../ui/Icon'
import {
  Card, CardHead, Badge, Tabs, Modal, Empty, Loading, SectionLabel, StatCard, useConfirm,
} from '../ui/Kit'
import { useAsync } from '../../hooks/useAsync'
import {
  fetchWorkoutPlan, savePlanDay, clearPlanDay, fetchExerciseDB, saveExerciseDB,
  fetchWorkoutSessions, saveWorkoutSession, deleteWorkoutSession,
  addExerciseMinutes, fetchGoals, newId,
  fetchExerciseGoals, saveExerciseGoal, deleteExerciseGoal,
} from '../../lib/data'
import {
  WK_TYPES, DEFAULT_EXERCISE_DB, WK_TEMPLATES, bodypartLabel,
  DAY_SHORT, DAY_FULL, weekDates, sessionVolume, sessionSetCount, fmtDuration,
  parseWorkoutCSV, WORKOUT_CSV_TEMPLATE, isBodyweightExercise,
} from '../../lib/workout'
import { today, pretty, prettyShort } from '../../lib/dates'
import TrendChart from './TrendChart'

/* No standalone "Session Log" tab — it used to be a nav destination that,
   with no active session, was just an empty state with a "Start Quick
   Session" button duplicating the header's Log Session action. The live
   session-logging screen (SessionTab) still exists and still renders
   whenever `tab === 'log'`; it's just reached by actually starting a
   session (header button, mobile FAB, "Start Session Now" in a day's
   plan, or editing a past session from Session Log) rather than sitting
   in the tab bar as its own destination. */
const TABS = [
  { value: 'plan', label: 'Plan', icon: 'calendar_month' },
  { value: 'db', label: 'Database', icon: 'list_alt' },
  { value: 'history', label: 'Session Log', icon: 'bar_chart' },
  { value: 'progress', label: 'Progress', icon: 'trending_up' },
]

export default function WorkoutModule() {
  const [tab, setTab] = useState('plan')
  const [weekOffset, setWeekOffset] = useState(0)
  const [session, setSession] = useState(null)

  const plan = useAsync((f) => fetchWorkoutPlan({ force: f }))
  const sessions = useAsync((f) => fetchWorkoutSessions({ force: f }))
  const dbRaw = useAsync((f) => fetchExerciseDB({ force: f }))
  const goals = useAsync((f) => fetchGoals({ force: f }))
  const exGoals = useAsync((f) => fetchExerciseGoals({ force: f }))

  const db = dbRaw.data || DEFAULT_EXERCISE_DB
  const healthGoals = (goals.data || []).filter((g) => g.area === 'health' && g.status === 'active')

  function startSession(dateStr, blank = false) {
    const date = dateStr || today()
    const day = blank ? null : plan.data?.[date]
    setSession({
      id: 'sess-' + Date.now(),
      date,
      type: day?.type || 'Other',
      exercises: day?.exercises?.length
        ? day.exercises.map((ex) => ({
            name: typeof ex === 'string' ? ex : ex.name,
            sets: Array.from({ length: ex.sets || 3 },
              () => ({ reps: ex.reps || '', weight: ex.weight || '', done: false })),
          }))
        : [{ name: '', sets: [0, 1, 2].map(() => ({ reps: '', weight: '', done: false })) }],
      goalIds: day?.goalIds || [],
      notes: '',
      durationSec: 0,
    })
    setTab('log')
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap" style={{ marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div className="page-date">Training OS</div>
          <h1 className="page-title">Workout Planner</h1>
          <p className="page-sub">Plan your week, log every session, track progress.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
            <Icon name="chevron_left" size={16} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', minWidth: 74, textAlign: 'center' }}>
            {weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week'
              : weekOffset === 1 ? 'Next Week' : `${weekOffset > 0 ? '+' : ''}${weekOffset} weeks`}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>
            <Icon name="chevron_right" size={16} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => startSession(null, true)}>
            <Icon name="play_arrow" size={16} /> Log Session
          </button>
        </div>
      </div>

      <Tabs variant="segment" value={tab} onChange={setTab} options={TABS} />

      {tab === 'plan' && (
        <PlanTab
          plan={plan} weekOffset={weekOffset} db={db} goals={healthGoals}
          sessions={sessions.data || []} onStart={startSession}
        />
      )}
      {tab === 'log' && (
        <SessionTab
          session={session} setSession={setSession} db={db} goals={healthGoals} plan={plan}
          pastSessions={sessions.data || []} exerciseGoals={exGoals.data || []}
          onStart={startSession}
          onFinished={() => { sessions.reload(); setSession(null); setTab('history') }}
        />
      )}
      {tab === 'db' && <DatabaseTab db={db} onSaved={() => dbRaw.reload()} />}
      {tab === 'history' && <HistoryTab sessions={sessions} onEdit={setSession} onTab={setTab} />}
      {tab === 'progress' && <ProgressTab sessions={sessions.data || []} exGoals={exGoals} db={db} />}

      <button className="mob-fab" onClick={() => startSession(null, true)} aria-label="Log session">
        <Icon name="play_arrow" size={26} fill />
      </button>
    </>
  )
}

/* Shared shape-conversion: a session's per-set exercises -> the plan's
   {name, sets:<count>, reps, weight} shape, using the first set as the
   representative reps/weight. Used both to backfill plan.data on finish()
   and to derive a display-only "what actually happened" day when a day
   was logged straight from Log Session without ever being planned. */
function sessionToPlanDay(session, existing) {
  return {
    type: session.type || existing?.type || 'Other',
    exercises: session.exercises?.length
      ? session.exercises.map((ex) => ({
          name: ex.name,
          sets: ex.sets?.length || 3,
          reps: ex.sets?.[0]?.reps || '',
          weight: ex.sets?.[0]?.weight || '',
        }))
      : (existing?.exercises || []),
    notes: existing?.notes || session.notes || '',
    rest: false,
    goalIds: Array.from(new Set([...(existing?.goalIds || []), ...(session.goalIds || [])])),
  }
}

/* ═══════════════ Plan ═══════════════ */

function PlanTab({ plan, weekOffset, db, goals, sessions, onStart }) {
  const [editDate, setEditDate] = useState(null)
  const [importPreview, setImportPreview] = useState(null) // { days, errors } | null
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  const dates = useMemo(() => weekDates(weekOffset), [weekOffset])
  const t = today()

  const weekSessions = sessions.filter((s) => dates.includes(s.date))
  const totalMins = weekSessions.reduce((n, s) => n + Math.round((s.durationSec || 0) / 60), 0)
  const totalVol = weekSessions.reduce((n, s) => n + sessionVolume(s), 0)
  const planned = dates.filter((d) => plan.data?.[d] && !plan.data[d].rest).length

  // A day with a REAL saved plan uses it as-is. A day with no plan but at
  // least one logged session is displayed and made copyable too — a session
  // logged via "Log Session" (bypassing the planner entirely) never wrote
  // to plan.data before, so that day silently stayed "+ Add" forever even
  // once real training happened. Nothing is written here; this is purely
  // what the Plan grid and "Copy from another day" read from.
  const effectiveByDate = useMemo(() => {
    const out = {}
    for (const d of dates) {
      if (plan.data?.[d]) { out[d] = plan.data[d]; continue }
      const daySessions = sessions.filter((s) => s.date === d)
      if (daySessions.length) out[d] = sessionToPlanDay(daySessions[daySessions.length - 1])
    }
    return out
  }, [dates, plan.data, sessions])

  function onFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file after a fix
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const { days, errors } = parseWorkoutCSV(String(reader.result || ''))
      if (!Object.keys(days).length) {
        toast.error(errors[0] || 'Nothing to import — check the CSV format.')
        return
      }
      setImportPreview({ days, errors })
    }
    reader.onerror = () => toast.error('Could not read that file.')
    reader.readAsText(file)
  }

  function downloadTemplate() {
    const blob = new Blob([WORKOUT_CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workout-plan-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    try {
      const entries = Object.entries(importPreview.days)
      for (const [date, day] of entries) {
        await savePlanDay(date, day)
      }
      toast.success(`Imported ${entries.length} day${entries.length === 1 ? '' : 's'}`)
      plan.reload()
      setImportPreview(null)
    } catch (e) {
      toast.error(e.message || 'Import failed partway through — check what saved and retry the rest.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFileSelected} />
        <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
          <Icon name="download" size={15} /> Download CSV template
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
          <Icon name="upload_file" size={15} /> Import CSV
        </button>
      </div>

      <div className="plan-week">
        {dates.map((date, i) => {
          const day = effectiveByDate[date]
          const isToday = date === t
          const type = WK_TYPES.find((w) => w.id === day?.type)
          return (
            <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className={`plan-day-hdr${isToday ? ' today-col' : ''}`}>
                {DAY_SHORT[i]}<br />
                <span style={{ fontWeight: 600 }}>{Number(date.slice(8))}</span>
              </div>
              <button
                className={[
                  'plan-slot',
                  day && !day.rest ? 'has-workout' : '',
                  day?.rest ? 'rest-day' : '',
                  isToday ? 'today-slot' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setEditDate(date)}
              >
                {day?.goalIds?.length > 0 && <span className="wt-goal-dot" />}
                {day?.rest ? (
                  <span className="add-hint">Rest</span>
                ) : day ? (
                  <>
                    <span className="wt-icon">{type?.em || '💪'}</span>
                    <span className="wt-name">{day.type}</span>
                    {day.exercises?.length > 0 && (
                      <span className="wt-meta">{day.exercises.length} ex</span>
                    )}
                  </>
                ) : (
                  <span className="add-hint">+ Add</span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <Card>
        <CardHead
          title="Connected Health Goals"
          sub="Tag workouts to a goal. Sessions count toward your progress."
          right={<Badge tone="green">{goals.length} goal{goals.length === 1 ? '' : 's'}</Badge>}
        />
        {!goals.length ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            No active health goals yet. Create one in the Goals module and it will show here.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {goals.map((g) => {
              const linked = sessions.filter((s) => (s.goalIds || []).includes(g.id))
              return (
                <div key={g.id} className="goal-link-row" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{g.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
                      {linked.length} session{linked.length === 1 ? '' : 's'} logged
                    </div>
                  </div>
                  <Icon name="fitness_center" size={17} style={{ color: 'var(--text-3)' }} />
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" style={{ marginTop: 18 }}>
        <StatCard label="Planned" value={planned} sub="workouts this week" />
        <StatCard label="Logged" value={weekSessions.length} sub="sessions this week" />
        <StatCard label="Time" value={totalMins} sub="minutes trained" />
        <StatCard label="Volume" value={totalVol ? Math.round(totalVol).toLocaleString() : 0} sub="kg lifted" />
      </div>

      <DayModal
        date={editDate}
        plan={plan}
        effectiveByDate={effectiveByDate}
        db={db}
        allDates={dates}
        onClose={() => setEditDate(null)}
        onStart={(d) => { setEditDate(null); onStart(d) }}
      />

      <ImportPreviewModal preview={importPreview} importing={importing}
        onClose={() => setImportPreview(null)} onConfirm={confirmImport} />
    </>
  )
}

function ImportPreviewModal({ preview, importing, onClose, onConfirm }) {
  if (!preview) return null
  const entries = Object.entries(preview.days).sort(([a], [b]) => a.localeCompare(b))
  return (
    <Modal open={!!preview} onClose={onClose} title="Import CSV"
      sub={`${entries.length} day${entries.length === 1 ? '' : 's'} found. This replaces any existing plan for these dates.`}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={importing} onClick={onConfirm}>
          <Icon name="upload_file" size={16} /> {importing ? 'Importing…' : `Import ${entries.length} day${entries.length === 1 ? '' : 's'}`}
        </button>
      </>}>
      {preview.errors.length > 0 && (
        <div style={{
          background: 'var(--s-risk-bg, #f9e3df)', color: 'var(--s-risk, #c8452f)', borderRadius: 10,
          padding: '10px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12, lineHeight: 1.5,
        }}>
          {preview.errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {entries.map(([date, day]) => (
          <div key={date} className="check-row" style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{pretty(date)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
                {day.rest ? 'Rest day' : `${day.type} · ${day.exercises.length} exercise${day.exercises.length === 1 ? '' : 's'}`}
              </div>
            </div>
            {!day.rest && day.exercises.length > 0 && (
              <Badge tone="blue">{day.exercises.map((e) => e.name).slice(0, 2).join(', ')}{day.exercises.length > 2 ? '…' : ''}</Badge>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

function DayModal({ date, plan, effectiveByDate, db, allDates, onClose, onStart }) {
  const open = Boolean(date)
  // Prefill from the REAL plan if one exists, otherwise from whatever was
  // actually logged that day (effectiveByDate) — so opening a day that was
  // only ever "Log Session"-ed shows what happened instead of a blank form,
  // and hitting Save on it turns that into a real saved plan.
  const existing = date ? (plan.data?.[date] || effectiveByDate?.[date]) : null

  const [type, setType] = useState(null)
  const [exercises, setExercises] = useState([])
  const [notes, setNotes] = useState('')
  const [rest, setRest] = useState(false)
  const [bodypart, setBodypart] = useState('Chest')
  const [pick, setPick] = useState('')
  const [copyFrom, setCopyFrom] = useState('')

  // Re-seed whenever a different day is opened.
  useEffect(() => {
    if (!open) return
    setType(existing?.type || null)
    setExercises(existing?.exercises || [])
    setNotes(existing?.notes || '')
    setRest(Boolean(existing?.rest))
    setBodypart('Chest')
    setPick('')
    setCopyFrom('')
  }, [open, date]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = db[bodypart] || []
  useEffect(() => { setPick(list[0] || '') }, [bodypart]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectType(id) {
    setType(id)
    if (!exercises.length && WK_TEMPLATES[id]?.length) {
      setExercises(WK_TEMPLATES[id].map((name) => ({ name, sets: 3, reps: '', weight: '' })))
    }
  }

  async function save() {
    try {
      await savePlanDay(date, {
        type: type || 'Other', exercises, notes, rest,
        goalIds: existing?.goalIds || [],
      })
      toast.success('Day saved')
      plan.reload()
      onClose()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={date ? pretty(date) : ''}
      sub="Plan your training for this day"
    >
      <SectionLabel>Workout type</SectionLabel>
      <div className="wt-type-grid">
        {WK_TYPES.map((t) => (
          <button key={t.id} className={`wt-type-btn${type === t.id ? ' selected' : ''}`}
            onClick={() => selectType(t.id)}>
            <span className="em">{t.em}</span>{t.label}
          </button>
        ))}
      </div>

      <SectionLabel>Quick template</SectionLabel>
      <div className="exercise-picker">
        <select value={bodypart} onChange={(e) => setBodypart(e.target.value)}>
          {Object.keys(db).map((k) => <option key={k} value={k}>{bodypartLabel(k)}</option>)}
        </select>
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          {list.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm"
          onClick={() => pick && setExercises([...exercises, { name: pick, sets: 3, reps: '', weight: '' }])}>
          <Icon name="library_add" size={15} /> Add
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {exercises.map((ex, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input value={ex.name} placeholder="Exercise"
              onChange={(e) => setExercises(exercises.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              style={{ fontSize: 13, padding: '8px 10px' }} />
            <input type="number" value={ex.sets ?? 3} min={1} max={12} title="Sets"
              onChange={(e) => setExercises(exercises.map((x, j) => j === i ? { ...x, sets: Number(e.target.value) } : x))}
              style={{ width: 62, fontSize: 13, padding: '8px 6px', textAlign: 'center', fontWeight: 800 }} />
            <button className="btn btn-icon btn-sm" onClick={() => setExercises(exercises.filter((_, j) => j !== i))}
              aria-label="Remove">
              <Icon name="close" size={15} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm"
        onClick={() => setExercises([...exercises, { name: '', sets: 3, reps: '', weight: '' }])}>
        <Icon name="add" size={15} /> Add Exercise
      </button>

      <div style={{ marginTop: 14 }}>
        <SectionLabel>Notes / intention</SectionLabel>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Focus on form, keep rest short…" style={{ resize: 'none', minHeight: 0 }} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>
        <input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)}
          style={{ width: 16, height: 16 }} />
        Mark as rest day
      </label>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-med)' }}>
        <SectionLabel>Copy from another day</SectionLabel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={{ flex: 1, fontSize: 13 }}>
            <option value="">— pick a day to copy —</option>
            {allDates.filter((d) => d !== date && effectiveByDate?.[d]).map((d, i) => (
              <option key={d} value={d}>{DAY_FULL[allDates.indexOf(d)]} — {effectiveByDate[d].type}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" disabled={!copyFrom}
            onClick={() => {
              const src = effectiveByDate?.[copyFrom]
              if (!src) return
              setType(src.type); setExercises(src.exercises || [])
              setNotes(src.notes || ''); setRest(Boolean(src.rest))
              toast.success('Copied')
            }}>
            <Icon name="content_copy" size={15} /> Copy
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save}>
          <Icon name="save" size={17} /> Save
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => onStart(date)}>
          <Icon name="play_arrow" size={16} /> Start Session Now
        </button>
        <button className="btn btn-danger btn-sm"
          onClick={async () => {
            await clearPlanDay(date)
            toast.success('Day cleared')
            plan.reload(); onClose()
          }}>
          <Icon name="delete" size={15} /> Clear
        </button>
      </div>
    </Modal>
  )
}

/*
  A session logged via "Log Session" (quick-start, bypassing the Plan
  grid entirely) used to only write to the sessions table — plan.data[date]
  stayed undefined forever, so that day kept showing "+ Add" on the Plan
  tab and never appeared in any "Copy from another day" list even after
  real workouts were logged. This backfills the plan for that date from
  what was actually done, so the Plan grid and Copy-from-day both reflect
  reality regardless of whether the day was pre-planned first. Converts
  the session's per-set shape ({name, sets:[{reps,weight,done}]}) into the
  plan's shape ({name, sets:<count>, reps, weight}) using the first set's
  values as the representative rep/weight for that exercise. */
async function syncPlanFromSession(session, plan) {
  const existing = plan?.data?.[session.date]
  await savePlanDay(session.date, sessionToPlanDay(session, existing))
  plan?.reload?.()
}

/* ═══════════════ Live session ═══════════════ */

function SessionTab({ session, setSession, db, goals, plan, pastSessions, exerciseGoals, onStart, onFinished }) {
  const [secs, setSecs] = useState(0)
  const [running, setRunning] = useState(false)
  const [openEx, setOpenEx] = useState(0)
  const startedAt = useRef(0)
  const base = useRef(0)

  // Active goals grouped by exercise name — surfaced right on the exercise
  // card during logging, not just on a separate Progress tab you have to
  // remember to visit. This is the moment the number is actually
  // actionable, so it's the moment it should be visible.
  const goalsByExercise = useMemo(() => {
    const map = {}
    ;(exerciseGoals || []).forEach((g) => {
      if (g.celebratedAt) return
      ;(map[g.exercise] ||= []).push(g)
    })
    return map
  }, [exerciseGoals])

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now()
    const id = setInterval(() => setSecs(base.current + Math.floor((Date.now() - startedAt.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => { setSecs(0); base.current = 0; setRunning(false); setOpenEx(0) }, [session?.id])

  if (!session) {
    return (
      <Empty icon="fitness_center" title="No active session"
        action={<button className="btn btn-primary" onClick={() => onStart(null, true)}>
          <Icon name="play_arrow" size={17} /> Start Quick Session</button>}>
        Choose a planned workout or start a quick session.
      </Empty>
    )
  }

  const set = (patch) => setSession({ ...session, ...patch })
  const updateEx = (i, patch) =>
    set({ exercises: session.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) })

  function toggleTimer() {
    if (running) { base.current = secs; setRunning(false) } else setRunning(true)
  }

  async function finish() {
    if (running) { base.current = secs; setRunning(false) }
    const cleaned = {
      ...session,
      durationSec: secs,
      exercises: session.exercises.filter((e) => e.name.trim()),
      completedAt: new Date().toISOString(),
    }
    try {
      await saveWorkoutSession(cleaned)
      await addExerciseMinutes(cleaned.date, Math.round(secs / 60), cleaned.type)
      await syncPlanFromSession(cleaned, plan)
      toast.success('Session saved')
      onFinished()
    } catch (e) { toast.error(e.message) }
  }

  const doneSets = sessionSetCount(session)
  const totalSets = session.exercises.reduce((n, e) => n + (e.sets?.length || 0), 0)

  return (
    <>
      <div className="session-header">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>
              {session.type} Session
            </h2>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>
              {pretty(session.date)} · {doneSets}/{totalSets} sets done
            </div>
          </div>
          <button className="btn btn-primary" onClick={finish}>
            <Icon name="check" size={17} /> Finish
          </button>
        </div>
      </div>

      <div className="session-timer">
        <div className="timer-display">{fmtDuration(secs)}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`timer-btn ${running ? 'stop' : 'start'}`} onClick={toggleTimer}>
            {running ? 'Pause' : secs ? 'Resume' : 'Start'}
          </button>
          <button className="timer-btn reset" onClick={() => { base.current = 0; setSecs(0); setRunning(false) }}>
            Reset
          </button>
        </div>
      </div>

      <div className="session-type-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <select value={session.type} onChange={(e) => set({ type: e.target.value })} style={{ fontSize: 13, padding: '8px 10px' }}>
          {WK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.em} {t.label}</option>)}
        </select>
        <input type="date" value={session.date} onChange={(e) => set({ date: e.target.value })}
          style={{ fontSize: 13, padding: '8px 10px' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {session.exercises.map((ex, i) => {
          const open = openEx === i
          const done = (ex.sets || []).filter((s) => s.done).length
          const exGoalsHere = goalsByExercise[ex.name] || []
          return (
            <div key={i} className={`ex-card${open ? ' open' : ''}`}>
              <div className="ex-card-hdr" onClick={() => setOpenEx(open ? -1 : i)}>
                <input
                  className="ex-name"
                  value={ex.name}
                  placeholder="Exercise name"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateEx(i, { name: e.target.value })}
                  style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 800, fontSize: 14 }}
                />
                <span className="ex-summary">{done}/{ex.sets?.length || 0}</span>
                <button className="btn btn-icon btn-sm" onClick={(e) => {
                  e.stopPropagation()
                  set({ exercises: session.exercises.filter((_, j) => j !== i) })
                }} aria-label="Remove exercise">
                  <Icon name="close" size={15} />
                </button>
                <Icon name="expand_more" size={18} className="icon-chevron" />
              </div>

              {exGoalsHere.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 10px' }}>
                  {exGoalsHere.map((g) => {
                    const { best, pct } = evaluateGoal(pastSessions, g)
                    const unit = goalUnit(g.mode)
                    const qualifier = goalQualifier(g)
                    return (
                      <Badge key={g.id} tone="blue">
                        🎯 {Math.round(best)}{unit} → {Math.round(g.target)}{unit}{qualifier ? ` ${qualifier}` : ''} · {Math.round(pct)}%
                      </Badge>
                    )
                  })}
                </div>
              )}

              {open && (
                <div className="ex-sets">
                  <div className="sets-grid">
                    <span className="set-label">#</span>
                    <span className="set-label">Reps</span>
                    <span className="set-label">Weight</span>
                    <span className="set-label">Vol</span>
                    <span />
                  </div>
                  {(ex.sets || []).map((s, si) => (
                    <div key={si} className="set-row">
                      <span className="set-num">{si + 1}</span>
                      <input className="set-input" inputMode="decimal" value={s.reps} placeholder="—"
                        onChange={(e) => updateEx(i, {
                          sets: ex.sets.map((x, j) => j === si ? { ...x, reps: e.target.value } : x),
                        })} />
                      <input className="set-input" inputMode="decimal" value={s.weight} placeholder="—"
                        onChange={(e) => updateEx(i, {
                          sets: ex.sets.map((x, j) => j === si ? { ...x, weight: e.target.value } : x),
                        })} />
                      <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textAlign: 'center' }}>
                        {((parseFloat(s.reps) || 0) * (parseFloat(s.weight) || 0)) || '—'}
                      </span>
                      <button className={`set-done-btn${s.done ? ' done' : ''}`}
                        onClick={() => updateEx(i, {
                          sets: ex.sets.map((x, j) => j === si ? { ...x, done: !x.done } : x),
                        })} aria-label="Set done">
                        <Icon name="check" size={16} />
                      </button>
                    </div>
                  ))}
                  <button className="ex-add-set"
                    onClick={() => updateEx(i, { sets: [...(ex.sets || []), { reps: '', weight: '', done: false }] })}>
                    <Icon name="add" size={16} /> Add set
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="exercise-picker" style={{ marginBottom: 16 }}>
        <AddFromDB db={db} onAdd={(name) => set({
          exercises: [...session.exercises, { name, sets: [{ reps: '', weight: '', done: false }] }],
        })} />
      </div>

      {goals.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel>Count toward a goal</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {goals.map((g) => {
              const linked = (session.goalIds || []).includes(g.id)
              return (
                <button key={g.id} className={`goal-link-row${linked ? ' linked' : ''}`}
                  onClick={() => set({
                    goalIds: linked
                      ? session.goalIds.filter((x) => x !== g.id)
                      : [...(session.goalIds || []), g.id],
                  })}>
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{g.title}</span>
                  <Icon name={linked ? 'check_circle' : 'radio_button_unchecked'} size={18} className="gl-check" />
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionLabel>Session notes</SectionLabel>
        <textarea value={session.notes} onChange={(e) => set({ notes: e.target.value })}
          placeholder="How did it feel? Anything to carry into next time." />
      </Card>
    </>
  )
}

function AddFromDB({ db, onAdd }) {
  const [bodypart, setBodypart] = useState('Chest')
  const list = db[bodypart] || []
  const [pick, setPick] = useState(list[0] || '')
  useEffect(() => { setPick((db[bodypart] || [])[0] || '') }, [bodypart, db])

  return (
    <>
      <select value={bodypart} onChange={(e) => setBodypart(e.target.value)}>
        {Object.keys(db).map((k) => <option key={k} value={k}>{bodypartLabel(k)}</option>)}
      </select>
      <select value={pick} onChange={(e) => setPick(e.target.value)}>
        {list.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <button className="btn btn-secondary btn-sm" onClick={() => pick && onAdd(pick)}>
        <Icon name="library_add" size={15} /> Add
      </button>
    </>
  )
}

/* ═══════════════ Exercise database ═══════════════ */

function DatabaseTab({ db, onSaved }) {
  const [bodypart, setBodypart] = useState('Chest')
  const [draft, setDraft] = useState('')
  const [local, setLocal] = useState(db)
  const confirm = useConfirm()

  useEffect(() => { setLocal(db) }, [db])

  async function commit(next) {
    setLocal(next)
    try { await saveExerciseDB(next); onSaved() } catch (e) { toast.error(e.message) }
  }

  const list = local[bodypart] || []

  return (
    <Card>
      <CardHead
        title="Workout Database"
        sub="Edit the exercises used by the planner and session logger."
        right={
          <button className="btn btn-secondary btn-sm"
            onClick={() => commit(JSON.parse(JSON.stringify(DEFAULT_EXERCISE_DB)))}>
            <Icon name="restart_alt" size={15} /> Reset
          </button>
        }
      />
      <div className="db-editor-grid">
        <div>
          <SectionLabel>Body parts</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.keys(local).map((k) => (
              <button key={k} className={`db-bodypart-btn${k === bodypart ? ' active' : ''}`}
                onClick={() => setBodypart(k)}>
                {bodypartLabel(k)}
                <span style={{ fontSize: 11, opacity: .7 }}>{(local[k] || []).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>{bodypartLabel(bodypart)} exercises</SectionLabel>
          <div>
            {list.map((name, i) => (
              <div key={i} className="db-exercise-row">
                <input value={name} style={{ fontSize: 13, padding: '8px 10px' }}
                  onChange={(e) => {
                    const next = { ...local, [bodypart]: list.map((x, j) => j === i ? e.target.value : x) }
                    setLocal(next)
                  }}
                  onBlur={() => commit(local)} />
                <button className={`btn btn-icon btn-sm${confirm.isArmed(bodypart + i) ? ' btn-danger' : ''}`}
                  onClick={() => {
                    if (!confirm.isArmed(bodypart + i)) return confirm.arm(bodypart + i)
                    commit({ ...local, [bodypart]: list.filter((_, j) => j !== i) })
                  }} aria-label="Delete">
                  <Icon name="delete" size={15} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add exercise"
              style={{ fontSize: 13, padding: '9px 10px', flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  commit({ ...local, [bodypart]: [...list, draft.trim()] }); setDraft('')
                }
              }} />
            <button className="btn btn-primary btn-sm" disabled={!draft.trim()}
              onClick={() => { commit({ ...local, [bodypart]: [...list, draft.trim()] }); setDraft('') }}>
              <Icon name="add" size={15} /> Add
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ═══════════════ History ═══════════════ */

function HistoryTab({ sessions, onEdit, onTab }) {
  const [filter, setFilter] = useState('all')
  const confirm = useConfirm()
  const all = sessions.data || []
  const list = (filter === 'all' ? all : all.filter((s) => s.type === filter))
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  // 13 weeks × 7 days, oldest first, matching the original heatmap.
  const cells = useMemo(() => {
    const out = []
    const start = new Date()
    start.setDate(start.getDate() - 90)
    for (let i = 0; i < 91; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      const day = all.filter((s) => s.date === iso)
      const vol = day.reduce((n, s) => n + sessionVolume(s), 0)
      const mins = day.reduce((n, s) => n + Math.round((s.durationSec || 0) / 60), 0)
      const level = !day.length ? 0 : vol > 8000 ? 5 : vol > 4000 ? 4 : vol > 1500 ? 3 : vol > 0 ? 2 : 1
      out.push({ iso, level, mins, count: day.length })
    }
    return out
  }, [all])

  const totalMins = all.reduce((n, s) => n + Math.round((s.durationSec || 0) / 60), 0)
  const totalVol = all.reduce((n, s) => n + sessionVolume(s), 0)
  const streak = useMemo(() => {
    let n = 0
    const dates = new Set(all.map((s) => s.date))
    const d = new Date()
    for (;;) {
      const iso = d.toISOString().slice(0, 10)
      if (dates.has(iso)) { n++; d.setDate(d.getDate() - 1) }
      else if (n === 0 && iso === today()) d.setDate(d.getDate() - 1)
      else break
    }
    return n
  }, [all])

  return (
    <>
      <Card style={{ marginBottom: 18 }}>
        <CardHead
          title="Training Heatmap"
          sub="13-week activity — darker = more volume."
          right={
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>
              <span>Less</span>
              {['var(--white-soft)', 'rgba(var(--accent-rgb),.18)', 'rgba(var(--accent-rgb),.38)', 'rgba(var(--accent-rgb),.58)', 'var(--accent)'].map((c) => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
              ))}
              <span>More</span>
            </div>
          }
        />
        <div className="wk-heatmap">
          {cells.map((c) => (
            <div key={c.iso} className={`hm-cell${c.level ? ' w' + Math.min(5, c.level) : ''}`}
              title={c.count ? `${c.iso}: ${c.count} session${c.count > 1 ? 's' : ''}, ${c.mins}m` : c.iso} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" style={{ marginBottom: 18 }}>
        <StatCard label="Sessions" value={all.length} sub="all time" />
        <StatCard label="Time" value={totalMins} sub="minutes trained" />
        <StatCard label="Volume" value={Math.round(totalVol).toLocaleString()} sub="kg lifted" />
        <StatCard label="Streak" value={streak} sub="consecutive days" />
      </div>

      <Card>
        <CardHead
          title="Session History"
          sub="Every logged session."
          right={
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 140 }}>
              <option value="all">All types</option>
              {WK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          }
        />
        {sessions.loading ? (
          <Loading />
        ) : !list.length ? (
          <Empty icon="fitness_center" title="No sessions logged yet" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((s) => {
              const type = WK_TYPES.find((t) => t.id === s.type)
              const vol = sessionVolume(s)
              return (
                <div key={s.id} className="session-log-row">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{s.date?.slice(5)}</div>
                    <small style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 1 }}>
                      {s.durationSec ? fmtDuration(s.durationSec) : '—'}
                    </small>
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>
                      {type?.em} {s.type}
                    </div>
                    <div className="sl-chips">
                      {(s.exercises || []).slice(0, 4).map((e, i) => (
                        <span key={i} className="sl-chip">{e.name}</span>
                      ))}
                      {(s.exercises || []).length > 4 && (
                        <span className="sl-chip">+{s.exercises.length - 4}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div className="tnum" style={{ fontSize: 13, fontWeight: 900 }}>
                        {vol ? Math.round(vol).toLocaleString() : '—'}
                      </div>
                      <small style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', fontWeight: 700 }}>kg vol</small>
                    </div>
                    <button className="btn btn-icon btn-sm" aria-label="Edit"
                      onClick={() => { onEdit({ ...s }); onTab('log') }}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button className={`btn btn-icon btn-sm${confirm.isArmed(s.id) ? ' btn-danger' : ''}`}
                      onClick={async () => {
                        if (!confirm.isArmed(s.id)) return confirm.arm(s.id)
                        await deleteWorkoutSession(s.id)
                        toast.success('Session deleted')
                        sessions.reload()
                      }} aria-label="Delete">
                      <Icon name="delete" size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}

/* ═══════════════ Progress ═══════════════ */

/* One row per session that included this exercise, oldest first. Tracks
   BOTH signals regardless of exercise — the caller picks which one to
   chart based on mode:
   - topWeight/volume/est1RM: the loaded-exercise "am I getting stronger"
     signal (top-set weight beats total volume for this since volume
     swings with rep ranges and how many exercises got done that day).
     Est. 1RM uses the Epley formula off the top set.
   - topReps/totalReps: the bodyweight-exercise equivalent — weight isn't
     the lever for a push-up or pull-up, reps are. topReps is the best
     single set that session (the direct analog of top-set weight),
     totalReps is every rep across all sets (the analog of volume). */
function exerciseHistory(sessions, name) {
  return sessions
    .filter((s) => (s.exercises || []).some((e) => e.name === name))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const ex = s.exercises.find((e) => e.name === name)
      // Parsed per-set data, kept raw (not just pre-aggregated into
      // topWeight/topReps) — goal evaluation needs to know reps AND
      // weight TOGETHER per set (a true 1RM only counts a set logged as
      // exactly 1 rep; "reps at a weight" only counts sets at or above
      // that weight), which topWeight/topReps alone can't answer since
      // they're each the best of a DIFFERENT set.
      const sets = (ex.sets || []).map((set) => ({
        reps: parseFloat(set.reps) || 0,
        weight: parseFloat(set.weight) || 0,
      }))
      let topSet = null
      let topWeight = 0
      let volume = 0
      let topReps = 0
      let totalReps = 0
      for (const set of sets) {
        volume += set.weight * set.reps
        totalReps += set.reps
        if (set.reps > topReps) topReps = set.reps
        if (set.weight > topWeight) { topWeight = set.weight; topSet = set }
      }
      const est1RM = topWeight > 0 ? topWeight * (1 + (topSet?.reps || 0) / 30) : 0
      return { date: s.date, sessionId: s.id, sets, topWeight, volume, est1RM, topReps, totalReps, setCount: sets.length }
    })
}

/* ── Goal evaluation ─────────────────────────────────────────
   Three goal types, matching the three ways lifting progress actually
   gets measured:
   - oneRM: the heaviest weight lifted for a true single rep. Only counts
     a set logged as EXACTLY 1 rep — a top-set-of-5 at some weight is not
     a 1RM attempt, even if it was heavy.
   - reps: best single-set rep count, regardless of weight (or no weight
     at all — this is the bodyweight case: "15 pull-ups").
   - repsAtWeight: best rep count achieved in any set at or above a fixed
     weight (goal.atWeight) — "10 reps at 80kg". Different from oneRM
     (which fixes reps=1 and asks how heavy) and from reps (which doesn't
     care about weight at all).
   Nothing about achievement is stored — it's recomputed from real session
   history every render, so it can never drift out of sync with the log.
   Only the user's explicit "I saw it, celebrate" moment (celebratedAt)
   is persisted. */
function goalMetric(row, mode, atWeight) {
  if (mode === 'oneRM') {
    return row.sets.reduce((m, s) => (s.reps === 1 && s.weight > m ? s.weight : m), 0)
  }
  if (mode === 'repsAtWeight') {
    const thresh = atWeight || 0
    return row.sets.reduce((m, s) => (s.weight >= thresh && s.reps > m ? s.reps : m), 0)
  }
  return row.topReps // mode === 'reps'
}

function evaluateGoal(sessions, goal) {
  const rows = exerciseHistory(sessions, goal.exercise).filter((r) => r.date >= goal.startedAt)
  const start = goal.startingValue || 0
  let best = start
  let achievedDate = null
  let lastImprovedDate = null
  for (const r of rows) {
    const v = goalMetric(r, goal.mode, goal.atWeight)
    if (v > best) { best = v; lastImprovedDate = r.date }
    if (!achievedDate && v >= goal.target) achievedDate = r.date
  }
  const span = goal.target - start
  const pct = span > 0 ? Math.max(0, Math.min(100, ((best - start) / span) * 100)) : (best >= goal.target ? 100 : 0)
  return { best, achievedDate, lastImprovedDate, pct, reached: !!achievedDate }
}

/** A sensible default target one notch above the current best, so setting
    a goal doesn't start from a blank field — editable, never forced.
    Weight goals round to the nearest 2.5kg plate jump; rep goals round to
    a whole rep. Returns null until there's a starting value to build from. */
function suggestTarget(mode, startingValue) {
  if (!startingValue || startingValue <= 0) return null
  if (mode === 'oneRM') {
    const raw = startingValue * 1.1
    return Math.max(startingValue + 2.5, Math.round(raw / 2.5) * 2.5)
  }
  return Math.max(startingValue + 1, Math.round(startingValue * 1.1))
}

/** All-time best for an exercise+mode(+atWeight) across full history —
    used as the starting point when a new goal is created ("where you are
    today"). */
function bestEver(sessions, exercise, mode, atWeight) {
  return exerciseHistory(sessions, exercise).reduce(
    (m, r) => Math.max(m, goalMetric(r, mode, atWeight)), 0)
}

const GOAL_MODES = [
  { value: 'oneRM', label: '1-rep max', unit: ' kg' },
  { value: 'reps', label: 'Reps', unit: ' reps' },
  { value: 'repsAtWeight', label: 'Reps at a weight', unit: ' reps' },
]

function goalUnit(mode) {
  return GOAL_MODES.find((m) => m.value === mode)?.unit || ''
}

/** Short qualifier shown next to a goal's exercise name — the "at 80kg"
    part for repsAtWeight, blank for the other two modes. */
function goalQualifier(goal) {
  return goal.mode === 'repsAtWeight' && goal.atWeight ? `at ${Math.round(goal.atWeight)} kg` : ''
}

function ProgressTab({ sessions, exGoals, db }) {
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const [prefill, setPrefill] = useState(null)
  const confirm = useConfirm()

  const list = exGoals.data || []
  const evaluated = useMemo(() => list.map((g) => ({ goal: g, ...evaluateGoal(sessions, g) })), [list, sessions])
  const active = evaluated.filter((e) => !e.goal.celebratedAt && !e.reached)
  const readyToCelebrate = evaluated.filter((e) => !e.goal.celebratedAt && e.reached)
  const completed = evaluated.filter((e) => e.goal.celebratedAt)
    .sort((a, b) => (b.goal.celebratedAt || '').localeCompare(a.goal.celebratedAt || ''))

  // Fires a one-time toast the first time a goal crosses 25/50/75% — the
  // only feedback in the old version was total silence until 100%, which
  // is most of why grinding on a goal with no PR yet felt like nothing was
  // happening. milestonesHit rides on the goal record so a milestone never
  // re-fires after a reload. The in-flight ref guards against the toast
  // double-firing while the save+reload round-trip is still in the air.
  const milestoneInFlight = useRef(new Set())
  useEffect(() => {
    for (const { goal, pct } of active) {
      const hit = new Set(goal.milestonesHit || [])
      const next = [25, 50, 75].find((m) => pct >= m && !hit.has(m))
      if (!next || milestoneInFlight.current.has(goal.id)) continue
      milestoneInFlight.current.add(goal.id)
      toast.success(`${goal.exercise} — ${next}% of the way there 💪`)
      saveExerciseGoal({ ...goal, milestonesHit: [...hit, next] })
        .then(() => exGoals.reload())
        .catch(() => {})
        .finally(() => milestoneInFlight.current.delete(goal.id))
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  async function celebrate(goal) {
    try {
      await saveExerciseGoal({ ...goal, celebratedAt: new Date().toISOString() })
      exGoals.reload()
      toast.success('Goal reached! 🎉')
    } catch (e) { toast.error(e.message) }
  }

  async function removeGoal(id) {
    try { await deleteExerciseGoal(id); exGoals.reload() }
    catch (e) { toast.error(e.message) }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Goals</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3 }}>
            Pick an exercise, set a target, track it from the day you started until you hit it.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setPrefill(null); setNewGoalOpen(true) }}>
          <Icon name="add" size={16} /> New Goal
        </button>
      </div>

      {readyToCelebrate.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {readyToCelebrate.map(({ goal, best, achievedDate }) => (
            <div key={goal.id} className="hero-card" style={{ background: 'var(--accent)' }}>
              <div className="hero-content">
                <div>
                  <div className="hero-eyebrow">
                    Goal reached &middot; {goal.exercise} {goalQualifier(goal)}
                  </div>
                  <div className="hero-h">{Math.round(best)}{goalUnit(goal.mode)}</div>
                  <p className="hero-copy">
                    Hit on {pretty(achievedDate)} — started {pretty(goal.startedAt)} at {Math.round(goal.startingValue || 0)}{goalUnit(goal.mode)}.
                  </p>
                  <div className="hero-actions">
                    <button className="btn btn-primary" onClick={() => celebrate(goal)}>
                      <Icon name="celebration" size={17} /> Celebrate
                    </button>
                    <button className="btn btn-secondary"
                      onClick={() => {
                        // Same jump that got them here, applied again — one
                        // click into a fully-formed next goal instead of a
                        // blank target field.
                        const increment = goal.target - (goal.startingValue || 0)
                        const nextTarget = increment > 0 ? Math.round((goal.target + increment) * 100) / 100 : null
                        setPrefill({ exercise: goal.exercise, mode: goal.mode, atWeight: goal.atWeight, target: nextTarget })
                        setNewGoalOpen(true)
                      }}>
                      <Icon name="add" size={16} /> Next goal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!active.length && !readyToCelebrate.length ? (
        <Card style={{ marginBottom: 18 }}>
          <Empty icon="flag" title="No active goals" action={
            <button className="btn btn-primary btn-sm" onClick={() => { setPrefill(null); setNewGoalOpen(true) }}>
              <Icon name="add" size={16} /> Set your first goal
            </button>
          }>
            Pick an exercise you care about and a number to hit — a 1-rep max, a rep count, or reps at a specific weight.
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5" style={{ marginBottom: 18 }}>
          {active.map(({ goal, best, pct, lastImprovedDate }) => {
            const daysIn = Math.max(0, Math.round((new Date() - new Date(goal.startedAt + 'T12:00:00')) / 86400000))
            const daysSincePR = lastImprovedDate
              ? Math.max(0, Math.round((new Date() - new Date(lastImprovedDate + 'T12:00:00')) / 86400000))
              : null
            const armed = confirm.isArmed(goal.id)
            const unit = goalUnit(goal.mode)
            const qualifier = goalQualifier(goal)
            return (
              <Card key={goal.id}>
                <div className="flex items-start justify-between gap-3" style={{ marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      {goal.exercise}{qualifier && <span style={{ color: 'var(--text-3)', fontWeight: 700 }}> · {qualifier}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>
                      {GOAL_MODES.find((m) => m.value === goal.mode)?.label} &middot; since {pretty(goal.startedAt)} &middot; day {daysIn}
                    </div>
                  </div>
                  <button className={`btn btn-icon btn-sm${armed ? ' btn-danger' : ''}`}
                    onClick={() => armed ? removeGoal(goal.id) : confirm.arm(goal.id)}
                    title={armed ? 'Confirm delete' : 'Delete goal'}>
                    <Icon name={armed ? 'check' : 'delete'} size={15} />
                  </button>
                </div>
                <div className="flex items-end justify-between gap-2" style={{ marginBottom: 8 }}>
                  <span className="tnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>
                    {Math.round(best)}{unit}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 700, marginBottom: 4 }}>
                    target {Math.round(goal.target)}{unit}
                  </span>
                </div>
                <div className="score-meter" style={{ height: 10 }}>
                  <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, marginTop: 6 }}>
                  {Math.round(pct)}% of the way from {Math.round(goal.startingValue || 0)}{unit} to {Math.round(goal.target)}{unit}
                </div>
                <div style={{ fontSize: 11, color: daysSincePR != null && daysSincePR >= 14 ? 'var(--orange)' : 'var(--text-3)', fontWeight: 700, marginTop: 3 }}>
                  {daysSincePR == null ? `No PR yet — day ${daysIn} on this goal` : daysSincePR === 0 ? 'New PR today 🔥' : `Last PR ${daysSincePR}d ago`}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {completed.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <CardHead title="Completed goals" sub="Every goal you've hit and celebrated." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completed.map(({ goal, achievedDate }) => (
              <div key={goal.id} className="check-row" style={{ cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {goal.exercise}{goalQualifier(goal) && <span style={{ color: 'var(--text-3)', fontWeight: 600 }}> · {goalQualifier(goal)}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
                    {pretty(goal.startedAt)} &rarr; {achievedDate ? pretty(achievedDate) : '—'}
                  </div>
                </div>
                <Badge tone="green">
                  {Math.round(goal.target)}{goalUnit(goal.mode)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-2)', marginBottom: 3 }}>Explore any exercise</h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
          A secondary view — every exercise you've logged, with a chart, whether or not it has a goal.
        </p>
        <ExerciseExplorer sessions={sessions} />
      </div>

      <NewGoalModal open={newGoalOpen} prefill={prefill} sessions={sessions} db={db}
        onClose={() => setNewGoalOpen(false)}
        onSaved={() => { setNewGoalOpen(false); exGoals.reload() }} />
    </>
  )
}

const GOAL_MODE_HINTS = {
  oneRM: 'The heaviest weight for a true single rep. Only sets logged as exactly 1 rep count.',
  reps: 'Your best single set, regardless of weight — pull-ups, push-ups, or any rep count you want to raise.',
  repsAtWeight: 'The most reps you can do in one set at or above a fixed weight — e.g. "10 reps at 80kg".',
}

function NewGoalModal({ open, prefill, sessions, db, onClose, onSaved }) {
  const [exercise, setExercise] = useState('')
  const [mode, setMode] = useState('oneRM')
  const [atWeight, setAtWeight] = useState('')
  const [target, setTarget] = useState('')
  const [startedAt, setStartedAt] = useState(today())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const ex = prefill?.exercise || ''
    setExercise(ex)
    setMode(prefill?.mode || (ex ? (isBodyweightExercise(ex, sessions) ? 'reps' : 'oneRM') : 'oneRM'))
    setAtWeight(prefill?.atWeight ? String(prefill.atWeight) : '')
    setTarget(prefill?.target ? String(prefill.target) : '')
    setStartedAt(today())
    setNotes('')
  }, [open, prefill]) // eslint-disable-line react-hooks/exhaustive-deps

  const exerciseOptions = useMemo(() => {
    const names = new Set()
    sessions.forEach((s) => (s.exercises || []).forEach((e) => e.name?.trim() && names.add(e.name)))
    Object.values(db || {}).forEach((list) => list.forEach((n) => names.add(n)))
    return [...names].sort()
  }, [sessions, db])

  // What today's best already is for whatever's currently selected — drives
  // the "Suggest" chip so a new goal starts from a real number instead of a
  // blank field. Recomputes live as exercise/mode/weight change.
  const startingPreview = useMemo(() => {
    if (!exercise.trim()) return 0
    const weightVal = mode === 'repsAtWeight' ? Number(atWeight) || 0 : null
    return bestEver(sessions, exercise.trim(), mode, weightVal)
  }, [sessions, exercise, mode, atWeight])
  const suggested = (mode !== 'repsAtWeight' || Number(atWeight) > 0)
    ? suggestTarget(mode, startingPreview)
    : null

  async function save() {
    if (!exercise.trim() || !target || Number(target) <= 0) {
      toast.error('Pick an exercise and a target above zero.')
      return
    }
    if (mode === 'repsAtWeight' && (!atWeight || Number(atWeight) <= 0)) {
      toast.error('Set the weight this rep goal is measured at.')
      return
    }
    setSaving(true)
    try {
      const weightVal = mode === 'repsAtWeight' ? Number(atWeight) : null
      const startingValue = bestEver(sessions, exercise.trim(), mode, weightVal)
      await saveExerciseGoal({
        id: newId('exgoal'),
        exercise: exercise.trim(),
        mode,
        atWeight: weightVal,
        target: Number(target),
        startedAt,
        startingValue,
        celebratedAt: null,
        createdAt: new Date().toISOString(),
        notes,
      })
      toast.success('Goal set')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New goal" sub="One number, one exercise, tracked from today until you hit it.">
      <SectionLabel>Exercise</SectionLabel>
      <input list="goal-exercise-options" value={exercise} onChange={(e) => setExercise(e.target.value)}
        placeholder="e.g. Barbell Bench Press, Pull-Up" style={{ marginBottom: 14 }} />
      <datalist id="goal-exercise-options">
        {exerciseOptions.map((n) => <option key={n} value={n} />)}
      </datalist>

      <SectionLabel>Tracked by</SectionLabel>
      <div className="flex gap-1 flex-wrap" style={{ background: 'var(--white-soft)', borderRadius: 999, padding: 3, width: 'fit-content', marginBottom: 8 }}>
        {GOAL_MODES.map((m) => (
          <button key={m.value} className={`btn btn-sm ${mode === m.value ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 999 }} onClick={() => setMode(m.value)}>
            {m.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14, lineHeight: 1.5 }}>
        {GOAL_MODE_HINTS[mode]}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'repsAtWeight' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12, marginBottom: 4 }}>
        {mode === 'repsAtWeight' && (
          <div>
            <SectionLabel>At weight (kg)</SectionLabel>
            <input type="number" inputMode="decimal" min={1} value={atWeight}
              onChange={(e) => setAtWeight(e.target.value)} placeholder="e.g. 80" />
          </div>
        )}
        <div>
          <SectionLabel>Target ({mode === 'oneRM' ? 'kg' : 'reps'})</SectionLabel>
          <input type="number" inputMode="decimal" min={1} value={target}
            onChange={(e) => setTarget(e.target.value)} placeholder={mode === 'oneRM' ? 'e.g. 100' : 'e.g. 15'} />
          {suggested != null && (
            <button type="button" className="btn btn-ghost btn-sm"
              style={{ marginTop: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}
              onClick={() => setTarget(String(suggested))}>
              Suggest {suggested}{goalUnit(mode)} (+10%)
            </button>
          )}
        </div>
        <div>
          <SectionLabel>Started</SectionLabel>
          <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </div>
      </div>

      <SectionLabel>Notes</SectionLabel>
      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional — why this goal, what the plan is." style={{ marginBottom: 16 }} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          <Icon name="flag" size={16} /> {saving ? 'Saving…' : 'Set goal'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

/* ── Explorer (secondary) ────────────────────────────────────
   The original single-exercise chart, kept as-is but demoted below Goals
   — a browse tool for anything logged, goal or no goal. */
function ExerciseExplorer({ sessions }) {
  const exerciseNames = useMemo(() => {
    const counts = new Map()
    sessions.forEach((s) => (s.exercises || []).forEach((e) => {
      if (!e.name?.trim()) return
      counts.set(e.name, (counts.get(e.name) || 0) + 1)
    }))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [sessions])

  const [selected, setSelected] = useState('')
  const [mode, setMode] = useState('weight') // 'weight' | 'reps'
  useEffect(() => {
    if (exerciseNames.length && !exerciseNames.includes(selected)) setSelected(exerciseNames[0])
  }, [exerciseNames]) // eslint-disable-line react-hooks/exhaustive-deps

  // Default to reps for known/likely bodyweight moves, but let it be
  // overridden per exercise — some things (weighted pull-ups, a loaded
  // plank) are genuinely tracked either way depending on how they were
  // logged, and auto-detection is a starting point, not a rule.
  useEffect(() => {
    if (selected) setMode(isBodyweightExercise(selected, sessions) ? 'reps' : 'weight')
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!exerciseNames.length) {
    return (
      <Card>
        <Empty icon="trending_up" title="No exercises logged yet">
          Finish a session with real exercises and they'll show up here to track over time.
        </Empty>
      </Card>
    )
  }

  const rows = exerciseHistory(sessions, selected)
  const byWeight = mode === 'weight'
  const unit = byWeight ? ' kg' : ' reps'
  // Reps mode tracks TOTAL reps that session (every rep across every set),
  // not "best single set" — total is the one number that's always the sum
  // of what actually got typed in, so it can't drift between "reps" one
  // day and something that reads like a set count another day just
  // because the set/rep split happened to vary (3 sets of 10 vs 2 of 15).
  const points = rows.map((r) => ({ label: prettyShort(r.date), value: (byWeight ? r.topWeight : r.totalReps) || null }))
  const best = rows.reduce((m, r) => Math.max(m, byWeight ? r.topWeight : r.totalReps), 0)
  const latest = rows[rows.length - 1]
  const latestVal = latest ? (byWeight ? latest.topWeight : latest.totalReps) : 0
  const first = rows[0]
  const firstVal = first ? (byWeight ? first.topWeight : first.totalReps) : 0
  const delta = latest && first && rows.length > 1 ? latestVal - firstVal : null

  return (
    <>
      <Card style={{ marginBottom: 18 }}>
        <CardHead
          title="Exercise progress"
          sub={byWeight ? 'Top-set weight, session by session.' : 'Total reps, session by session.'}
          right={
            <div className="flex gap-1" style={{ background: 'var(--white-soft)', borderRadius: 999, padding: 3 }}>
              {['weight', 'reps'].map((m) => (
                <button key={m} className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 999 }} onClick={() => setMode(m)}>
                  {m === 'weight' ? 'Weight' : 'Reps'}
                </button>
              ))}
            </div>
          }
        />
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ marginBottom: 16, maxWidth: 340 }}>
          {exerciseNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <TrendChart points={points} unit={unit} format={(v) => Math.round(v).toString()} />
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" style={{ marginBottom: 18 }}>
        <StatCard label={byWeight ? 'Best top set' : 'Best session'} value={best ? `${Math.round(best)}${unit}` : '--'} sub="all-time" />
        <StatCard label="Most recent" value={latestVal ? `${Math.round(latestVal)}${unit}` : '--'} sub={latest ? pretty(latest.date) : 'not logged yet'} />
        <StatCard label="Change" value={delta != null ? `${delta >= 0 ? '+' : ''}${Math.round(delta)}${unit}` : '--'} sub="first logged to now" />
        <StatCard label="Times logged" value={rows.length} sub={selected} />
      </div>

      <Card>
        <CardHead title="Recent sessions" sub={`Every logged session that included ${selected}.`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.slice().reverse().slice(0, 15).map((r) => (
            <div key={r.sessionId} className="check-row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{pretty(r.date)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
                  {byWeight ? (
                    <>
                      {r.setCount} set{r.setCount === 1 ? '' : 's'} &middot; {Math.round(r.volume).toLocaleString()} kg volume
                      {r.est1RM > 0 && <> &middot; est. 1RM {Math.round(r.est1RM)} kg</>}
                    </>
                  ) : r.totalReps > 0 ? (
                    <>{r.setCount} set{r.setCount === 1 ? '' : 's'} &middot; best set {r.topReps} reps</>
                  ) : (
                    <span style={{ color: 'var(--s-risk, #c8452f)' }}>
                      {r.setCount} set{r.setCount === 1 ? '' : 's'} logged, no reps recorded
                    </span>
                  )}
                </div>
              </div>
              <Badge tone="blue">
                {byWeight
                  ? (r.topWeight ? `${Math.round(r.topWeight)} kg top set` : '—')
                  : (r.totalReps ? `${r.totalReps} reps total` : '—')}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
