import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import { Card, CardHead, PageHeader, Empty, Loading, ErrorNote } from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  fetchGoals, fetchSprints, fetchSprintPhases, fetchSprintTactics, fetchWeeklyReviews,
} from '../lib/data'
import { commitmentRate, MIN_RATE_SAMPLE, isSprintActive, scoreColor, scoreBadgeTone } from '../lib/goals'
import { MODULES } from '../lib/design'
import { IDENTITY_STATEMENT, IDENTITY_THREADS } from '../lib/identity'
import { weekIdFor, prevWeekId, prettyWeek } from '../lib/review'
import { today } from '../lib/dates'

/*
  Identity — the fifth module, and deliberately not a sixth thing
  competing with Goals/Health/Wellness/Review. Same standing as Review:
  a surface that sits above the other three rather than beside them, this
  time looking across them through one lens instead of one week.

  It exists because a quiet line on Today and Review (still there — see
  the .north-star class) wasn't "front and center" enough: it restated
  the statement without ever showing whether the app's actual daily work
  serves it. This page is a rollup, not a repeat. Per thread, it shows
  which active Goals are tagged to it (goals.identity_thread, set in
  GoalsPage's editor) and how those goals' live cycles are actually
  executing — not a vibe, the same commitmentRate() everything else on
  Goals is judged by. An untagged, uncovered thread is left visibly
  empty on purpose: that gap IS the signal this page exists to surface.

  Deliberately does NOT compute an "Identity Score." scores.js and
  correlations.js both got a real pass (2026-08-21) for overclaiming —
  dressing up self-report and heuristics as measurement. A single number
  for something as genuinely unquantifiable as character would repeat
  that exact mistake, worse. Coverage is honest; a score wouldn't be. The
  Ring in the hero shows COVERAGE (X of 6 threads tagged), not a score —
  same widget Health/Wellness use for their real scores, repurposed for
  a number that's actually honest to show.

  Visual pass 2026-08-21: the first version of this page was a plain
  bordered white Card for the statement and plain white Cards for every
  thread — technically everything the module needed, but next to Health
  and Wellness's saturated .hero-card treatment it read as an
  afterthought, which undercuts the entire point of the page. Now: the
  statement itself sits in a .hero-card (the same component Health uses
  for its Ring), thread cards get the .tile-ic colour chip pattern
  METRICS tiles already use elsewhere, and each goal's execution gets a
  real .score-meter bar (status-coloured via scoreColor/scoreBadgeTone,
  same helpers Goals uses) instead of a bare percentage badge. Nothing
  here invents new visual language — every piece is something this app
  already does elsewhere, just not yet on this page.

  Recent Review "Identity check" answers (module_notes) round out the
  page underneath the six thread cards — the part of this that isn't
  goal-shaped at all, the reflective side rather than the tracked side.
*/
export default function IdentityPage() {
  const goals = useAsync((f) => fetchGoals({ force: f }))
  const sprints = useAsync((f) => fetchSprints({ force: f }))
  const phases = useAsync((f) => fetchSprintPhases({ force: f }))
  const tactics = useAsync((f) => fetchSprintTactics({ force: f }))

  const toWeek = weekIdFor(today())
  const fromWeek = useMemo(() => {
    let w = toWeek
    for (let i = 0; i < 7; i++) w = prevWeekId(w)
    return w
  }, [toWeek])
  const reviews = useAsync((f) => fetchWeeklyReviews(fromWeek, toWeek, { force: f }), [fromWeek, toWeek])

  const goalsByThread = useMemo(() => {
    const m = {}
    IDENTITY_THREADS.forEach((t) => { m[t.key] = [] })
    ;(goals.data || [])
      .filter((g) => g.status === 'active' && g.identity_thread && m[g.identity_thread])
      .forEach((g) => m[g.identity_thread].push(g))
    return m
  }, [goals.data])

  const loading = goals.loading || sprints.loading || phases.loading || tactics.loading

  function execForGoal(goalId) {
    const mySprints = (sprints.data || []).filter((s) => s.goal_id === goalId && isSprintActive(s))
    if (!mySprints.length) return null
    // Pools raw commitment counts across the goal's live cycles rather
    // than averaging their percentages — see the Scoring v2 note in
    // lib/goals.js for why averaging percentages was wrong.
    let done = 0, total = 0
    mySprints.forEach((s) => {
      const myPhases = (phases.data || []).filter((p) => p.sprint_id === s.id)
      const myTactics = (tactics.data || []).filter((t) => t.sprint_id === s.id)
      const r = commitmentRate(myPhases, myTactics, s)
      done += r.done; total += r.total
    })
    return total >= MIN_RATE_SAMPLE ? Math.round((done / total) * 100) : null
  }

  const reflections = (reviews.data || []).filter((r) => r.module_notes && r.module_notes.trim())

  /*
    Visual pass 2026-09-16: every thread card used the same identity-olive
    border and chip regardless of whether it was thriving, struggling, or
    completely uncovered, so the grid read as six identical boxes you had
    to actually read to tell apart. An uncovered thread is a real status
    (rule 3 in lib/design.js: colour is reserved for performance signals),
    the same status the per-goal meter bars below already report via
    scoreColor/scoreBadgeTone — so the card itself now wears that colour
    too: green/amber/red border+chip when a live cycle says how it's
    doing, the module's own olive only for "tagged but nothing measurable
    right now" (dormant), and a quiet dashed neutral border for a genuine
    gap. A thread with two goals is judged by its WEAKEST live one, same
    "weakest lever" logic Health's score already uses — a thread isn't
    covered just because ONE of its promises is thriving while another
    quietly isn't.
  */
  function threadSignal(list) {
    if (!list.length) return { kind: 'gap', worst: null }
    const execs = list.map((g) => execForGoal(g.id)).filter((v) => v != null)
    if (!execs.length) return { kind: 'dormant', worst: null }
    return { kind: 'active', worst: Math.min(...execs) }
  }
  const TONE_BG = { green: 'var(--s-good-bg)', orange: 'var(--s-short-bg)', red: 'var(--s-risk-bg)' }
  function threadAccent({ kind, worst }) {
    if (kind === 'active') {
      const tone = scoreBadgeTone(worst)
      return { border: scoreColor(worst), chipColor: scoreColor(worst), chipBg: TONE_BG[tone] }
    }
    if (kind === 'dormant') {
      return { border: MODULES.identity.color, chipColor: MODULES.identity.color, chipBg: MODULES.identity.tint }
    }
    return { border: 'var(--border-med)', chipColor: 'var(--text-3)', chipBg: 'var(--white-soft)', dashed: true }
  }

  const taggedCount = IDENTITY_THREADS.reduce((n, t) => n + (goalsByThread[t.key]?.length ? 1 : 0), 0)
  const covered = IDENTITY_THREADS.filter((t) => goalsByThread[t.key]?.length)
  const gaps = IDENTITY_THREADS.filter((t) => !goalsByThread[t.key]?.length)

  return (
    <View>
      <PageHeader
        kicker="The reason the rest of xLife exists"
        title="Identity"
        sub="Everything else in this app measures something. This is the standard the measuring is for."
      />

      {/* Rebuilt 2026-09-24. The olive .hero-card with a coverage Ring
          read as a brown box with a meaningless "50" in it (the ring was
          thread coverage, not a score). Now a real gold hero: the
          statement is the centerpiece in dark ink, and coverage is six
          thread icons that light up when a goal stands behind them. */}
      <section className="id-hero">
        <div className="id-eyebrow">Your identity statement</div>
        <blockquote className="id-quote">{IDENTITY_STATEMENT}</blockquote>
        <div className="id-coverage">
          <div className="id-cov-dots">
            {IDENTITY_THREADS.map((t) => (
              <span key={t.key} className={goalsByThread[t.key]?.length ? 'on' : ''} title={t.label}>
                <Icon name={t.icon} size={15} />
              </span>
            ))}
          </div>
          <div className="id-cov-txt">
            {taggedCount} of {IDENTITY_THREADS.length} threads have a goal behind them
            {taggedCount < IDENTITY_THREADS.length && <small>The rest are listed below so they stay visible.</small>}
          </div>
        </div>
      </section>

      {goals.error && <ErrorNote error={goals.error} />}

      {/* One list instead of six equal-weight cards with differently
          coloured borders: covered threads first with their goals and a
          thin bar each, uncovered ones gathered underneath as short lines.
          The status colour now sits only on the icon chip and the bars. */}
      <Card>
        <CardHead title="Where it shows up" sub="Each thread of the statement and the goals behind it. Colour shows how the live cycle is going." />
        {loading ? <Loading /> : (
          <>
            {covered.map((t) => {
              const list = goalsByThread[t.key]
              const accent = threadAccent(threadSignal(list))
              return (
                <div key={t.key} className="id-row">
                  <span className="id-row-ic" style={{ background: accent.chipBg, color: accent.chipColor }}>
                    <Icon name={t.icon} size={19} />
                  </span>
                  <div>
                    <div className="id-row-title">{t.label}</div>
                    <div className="id-row-hint">{t.hint}</div>
                    <div className="id-goals">
                      {list.map((g) => {
                        const exec = execForGoal(g.id)
                        return (
                          <div key={g.id} className="id-goal">
                            <span className="id-goal-title">{g.title}</span>
                            {exec != null ? (
                              <>
                                <span className="id-goal-bar"><i style={{ width: `${exec}%`, background: scoreColor(exec) }} /></span>
                                <span className="id-goal-pct tnum" style={{ color: scoreColor(exec) }}>{exec}%</span>
                              </>
                            ) : <span className="id-goal-none">No live cycle</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
            {gaps.length > 0 && (
              <>
                <div className="id-gap-hd">Not covered yet</div>
                {gaps.map((t) => (
                  <div key={t.key} className="id-gap">
                    <Icon name={t.icon} size={18} />
                    <span className="id-gap-txt">{t.label}<small>{t.hint}</small></span>
                    <Link to="/goals" className="btn btn-ghost btn-sm">Tag a goal</Link>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <CardHead title="Recent identity checks" sub="Your own weekly answers from Review, last 8 weeks." />
        {reviews.loading ? <Loading /> : !reflections.length ? (
          <Empty icon="event_note" title="Nothing written yet">
            Review's weekly &ldquo;Identity check&rdquo; answers will show up here once you write one.
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reflections.slice(0, 6).map((r) => (
              <div key={r.week_id}>
                <small style={{ color: 'var(--text-3)', fontWeight: 700 }}>{prettyWeek(r.week_id)}</small>
                <p style={{ fontSize: 13, lineHeight: 1.55, marginTop: 3 }}>{r.module_notes}</p>
              </div>
            ))}
          </div>
        )}
        <Link to="/review" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
          Open Review
        </Link>
      </Card>
    </View>
  )
}
