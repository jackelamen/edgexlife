/*
  Small drawing helpers shared by the charts (TrendChart, PaceChart, the
  Today sparklines). Kept dependency-free on purpose: the app draws plain
  SVG, and a charting library would be a lot of weight for a handful of
  line charts.
*/

/** Slope at the middle of three points, clamped so a curve never overshoots them. */
function slope3(x0, y0, x1, y1, x2, y2) {
  const h0 = x1 - x0
  const h1 = x2 - x1
  const s0 = (y1 - y0) / (h0 || (h1 < 0 ? -0 : 0))
  const s1 = (y2 - y1) / (h1 || (h0 < 0 ? -0 : 0))
  const p = (s0 * h1 + s1 * h0) / ((h0 + h1) || 1)
  return (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
}

function slope2(x0, y0, x1, y1, t) {
  const h = x1 - x0
  return h ? (3 * (y1 - y0) / h - t) / 2 : t
}

/**
 * SVG path through [[x, y], ...] as a monotone cubic curve: smooth like a
 * spline, but it never swings above a peak or below a trough the way a plain
 * spline does, so the line can't suggest a value that wasn't logged.
 * Straight segments (the old look) read as a jagged polyline; this reads as
 * a continuous shape.
 */
export function smoothPath(pts) {
  const n = pts.length
  if (n === 0) return ''
  const f = (v) => v.toFixed(1)
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`
  if (n === 2) return `M${f(pts[0][0])},${f(pts[0][1])} L${f(pts[1][0])},${f(pts[1][1])}`

  const t = new Array(n)
  for (let i = 1; i < n - 1; i++) {
    t[i] = slope3(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
  }
  t[0] = slope2(pts[0][0], pts[0][1], pts[1][0], pts[1][1], t[1])
  t[n - 1] = slope2(pts[n - 2][0], pts[n - 2][1], pts[n - 1][0], pts[n - 1][1], t[n - 2])

  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const dx = (x1 - x0) / 3
    d += ` C${f(x0 + dx)},${f(y0 + dx * t[i])} ${f(x1 - dx)},${f(y1 - dx * t[i + 1])} ${f(x1)},${f(y1)}`
  }
  return d
}

/** Rolling mean over `win` neighbouring values (centred, shrinking at the ends). */
export function rollingMean(values, win = 7) {
  const half = Math.floor(win / 2)
  return values.map((_, i) => {
    const from = Math.max(0, i - half)
    const to = Math.min(values.length, i + half + 1)
    let sum = 0
    for (let k = from; k < to; k++) sum += values[k]
    return sum / (to - from)
  })
}
