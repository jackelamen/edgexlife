import { execScore, sprintCurrentWeek } from '../../lib/goals'

/** 12-week execution bar chart, ported from goals.html's streakChartHTML. */
export default function StreakChart({ sprint, phases, tactics }) {
  const cw = sprintCurrentWeek(sprint)
  const scores = []
  for (let w = 1; w <= 12; w++) scores.push(w <= cw ? execScore(phases, tactics, sprint, w) : null)

  const W = 440, H = 90, barW = 22, gap = 10
  const padL = 28, padB = 18
  const innerW = W - padL
  const totalW = 12 * (barW + gap) - gap
  const startX = padL + (innerW - totalW) / 2

  const completed = scores.filter((s) => s !== null)
  const avgScore = completed.length ? Math.round(completed.reduce((a, b) => a + b, 0) / completed.length) : null
  const avgY = avgScore != null ? H - padB - Math.round((avgScore / 100) * (H - padB - 6)) : null
  const yTicks = [0, 50, 85, 100]
  const glowId = `glow-${sprint.id}`

  return (
    <div className="streak-chart-wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="streak-chart-title" style={{ marginBottom: 0 }}>12-Week Execution Streak</div>
        {avgScore != null && <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>avg {avgScore}%</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {yTicks.map((v) => {
          const y = H - padB - Math.round((v / 100) * (H - padB - 6))
          return (
            <g key={v}>
              <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="8" fontWeight="700" fill="#9BA3B2">{v}</text>
              <line x1={padL} y1={y} x2={startX + totalW} y2={y} stroke="#EEF2F7" strokeWidth="1" />
            </g>
          )
        })}
        {scores.map((s, i) => {
          const x = startX + i * (barW + gap)
          const isCur = i + 1 === cw
          if (s === null) {
            return (
              <g key={i}>
                <rect x={x} y={H - padB - 6} width={barW} height={6} rx={3} fill="#EEF2F7" />
                <text x={x + barW / 2} y={H - 1} textAnchor="middle" fontSize="9" fontWeight="700" fill="#C8D0DC">{i + 1}</text>
              </g>
            )
          }
          const barH = Math.max(6, Math.round((s / 100) * (H - padB - 6)))
          const y = H - padB - barH
          const color = s >= 85 ? '#10b981' : s >= 65 ? '#f97316' : '#ef4444'
          return (
            <g key={i}>
              <title>Week {i + 1}: {s}%{isCur ? ' · Current' : ''}</title>
              <rect x={x} y={y} width={barW} height={barH} rx={4} fill={color}
                filter={isCur ? `url(#${glowId})` : undefined} opacity={isCur ? 1 : 0.72} />
              <text x={x + barW / 2} y={H - 1} textAnchor="middle" fontSize="9"
                fontWeight={isCur ? '800' : '700'} fill={isCur ? color : '#9BA3B2'}>{i + 1}</text>
            </g>
          )
        })}
        {avgScore != null && (
          <>
            <line x1={padL} y1={avgY} x2={startX + totalW} y2={avgY} stroke="rgba(79,70,229,0.35)" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={startX + totalW + 4} y={avgY + 3} fontSize="8" fontWeight="800" fill="rgba(79,70,229,0.6)">avg {avgScore}%</text>
          </>
        )}
        <line x1={padL} y1={H - padB} x2={startX + totalW} y2={H - padB} stroke="#E8ECF4" strokeWidth="1" />
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {[['#10b981', '≥85% Excellent'], ['#f97316', '65–84% Solid'], ['#ef4444', '<65% Push']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
          </span>
        ))}
      </div>
    </div>
  )
}
