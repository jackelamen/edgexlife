import { dateKey } from '../../lib/dates'
import { num } from '../../lib/outcomes'

const DAY = 86400000
const dayNum = (iso) => Math.round(new Date(`${iso}T00:00:00`).getTime() / DAY)

/*
  Expected line vs what you actually logged, across one cycle.

  The dashed line runs from the metric's baseline on the cycle's first day
  to its target on the last. The solid line is the logged values. Reading
  it is the whole interaction: solid above the dashed line (for a metric
  going up) or below it (going down) means ahead, and the gap is how much.
  Y is scaled to the data, not to zero, so a weight that moves 3 kg across
  a 90 kg baseline is still visible.
*/
export default function PaceChart({ metric, logs, sprint, color = 'var(--accent)', height = 84 }) {
  const target = num(metric.target)
  const start = num(metric.start_value) ?? 0
  if (target == null || !sprint?.start_date || !sprint?.end_date) return null

  const d0 = dayNum(sprint.start_date)
  const d1 = dayNum(sprint.end_date) + 1
  const span = Math.max(1, d1 - d0)
  const points = (logs || [])
    .filter((l) => l.metric_id === metric.id && l.log_date >= sprint.start_date && l.log_date <= sprint.end_date)
    .sort((a, b) => (a.log_date < b.log_date ? -1 : 1))
    .map((l) => ({ x: (dayNum(l.log_date) - d0) / span, v: Number(l.value) }))
  const todayX = Math.max(0, Math.min(1, (dayNum(dateKey()) - d0) / span))

  const vals = [start, target, ...points.map((p) => p.v)]
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const pad = (hi - lo || 1) * 0.12
  const W = 300, H = height, L = 6, R = 6, T = 8, B = 8
  const X = (x) => L + x * (W - L - R)
  const Y = (v) => T + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (H - T - B)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`${metric.name}: logged values against the expected pace`} style={{ display: 'block' }}>
      <line x1={X(todayX)} x2={X(todayX)} y1={T} y2={H - B} stroke="var(--border-med)" strokeWidth="1" />
      <line x1={X(0)} y1={Y(start)} x2={X(1)} y2={Y(target)}
        stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 4" />
      {points.length > 1 && (
        <polyline fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round"
          points={points.map((p) => `${X(p.x)},${Y(p.v)}`).join(' ')} />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.v)} r={i === points.length - 1 ? 3.6 : 2.4} fill={color} />
      ))}
    </svg>
  )
}
