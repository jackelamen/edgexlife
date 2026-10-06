/**
 * Area-balance donut. data = [{label, color, value}]
 *
 * Thin ring with rounded, slightly separated segments (the old one was a
 * thick butt-capped wheel). With a single segment it closes into a plain ring.
 */
export default function DonutChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return null
  const stroke = 10
  const cx = size / 2, cy = size / 2, r = (size - stroke) / 2 - 2
  const circumference = 2 * Math.PI * r
  const gap = data.length > 1 ? 5 : 0
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--white-soft)" strokeWidth={stroke} />
      {data.map((d) => {
        const pct = d.value / total
        // Round caps add stroke/2 to each end, so shorten the dash by one
        // stroke (plus the gap) and nudge it forward by half a stroke.
        const dash = Math.max(0.01, pct * circumference - (gap ? stroke + gap : 0))
        const start = offset * circumference + (gap ? (stroke + gap) / 2 : 0)
        const el = (
          <circle key={d.label} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={stroke}
            strokeDasharray={`${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`}
            strokeDashoffset={(-start + circumference / 4).toFixed(2)}
            strokeLinecap={gap ? 'round' : 'butt'} style={{ transition: 'stroke-dashoffset .6s ease' }} />
        )
        offset += pct
        return el
      })}
      <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={size * 0.24} fontWeight="600" fill="var(--text)"
        style={{ letterSpacing: '-.03em' }}>{data.length}</text>
    </svg>
  )
}
