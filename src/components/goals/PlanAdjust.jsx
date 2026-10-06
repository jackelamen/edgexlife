import { useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../ui/Icon'
import { Badge } from '../ui/Kit'
import { endTactic, replaceTactic, saveSprintDecision } from '../../lib/data'
import { DAY_LABELS, tacticKeyId } from '../../lib/goals'
import { ADHERENCE_BAR } from '../../lib/outcomes'

/*
  The decision the weekly review exists to force.

  An action under the bar two completed weeks running is a pattern, not a
  bad week, and describing it again does nothing. Each one gets a keep,
  change or drop. Change and drop take effect from NEXT week and leave the
  weeks already scored untouched (see starts_week / ended_week on
  sprint_tactics), so fixing a plan can never quietly improve the history
  it is meant to explain.
*/
export default function PlanAdjust({ items, weekId, onChanged }) {
  if (!items.length) return null
  return (
    <div className="plan-adjust">
      {items.map((it) => (
        <PlanItem key={`${it.sprint.id}:${tacticKeyId(it.tactic)}`} item={it} weekId={weekId} onChanged={onChanged} />
      ))}
    </div>
  )
}

function PlanItem({ item, weekId, onChanged }) {
  const { sprint, tactic: t, weeks, lastDone } = item
  const key = tacticKeyId(t)
  const decided = (sprint.reflections?.decisions || {})[weekId]?.[key]?.action
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({
    text: t.text, freq: t.freq, times_per_week: t.times_per_week || 3, days: t.days || [],
  })

  async function run(fn, ok) {
    setBusy(true)
    try { await fn(); toast.success(ok); setEditing(false); onChanged?.() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const keep = () => run(() => saveSprintDecision(sprint.id, weekId, key, 'keep'), 'Kept')
  const drop = () => run(async () => {
    await endTactic(t.id, lastDone)
    await saveSprintDecision(sprint.id, weekId, key, 'drop')
  }, 'Dropped from next week')
  const change = () => run(async () => {
    await replaceTactic(t, draft, lastDone + 1)
    await saveSprintDecision(sprint.id, weekId, key, 'change')
  }, 'Changed from next week')

  const label = { keep: 'Kept as is', drop: 'Dropped', change: 'Changed' }[decided]

  return (
    <div className="plan-adjust-item">
      <div className="plan-adjust-head">
        <strong>{t.text || 'Untitled action'}</strong>
        <small>{sprint.name} · weeks {lastDone - 1} and {lastDone}: {weeks[0]}% then {weeks[1]}% (bar is {ADHERENCE_BAR}%)</small>
      </div>

      {decided && !editing ? (
        <span className="plan-adjust-done"><Icon name="check_circle" size={15} fill style={{ color: 'var(--s-good)' }} /> {label}</span>
      ) : editing ? (
        <div className="plan-adjust-form">
          <input type="text" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <select style={{ width: 110 }} value={draft.freq} onChange={(e) => setDraft({ ...draft, freq: e.target.value })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="xperweek">×/week</option>
            <option value="custom">Custom days</option>
          </select>
          {draft.freq === 'xperweek' && (
            <input type="number" min={1} max={7} style={{ width: 56 }} value={draft.times_per_week}
              onChange={(e) => setDraft({ ...draft, times_per_week: Number(e.target.value) })} />
          )}
          {draft.freq === 'custom' && (
            <div style={{ display: 'flex', gap: 3 }}>
              {DAY_LABELS.map((lbl, d) => (
                <button key={d} type="button" className="btn btn-xs"
                  style={draft.days.includes(d) ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : undefined}
                  onClick={() => {
                    const days = new Set(draft.days)
                    days.has(d) ? days.delete(d) : days.add(d)
                    setDraft({ ...draft, days: [...days].sort() })
                  }}>{lbl[0]}</button>
              ))}
            </div>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy || !draft.text.trim() || (draft.freq === 'custom' && !draft.days.length)}
            onClick={change}>Start next week</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className="plan-adjust-actions">
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={keep}>Keep</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing(true)}>
            <Icon name="edit" size={13} /> Change
          </button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={drop}>
            <Icon name="remove_circle_outline" size={13} /> Drop
          </button>
          <Badge tone="muted">Takes effect next week</Badge>
        </div>
      )}
    </div>
  )
}
