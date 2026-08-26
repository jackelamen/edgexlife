import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAsync } from '../../hooks/useAsync'
import {
  fetchDailyIntention, saveDailyIntention, fetchTodayCandidateTasks, fetchIntentionTasks,
  attachIntentionTask, detachIntentionTask, toggleTaskDone,
  fetchHabits, fetchHabitLogs, logHabit, unlogHabit,
  fetchIntentionHabits, attachIntentionHabit, detachIntentionHabit,
} from '../../lib/data'
import { today, pretty } from '../../lib/dates'
import { isHabitDueToday } from '../../lib/habits'
import { IDENTITY_THREADS, identityThreadByKey } from '../../lib/identity'
import { Modal, Empty, Loading } from '../ui/Kit'
import Icon from '../ui/Icon'

/*
  Sits below Today's hero — see the approved mockup. Tied to the identity
  statement rather than a bare to-do: you pick which thread(s) (lib/
  identity.js IDENTITY_THREADS) today is in service of — more than one at
  once is fine, a day can genuinely be in service of Success AND Health —
  say what that looks like, optionally commit Pulse tasks AND habits to
  it, then close the loop that evening with the same yes/mostly/partial/
  no vocabulary Goals' cycle retros already use — one outcome scale
  across the app, not a second one invented here.

  Three states, driven entirely by daily_intentions' own columns for
  today's date (see saveDailyIntention in lib/data.js):
    no row yet       -> morning prompt
    row, not closed   -> set (quote + committed tasks/habits), with the
                         reflect form and the edit form both available
                         to open whenever
    row, closed_at set -> compact closed summary, still editable
*/

const OUTCOMES = [['yes', 'Yes, fully'], ['mostly', 'Mostly'], ['partial', 'Partially'], ['no', 'Not really']]

/** "success", "success and health", or "success, health, and family" —
    used in the adaptive prompt/placeholder text once more than one
    thread is picked. */
function threadPhrase(keys) {
  const labels = keys.map((k) => identityThreadByKey[k]?.label.toLowerCase()).filter(Boolean)
  if (labels.length <= 1) return labels[0] || ''
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

export default function IntentionCard() {
  const date = today()
  const row = useAsync((f) => fetchDailyIntention(date, { force: f }), [date])
  const intention = row.data

  if (row.loading) return null // avoid a flash of the empty-state prompt while the first fetch resolves
  if (!intention) return <PromptState date={date} onSaved={() => row.reload()} />
  if (intention.closed_at) return <ClosedState intention={intention} onChanged={() => row.reload()} />
  return <SetState intention={intention} onChanged={() => row.reload()} />
}

/* ── Shared: the "commit Pulse tasks/habits" picker ────────────────
   Fully controlled — PromptState uses it in deferred mode (nothing's
   written until the intention itself is saved, since there's no
   intention_id yet to attach against); SetState/EditForm use it in
   immediate mode (each checkbox click attaches/detaches right away,
   same as the existing per-row remove buttons already do). */
function TaskHabitPicker({ open, onClose, selectedTaskIds, onToggleTask, selectedHabitIds, onToggleHabit }) {
  // [open] as the dep, not [] — see the useAsync fix commit from earlier
  // this session (GoalPhotoPicker/IntentionCard/Review all had the same
  // bug: enabled flipping true doesn't refetch unless it's also a dep).
  const tasks = useAsync((f) => fetchTodayCandidateTasks({ force: f }), [open], { enabled: open })
  const habits = useAsync((f) => fetchHabits({ force: f }), [open], { enabled: open })
  const habitCandidates = (habits.data || []).filter(isHabitDueToday)
  const loading = tasks.loading || habits.loading
  const totalSelected = selectedTaskIds.length + selectedHabitIds.length

  return (
    <Modal open={open} onClose={onClose} title="Commit Pulse tasks & habits to today" width={480}
      footer={<button className="btn btn-primary" onClick={onClose}>Done ({totalSelected} selected)</button>}>
      {loading ? <Loading /> : !(tasks.data || []).length && !habitCandidates.length ? (
        <Empty icon="task_alt" title="Nothing open in Pulse" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 400, overflowY: 'auto' }}>
          {(tasks.data || []).length > 0 && (
            <div>
              <div className="picker-section-label">Tasks</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tasks.data.map((t) => (
                  <label key={t.id} className="task-pick-row">
                    <input type="checkbox" checked={selectedTaskIds.includes(t.id)} onChange={() => onToggleTask(t.id)} />
                    <span>{t.title}</span>
                    {t.due_at && <span className="task-pick-due">{pretty(t.due_at.slice(0, 10))}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          {habitCandidates.length > 0 && (
            <div>
              <div className="picker-section-label">Habits</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {habitCandidates.map((h) => (
                  <label key={h.id} className="task-pick-row">
                    <input type="checkbox" checked={selectedHabitIds.includes(h.id)} onChange={() => onToggleHabit(h.id)} />
                    <span>{h.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ── Morning: no intention yet ────────────────────────────────── */

function PromptState({ date, onSaved }) {
  const [threads, setThreads] = useState([])
  const [text, setText] = useState('')
  const [pickingTasks, setPickingTasks] = useState(false)
  const [taskIds, setTaskIds] = useState([])
  const [habitIds, setHabitIds] = useState([])
  const [saving, setSaving] = useState(false)

  function toggleThread(key) {
    setThreads((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key])
  }
  const toggleTaskId = (id) => setTaskIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  const toggleHabitId = (id) => setHabitIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])

  async function save() {
    setSaving(true)
    try {
      await saveDailyIntention({ date, identity_threads: threads, intention: text.trim() })
      const row = await fetchDailyIntention(date, { force: true })
      for (const taskId of taskIds) await attachIntentionTask(row.id, taskId)
      for (const habitId of habitIds) await attachIntentionHabit(row.id, habitId)
      toast.success("Today's intention set")
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const phrase = threadPhrase(threads)
  const attachedCount = taskIds.length + habitIds.length

  return (
    <div className="intention-card">
      <div className="intention-top">
        <div className="intention-eyebrow"><Icon name="star" fill size={15} /><span>Today's intention</span></div>
        <p className="intention-prompt">Which part of who you're building shows up today? Pick as many as fit.</p>
        <div className="thread-row">
          {IDENTITY_THREADS.map((t) => (
            <button key={t.key} type="button" className={`thread-chip${threads.includes(t.key) ? ' active' : ''}`}
              onClick={() => toggleThread(t.key)}>
              <Icon name={t.icon} size={14} fill={threads.includes(t.key)} />{t.short}
            </button>
          ))}
        </div>
        {threads.length > 0 && (
          <>
            <p className="intention-prompt">What does "{phrase}" look like today?</p>
            <textarea className="intention-input" rows={2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={`e.g. one concrete thing that's actually ${phrase} today`} />
            <div className="task-attach">
              <span className="task-attach-label">Anything from Pulse you must get done?</span>
              <button type="button" className="btn btn-ghost" onClick={() => setPickingTasks(true)}>
                <Icon name="add_task" size={15} /> {attachedCount ? `${attachedCount} attached` : 'Attach tasks & habits'}
              </button>
            </div>
          </>
        )}
      </div>
      {threads.length > 0 && (
        <div className="intention-footer">
          <button type="button" className="btn btn-primary" disabled={saving || !text.trim()} onClick={save}>
            <Icon name="check" size={16} /> {saving ? 'Setting…' : "Set today's intention"}
          </button>
        </div>
      )}

      <TaskHabitPicker open={pickingTasks} onClose={() => setPickingTasks(false)}
        selectedTaskIds={taskIds} onToggleTask={toggleTaskId}
        selectedHabitIds={habitIds} onToggleHabit={toggleHabitId} />
    </div>
  )
}

/* ── Set: intention exists, not yet closed ────────────────────── */

function SetState({ intention, onChanged }) {
  const [reflecting, setReflecting] = useState(false)
  const [editing, setEditing] = useState(false)
  const tasks = useAsync((f) => fetchIntentionTasks(intention.id, { force: f }), [intention.id])
  const habits = useAsync((f) => fetchIntentionHabits(intention.id, { force: f }), [intention.id])
  const habitLogs = useAsync((f) => fetchHabitLogs(intention.date, intention.date, { force: f }), [intention.date])
  const threads = (intention.identity_threads || []).map((k) => identityThreadByKey[k]).filter(Boolean)
  const taskList = tasks.data || []
  const habitList = habits.data || []
  const doneHabitIds = new Set((habitLogs.data || []).filter((l) => l.count > 0).map((l) => l.habit_id))
  const doneCount = taskList.filter((r) => r.tasks?.completed_at).length + habitList.filter((r) => doneHabitIds.has(r.habit_id)).length
  const totalCommitted = taskList.length + habitList.length

  async function toggleTask(row) {
    try {
      await toggleTaskDone(row.task_id, !row.tasks?.completed_at)
      tasks.reload()
    } catch (e) { toast.error(e.message) }
  }

  async function toggleHabit(row) {
    try {
      if (doneHabitIds.has(row.habit_id)) await unlogHabit(row.habit_id, intention.date)
      else await logHabit(row.habit_id, intention.date, 1)
      habitLogs.reload()
    } catch (e) { toast.error(e.message) }
  }

  if (editing) {
    return <EditForm intention={intention} onDone={() => { setEditing(false); onChanged(); tasks.reload(); habits.reload() }} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="intention-card">
      <div className="set-header">
        {threads.map((t) => <span key={t.key} className="thread-badge"><Icon name={t.icon} size={14} fill />{t.short}</span>)}
        <button type="button" className="intention-edit-btn" title="Edit today's intention" onClick={() => setEditing(true)}>
          <Icon name="edit" size={14} />
        </button>
      </div>
      {intention.intention && <p className="set-quote">"{intention.intention}"</p>}
      <div className="set-sub">{totalCommitted ? `${doneCount} of ${totalCommitted} committed done` : "Today's intention"}</div>

      {totalCommitted > 0 && (
        <div className="task-list">
          {taskList.map((row) => {
            const done = Boolean(row.tasks?.completed_at)
            return (
              <div key={row.id} className={`task-row${done ? ' done' : ''}`}>
                <button type="button" className={`task-check${done ? ' done' : ''}`} onClick={() => toggleTask(row)}>
                  {done && <Icon name="check" size={13} />}
                </button>
                <span>{row.tasks?.title}</span>
                <button type="button" className="task-remove" title="Un-commit this task"
                  onClick={async () => { await detachIntentionTask(row.id, intention.id); tasks.reload() }}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            )
          })}
          {habitList.map((row) => {
            const done = doneHabitIds.has(row.habit_id)
            return (
              <div key={row.id} className={`task-row${done ? ' done' : ''}`}>
                <button type="button" className={`task-check${done ? ' done' : ''}`} onClick={() => toggleHabit(row)}>
                  {done && <Icon name="check" size={13} />}
                </button>
                <span>{row.habits?.name}</span>
                <button type="button" className="task-remove" title="Un-commit this habit"
                  onClick={async () => { await detachIntentionHabit(row.id, intention.id); habits.reload() }}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {reflecting ? (
        <ReflectForm intention={intention} onDone={onChanged} />
      ) : (
        <div className="intention-footer">
          <button type="button" className="btn btn-ghost" onClick={() => setReflecting(true)}>
            <Icon name="nights_stay" size={15} /> How did today go?
          </button>
        </div>
      )}
    </div>
  )
}

function ReflectForm({ intention, onDone }) {
  const [outcome, setOutcome] = useState(intention.outcome || '')
  const [note, setNote] = useState(intention.reflection || '')
  const [saving, setSaving] = useState(false)

  async function close() {
    setSaving(true)
    try {
      await saveDailyIntention({
        ...intention, outcome, reflection: note.trim() || null, closed_at: new Date().toISOString(),
      })
      toast.success("Today's loop closed")
      onDone()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="reflect-divider">
      <div className="reflect-title">Did you show up that way today?</div>
      <div className="outcome-row">
        {OUTCOMES.map(([v, l]) => (
          <button key={v} type="button" className={`outcome-btn${outcome === v ? ` sel-${v === 'yes' ? 'good' : v === 'no' ? 'risk' : 'short'}` : ''}`}
            onClick={() => setOutcome(v)}>{l}</button>
        ))}
      </div>
      <textarea className="intention-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Anything worth remembering about today? (optional)" />
      <div className="intention-footer" style={{ padding: '12px 0 0', borderTop: 'none' }}>
        <button type="button" className="btn btn-primary" disabled={saving || !outcome} onClick={close}>
          <Icon name="check" size={16} /> {saving ? 'Closing…' : "Close today's loop"}
        </button>
      </div>
    </div>
  )
}

/* ── Closed: loop already shut for today ──────────────────────── */

function ClosedState({ intention, onChanged }) {
  const [editing, setEditing] = useState(false)
  const threads = (intention.identity_threads || []).map((k) => identityThreadByKey[k]).filter(Boolean)
  const tone = intention.outcome === 'yes' ? 'good' : intention.outcome === 'no' ? 'risk' : 'short'

  // Editing after closing only touches threads/intention text/committed
  // tasks & habits — see EditForm — so outcome/reflection/closed_at all
  // pass through saveDailyIntention unchanged and the loop stays closed.
  if (editing) return <EditForm intention={intention} onDone={() => { setEditing(false); onChanged() }} onCancel={() => setEditing(false)} />

  return (
    <div className="intention-card">
      <div className="closed-summary">
        <div className="closed-text" style={{ flex: 1 }}>
          {threads.length > 0 && (
            <div className="thread-row" style={{ marginBottom: 6 }}>
              {threads.map((t) => <span key={t.key} className="thread-badge"><Icon name={t.icon} size={12} fill />{t.short}</span>)}
            </div>
          )}
          {intention.intention && <p className="quote">"{intention.intention}"</p>}
          {intention.reflection && <p className="note">{intention.reflection}</p>}
          <div className="meta"><span className={`meta-dot tone-${tone}`} />{OUTCOMES.find(([v]) => v === intention.outcome)?.[1] || 'Reflected'}</div>
        </div>
        <button type="button" className="intention-edit-btn" title="Edit today's intention" onClick={() => setEditing(true)}>
          <Icon name="edit" size={14} />
        </button>
      </div>
    </div>
  )
}

/* ── Edit: revise threads/intention text/committed tasks & habits ─ */

function EditForm({ intention, onDone, onCancel }) {
  const [threads, setThreads] = useState(intention.identity_threads || [])
  const [text, setText] = useState(intention.intention || '')
  const [saving, setSaving] = useState(false)
  const [pickingTasks, setPickingTasks] = useState(false)
  const tasks = useAsync((f) => fetchIntentionTasks(intention.id, { force: f }), [intention.id])
  const habits = useAsync((f) => fetchIntentionHabits(intention.id, { force: f }), [intention.id])
  const taskIds = (tasks.data || []).map((r) => r.task_id)
  const habitIds = (habits.data || []).map((r) => r.habit_id)

  function toggleThread(key) {
    setThreads((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key])
  }

  // Task/habit changes here are immediate (attach/detach on click), same
  // as the remove buttons already are in SetState — only threads/text
  // wait for "Save changes" below, since those are free-text edits that
  // need an explicit commit point.
  async function toggleTaskId(taskId) {
    const existing = (tasks.data || []).find((r) => r.task_id === taskId)
    if (existing) await detachIntentionTask(existing.id, intention.id)
    else await attachIntentionTask(intention.id, taskId)
    tasks.reload()
  }
  async function toggleHabitId(habitId) {
    const existing = (habits.data || []).find((r) => r.habit_id === habitId)
    if (existing) await detachIntentionHabit(existing.id, intention.id)
    else await attachIntentionHabit(intention.id, habitId)
    habits.reload()
  }

  async function save() {
    setSaving(true)
    try {
      // Spreads the existing row first so outcome/reflection/closed_at
      // (irrelevant to this form) pass through untouched — editing the
      // intention after closing the loop doesn't reopen it.
      await saveDailyIntention({ ...intention, identity_threads: threads, intention: text.trim() })
      toast.success('Intention updated')
      onDone()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const phrase = threadPhrase(threads)
  const attachedCount = taskIds.length + habitIds.length

  return (
    <div className="intention-card">
      <div className="intention-top">
        <div className="intention-eyebrow"><Icon name="edit" size={15} /><span>Edit today's intention</span></div>
        <div className="thread-row">
          {IDENTITY_THREADS.map((t) => (
            <button key={t.key} type="button" className={`thread-chip${threads.includes(t.key) ? ' active' : ''}`}
              onClick={() => toggleThread(t.key)}>
              <Icon name={t.icon} size={14} fill={threads.includes(t.key)} />{t.short}
            </button>
          ))}
        </div>
        <textarea className="intention-input" rows={2} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={phrase ? `e.g. one concrete thing that's actually ${phrase} today` : 'What does today look like?'} />
        <div className="task-attach">
          <span className="task-attach-label">Pulse tasks &amp; habits committed today</span>
          <button type="button" className="btn btn-ghost" onClick={() => setPickingTasks(true)}>
            <Icon name="add_task" size={15} /> {attachedCount ? `${attachedCount} attached` : 'Choose tasks & habits'}
          </button>
        </div>
      </div>
      <div className="intention-footer" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={saving || !threads.length || !text.trim()} onClick={save}>
          <Icon name="check" size={16} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <TaskHabitPicker open={pickingTasks} onClose={() => setPickingTasks(false)}
        selectedTaskIds={taskIds} onToggleTask={toggleTaskId}
        selectedHabitIds={habitIds} onToggleHabit={toggleHabitId} />
    </div>
  )
}
