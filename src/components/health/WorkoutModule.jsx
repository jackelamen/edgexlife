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
} from '../../lib/data'
import {
  WK_TYPES, DEFAULT_EXERCISE_DB, WK_TEMPLATES, bodypartLabel,
  DAY_SHORT, DAY_FULL, weekDates, sessionVolume, sessionSetCount, fmtDuration,
} from '../../lib/workout'
import { today, pretty } from '../../lib/dates'

const TABS = [
  { value: 'plan', label: 'Plan', icon: 'calendar_month' },
  { value: 'log', label: 'Session Log', icon: 'fitness_center' },
  { value: 'db', label: 'Database', icon: 'list_alt' },
  { value: 'history', label: 'History', icon: 'bar_chart' },
]

export default function WorkoutModule() {
  const [tab, setTab] = useState('plan')
  const [weekOffset, setWeekOffset] = useState(0)
  const [session, setSession] = useState(null)

  const plan = useAsync((f) => fetchWorkoutPlan({ force: f }))
  const sessions = useAsync((f) => fetchWorkoutSessions({ force: f }))
  const dbRaw = useAsync((f) => fetchExerciseDB({ force: f }))
  const goals = useAsync((f) => fetchGoals({ force: f }))

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
          session={session} setSession={setSession} db={db} goals={healthGoals}
          onStart={startSession}
          onFinished={() => { sessions.reload(); setSession(null); setTab('history') }}
        />
      )}
      {tab === 'db' && <DatabaseTab db={db} onSaved={() => dbRaw.reload()} />}
      {tab === 'history' && <HistoryTab sessions={sessions} onEdit={setSession} onTab={setTab} />}

      <button className="mob-fab" onClick={() => startSession(null, true)} aria-label="Log session">
        <Icon name="play_arrow" size={26} fill />
      </button>
    </>
  )
}

/* ═══════════════ Plan ═══════════════ */

function PlanTab({ plan, weekOffset, db, goals, sessions, onStart }) {
  const [editDate, setEditDate] = useState(null)
  const dates = useMemo(() => weekDates(weekOffset), [weekOffset])
  const t = today()

  const weekSessions = sessions.filter((s) => dates.includes(s.date))
  const totalMins = weekSessions.reduce((n, s) => n + Math.round((s.durationSec || 0) / 60), 0)
  const totalVol = weekSessions.reduce((n, s) => n + sessionVolume(s), 0)
  const planned = dates.filter((d) => plan.data?.[d] && !plan.data[d].rest).length

  return (
    <>
      <div className="plan-week">
        {dates.map((date, i) => {
          const day = plan.data?.[date]
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
        db={db}
        allDates={dates}
        onClose={() => setEditDate(null)}
        onStart={(d) => { setEditDate(null); onStart(d) }}
      />
    </>
  )
}

function DayModal({ date, plan, db, allDates, onClose, onStart }) {
  const open = Boolean(date)
  const existing = date ? plan.data?.[date] : null

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
            {allDates.filter((d) => d !== date && plan.data?.[d]).map((d, i) => (
              <option key={d} value={d}>{DAY_FULL[allDates.indexOf(d)]} — {plan.data[d].type}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" disabled={!copyFrom}
            onClick={() => {
              const src = plan.data?.[copyFrom]
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

/* ═══════════════ Live session ═══════════════ */

function SessionTab({ session, setSession, db, goals, onStart, onFinished }) {
  const [secs, setSecs] = useState(0)
  const [running, setRunning] = useState(false)
  const [openEx, setOpenEx] = useState(0)
  const startedAt = useRef(0)
  const base = useRef(0)

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
  const list = filter === 'all' ? all : all.filter((s) => s.type === filter)

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
