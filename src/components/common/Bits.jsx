import { AlertCircle } from 'lucide-react'

export function PageHead({ eyebrow, title, sub, right }) {
  return (
    <header className="flex items-end justify-between gap-6 mb-7 lf-settle">
      <div>
        {eyebrow && <div className="lf-eyebrow mb-2">{eyebrow}</div>}
        {/* The hook: one large, quiet headline. No hero card, no gradient. */}
        <h1 className="text-[27px] lg:text-[34px] leading-[1.12]">{title}</h1>
        {sub && (
          <p className="mt-2 text-[14px] max-w-[52ch]" style={{ color: 'var(--ink-2)' }}>
            {sub}
          </p>
        )}
      </div>
      {right && <div className="shrink-0 hidden sm:block">{right}</div>}
    </header>
  )
}

export function Section({ title, note, children, className = '' }) {
  return (
    <section className={`mb-9 ${className}`}>
      {(title || note) && (
        <div className="flex items-baseline justify-between gap-4 mb-3">
          {title && <h2 className="text-[17px]">{title}</h2>}
          {note && (
            <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
              {note}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ children }) {
  return (
    <div
      className="lf-card px-5 py-7 text-[14px] text-center"
      style={{ color: 'var(--ink-3)', background: 'var(--surface-sunk)', boxShadow: 'none' }}
    >
      {children}
    </div>
  )
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="py-8 text-[13px]" style={{ color: 'var(--ink-4)' }}>
      {label}…
    </div>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3 rounded-[9px] text-[13px] mb-4"
      style={{ background: 'var(--clay-soft)', color: 'var(--clay)' }}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{error.message || String(error)}</span>
    </div>
  )
}

/** Small numeric readout. Ochre only when this is today's live value. */
export function Stat({ label, value, unit, hint, live = false }) {
  return (
    <div className="lf-card px-4 py-3.5">
      <div className="lf-eyebrow mb-1.5">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className="lf-display text-[24px]"
          style={{ color: live ? 'var(--ochre)' : 'var(--ink)' }}
        >
          {value ?? '—'}
        </span>
        {unit && value != null && (
          <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>{unit}</span>
        )}
      </div>
      {hint && (
        <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>{hint}</div>
      )}
    </div>
  )
}
