import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { metric, statusFor, statusColor, METRICS, STATUS, DESIGN_RULES } from '../../lib/design'

/*
  Component vocabulary for design system v3. The rules these components
  encode live in src/lib/design.js — read that first.

  In short: anything that identifies a metric takes its colour from
  design.js (`hue = identity`); anything that reports performance uses the
  reserved status ramp; and a bar or tile's fill is always a real ratio,
  never a decorative amount.
*/

export function PageHeader({ kicker, title, sub, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
        {kicker && <div className="page-date">{kicker}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap items-center">{actions}</div>}
    </div>
  )
}

export function Card({ children, pad = true, className = '', style }) {
  return (
    <div className={`card${pad ? ' card-pad' : ''}${className ? ' ' + className : ''}`} style={style}>
      {children}
    </div>
  )
}

export function CardHead({ title, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-3.5 mb-3.5 flex-wrap">
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>{title}</h2>
        {sub && <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/**
 * Metric tile.
 *
 * `metricKey` sets the hue (identity — always the same colour for this
 * metric, everywhere). `pct` drives BOTH the fill height (quantity) and
 * the status pill (the only status-coloured element on the tile).
 *
 * Passing no metricKey/pct degrades to a plain figure card, which is what
 * counts like "3 live cycles" want — they aren't measured against a target,
 * so colouring them would be decoration.
 */
export function StatCard({ label, value, sub, metricKey, pct, icon }) {
  const m = metricKey ? metric(metricKey) : null
  const status = pct == null ? null : statusFor(pct)
  const glyph = icon || m?.icon

  return (
    <div className="stat-card">
      {m && pct != null && (
        <div className="tile-fill" style={{ height: `${Math.min(100, Math.max(0, pct))}%`, background: m.tint }} />
      )}
      <div className="tile-top">
        {glyph ? (
          <div className="tile-ic" style={{ background: m ? m.tint : 'var(--white-soft)' }}>
            <Icon name={glyph} size={18} style={{ color: m ? m.color : 'var(--text-2)' }} />
          </div>
        ) : <span />}
        {status && (
          <span className="status-pill" style={{ background: status.color }}>{Math.round(pct)}%</span>
        )}
      </div>
      <div className="tile-bot">
        <div className="stat-label">{label}</div>
        <div className="stat-value tnum">{value ?? '--'}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  )
}

/** Colour legend. Renders the actual METRICS entries, so it can't drift. */
export function MetricLegend({ keys }) {
  const list = (keys || Object.keys(METRICS)).map((k) => ({ k, ...metric(k) }))
  return (
    <div className="legend">
      <span className="legend-lbl">Colour = metric</span>
      {list.map((m) => (
        <span key={m.k} className="legend-item">
          <span className="legend-swatch" style={{ background: m.color }} />
          {m.label}
        </span>
      ))}
    </div>
  )
}

/**
 * The colour system, explained in the app. Rendered from DESIGN_RULES and
 * the live METRICS/STATUS objects in lib/design.js, so it physically cannot
 * describe a system different from the one the app is actually using.
 */
export function DesignLegend() {
  return (
    <Card>
      <CardHead title="How to read the colours" sub="The rules every screen follows." />

      <div className="form-section-label">Metric colours</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px 16px', marginBottom: 18 }}>
        {Object.entries(METRICS).map(([k, m]) => (
          <span key={k} className="legend-item">
            <span className="legend-swatch" style={{ background: m.color }} />
            {m.label}
          </span>
        ))}
      </div>

      <div className="form-section-label">Status colours (reserved)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px 16px', marginBottom: 18 }}>
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="legend-item">
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {DESIGN_RULES.map((r) => (
        <div key={r.title} style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 13, fontWeight: 800, display: 'block', marginBottom: 2 }}>{r.title}</strong>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{r.body}</p>
        </div>
      ))}
    </Card>
  )
}

/**
 * Day dots — status ramp, deliberately. Each entry is a percent (or null
 * for an unlogged day), so the row reads as "how did the last N days go".
 */
export function StatusDots({ values, columns = 14 }) {
  return (
    <div className="dot-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {values.map((v, i) => {
        const s = statusFor(v)
        const cls = v == null ? '' : s === null ? '' : v >= 85 ? ' good' : v >= 60 ? ' short' : ' risk'
        return <div key={i} className={`dot${cls}`} title={v == null ? 'Not logged' : `${Math.round(v)}%`} />
      })}
    </div>
  )
}

export function Badge({ tone = 'blue', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Tabs({ value, onChange, options, variant = 'pill' }) {
  if (variant === 'segment') {
    return (
      <div className="wk-tabs">
        {options.map((o) => (
          <button key={o.value} className={`wk-tab${o.value === value ? ' active' : ''}`}
            onClick={() => onChange(o.value)}>
            {o.icon && <Icon name={o.icon} size={15} />}
            {o.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="tabs">
      {options.map((o) => (
        <button key={o.value} className={`tab${o.value === value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{hint}</span>}
    </div>
  )
}

export function SectionLabel({ children }) {
  return <div className="form-section-label">{children}</div>
}

/** 1–5 slider with a score pill, matching the originals' .range-row. */
export function RangeScale({ label, value, onChange, low, high }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="range" min={1} max={5} step={1} value={value ?? 3}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="score-pill">{value ?? '–'}</span>
      </div>
      {(low || high) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          <span>{low}</span><span>{high}</span>
        </div>
      )}
    </div>
  )
}

export function Empty({ icon = 'inbox', title, children, action }) {
  // Accepts a Material Symbols name, or a React component for the pages
  // still on the older API.
  const Glyph = typeof icon === 'function' ? icon : null
  return (
    <div className="empty">
      <div className="empty-icon">
        {Glyph ? <Glyph size={22} style={{ color: 'var(--accent)' }} /> : <Icon name={icon} size={22} />}
      </div>
      {title && <strong>{title}</strong>}
      {children && <span>{children}</span>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}

export function Loading({ label = 'Loading' }) {
  return <div style={{ padding: '32px 0', fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>{label}…</div>
}

export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <div style={{
      background: 'var(--red-light)', color: '#dc2626', borderRadius: 12,
      padding: '12px 14px', fontSize: 13, fontWeight: 700, marginBottom: 14,
    }}>
      {error.message || String(error)}
    </div>
  )
}

/** Bottom sheet, matching .wk-modal in the originals. */
export function Modal({ open, onClose, title, sub, children, footer, maxWidth = 540, width }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: width || maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 22, lineHeight: 1 }}>
            ×
          </button>
        </div>
        {sub && <p className="sub">{sub}</p>}
        {children}
        {footer && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20,
            paddingTop: 16, borderTop: '1px solid var(--border-med)', flexWrap: 'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

/**
 * Coach card. `chip` optionally states the concrete gap ("+0.8L to target")
 * and takes the relevant metric's hue, so the advice is colour-linked to
 * the thing it's about.
 */
export function CoachCard({ kicker = 'Takeaway', title, children, tone = 'soft', chip, chipIcon, metricKey }) {
  const m = metricKey ? metric(metricKey) : null
  return (
    <div className={`coach-card ${tone}`}>
      <div className="coach-kicker">{kicker}</div>
      <div className="coach-title">{title}</div>
      <p className="coach-copy">{children}</p>
      {chip && (
        <span className="coach-chip" style={m ? { background: m.color } : undefined}>
          {(chipIcon || m?.icon) && <Icon name={chipIcon || m.icon} size={15} style={{ color: '#fff' }} />}
          {chip}
        </span>
      )}
    </div>
  )
}

/**
 * Composite-score ring.
 *
 * On the module hero (`onAccent`) the ring is plain white: it already sits
 * on the module's own colour, and tinting it by performance there would
 * fight the hero. Anywhere else it uses the reserved status ramp — the
 * third and last place status colour is allowed.
 */
export function Ring({ score, size = 150, stroke = 13, sub, onAccent = true }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const val = score == null ? 0 : Math.max(0, Math.min(100, score))
  const color = onAccent ? '#fff' : statusColor(val)

  return (
    <div style={{ width: size, height: size, position: 'relative', marginLeft: 'auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={onAccent ? 'rgba(255,255,255,.24)' : 'var(--white-soft)'} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - val / 100)}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1), stroke .4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div className="tnum" style={{ fontSize: size * 0.3, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>
          {score == null ? '--' : Math.round(score)}
        </div>
        {sub && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', opacity: .72, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  )
}

/**
 * One driver of a composite score. Takes the METRIC's hue (identity) via
 * `metricKey` — the same colour as that metric's tile above it, which is
 * the whole point of the system.
 */
export function ScoreRow({ label, detail, value, weight, metricKey }) {
  const m = metricKey ? metric(metricKey) : null
  return (
    <div className="score-row">
      <div>
        <strong style={{ fontSize: 13, fontWeight: 700 }}>{label}</strong>
        <small style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{detail}</small>
      </div>
      <div className="score-meter" style={m ? { background: m.tint } : undefined}>
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: m ? m.color : undefined }} />
      </div>
      <span className="tnum" style={{ fontSize: 14, fontWeight: 800, textAlign: 'right' }}>
        {Math.round(value)}
        {weight != null && <span className="score-weight" style={{ display: 'block' }}>{Math.round(weight * 100)}% wt</span>}
      </span>
    </div>
  )
}

export function DriverRow({ label, detail, score, hitRate }) {
  return (
    <div className="driver-row">
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <div className="driver-meter"><span style={{ width: `${Math.round(score)}%` }} /></div>
      <span className={`badge badge-${hitRate >= 70 ? 'green' : hitRate >= 40 ? 'orange' : 'red'}`}>{hitRate}%</span>
    </div>
  )
}

/** Two-press confirm for destructive row actions. */
export function useConfirm() {
  const [pending, setPending] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    isArmed: (id) => pending === id,
    arm: (id) => { setPending(id); clearTimeout(timer.current); timer.current = setTimeout(() => setPending(null), 3500) },
    disarm: () => setPending(null),
  }
}

export const Grid = ({ cols = 4, gap = 14, children, style }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, ...style }}
    data-grid={cols}>
    {children}
  </div>
)

/* ────────────────────────────────────────────────────────────
   Compatibility shims.

   Health has been ported to the original design language. Goals and
   Wellness still use the previous component API and are scheduled for
   their own deep pass. These shims map that older API onto the NEW
   styles so those pages stay usable and visually consistent in the
   meantime — they are not the long-term surface. Delete each one as its
   module gets rebuilt.
   ──────────────────────────────────────────────────────────── */

export function Panel({ title, actions, children, className = '', bodyClass }) {
  return (
    <Card pad={false} className={className}>
      {(title || actions) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '14px 18px 0',
        }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{title}</span>
          {actions && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: bodyClass === '' ? '10px 18px 16px' : 18 }}>{children}</div>
    </Card>
  )
}

export function Toolbar({ children, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, marginBottom: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{right}</div>}
    </div>
  )
}

export const Seg = ({ value, onChange, options }) => (
  <Tabs value={value} onChange={onChange} options={options} />
)

export function Scale({ value, onChange, lowLabel, highLabel }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = Number(value) === n
          return (
            <button key={n} type="button" onClick={() => onChange(on ? null : n)}
              style={{
                height: 40, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 14, fontWeight: 800,
                border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-med)'}`,
                background: on ? 'var(--accent)' : 'var(--white-soft)',
                color: on ? '#fff' : 'var(--text-2)',
              }}>
              {n}
            </button>
          )
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          <span>{lowLabel}</span><span>{highLabel}</span>
        </div>
      )}
    </div>
  )
}

export const StatTile = ({ label, value, unit, sub }) => (
  <StatCard label={label} value={value != null && unit ? `${value}${unit}` : value} sub={sub} />
)

export const ScoreRing = ({ score, size = 128, label }) => (
  <div style={{ display: 'inline-block' }}>
    <Ring score={score} size={size} stroke={Math.max(8, size * 0.08)} sub={label} />
  </div>
)

export const ScoreBreakdown = ({ components }) => (
  <div>
    {components.map((c) => (
      <ScoreRow key={c.key} label={c.label} detail={c.detail} value={c.value} weight={c.weight} />
    ))}
  </div>
)

export function NumberInput({ value, onChange, step = 1, min = 0, max, suffix, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <input type="number" inputMode="decimal" step={step} min={min} max={max}
        placeholder={placeholder} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={suffix ? { paddingRight: 38 } : undefined} />
      {suffix && (
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, pointerEvents: 'none',
        }}>{suffix}</span>
      )}
    </div>
  )
}
