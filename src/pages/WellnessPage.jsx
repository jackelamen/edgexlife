import { useMemo } from 'react'
import { useAsync } from '../hooks/useAsync'
import { useDataWindow } from '../hooks/useDataWindow'
import { fetchWellnessIndex, fetchWellnessCheckins, fetchWellnessNotes } from '../lib/data'
import { pretty, WINDOWS } from '../lib/dates'
import { PageHead, Section, Empty, Loading, ErrorNote, Stat } from '../components/common/Bits'

const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10)
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export default function WellnessPage() {
  // The index is a few hundred bytes and tells us the whole journalling
  // history at a glance, without pulling a single entry's text. It also
  // decides how wide the window needs to be to show anything at all.
  const index = useAsync((f) => fetchWellnessIndex({ force: f }))
  const { win, setWin, from, to, stale, latestDate } = useDataWindow(index.data?.[0]?.date)

  const checkins = useAsync((f) => fetchWellnessCheckins(from, to, { force: f }), [from, to])
  const notes = useAsync((f) => fetchWellnessNotes({ force: f }))

  const rows = checkins.data || []
  const totalEntries = (index.data || []).reduce((n, d) => n + d.entries, 0)

  const stats = useMemo(() => ({
    mood: r1(mean(rows.map((r) => r.mood).filter((x) => x != null))),
    stress: r1(mean(rows.map((r) => r.stress).filter((x) => x != null))),
    clarity: r1(mean(rows.map((r) => r.clarity).filter((x) => x != null))),
  }), [rows])

  const byDate = useMemo(() => {
    const m = new Map()
    rows.forEach((c) => {
      if (!m.has(c.date)) m.set(c.date, [])
      m.get(c.date).push(c)
    })
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [rows])

  const openThoughts = (notes.data?.thoughts || []).filter((t) => !t.done)

  return (
    <>
      <PageHead
        eyebrow="Mind"
        title="What you've been carrying"
        sub="Check-ins, loops and reframes from the Wellness module. Entries load a window at a time, so opening this page costs a few kilobytes rather than a few hundred."
        right={<WindowPicker value={win} onChange={setWin} />}
      />

      <ErrorNote error={checkins.error || index.error} />
      <div className="sm:hidden mb-6"><WindowPicker value={win} onChange={setWin} /></div>

      {stale && (
        <p
          className="mb-6 px-4 py-3 rounded-[9px] text-[13px]"
          style={{ background: 'var(--ochre-soft)', color: 'var(--ochre)' }}
        >
          Your last check-in was {pretty(latestDate)}. The window opened wide
          enough to include it.
        </p>
      )}

      <Section
        title="This window"
        note={index.data ? `${totalEntries} entries across ${index.data.length} days on record` : null}
      >
        <div className="grid gap-3 grid-cols-3">
          <Stat label="Mood" value={stats.mood} unit="/5" />
          <Stat label="Stress" value={stats.stress} unit="/5" />
          <Stat label="Clarity" value={stats.clarity} unit="/5" />
        </div>
      </Section>

      {openThoughts.length > 0 && (
        <Section title="Open loops" note={`${openThoughts.length} unresolved`}>
          <div className="lf-card divide-y" style={{ borderColor: 'var(--line)' }}>
            {openThoughts.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-start gap-3">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                  style={{ background: 'var(--ochre)' }}
                />
                <div className="min-w-0">
                  <p className="text-[14px] leading-[1.55]">{t.text}</p>
                  {t.type && <span className="lf-eyebrow">{t.type}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Journal" note={rows.length ? `${rows.length} entries in ${win.label.toLowerCase()}` : null}>
        {checkins.loading ? (
          <Loading label="Reading check-ins" />
        ) : byDate.length === 0 ? (
          <Empty>No check-ins in the last {win.label.toLowerCase()}.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {byDate.map(([date, entries]) => (
              <article key={date} className="lf-card px-5 py-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-[15px]">{pretty(date)}</h3>
                  <span className="text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  {entries.map((c) => (
                    <Entry key={c.id} c={c} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      {notes.data?.practices?.length > 0 && (
        <Section title="Practices">
          <div className="lf-card divide-y" style={{ borderColor: 'var(--line)' }}>
            {notes.data.practices.slice(0, 30).map((p) => (
              <div key={p.id} className="px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13.5px]">
                <span className="w-[110px] shrink-0" style={{ color: 'var(--ink-3)' }}>{p.date}</span>
                <span>{p.type}</span>
                {p.minutes != null && (
                  <span style={{ color: 'var(--ink-3)' }}>{p.minutes} min</span>
                )}
                {p.note && <span className="basis-full" style={{ color: 'var(--ink-3)' }}>{p.note}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function Entry({ c }) {
  const scores = [
    c.mood != null && `mood ${c.mood}`,
    c.stress != null && `stress ${c.stress}`,
    c.clarity != null && `clarity ${c.clarity}`,
  ].filter(Boolean)

  return (
    <div>
      {(c.state || scores.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
          {c.state && (
            <span
              className="px-2 py-0.5 rounded-full text-[11.5px] font-medium"
              style={{ background: 'var(--ever-mist)', color: 'var(--ever-deep)' }}
            >
              {c.state}
            </span>
          )}
          <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
            {scores.join(' · ')}
          </span>
        </div>
      )}
      {c.loop && (
        <p className="text-[14px] leading-[1.6] mb-2">
          <span className="lf-eyebrow block mb-1">The loop</span>
          {c.loop}
        </p>
      )}
      {c.reframe && (
        <p
          className="text-[14px] leading-[1.6] pl-3 border-l-2"
          style={{ borderColor: 'var(--ever-soft)', color: 'var(--ink-2)' }}
        >
          <span className="lf-eyebrow block mb-1">Reframe</span>
          {c.reframe}
        </p>
      )}
    </div>
  )
}

function WindowPicker({ value, onChange }) {
  return (
    <div className="inline-flex rounded-[9px] overflow-hidden border" style={{ borderColor: 'var(--line-2)' }}>
      {WINDOWS.map((w) => (
        <button
          key={w.key}
          onClick={() => onChange(w)}
          className="px-3 py-1.5 text-[13px] font-medium"
          style={{
            background: w.key === value.key ? 'var(--ever-mist)' : 'var(--surface)',
            color: w.key === value.key ? 'var(--ever-deep)' : 'var(--ink-3)',
          }}
        >
          {w.label}
        </button>
      ))}
    </div>
  )
}
