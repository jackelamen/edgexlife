/*
  A deliberately plain line: no gradient fill, no dots on every point, no
  tooltip chrome. The target line is the only second element, drawn as a
  hairline dash so the data reads first.
*/
export default function Sparkline({ values, target, unit, labels = [], height = 84 }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null)
  if (pts.length < 2) {
    return (
      <p className="text-[13px] py-4" style={{ color: 'var(--ink-4)' }}>
        Not enough points to chart.
      </p>
    )
  }

  const W = 320
  const H = height
  const PAD = 6

  const vals = pts.map((p) => p.v)
  let min = Math.min(...vals, target ?? Infinity)
  let max = Math.max(...vals, target ?? -Infinity)
  if (min === max) { min -= 1; max += 1 }
  const span = max - min

  const n = values.length - 1 || 1
  const x = (i) => PAD + (i / n) * (W - PAD * 2)
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2)

  const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
        {target != null && (
          <line
            x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)}
            stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={d}
          fill="none"
          stroke="var(--ever)"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Only the most recent reading gets a marker, and it gets the ochre. */}
        <circle cx={x(last.i)} cy={y(last.v)} r="3" fill="var(--ochre)" />
      </svg>
      <div className="flex justify-between mt-1.5 text-[11px]" style={{ color: 'var(--ink-4)' }}>
        <span>{labels[0]?.slice(5)}</span>
        <span style={{ color: 'var(--ink-2)' }}>
          latest {Math.round(last.v * 10) / 10}{unit || ''}
        </span>
        <span>{labels[labels.length - 1]?.slice(5)}</span>
      </div>
    </div>
  )
}
