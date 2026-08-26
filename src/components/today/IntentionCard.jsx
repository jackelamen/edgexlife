import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAsync } from '../../hooks/useAsync'
import {
  fetchDailyIntention, saveDailyIntention, fetchTodayCandidateTasks, fetchIntentionTasks,
  attachIntentionTask, detachIntentionTask, toggleTaskDone,
} from '../../lib/data'
import { today, pretty } from '../../lib/dates'
import { IDENTITY_THREADS, identityThreadByKey } from '../../lib/identity'
import { Modal, Empty, Loading } from '../ui/Kit'
import Icon from '../ui/Icon'

/*
  Sits below Today's hero — see the approved mockup. Tied to the identity
  statement rather than a bare to-do: you pick which thread(s) (lib/
  identity.js IDENTITY_THREADS) today is in service of — more than one at
  once is fine, a day can genuinely be in service of Success AND Health —
  say what that looks like, optionally commit Pulse tasks to it, then
  close the loop that evening with the same yes/mostly/partial/no
  vocabulary Goals' cycle retros already use — one outcome scale across
  the app, not a second one invented here.

  Three states, driven entirely by daily_intentions' own columns for
  today's date (see saveDailyIntention in lib/data.js):
    no row yet       -> morning prompt
    row, not closed   -> set (quote + tasks), with the reflect form
                         available to open whenever
    row, closed_at set -> compact closed summary
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
  if (intention.closed_at) return <ClosedState intention={intention} onReopen={() => row.reload()} />
  return <SetState intention={intention} onChanged={() => row.reload()} />
}

/* ── Morning: no intention yet ────────────────────────────────── */

function PromptState({ date, onSaved }) {
  const [threads, setThreads] = useState([])
  const [text, setText] = useState('')
  const [pickingTasks, setPickingTasks] = useState(false)
  const [taskIds, setTaskIds] = useState([])
  const [saving, setSaving] = useState(false)
  // [pickingTasks] as the dep, not [] — useAsync only (re)fetches when its
  // deps array changes, not whenever `enabled` flips. With [], the fetch
  // ran once at mount while the picker was still closed (enabled: false)
  // and never ran again once it actually opened — the exact same bug
  // GoalPhotoPicker had (see that fix's commit for the full explanation).
  const candidates = useAsync((f) => fetchTodayCandidateTasks({ force: f }), [pickingTasks], { enabled: pickingTasks })

  function toggleThread(key) {
    setThreads((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key])
  }

  async function save() {
    setSaving(true)
    try {
      await saveDailyIntention({ date, identity_threads: threads, intention: text.trim() })
      const row = await fetchDailyIntention(date, { force: true })
      for (const taskId of taskIds) await attachIntentionTask(row.id, taskId)
      toast.success("Today's intention set")
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const phrase = threadPhrase(threads)

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
                <Icon name="add_task" size={15} /> {taskIds.length ? `${taskIds.length} attached` : 'Attach tasks'}
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

      <Modal open={pickingTasks} onClose={() => setPickingTasks(false)} title="Commit Pulse tasks to today" width={480}
        footer={<button className="btn btn-primary" onClick={() => setPickingTasks(false)}>Done ({taskIds.length} attached)</button>}>
        {candidates.loading ? <Loading /> : !(candidates.data || []).length ? (
          <Empty icon="task_alt" title="Nothing open in Pulse" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {candidates.data.map((t) => (
              <label key={t.id} className="task-pick-row">
                <input type="checkbox" checked={taskIds.includes(t.id)}
                  onChange={(e) => setTaskIds(e.target.checked ? [...taskIds, t.id] : taskIds.filter((id) => id !== t.id))} />
                <span>{t.title}</span>
                {t.due_at && <span className="task-pick-due">{pretty(t.due_at.slice(0, 10))}</span>}
              </label>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ── Set: intention exists, not yet closed ────────────────────── */

function SetState({ intention, onChanged }) {
  const [reflecting, setReflecting] = useState(false)
  const tasks = useAsync((f) => fetchIntentionTasks(intention.id, { force: f }), [intention.id])
  const threads = (intention.identity_threads || []).map((k) => identityThreadByKey[k]).filter(Boolean)
  const list = tasks.data || []
  const doneCount = list.filter((r) => r.tasks?.completed_at).length

  async function toggleTask(row) {
    try {
      await toggleTaskDone(row.task_id, !row.tasks?.completed_at)
      tasks.reload()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="intention-card">
      <div className="set-header">
        {threads.map((t) => <span key={t.key} className="thread-badge"><Icon name={t.icon} size={14} fill />{t.short}</span>)}
      </div>
      {intention.intention && <p className="set-quote">"{intention.intention}"</p>}
      <div className="set-sub">{list.length ? `${doneCount} of ${list.length} tasks done` : "Today's intention"}</div>

      {list.length > 0 && (
        <div className="task-list">
          {list.map((row) => {
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

function ClosedState({ intention }) {
  const threads = (intention.identity_threads || []).map((k) => identityThreadByKey[k]).filter(Boolean)
  const tone = intention.outcome === 'yes' ? 'good' : intention.outcome === 'no' ? 'risk' : 'short'
  return (
    <div className="intention-card">
      <div className="closed-summary">
        <div className="closed-text">
          {threads.length > 0 && (
            <div className="thread-row" style={{ marginBottom: 6 }}>
              {threads.map((t) => <span key={t.key} className="thread-badge"><Icon name={t.icon} size={12} fill />{t.short}</span>)}
            </div>
          )}
          {intention.intention && <p className="quote">"{intention.intention}"</p>}
          {intention.reflection && <p className="note">{intention.reflection}</p>}
          <div className="meta"><span className={`meta-dot tone-${tone}`} />{OUTCOMES.find(([v]) => v === intention.outcome)?.[1] || 'Reflected'}</div>
        </div>
      </div>
    </div>
  )
}
