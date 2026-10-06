import toast from 'react-hot-toast'
import { usePhone } from '../../hooks/usePhone'
import Icon from '../ui/Icon'
import { Badge } from '../ui/Kit'
import { setMilestoneDone } from '../../lib/data'
import { today, prettyShort } from '../../lib/dates'
import { phaseWeekRange, sprintWeeks, tacticWeekRows } from '../../lib/goals'
import { statusFor } from '../../lib/design'
import { sprintMilestones, fmtMetricValue } from '../../lib/outcomes'

/*
  Where this week sits in the cycle.

  One cell per week, grouped under the phase that owns it, coloured by how
  that week went (the same status ramp as every other performance read).
  Clicking a cell jumps the card to that week. Under the strip, each
  phase's milestone with its due date and whether it was met. This is the
  timeline the week arrows alone could not give: you can see you are two
  weeks from Peak, which weeks were strong, and whether the Build
  milestone landed.
*/
export default function PhaseStrip({ sprint, phases, tactics, metrics, logs, week, currentWeek, onPick, onChanged }) {
  const phone = usePhone()
  const total = sprintWeeks(sprint)
  const sorted = [...phases].sort((a, b) => a.phase_index - b.phase_index)
  if (!sorted.length || total < 2) return null

  const weekPct = (w) => {
    if (w > currentWeek) return null
    const rows = tacticWeekRows(sorted, tactics, sprint, w)
    const possible = rows.reduce((n, r) => n + r.possible, 0)
    if (!possible) return null
    return Math.round((rows.reduce((n, r) => n + r.done, 0) / possible) * 100)
  }
  const milestones = sprintMilestones(sprint, sorted, metrics, logs)

  async function toggle(m) {
    try {
      await setMilestoneDone(m.phase.id, m.phase.milestone_done_on ? null : today())
      onChanged?.()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="phase-strip">
      <div className="phase-strip-track">
        {sorted.map((p, pi) => {
          const [from, to] = phaseWeekRange(pi, total, sorted.length)
          const weeks = []
          for (let w = from; w <= to; w++) weeks.push(w)
          const isCurrent = currentWeek >= from && currentWeek <= to
          return (
            <div key={p.id || pi} className={`phase-strip-phase${isCurrent ? ' current' : ''}`} style={{ flex: weeks.length }}>
              <div className="phase-strip-name">{p.name}</div>
              <div className="phase-strip-weeks">
                {weeks.map((w) => {
                  const pct = weekPct(w)
                  const st = statusFor(pct)
                  const future = w > currentWeek
                  return (
                    <button key={w} type="button"
                      className={`phase-strip-week${w === week ? ' selected' : ''}${w === currentWeek ? ' now' : ''}${future ? ' future' : ''}`}
                      style={st ? { '--wk': st.color } : undefined}
                      title={pct != null ? `Week ${w}: ${pct}%` : `Week ${w}`}
                      aria-label={`Week ${w}${pct != null ? `, ${pct} percent` : ''}`}
                      onClick={() => onPick(w)}>
                      {st && <i className="phase-strip-dot" />}{w}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {milestones.length > 0 && (phone ? (
        <details className="phase-fold">
          <summary>
            <span>Milestones</span>
            <small>{milestones.filter((m) => m.met).length} of {milestones.length} met</small>
            <Icon name="expand_more" size={20} className="fold-chev" />
          </summary>
          <div className="phase-milestones">
          {milestones.map((m) => {
            const tone = m.status === 'met' ? 'green' : m.status === 'missed' ? 'red' : m.status === 'due' ? 'orange' : 'muted'
            const word = m.status === 'met' ? 'Met' : m.status === 'missed' ? 'Missed' : m.status === 'due' ? 'Due this week' : 'Upcoming'
            return (
              <div key={m.phase.id} className="phase-milestone">
                <Icon name={m.met ? 'check_circle' : 'flag'} size={16} fill={m.met}
                  style={{ color: m.met ? 'var(--s-good)' : 'var(--text-3)' }} />
                <div className="phase-milestone-body">
                  <strong>{m.text}</strong>
                  <small>
                    End of {m.phase.name}{m.dueOn ? ` · ${prettyShort(m.dueOn)}` : ''}
                    {!m.manual && m.current != null && m.target != null &&
                      ` · now ${fmtMetricValue(m.metric.type, m.current)} of ${fmtMetricValue(m.metric.type, m.target)}`}
                  </small>
                </div>
                <Badge tone={tone}>{word}</Badge>
                {m.manual && (
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(m)}>
                    {m.met ? 'Undo' : 'Mark met'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        </details>
      ) : (
        <div className="phase-milestones">
          {milestones.map((m) => {
            const tone = m.status === 'met' ? 'green' : m.status === 'missed' ? 'red' : m.status === 'due' ? 'orange' : 'muted'
            const word = m.status === 'met' ? 'Met' : m.status === 'missed' ? 'Missed' : m.status === 'due' ? 'Due this week' : 'Upcoming'
            return (
              <div key={m.phase.id} className="phase-milestone">
                <Icon name={m.met ? 'check_circle' : 'flag'} size={16} fill={m.met}
                  style={{ color: m.met ? 'var(--s-good)' : 'var(--text-3)' }} />
                <div className="phase-milestone-body">
                  <strong>{m.text}</strong>
                  <small>
                    End of {m.phase.name}{m.dueOn ? ` · ${prettyShort(m.dueOn)}` : ''}
                    {!m.manual && m.current != null && m.target != null &&
                      ` · now ${fmtMetricValue(m.metric.type, m.current)} of ${fmtMetricValue(m.metric.type, m.target)}`}
                  </small>
                </div>
                <Badge tone={tone}>{word}</Badge>
                {m.manual && (
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(m)}>
                    {m.met ? 'Undo' : 'Mark met'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
