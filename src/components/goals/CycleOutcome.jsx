import { useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../ui/Icon'
import { Badge } from '../ui/Kit'
import PaceChart from './PaceChart'
import { logMetric } from '../../lib/data'
import { today } from '../../lib/dates'
import {
  metricLatest, metricPace, metricProgress, metricDirection, cycleDiagnosis,
  fmtMetricValue, paceColor, PACE_LABEL, num,
} from '../../lib/outcomes'

/*
  The outcome half of a cycle, shown beside its adherence ring.

  Adherence alone is a streak tracker: it can read 100% while the number
  you actually care about does not move. Each metric attached to the cycle
  gets a progress bar, a pace read against the straight line to its
  target, and a place to log a value without leaving the card. Under them,
  one sentence that reads adherence and pace together, because "behind on
  the outcome" means a different thing if you did the work than if you
  didn't.
*/
export default function CycleOutcome({ sprint, metrics, logs, rate, compact, onLogged }) {
  const mine = (metrics || []).filter((m) => m.sprint_id === sprint.id && num(m.target) != null)
  const [drafts, setDrafts] = useState({})
  const [chartFor, setChartFor] = useState(null)

  if (!mine.length) {
    if (compact) return null
    return (
      <div className="cycle-outcome-empty">
        <Icon name="show_chart" size={14} />
        No outcome metric on this cycle yet. Add one from the goal, attach it to this cycle, and you will see
        whether the work is moving the number.
      </div>
    )
  }

  const rows = mine.map((m) => ({ m, pace: metricPace(m, logs, sprint), latest: metricLatest(m, logs) }))
  const diagnosis = cycleDiagnosis(rate?.pct ?? null, rows.map((r) => r.pace))

  async function commit(m) {
    const v = drafts[m.id]
    if (v === '' || v == null || Number.isNaN(Number(v))) { toast.error('Enter a number'); return }
    try {
      await logMetric(m.id, m.goal_id, today(), Number(v))
      setDrafts((d) => { const n = { ...d }; delete n[m.id]; return n })
      toast.success('Logged')
      onLogged?.()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="cycle-outcome">
      <div className="cycle-outcome-label">Outcome</div>
      {rows.map(({ m, pace, latest }) => {
        const cur = latest ? latest.value : num(m.start_value)
        const pct = metricProgress(m, cur)
        const color = paceColor(pace)
        const drafting = drafts[m.id] !== undefined
        const dir = metricDirection(m)
        return (
          <div key={m.id} className="cycle-outcome-row">
            <div className="cycle-outcome-head">
              <strong>{m.name}</strong>
              <span className="tnum cycle-outcome-vals">
                {cur != null ? fmtMetricValue(m.type, cur) : 'n/a'}
                <Icon name={dir === 'down' ? 'south_east' : 'north_east'} size={12} />
                {fmtMetricValue(m.type, m.target)}
              </span>
              <span className="cycle-outcome-pace" style={{ color }}>
                <span className="cycle-outcome-dot" style={{ background: color }} />
                {PACE_LABEL[pace.status]}
              </span>
            </div>
            <div className="cycle-outcome-track" title={pace.expected != null ? `Expected ${Math.round(pace.expected * 100)}% by today` : undefined}>
              <span className="cycle-outcome-fill" style={{ width: `${Math.round((pct ?? 0) * 100)}%`, background: color }} />
              {pace.expected != null && (
                <span className="cycle-outcome-expected" style={{ left: `${Math.round(pace.expected * 100)}%` }} />
              )}
            </div>
            {pace.expectedValue != null && (
              <div className="cycle-outcome-sub">
                Pace says {fmtMetricValue(m.type, Math.round(pace.expectedValue * 100) / 100)} by today
                {pace.current != null && ` · you are at ${fmtMetricValue(m.type, pace.current)}`}
              </div>
            )}
            <div className="cycle-outcome-actions">
              {drafting ? (
                <>
                  <input type="number" inputMode="decimal" autoFocus placeholder="value" value={drafts[m.id]}
                    onChange={(e) => setDrafts({ ...drafts, [m.id]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(m)
                      if (e.key === 'Escape') setDrafts((d) => { const n = { ...d }; delete n[m.id]; return n })
                    }} />
                  <button className="btn btn-icon btn-sm" onClick={() => commit(m)} aria-label="Save value">
                    <Icon name="check" size={13} /></button>
                  <button className="btn btn-icon btn-sm" aria-label="Cancel"
                    onClick={() => setDrafts((d) => { const n = { ...d }; delete n[m.id]; return n })}>
                    <Icon name="close" size={13} /></button>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setDrafts({ ...drafts, [m.id]: latest ? String(latest.value) : '' })}>
                    <Icon name="edit_note" size={14} /> Log today
                  </button>
                  {!compact && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setChartFor(chartFor === m.id ? null : m.id)}>
                      <Icon name="show_chart" size={14} /> {chartFor === m.id ? 'Hide chart' : 'Chart'}
                    </button>
                  )}
                </>
              )}
            </div>
            {chartFor === m.id && !compact && (
              <div className="cycle-outcome-chart">
                <PaceChart metric={m} logs={logs} sprint={sprint} color={color} />
                <div className="cycle-outcome-legend">
                  <span><i className="solid" /> Logged</span>
                  <span><i className="dashed" /> Expected pace</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {diagnosis && (
        <div className={`cycle-diagnosis cycle-diagnosis-${diagnosis.tone}`}>
          <Badge tone={diagnosis.tone}>{diagnosis.title}</Badge>
          <p>{diagnosis.text}</p>
        </div>
      )}
    </div>
  )
}
