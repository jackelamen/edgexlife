import { useEffect, useRef, useState } from 'react'

/*
  Trend chart: one series over time, drawn 1:1 in real pixels.

  The previous version stretched a fixed 640x160 viewBox to the card width
  with preserveAspectRatio="none", which sheared every circle into an oval,
  smeared the axis text, and squashed the slope of the line. This measures
  the container and draws in true pixel units instead, so nothing distorts
  at any width. It also picks round y-axis ticks, labels the last point
  directly, and carries a crosshair + tooltip on hover rather than a native
  <title> on 90 stacked dots.

  Public API unchanged: points = [{ label, value|null }], plus optional
  target, unit, format.
*/
export default function TrendChart({ points = [], target = null, unit = '', height, format }) {
  const wrapRef = useRef(null)
  const [w, setW] = useState(0)
  const [hoverX, setHoverX] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    setW(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  const valid = points.filter((p) => p.value != null)
  const fmt = format || ((v) => (Math.round(v * 10) / 10).toString())

  // Height tracks width on a gentle ratio, clamped so it never gets
  // letterbox-thin on desktop or tower-tall on a phone.
  const W = w || 640
  const H = height || Math.round(Math.max(220, Math.min(320, W / 3)))

  if (valid.length < 2) {
    return (
      <div ref={wrapRef} className="trend-chart">
        <div style={{ height: H, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13, fontWeight: 600 }}>
          {valid.length === 1 ? `Only one log so far: ${fmt(valid[0].value)}${unit}` : 'Not enough data to chart yet.'}
        </div>
      </div>
    )
  }

  const vals = valid.map((p) => p.value)
  const dataMin = Math.min(...vals, target ?? Infinity)
  const dataMax = Math.max(...vals, target ?? -Infinity)
  const ticks = niceTicks(dataMin, dataMax, 4)

  // Left gutter widens for long y labels ("14,000") so they never clip
  // past the card edge, which the old fixed 34px gutter did.
  const yLabelChars = Math.max(...ticks.map((t) => fmt(t).length))
  const PAD_L = Math.round(16 + yLabelChars * 6.4 + 8)
  const PAD_R = 18
  const PAD_T = 16
  const PAD_B = 26
  const plotW = Math.max(40, W - PAD_L - PAD_R)
  const plotH = Math.max(40, H - PAD_T - PAD_B)
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]

  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const n = points.length - 1 || 1
  const x = (i) => PAD_L + (i / n) * plotW
  const y = (v) => PAD_T + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH

  const idx = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null)
  const line = idx.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const last = idx[idx.length - 1]
  const area = `${line} L${x(last.i).toFixed(1)},${(H - PAD_B).toFixed(1)} L${x(idx[0].i).toFixed(1)},${(H - PAD_B).toFixed(1)} Z`

  // 4-ish evenly spaced date labels, first and last always included.
  const labelCount = Math.min(idx.length, Math.max(2, Math.floor(plotW / 120)))
  const seen = new Set()
  const xLabelIdx = Array.from({ length: labelCount }, (_, k) =>
    idx[Math.round((k / (labelCount - 1)) * (idx.length - 1))])
    .filter((p) => p && !seen.has(p.i) && seen.add(p.i))

  const hover = hoverX == null ? null : nearest(idx, hoverX, x)
  const tip = hover && {
    left: x(hover.i),
    top: y(hover.value),
    label: hover.label,
    text: `${fmt(hover.value)}${unit}`,
    flip: x(hover.i) > W * 0.62,
  }

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width)
    setHoverX(px)
  }

  return (
    <div ref={wrapRef} className="trend-chart" style={{ position: 'relative' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="tcArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line className="tc-grid" x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} />
            <text className="tc-ytick" x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>
          </g>
        ))}

        <line className="tc-avg" x1={PAD_L} x2={W - PAD_R} y1={y(avg)} y2={y(avg)} />
        <text className="tc-avg-lbl" x={PAD_L + 2} y={y(avg)} dy={y(avg) < PAD_T + 14 ? '1.1em' : '-0.5em'}>
          avg {fmt(avg)}
        </text>

        {target != null && (
          <>
            <line className="tc-target" x1={PAD_L} x2={W - PAD_R} y1={y(target)} y2={y(target)} />
            <text className="tc-target-lbl" x={W - PAD_R} y={y(target)} dy="-0.5em" textAnchor="end">
              target {fmt(target)}
            </text>
          </>
        )}

        <path d={area} fill="url(#tcArea)" />
        <path className="tc-line" d={line} vectorEffect="non-scaling-stroke" />

        {xLabelIdx.map((p) => (
          <text key={p.i} className="tc-xtick" x={clamp(x(p.i), PAD_L, W - PAD_R)} y={H - 8}
            textAnchor={p.i === idx[0].i ? 'start' : p.i === last.i ? 'end' : 'middle'}>
            {p.label}
          </text>
        ))}

        {!hover && <circle className="tc-end-dot" cx={x(last.i)} cy={y(last.value)} r="3.5" />}

        {hover && (
          <>
            <line className="tc-focus" x1={x(hover.i)} x2={x(hover.i)} y1={PAD_T} y2={H - PAD_B} />
            <circle className="tc-focus-dot" cx={x(hover.i)} cy={y(hover.value)} r="4.5" />
          </>
        )}

        <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="transparent"
          style={{ touchAction: 'pan-y' }}
          onMouseMove={onMove} onMouseLeave={() => setHoverX(null)}
          onTouchStart={onMove} onTouchMove={onMove} onTouchEnd={() => setHoverX(null)} />
      </svg>

      {tip && (
        <div className={`tc-tip${tip.flip ? ' flip' : ''}`} style={{
          left: `${(tip.left / W) * 100}%`,
          top: tip.top,
          transform: `translate(${tip.flip ? '-100%' : '0'}, calc(-100% - 10px))`,
          marginLeft: tip.flip ? -8 : 8,
        }}>
          <span className="tc-tip-v">{tip.text}</span>
          <span className="tc-tip-d">{tip.label}</span>
        </div>
      )}
    </div>
  )
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function nearest(idx, px, x) {
  let best = idx[0]
  let bestD = Infinity
  for (const p of idx) {
    const d = Math.abs(x(p.i) - px)
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

/* Round, human y-axis ticks (0, 25, 50, 75 rather than 4, 61, 118).
   Never forces a zero baseline — a 40-to-110 rep series shouldn't waste
   half the panel on empty space below it. */
function niceTicks(min, max, count) {
  if (!isFinite(min) || !isFinite(max)) return [0, 1]
  if (min === max) { min -= 1; max += 1 }
  const step = niceNum((max - min) / Math.max(1, count - 1), true)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out = []
  for (let v = lo; v <= hi + step * 0.5; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out.length >= 2 ? out : [lo, lo + step]
}

function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range || 1))
  const frac = (range || 1) / 10 ** exp
  let nf
  if (round) nf = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10
  else nf = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nf * 10 ** exp
}
