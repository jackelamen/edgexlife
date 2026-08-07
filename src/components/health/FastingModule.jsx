import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../ui/Icon'
import { Card, CardHead, Badge, Empty, Loading, Modal, Field, useConfirm } from '../ui/Kit'
import { useAsync } from '../../hooks/useAsync'
import { fetchFastingSessions, saveFastingSession, deleteFastingSession, newId } from '../../lib/data'
import {
  FAST_METHODS, methodLabel, isActive, elapsedMs, progressPct, formatDuration,
  weekStreak, thisWeekCount, longestFast, toLocalInputValue, fromLocalInputValue,
} from '../../lib/fasting'
import { pretty } from '../../lib/dates'
import { metric } from '../../lib/design'

/*
  Fasting is a session, not a daily log — it can run past midnight, so it
  gets its own tab rather than a field on the daily form. Nothing here
  feeds the Health Score; that formula is scored, weighted, and load-bearing
  against months of history, and "did you fast" doesn't belong in it
  without changing what the score has always meant. This tracks the thing
  on its own terms instead: is one running now, and are you keeping the
  weekly habit.
*/
export default function FastingModule() {
  const sessions = useAsync((f) => fetchFastingSessions({ force: f }))
  const confirm = useConfirm()
  const list = sessions.data || []
  const activeSession = list.find(isActive) || null
  const [editing, setEditing] = useState(null)

  async function startFast(methodId) {
    const method = FAST_METHODS.find((m) => m.id === methodId)
    const session = {
      id: newId('fast'),
      startedAt: new Date().toISOString(),
      endedAt: null,
      targetHours: method?.hours ?? 16,
      method: methodId,
      notes: '',
    }
    try {
      await saveFastingSession(session)
      sessions.reload()
    } catch (err) { toast.error(err.message || 'Could not start') }
  }

  async function endFast() {
    if (!activeSession) return
    const ended = { ...activeSession, endedAt: new Date().toISOString() }
    try {
      await saveFastingSession(ended)
      sessions.reload()
      toast.success(`Fast logged — ${formatDuration(elapsedMs(ended))}`)
    } catch (err) { toast.error(err.message || 'Could not end fast') }
  }

  async function removeSession(id) {
    try { await deleteFastingSession(id); sessions.reload() }
    catch (err) { toast.error(err.message || 'Could not delete') }
  }

  async function updateSession(patch) {
    try {
      await saveFastingSession({ ...editing, ...patch })
      sessions.reload()
      setEditing(null)
      toast.success('Fast updated')
    } catch (err) { toast.error(err.message || 'Could not save') }
  }

  if (sessions.loading) return <Loading />

  return (
    <>
      {activeSession
        ? <ActiveFastCard session={activeSession} onEnd={endFast} />
        : <StartFastCard onStart={startFast} />}

      <WeeklyStats sessions={list} />

      <Card>
        <CardHead title="Fasting history" sub="Completed fasts, most recent first. Tap to edit start, end, method or notes." />
        {!list.filter((s) => s.endedAt).length ? (
          <Empty icon="schedule" title="No completed fasts yet">
            Start one above — even a 16:8 counts toward the week.
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.filter((s) => s.endedAt).map((s) => (
              <FastRow key={s.id} session={s} confirm={confirm}
                onEdit={() => setEditing(s)} onDelete={() => removeSession(s.id)} />
            ))}
          </div>
        )}
      </Card>

      <EditFastModal session={editing} onClose={() => setEditing(null)} onSave={updateSession} />
    </>
  )
}

/* ── Edit a completed session ────────────────────────────────
   Fasts are logged live, but Jack starts/ends them a few minutes late or
   early often enough that the recorded duration can be meaningfully off —
   this lets a past session's start/end/method/notes be corrected after
   the fact without deleting and re-creating it (which would lose its id
   and week-streak placement). */
function EditFastModal({ session, onClose, onSave }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [method, setMethod] = useState('16:8')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!session) return
    setStart(toLocalInputValue(session.startedAt))
    setEnd(toLocalInputValue(session.endedAt))
    setMethod(session.method || '16:8')
    setNotes(session.notes || '')
  }, [session])

  if (!session) return null

  const startedAt = fromLocalInputValue(start)
  const endedAt = fromLocalInputValue(end)
  const invalid = !startedAt || !endedAt || new Date(endedAt) <= new Date(startedAt)

  return (
    <Modal open={!!session} onClose={onClose} title="Edit fast" sub="Correct the start, end, method or notes for this session."
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={invalid}
          onClick={() => onSave({ startedAt, endedAt, method, notes })}>
          <Icon name="check" size={16} /> Save
        </button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        <Field label="Started">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ended">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      {invalid && start && end && (
        <p style={{ fontSize: 11.5, color: 'var(--s-risk, #c8452f)', fontWeight: 700, marginBottom: 4 }}>
          End must be after start.
        </p>
      )}
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {FAST_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>
      <Field label="Notes" hint="Optional">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How it went, why it ran long, etc." />
      </Field>
    </Modal>
  )
}

/*
  Compact status for the Today view — shown without leaving Today, so the
  habit stays visible day to day rather than living only behind its own
  tab. Self-contained: fetches its own sessions rather than threading
  fasting state through TodayView's already-long prop list.
*/
export function FastingStatusCard({ onNav }) {
  const sessions = useAsync((f) => fetchFastingSessions({ force: f }))
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  if (sessions.loading) return null
  const list = sessions.data || []
  const active = list.find(isActive) || null
  const m = metric('fasting')
  const streak = weekStreak(list)
  const wkCount = thisWeekCount(list)
  const lastDone = list.find((s) => s.endedAt) || null

  if (active) {
    const pct = progressPct(active)
    return (
      <button className="check-row" style={{ cursor: 'pointer', marginBottom: 14 }} onClick={() => onNav?.()}>
        <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: m.tint, color: m.color }}>
          <Icon name="schedule" size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Fasting &middot; {formatDuration(elapsedMs(active))}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>{methodLabel(active.method)} target &middot; {pct != null ? `${Math.round(Math.min(100, pct))}%` : '--'} there</div>
        </div>
        <Badge tone="blue">Live</Badge>
      </button>
    )
  }

  return (
    <button className="check-row" style={{ cursor: 'pointer', marginBottom: 14 }} onClick={() => onNav?.()}>
      <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: m.tint, color: m.color }}>
        <Icon name="schedule" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {lastDone ? `Last fast ${formatDuration(elapsedMs(lastDone))} · ${methodLabel(lastDone.method)}` : 'No fasts logged yet'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
          {wkCount >= 1 ? `${wkCount} this week · ${streak}-week streak` : 'None yet this week — tap to start one'}
        </div>
      </div>
      <Badge tone={wkCount >= 1 ? 'green' : 'muted'}>{wkCount >= 1 ? 'On track' : 'Start one'}</Badge>
    </button>
  )
}

/* ── Active timer ─────────────────────────────────────────── */

function ActiveFastCard({ session, onEnd }) {
  // Re-render once a minute so the elapsed time actually counts up without
  // a full reload — a fast is measured in hours, a second-tick would just
  // burn cycles for no visible benefit.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const ms = elapsedMs(session)
  const pct = progressPct(session)
  const m = metric('fasting')
  const overTarget = session.targetHours && ms / 3600000 >= session.targetHours

  return (
    <div className="hero-card" style={{ marginBottom: 14, background: m.color }}>
      <div className="hero-content">
        <div>
          <div className="hero-eyebrow">Fasting now &middot; {methodLabel(session.method)}</div>
          <div className="hero-h">{formatDuration(ms)}</div>
          <p className="hero-copy">
            {overTarget
              ? `Past your ${session.targetHours}h target — end whenever feels right.`
              : `Started ${new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Aiming for ${session.targetHours}h.`}
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onEnd}>
              <Icon name="stop_circle" size={17} /> End Fast
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', width: 84, height: 84, marginLeft: 'auto' }}>
          <svg width="100%" height="100%" viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.24)" strokeWidth="8" />
            <circle cx="42" cy="42" r="34" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 34}
              strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min(100, pct ?? 0) / 100)} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: '#fff' }}>
              {pct != null ? `${Math.round(Math.min(100, pct))}%` : '--'}
            </div>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', opacity: .8, marginTop: 2, color: '#fff' }}>
              of target
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Start prompt ─────────────────────────────────────────── */

function StartFastCard({ onStart }) {
  const [method, setMethod] = useState('16:8')
  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead title="Start a fast" sub="Pick a target — the timer tracks real elapsed time either way." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginBottom: 16 }}>
        {FAST_METHODS.map((m) => (
          <button key={m.id} className={`btn ${method === m.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setMethod(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <button className="btn btn-primary" onClick={() => onStart(method)}>
        <Icon name="play_circle" size={17} /> Start {methodLabel(method)} Fast
      </button>
    </Card>
  )
}

/* ── Weekly stats ─────────────────────────────────────────── */

function WeeklyStats({ sessions }) {
  const wkCount = useMemo(() => thisWeekCount(sessions), [sessions])
  const streak = useMemo(() => weekStreak(sessions), [sessions])
  const longest = useMemo(() => longestFast(sessions), [sessions])
  const m = metric('fasting')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5" style={{ marginBottom: 14 }}>
      <div className="row" style={rowStyle}>
        <span className="k" style={kStyle}>This week</span>
        <span className="v" style={vStyle}>{wkCount}</span>
        <span style={subStyle}>{wkCount >= 1 ? 'goal met — at least 1' : 'goal is at least 1'}</span>
      </div>
      <div className="row" style={rowStyle}>
        <span className="k" style={kStyle}>Week streak</span>
        <span className="v" style={{ ...vStyle, color: streak > 0 ? m.color : 'inherit' }}>{streak}</span>
        <span style={subStyle}>{streak > 0 ? 'consecutive weeks' : 'complete one this week to start'}</span>
      </div>
      <div className="row" style={rowStyle}>
        <span className="k" style={kStyle}>Longest fast</span>
        <span className="v" style={vStyle}>{longest ? formatDuration(longest) : '--'}</span>
        <span style={subStyle}>all-time</span>
      </div>
    </div>
  )
}
const rowStyle = { background: 'var(--white)', borderRadius: 15, padding: '14px 16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 3 }
const kStyle = { fontSize: 11, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }
const vStyle = { fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }
const subStyle = { fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }

/* ── History row ──────────────────────────────────────────── */

function FastRow({ session, confirm, onEdit, onDelete }) {
  const ms = elapsedMs(session)
  const hours = ms / 3600000
  const hit = session.targetHours && hours >= session.targetHours
  const armed = confirm.isArmed(session.id)

  return (
    <div className="check-row" style={{ cursor: 'default' }}>
      <span style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        display: 'grid', placeItems: 'center', background: metric('fasting').tint, color: metric('fasting').color,
      }}>
        <Icon name="schedule" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {formatDuration(ms)} <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>&middot; {methodLabel(session.method)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>{pretty(session.startedAt.slice(0, 10))}</div>
      </div>
      <Badge tone={hit ? 'green' : 'muted'}>{hit ? 'Hit target' : 'Under target'}</Badge>
      <button className="btn-icon btn-sm" onClick={onEdit} title="Edit">
        <Icon name="edit" size={15} />
      </button>
      <button className="btn-icon btn-sm" onClick={() => armed ? onDelete() : confirm.arm(session.id)}
        title={armed ? 'Confirm delete' : 'Delete'}
        style={armed ? { background: 'var(--s-risk-bg)', color: 'var(--s-risk)' } : undefined}>
        <Icon name={armed ? 'check' : 'delete'} size={15} />
      </button>
    </div>
  )
}
