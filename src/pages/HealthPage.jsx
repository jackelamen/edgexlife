import { useMemo } from 'react'
import { useAsync } from '../hooks/useAsync'
import { useDataWindow } from '../hooks/useDataWindow'
import { fetchHealthIndex, fetchHealthLogs, fetchHealthSettings } from '../lib/data'
import { WINDOWS, daysAgo, prettyShort, pretty } from '../lib/dates'
import { PageHead, Section, Empty, Loading, ErrorNote, Stat } from '../components/common/Bits'
import Sparkline from '../components/health/Sparkline'

const avg = (rows, k) => {
  const v = rows.map((r) => r[k]).filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

export default function HealthPage() {
  const index = useAsync((f) => fetchHealthIndex({ force: f }))
  const { win, setWin, from, to, stale, latestDate } = useDataWindow(index.data?.[0])

  const logs = useAsync((f) => fetchHealthLogs(from, to, { force: f }), [from, to])
  const settings = useAsync((f) => fetchHealthSettings({ force: f }))

  const rows = logs.data || []
  const s = settings.data
  const latest = rows[0]

  const series = useMemo(() => [...rows].reverse(), [rows])

  const exerciseThisWeek = useMemo(() => {
    const cut = daysAgo(7)
    return rows.filter((r) => r.date >= cut).reduce((n, r) => n + (r.exerciseMins || 0), 0)
  }, [rows])

  return (
    <>
      <PageHead
        eyebrow="Body"
        title="How the last stretch actually went"
        sub="Sleep, movement, weight and energy from the Health module. Every read is bounded to the window you pick — nothing pulls your whole history by default."
        right={<WindowPicker value={win} onChange={setWin} />}
      />

      <ErrorNote error={logs.error} />
      <div className="sm:hidden mb-6"><WindowPicker value={win} onChange={setWin} /></div>

      {stale && (
        <p
          className="mb-6 px-4 py-3 rounded-[9px] text-[13px]"
          style={{ background: 'var(--ochre-soft)', color: 'var(--ochre)' }}
        >
          Your last health log was {pretty(latestDate)}. The window opened wide
          enough to include it.
        </p>
      )}

      {logs.loading ? (
        <Loading label="Reading health logs" />
      ) : rows.length === 0 ? (
        <Empty>No health logs in the last {win.label.toLowerCase()}.</Empty>
      ) : (
        <>
          <Section title="Averages" note={`${rows.length} logged days`}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Sleep"
                value={r1(avg(rows, 'sleepHours'))}
                unit="hrs"
                hint={s ? `target ${s.sleepTarget}` : null}
              />
              <Stat
                label="Steps"
                value={avg(rows, 'steps') ? Math.round(avg(rows, 'steps')).toLocaleString() : null}
                hint={s ? `target ${s.stepTarget.toLocaleString()}` : null}
              />
              <Stat
                label="Exercise, 7d"
                value={exerciseThisWeek || null}
                unit="min"
                hint={s ? `target ${s.weeklyExerciseTarget}` : null}
                live
              />
              <Stat
                label="Weight"
                value={r1(latest?.weight)}
                unit="kg"
                hint={latest ? `on ${prettyShort(latest.date)}` : null}
              />
            </div>
          </Section>

          <Section title="Trends">
            <div className="grid gap-3 lg:grid-cols-2">
              <TrendCard title="Sleep" unit="hrs" data={series} field="sleepHours" target={s?.sleepTarget} />
              <TrendCard title="Steps" data={series} field="steps" target={s?.stepTarget} />
              <TrendCard title="Weight" unit="kg" data={series} field="weight" />
              <TrendCard title="Energy" unit="/5" data={series} field="energy" />
            </div>
          </Section>

          <Section title="Log" note="most recent first">
            <div className="lf-card divide-y" style={{ borderColor: 'var(--line)' }}>
              {rows.slice(0, 40).map((r) => (
                <div key={r.date} className="px-4 py-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <span className="text-[13px] w-[130px] shrink-0" style={{ color: 'var(--ink-2)' }}>
                    {pretty(r.date)}
                  </span>
                  {r.sleepHours != null && <Chip label="sleep" v={`${r.sleepHours}h`} />}
                  {r.steps != null && <Chip label="steps" v={r.steps.toLocaleString()} />}
                  {r.exerciseMins != null && r.exerciseMins > 0 && (
                    <Chip label="exercise" v={`${r.exerciseMins}m ${r.exerciseTypes.join(', ')}`} />
                  )}
                  {r.weight != null && <Chip label="weight" v={`${r.weight}kg`} />}
                  {r.notes && (
                    <span className="text-[13px] basis-full" style={{ color: 'var(--ink-3)' }}>
                      {r.notes}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </>
  )
}

function Chip({ label, v }) {
  return (
    <span className="text-[13px]">
      <span style={{ color: 'var(--ink-4)' }}>{label} </span>
      {v}
    </span>
  )
}

function TrendCard({ title, unit, data, field, target }) {
  const points = data.map((d) => d[field])
  const has = points.some((p) => p != null)
  return (
    <div className="lf-card px-4 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="lf-eyebrow">{title}</span>
        {target != null && (
          <span className="text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
            target {target}
          </span>
        )}
      </div>
      {has ? (
        <Sparkline values={points} target={target} unit={unit} labels={data.map((d) => d.date)} />
      ) : (
        <p className="text-[13px] py-4" style={{ color: 'var(--ink-4)' }}>Nothing logged.</p>
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
