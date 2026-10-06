import { prettyShort } from '../../lib/dates'
import { PACE_LABEL } from '../../lib/outcomes'

/*
  One progress read per goal: how much of the outcome is done, set beside
  how much of the time is gone. Either number alone misleads; 40% done is
  great at 20% of the time and a problem at 80%. The tick on the bar marks
  where the clock is, so ahead or behind is visible without reading.
*/
export default function GoalProgress({ progress, time, standing, onPhoto }) {
  if (!progress) return null
  const ink = onPhoto ? '#fff' : 'var(--text)'
  const soft = onPhoto ? 'rgba(255,255,255,.78)' : 'var(--text-3)'
  const track = onPhoto ? 'rgba(255,255,255,.25)' : 'var(--white-soft)'
  const color = standing === 'behind' ? 'var(--s-short)' : standing ? 'var(--s-good)' : (onPhoto ? '#fff' : 'var(--accent)')

  if (progress.pct == null) {
    return <p style={{ fontSize: 12, color: soft, fontWeight: 600, marginBottom: 12 }}>{progress.hint}</p>
  }

  return (
    <div className="goal-progress" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <strong className="tnum" style={{ fontSize: 20, lineHeight: 1, color: ink }}>{progress.pct}%</strong>
        <span style={{ fontSize: 12, fontWeight: 600, color: soft }}>{progress.label}</span>
        {standing && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 650, color: onPhoto ? '#fff' : color }}>
            {PACE_LABEL[standing].replace(' pace', '')}
          </span>
        )}
      </div>
      <div className="goal-progress-track" style={{ background: track }}>
        <span style={{ width: `${progress.pct}%`, background: color }} />
        {time && <i style={{ left: `${time.elapsedPct}%`, background: onPhoto ? '#fff' : 'var(--text)' }} />}
      </div>
      {time && (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: soft, marginTop: 5 }}>
          {time.elapsedPct}% of the time gone · {time.daysLeft >= 0
            ? `${time.daysLeft} day${time.daysLeft === 1 ? '' : 's'} left`
            : `${-time.daysLeft} day${time.daysLeft === -1 ? '' : 's'} past`} · {prettyShort(time.deadline)}
        </div>
      )}
    </div>
  )
}
