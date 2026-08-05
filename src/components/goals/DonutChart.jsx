/** Area-balance donut, ported from goals.html's donutHTML. data = [{label, color, value}] */
export default function DonutChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return null
  const cx = size / 2, cy = size / 2, r = (size - 20) / 2, stroke = 14
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d) => {
        const pct = d.value / total
        const dash = pct * circumference
        const el = (
          <circle key={d.label} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={stroke}
            strokeDasharray={`${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`}
            strokeDashoffset={(-offset * circumference + circumference / 4).toFixed(2)}
            strokeLinecap="butt" style={{ transition: 'stroke-dashoffset .6s ease' }} />
        )
        offset += pct
        return el
      })}
      <circle cx={cx} cy={cy} r={r - stroke / 2 - 2} fill="var(--white)" stroke="none" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text)">{data.length}</text>
    </svg>
  )
}
