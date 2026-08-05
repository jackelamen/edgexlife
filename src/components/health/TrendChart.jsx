/*
  Trend chart ported from health.html: gridlines, a dashed orange target line,
  a dashed average line, an area fill under the stroke, and hoverable points
  with a tooltip. The originals' chart was a real chart; the first rebuild
  replaced it with a bare sparkline, which is most of why Trends felt thin.
*/
export default function TrendChart({ points, target, unit = '', height = 160, format }) {
  const valid = points.filter((p) => p.value != null)
  if (valid.length < 2) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, fontWeight: 600 }}>
        Not enough data to chart yet.
      </div>
    )
  }

  const W = 640
  const H = height
  const PAD_L = 34
  const PAD_R = 10
  const PAD_T = 12
  const PAD_B = 22

  const vals = valid.map((p) => p.value)
  let min = Math.min(...vals, target ?? Infinity)
  let max = Math.max(...vals, target ?? -Infinity)
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.12
  min -= pad; max += pad

  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const n = points.length - 1 || 1
  const x = (i) => PAD_L + (i / n) * (W - PAD_L - PAD_R)
  const y = (v) => H - PAD_B - ((v - min) / (max - min)) * (H - PAD_T - PAD_B)

  const idx = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null)
  const line = idx.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(idx[idx.length - 1].i).toFixed(1)},${H - PAD_B} L${x(idx[0].i).toFixed(1)},${H - PAD_B} Z`

  const fmt = format || ((v) => (Math.round(v * 10) / 10).toString())
  const ticks = [max, (max + min) / 2, min]

  return (
    <div className="trend-chart" style={{ minHeight: 0, border: 'none', background: 'none', padding: 0 }}>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
          style={{ overflow: 'visible', display: 'block' }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => (
            <g key={i}>
              <line className="grid-line" x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} />
              <text x={4} y={y(t) + 3} style={{ fontSize: 9, fontWeight: 700, fill: 'var(--text-3)' }}>
                {fmt(t)}
              </text>
            </g>
          ))}

          <line className="avg-line" x1={PAD_L} x2={W - PAD_R} y1={y(avg)} y2={y(avg)} />

          {target != null && (
            <>
              <line className="target" x1={PAD_L} x2={W - PAD_R} y1={y(target)} y2={y(target)} />
              <text x={W - PAD_R} y={y(target) - 4} textAnchor="end"
                style={{ fontSize: 9, fontWeight: 700, fill: 'var(--orange)' }}>
                target {fmt(target)}
              </text>
            </>
          )}

          <path d={area} fill="url(#areaGrad)" />
          <path className="line" d={line} vectorEffect="non-scaling-stroke" />

          {idx.map((p) => (
            <circle key={p.i} className="dot" cx={x(p.i)} cy={y(p.value)} r={3}>
              <title>{`${p.label}: ${fmt(p.value)}${unit}`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="trend-chart-footer" style={{
        display: 'flex', justifyContent: 'space-between', fontSize: 11,
        fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em',
      }}>
        <span>{points[0]?.label}</span>
        <span style={{ color: 'var(--text-2)' }}>avg {fmt(avg)}{unit}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
}
