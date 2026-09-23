import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../ui/Icon'
import { Card, CardHead, Badge, Empty, Loading, Modal, Field, useConfirm } from '../ui/Kit'
import { useAsync } from '../../hooks/useAsync'
import { fetchFastingSessions, saveFastingSession, deleteFastingSession, newId } from '../../lib/data'
import {
  FAST_METHODS, methodLabel, isActive, elapsedMs, progressPct, formatDuration,
  weekStreak, thisWeekCount, longestFast, toLocalInputValue, fromLocalInputValue,
  targetHoursFor,
} from '../../lib/fasting'
import { pretty } from '../../lib/dates'
import { FAST_STAGES, EVIDENCE, stageIndexAt, hoursToNextStage, stageRangeLabel } from '../../lib/fastingStages'
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
  // `editing` holds whichever session is open in the modal — a completed
  // session (from history), the live session (to fix a start time you
  // forgot to set), or a blank draft (to log a fast retroactively). Which
  // case it is doesn't change how it's saved (saveFastingSession upserts by
  // id either way) — only `editRequireEnd` changes, since a still-running
  // fast is allowed to leave its end blank while every other case isn't.
  const [editing, setEditing] = useState(null)
  const [editRequireEnd, setEditRequireEnd] = useState(true)
  // Holds the session right after "End Fast" so PostFastModal can prompt
  // for a reflection immediately, while it's still fresh — separate from
  // `editing` because that modal is framed as correcting a fact (start,
  // end, method) and this one is a different kind of moment (how did it
  // go), not a second way to edit the same fields.
  const [reflecting, setReflecting] = useState(null)

  function openEdit(session) { setEditing(session); setEditRequireEnd(true) }
  function openEditActiveStart() { setEditing(activeSession); setEditRequireEnd(false) }
  function openLogPastFast() {
    setEditing({ id: newId('fast'), startedAt: null, endedAt: null, method: '16:8', notes: '' })
    setEditRequireEnd(true)
  }

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
      toast.success(`Fast logged · ${formatDuration(elapsedMs(ended))}`)
      setReflecting(ended)
    } catch (err) { toast.error(err.message || 'Could not end fast') }
  }

  async function saveReflection(notes) {
    if (!reflecting) return
    try {
      await saveFastingSession({ ...reflecting, notes })
      sessions.reload()
      toast.success('Noted')
    } catch (err) { toast.error(err.message || 'Could not save') }
    finally { setReflecting(null) }
  }

  async function removeSession(id) {
    try { await deleteFastingSession(id); sessions.reload() }
    catch (err) { toast.error(err.message || 'Could not delete') }
  }

  async function updateSession(patch) {
    const wasNew = !list.some((s) => s.id === editing.id)
    // Recompute targetHours from whatever method ends up selected, rather
    // than trusting a carried-over value — a blank "log a past fast" draft
    // never had one at all, and editing an existing fast's method should
    // move its target with it instead of judging the new method against
    // the old one's target.
    const merged = { ...editing, ...patch }
    merged.targetHours = FAST_METHODS.find((m) => m.id === merged.method)?.hours ?? null
    try {
      await saveFastingSession(merged)
      sessions.reload()
      setEditing(null)
      toast.success(wasNew ? 'Past fast logged' : 'Fast updated')
    } catch (err) { toast.error(err.message || 'Could not save') }
  }

  if (sessions.loading) return <Loading />

  return (
    <>
      {activeSession
        ? <ActiveFastCard session={activeSession} onEnd={endFast} onEditStart={openEditActiveStart} />
        : <StartFastCard onStart={startFast} />}

      <FastingStages session={activeSession} />

      <WeeklyStats sessions={list} />

      <Card>
        <CardHead title="Fasting history" sub="Completed fasts, most recent first. Tap to edit start, end, method or notes."
          right={<button className="btn btn-secondary btn-sm" onClick={openLogPastFast}>
            <Icon name="add" size={15} /> Log a past fast
          </button>} />
        {!list.filter((s) => s.endedAt).length ? (
          <Empty icon="schedule" title="No completed fasts yet">
            Start one above, or log a past one if you forgot to start the timer.
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.filter((s) => s.endedAt)
              .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
              .map((s) => (
              <FastRow key={s.id} session={s} confirm={confirm}
                onEdit={() => openEdit(s)} onDelete={() => removeSession(s.id)} />
            ))}
          </div>
        )}
      </Card>

      <EditFastModal session={editing} requireEnd={editRequireEnd} onClose={() => setEditing(null)} onSave={updateSession} />
      <PostFastModal session={reflecting} onSave={saveReflection} onSkip={() => setReflecting(null)} />
    </>
  )
}

/* ── Edit / create a session ────────────────────────────────
   One modal, three jobs, because they're all the same edit under the
   hood (saveFastingSession upserts by id regardless):
     1. Correct a completed session's start/end/method/notes.
     2. Correct the RUNNING session's start time — the actual "forgot to
        start the timer" fix. `requireEnd=false` here, so leaving the end
        field blank keeps the fast live instead of forcing you to end it
        just to fix when it began. Filling in an end anyway ends it early,
        which is a reasonable thing to want in the same motion.
     3. Log a fast retroactively — `session` comes in as a blank draft
        with a fresh id and no dates, `requireEnd=true` since a
        retroactive entry is definitionally already over.
*/
function EditFastModal({ session, requireEnd = true, onClose, onSave }) {
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
  const invalid = !startedAt || (requireEnd && !endedAt) || (endedAt && new Date(endedAt) <= new Date(startedAt))
  const isNew = !session.startedAt

  return (
    <Modal open={!!session} onClose={onClose}
      title={isNew ? 'Log a past fast' : requireEnd ? 'Edit fast' : 'Fix start time'}
      sub={isNew ? 'Both start and end, since this one already happened.'
        : requireEnd ? 'Correct the start, end, method or notes for this session.'
          : 'Leave Ended blank to keep the fast running. This only corrects when it began.'}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={invalid}
          onClick={() => onSave({ startedAt, endedAt: endedAt || null, method, notes })}>
          <Icon name="check" size={16} /> Save
        </button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        <Field label="Started">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ended" hint={requireEnd ? undefined : 'Optional, blank keeps it running'}>
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
  Fires right after "End Fast", while the experience is still fresh —
  the alternative was hoping you'd remember to come back to Fasting
  history and tap into the edit modal later, which is a much colder
  moment to be asked "how did it feel." Writes to the same `notes`
  column EditFastModal already edits, so a reflection made here shows up
  there too (and can still be corrected there) rather than forking into
  a second notes field. Skipping is a real, silent option — this is a
  reflection prompt, not a form the fast can't be logged without.
*/
function PostFastModal({ session, onSave, onSkip }) {
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (session) setNotes(session.notes || '')
  }, [session])

  if (!session) return null

  return (
    <Modal open={Boolean(session)} onClose={onSkip}
      title="How did it go?"
      sub={`${formatDuration(elapsedMs(session))} · ${methodLabel(session.method)}`}
      footer={<>
        <button className="btn btn-secondary" onClick={onSkip}>Skip</button>
        <button className="btn btn-primary" onClick={() => onSave(notes)}>
          <Icon name="check" size={16} /> Save
        </button>
      </>}>
      <Field label="How do you feel?">
        <textarea rows={3} autoFocus value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Energy, hunger, mood, anything worth remembering next time." />
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
          {wkCount >= 1 ? `${wkCount} this week · ${streak}-week streak` : 'None yet this week · tap to start one'}
        </div>
      </div>
      <Badge tone={wkCount >= 1 ? 'green' : 'muted'}>{wkCount >= 1 ? 'On track' : 'Start one'}</Badge>
    </button>
  )
}

/* ── Active timer ─────────────────────────────────────────── */

function ActiveFastCard({ session, onEnd, onEditStart }) {
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
  const target = targetHoursFor(session)
  const overTarget = target && ms / 3600000 >= target

  return (
    <div className="hero-card" style={{ marginBottom: 14, background: m.color }}>
      <div className="hero-content">
        <div>
          <div className="hero-eyebrow">Fasting now &middot; {methodLabel(session.method)}</div>
          <div className="hero-h fast-live-h">{formatDuration(ms)}</div>
          <p className="hero-copy">
            {overTarget
              ? `Past your ${target}h target. End whenever feels right.`
              : target
                ? `Started ${new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Aiming for ${target}h.`
                : `Started ${new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}
          </p>
          {(() => {
            const h = ms / 3600000
            const i = stageIndexAt(h)
            const next = hoursToNextStage(h)
            return (
              <div className="fast-stage-line">
                <span><Icon name={FAST_STAGES[i].icon} size={15} /> {FAST_STAGES[i].name}</span>
                {next != null && <small>Next: {FAST_STAGES[i + 1].name.toLowerCase()} in {formatDuration(next * 3600000)}</small>}
              </div>
            )
          })()}
        </div>
        <div style={{ position: 'relative', width: 84, height: 84, marginLeft: 'auto' }}>
          <svg width="100%" height="100%" viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.24)" strokeWidth="8" />
            <circle cx="42" cy="42" r="34" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 34}
              strokeDashoffset={2 * Math.PI * 34 * (1 - Math.min(100, pct ?? 0) / 100)} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', color: '#fff' }}>
              {pct != null ? `${Math.round(Math.min(100, pct))}%` : '--'}
            </div>
            {/* "of target" in 8px caps clipped against the ring edge; the
                actual target in hours is shorter and says more. */}
            <div style={{ fontSize: 10, fontWeight: 700, opacity: .8, marginTop: 1, color: '#fff' }}>
              {target ? `of ${target}h` : 'no target'}
            </div>
          </div>
        </div>
        {/* Direct child of .hero-content on purpose: its `grid-column: 1/-1`
            only spans the hero if it IS a grid item. Nested inside the copy
            column (where it used to live) that rule is inert, and on a phone
            — where the ring sits beside the copy rather than under it — the
            two buttons got squeezed into a 255px column and wrapped into a
            ragged stack, with the wider one overflowing its own pill. */}
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={onEnd}>
            <Icon name="stop_circle" size={17} /> End Fast
          </button>
          <button className="btn btn-secondary" onClick={onEditStart} title="Forgot to start the timer on time?">
            <Icon name="edit" size={17} /> Fix start time
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── What's happening: stage timeline ─────────────────────
   A tappable strip of fasting stages plus the detail for whichever one
   is selected (the current stage by default while a fast is running).
   Also shown with no fast running, so it can be read ahead of time.
   Content and the evidence caveats live in lib/fastingStages.js. */
export function FastingStages({ session }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!session) return
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [session])

  const hours = session ? elapsedMs(session) / 3600000 : null
  const target = session ? targetHoursFor(session) : null
  const current = hours == null ? null : stageIndexAt(hours)
  const [picked, setPicked] = useState(null)
  const sel = picked ?? current ?? 0
  const stage = FAST_STAGES[sel]
  const ev = EVIDENCE[stage.evidence]

  let status = null
  if (current != null) {
    if (sel < current) status = 'Passed'
    else if (sel === current) status = 'You are here'
    else status = `Starts in ${formatDuration((stage.from - hours) * 3600000)}`
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead title={session ? "What's happening now" : 'Stages of a fast'}
        sub={session ? 'Tap any stage to read ahead or look back.' : 'What your body does as a fast goes on. Tap a stage to read about it.'}
        right={target ? (
          <span className="fs-target-lbl">
            <span className="fs-target-key" />{target}h target
            <small>{hours >= target ? ' · reached' : ` · ${formatDuration((target - hours) * 3600000)} to go`}</small>
          </span>
        ) : null} />

      <StageTrack hours={hours} target={target} current={current} sel={sel} onPick={setPicked} />

      <div className="fs-detail" key={stage.id}>
        <div className="fs-detail-main">
          <div className="fs-detail-name">{stage.name}</div>
          <div className="fs-detail-hrs">
            {stage.to == null ? `${stage.from} hours and beyond` : `${stage.from} to ${stage.to} hours`}
            {status && <> · <strong className={sel === current ? 'is-now' : ''}>{status}</strong></>}
          </div>
          <p className="fs-body">{stage.body}</p>
          <div className="fs-section">You may feel</div>
          <ul className="fs-list">{stage.feel.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
        <aside className="fs-detail-side">
          <div className="fs-tip">
            <div className="fs-tip-hd"><Icon name="lightbulb" size={16} /> Tip</div>
            <p>{stage.tip}</p>
          </div>
          <div className="fs-evidence">
            <span className="fs-section" style={{ margin: 0 }}>Evidence</span>
            <Badge tone={ev.tone}>{ev.label}</Badge>
          </div>
        </aside>
      </div>

      <p className="fs-note">
        Timings are rough and vary with your last meal, activity and metabolism. General information, not
        medical advice. Talk to a doctor before long fasts, especially if you have a health condition or take medication.
      </p>
    </Card>
  )
}

/* The open-ended last stage is drawn as if it ran to this hour, so the
   track has somewhere to put a marker past 72h. */
const TRACK_END = 96

/** 0-100 position of an hour along the track. Stages get equal widths
    (a 4h stage and a 24h stage side by side would be unreadable at true
    scale), so position is stage index plus progress through that stage. */
function trackPos(h) {
  const n = FAST_STAGES.length
  const i = stageIndexAt(h)
  const s = FAST_STAGES[i]
  const to = s.to ?? TRACK_END
  const frac = Math.max(0, Math.min(1, (h - s.from) / (to - s.from)))
  return ((i + frac) / n) * 100
}

/**
 * The whole fast as one continuous line, instead of the separate chip
 * boxes it replaced: each stage is an equal-width segment (filled once
 * passed, part-filled while you're in it), with a "now" marker at the
 * elapsed time and a flag at the fast's target. Icons sit above, hour
 * marks below; stage names only show where there's room for them.
 */
function StageTrack({ hours, target, current, sel, onPick }) {
  const nowPos = hours == null ? null : trackPos(hours)
  const targetPos = target ? trackPos(target) : null
  return (
    <div className="fs-track" role="tablist" aria-label="Fasting stages">
      <div className="fs-track-segs">
        {FAST_STAGES.map((st, i) => {
          const state = current == null ? 'idle' : i < current ? 'done' : i === current ? 'now' : 'next'
          const to = st.to ?? TRACK_END
          const fill = state === 'done' ? 100
            : state === 'now' ? Math.max(0, Math.min(100, ((hours - st.from) / (to - st.from)) * 100)) : 0
          return (
            <button key={st.id} type="button" role="tab" aria-selected={i === sel}
              className={`fs-seg is-${state}${i === sel ? ' is-sel' : ''}`} onClick={() => onPick(i)}
              title={`${st.name} · ${stageRangeLabel(st)}`}>
              <span className="fs-seg-ic"><Icon name={state === 'done' ? 'check' : st.icon} size={17} /></span>
              <span className="fs-seg-bar"><i style={{ width: `${fill}%` }} /></span>
              <span className="fs-seg-name">{st.name}</span>
              <span className="fs-seg-hrs">{st.from}h</span>
            </button>
          )
        })}
      </div>
      {/* Just a notch on the bar; the target itself is spelled out in the
          card header. A labelled flag up here collided with the "now" pill
          whenever both fell in the same stage, which is most fasts. */}
      {targetPos != null && <span className="fs-target" style={{ left: `${targetPos}%` }} title={`${target}h target`} />}
      {nowPos != null && (
        <span className="fs-now" style={{ left: `${nowPos}%` }}>
          <span className="fs-now-lbl">{formatDuration(hours * 3600000)}</span>
        </span>
      )}
    </div>
  )
}

/* ── Start prompt ─────────────────────────────────────────── */

function StartFastCard({ onStart }) {
  const [method, setMethod] = useState('16:8')
  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead title="Start a fast" sub="Pick a target. The timer tracks real elapsed time either way." />
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
    /* Two up on a phone rather than one: three single-column cards spent
       320px of scroll on three short numbers. Three across doesn't fit —
       "36h 42m" at this type size overflows a ~100px column on a 360px
       phone — so the two bare counts pair off and the duration, the one
       that actually needs the width, takes the full row underneath. */
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5" style={{ marginBottom: 14 }}>
      <div className="row" style={rowStyle}>
        <span className="k" style={kStyle}>This week</span>
        <span className="v" style={vStyle}>{wkCount}</span>
        <span style={subStyle}>{wkCount >= 1 ? 'goal met, at least 1' : 'goal is at least 1'}</span>
      </div>
      <div className="row" style={rowStyle}>
        <span className="k" style={kStyle}>Week streak</span>
        <span className="v" style={{ ...vStyle, color: streak > 0 ? m.color : 'inherit' }}>{streak}</span>
        <span style={subStyle}>{streak > 0 ? 'consecutive weeks' : 'complete one this week to start'}</span>
      </div>
      <div className="row col-span-2 lg:col-span-1" style={rowStyle}>
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
  const target = targetHoursFor(session)
  const hit = target && hours >= target
  const armed = confirm.isArmed(session.id)

  return (
    /* The badge sits with the date rather than as its own column. Five
       competing columns (icon, text, badge, edit, delete) left the text
       ~114px on a phone, so "36h 42m · 16:8" wrapped to two lines, the
       date to a third, and the delete button pushed past the card edge.
       Pairing it with the date costs nothing on desktop and stops the
       row from having more fixed-width children than a phone can hold. */
    <div className="check-row fast-row" style={{ cursor: 'default' }}>
      <span className="fast-row-ic" style={{ background: metric('fasting').tint, color: metric('fasting').color }}>
        <Icon name="schedule" size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {formatDuration(ms)} <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>&middot; {methodLabel(session.method)}</span>
        </div>
        <div className="fast-row-meta">
          <span>{pretty(session.startedAt.slice(0, 10))}</span>
          <Badge tone={hit ? 'green' : 'muted'}>{hit ? 'Hit target' : 'Under target'}</Badge>
        </div>
      </div>
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
