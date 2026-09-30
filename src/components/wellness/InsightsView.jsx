import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../ui/Icon'
import { Card, CardHead, Badge, Empty, Field, CoachCard, useConfirm, undoToast } from '../ui/Kit'
import { saveThought, deleteThought, newId } from '../../lib/data'
import { PRACTICE_TYPES, RESET_TOOLS } from '../../lib/practices'
import { today, pretty } from '../../lib/dates'
import {
  practiceEffects, triggerInsights, emotionCounts, rhythmInsights, practiceDayInsight,
  helpfulReframes, weeklyInsight, evaluateExperiment, EXPERIMENT_LENGTHS, MIN_SESSIONS,
} from '../../lib/wellnessInsights'

const EXPERIMENT_PRACTICES = [...new Set([...PRACTICE_TYPES.filter((t) => t !== 'Other'), ...RESET_TOOLS.map((t) => t.title)])]

/* Insights: everything Wellness has learned about YOU. Each block states
   its sample size and says "early" until there is enough behind it, so a
   handful of days never reads as a finding. */
export default function InsightsView({ history, notes, onNav, onChanged, children }) {
  const checkins = history || []
  const practices = notes.data?.practices || []
  const experiments = useMemo(
    () => (notes.data?.allThoughts || []).filter((t) => t.kind === 'experiment' && t.exp), [notes.data])

  const effects = useMemo(() => practiceEffects(practices), [practices])
  const insight = useMemo(() => weeklyInsight({ checkins, practices }), [checkins, practices])
  const triggers = useMemo(() => triggerInsights(checkins), [checkins])
  const feelings = useMemo(() => emotionCounts(checkins), [checkins])
  const rhythm = useMemo(() => rhythmInsights(checkins), [checkins])
  const practiceDay = useMemo(() => practiceDayInsight(checkins, practices), [checkins, practices])
  const reframes = useMemo(() => helpfulReframes(checkins), [checkins])
  const ratedSessions = effects.reduce((s, e) => s + e.n, 0)

  return (
    <>
      {insight ? (
        <CoachCard kicker={insight.kicker} title={insight.title}>{insight.body}</CoachCard>
      ) : (
        <CoachCard kicker="Getting started" title="Insights appear as you log.">
          Add feelings and triggers to your check-ins and rate how settled you are before and after a practice.
          After a couple of weeks this page starts telling you what actually works.
        </CoachCard>
      )}

      <div style={{ height: 14 }} />
      <Card>
        <CardHead title="What works for you"
          sub="Average change in how settled you feel, before to after each practice."
          right={<Badge tone="purple">{ratedSessions} rated</Badge>} />
        {!effects.some((e) => e.n > 0) ? (
          <Empty icon="self_improvement" title="No rated sessions yet">
            Rate how settled you are before and after a reset or breath session. Once a practice has {MIN_SESSIONS} rated sessions it shows up here.
          </Empty>
        ) : (
          <div>
            {effects.filter((e) => e.n > 0).map((e) => {
              const pct = Math.min(50, (Math.abs(e.avgDelta) / 4) * 50)
              const good = e.avgDelta >= 0
              return (
                <div key={e.type} className="fx-row">
                  <div className="fx-name">{e.type}
                    <small>{e.n} rated · helped {e.helpedPct}%{e.goodPct != null ? ` · felt clearer/calmer ${e.goodPct}%` : ''}</small>
                  </div>
                  <div className="fx-bar" aria-hidden>
                    <div className="fx-mid" />
                    <span style={{
                      left: good ? '50%' : `${50 - pct}%`, width: `${pct}%`,
                      background: good ? 'var(--accent)' : 'var(--s-short, #d98a3d)',
                    }} />
                  </div>
                  <Badge tone={e.n < MIN_SESSIONS ? 'blue' : e.avgDelta >= 0.5 ? 'green' : e.avgDelta > 0 ? 'orange' : 'red'}>
                    {e.avgDelta > 0 ? '+' : ''}{e.avgDelta}{e.n < MIN_SESSIONS ? ' · early' : e.reliable ? '' : ' · building'}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
        {practiceDay && practiceDay.diff > 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 12 }}>
            Across the board, clarity averages {practiceDay.yesAvg} on days you practiced vs {practiceDay.noAvg} on days you didn't
            ({practiceDay.yesN} vs {practiceDay.noN} days).
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5" style={{ margin: '14px 0' }}>
        <Card>
          <CardHead title="What you feel, and why" sub="From your check-ins over the last 90 days." />
          {!feelings.length ? (
            <Empty icon="psychology" title="No feelings logged yet">Pick a few feelings and a trigger on your next check-in.</Empty>
          ) : (
            <>
              <div className="pick-group-label" style={{ marginTop: 0 }}>Most frequent</div>
              <div className="pick-chips">
                {feelings.map((f) => <span key={f.label} className="pick-chip">{f.label} · {f.n}</span>)}
              </div>
              <div className="pick-group-label">Triggers vs your usual clarity</div>
              {!triggers.length ? (
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>A trigger needs 4 tagged check-ins before it is compared.</p>
              ) : triggers.map((t) => (
                <div key={t.name} className="fx-row" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="fx-name">{t.name}<small>{t.n} check-ins · avg clarity {t.avg}</small></div>
                  <Badge tone={t.diff <= -6 ? 'red' : t.diff >= 6 ? 'green' : 'blue'}>{t.diff > 0 ? '+' : ''}{t.diff}</Badge>
                </div>
              ))}
            </>
          )}
        </Card>

        <Card>
          <CardHead title="Your rhythm" sub="When you tend to be clearest." />
          {!rhythm.length ? (
            <Empty icon="schedule" title="No clear rhythm yet">Needs about 4 check-ins in each time of day or weekday to compare.</Empty>
          ) : rhythm.map((r) => (
            <div key={r.unit} style={{ padding: '8px 0', fontSize: 13.5 }}>
              <strong>Best {r.unit}: {r.high}.</strong>{' '}
              <span style={{ color: 'var(--text-2)' }}>{r.gap} points above {r.low} ({r.nHigh} vs {r.nLow} check-ins).</span>
            </div>
          ))}
          {reframes.length > 0 && (
            <>
              <div className="pick-group-label">Reframes that helped</div>
              {reframes.map((r, i) => (
                <div key={i} style={{ fontSize: 13, padding: '6px 0' }}>
                  <span style={{ color: 'var(--text-3)' }}>{pretty(r.date)} · </span>{r.reframe}
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      <Experiments experiments={experiments} checkins={checkins} practices={practices}
        onNav={onNav} onChanged={onChanged} />

      <div style={{ height: 14 }} />
      {children}
    </>
  )
}

function Experiments({ experiments, checkins, practices, onNav, onChanged }) {
  const [practiceType, setPracticeType] = useState(EXPERIMENT_PRACTICES[0])
  const [days, setDays] = useState(7)
  const confirm = useConfirm()
  const t = today()

  async function start() {
    const title = `${practiceType} daily for ${days} days`
    await saveThought({
      id: newId('t'), text: title, type: 'Experiment', kind: 'experiment', done: false,
      exp: { practiceType, days, start: t, title },
    })
    toast.success('Experiment started')
    onChanged()
  }

  const live = experiments.filter((e) => !e.done)
  const past = experiments.filter((e) => e.done)

  return (
    <Card>
      <CardHead title="Experiments" sub="Try one practice for a set stretch, then see what it did to your clarity." />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_140px_auto] gap-3" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
        <Field label="Practice">
          <select value={practiceType} onChange={(e) => setPracticeType(e.target.value)}>
            {EXPERIMENT_PRACTICES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="For">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {EXPERIMENT_LENGTHS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </Field>
        <button className="btn btn-primary" onClick={start}><Icon name="science" size={17} /> Start</button>
      </div>

      {!experiments.length && (
        <Empty icon="science" title="No experiments yet">
          One practice, one clear window, compared with the 14 days before. Small and honest.
        </Empty>
      )}

      <div className="mini-list">
        {live.map((e) => <ExperimentRow key={e.id} e={e} checkins={checkins} practices={practices}
          t={t} onNav={onNav} onChanged={onChanged} confirm={confirm} />)}
        {past.map((e) => <ExperimentRow key={e.id} e={e} checkins={checkins} practices={practices}
          t={t} onNav={onNav} onChanged={onChanged} confirm={confirm} />)}
      </div>
    </Card>
  )
}

function ExperimentRow({ e, checkins, practices, t, onNav, onChanged, confirm }) {
  const r = evaluateExperiment(e.exp, checkins, practices, t)
  const finished = e.done || r.complete
  const isReset = RESET_TOOLS.some((x) => x.title === e.exp.practiceType)

  let verdict = null
  if (finished) {
    if (r.delta == null) verdict = 'Not enough check-ins during or before the run to compare. Log a check-in most days next time.'
    else if (r.adherence < 50) verdict = `You did it on ${r.done} of ${r.elapsed} days, too few to judge. Clarity was ${r.delta > 0 ? '+' : ''}${r.delta} vs before, but it isn't a fair test.`
    else verdict = `Clarity averaged ${r.duringAvg} during vs ${r.beforeAvg} before (${r.delta > 0 ? '+' : ''}${r.delta}), with ${r.done} of ${r.elapsed} days practiced. ${r.delta >= 5 ? 'Worth keeping.' : r.delta <= -5 ? 'It did not help here.' : 'No clear change.'}`
  }

  return (
    <div className="exp-card" style={finished ? { opacity: .85 } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <strong style={{ fontSize: 14 }}>{e.exp.title}</strong>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {pretty(e.exp.start)} to {pretty(r.end)} · {r.done} of {r.elapsed || e.exp.days} days done
          </div>
        </div>
        <Badge tone={finished ? 'blue' : r.onToday ? 'green' : 'orange'}>
          {finished ? 'Finished' : r.onToday ? 'Done today' : 'Due today'}
        </Badge>
      </div>
      {verdict && <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>{verdict}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {!finished && !r.onToday && (
          <button className="btn btn-secondary btn-sm" onClick={() => onNav(isReset ? 'reset' : 'meditate')}>
            <Icon name="play_arrow" size={15} /> Do it now
          </button>
        )}
        {!e.done && r.complete && (
          <button className="btn btn-secondary btn-sm" onClick={async () => { await saveThought({ ...e, done: true }); onChanged() }}>
            <Icon name="check" size={15} /> Archive
          </button>
        )}
        <button className={`btn btn-sm ${confirm.isArmed(e.id) ? 'btn-danger' : 'btn-ghost'}`}
          onClick={async () => {
            if (!confirm.isArmed(e.id)) return confirm.arm(e.id)
            await deleteThought(e.id); onChanged()
            undoToast('Experiment deleted', async () => { await saveThought(e); onChanged() })
          }}>
          {confirm.isArmed(e.id) ? 'Tap again to delete' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
