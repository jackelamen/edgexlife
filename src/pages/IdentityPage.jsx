import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import { Card, CardHead, PageHeader, Empty, Loading, Badge, ErrorNote, Ring } from '../components/ui/Kit'
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

  const taggedCount = IDENTITY_THREADS.reduce((n, t) => n + (goalsByThread[t.key]?.length ? 1 : 0), 0)
  const coveragePct = Math.round((taggedCount / IDENTITY_THREADS.length) * 100)

  return (
    <View>
      <PageHeader
        kicker="The reason the rest of xLife exists"
        title="Identity"
        sub="Everything else in this app measures something. This is the standard the measuring is for."
      />

      {/* Same .hero-card treatment Health and Wellness use for their own
          headline number — this page's headline isn't a score (see the
          no-Identity-Score note below), it's the statement itself, so the
          quote takes the spot the big number usually sits in and the Ring
          moves to showing thread COVERAGE instead of a score. A plain
          bordered card here read as an afterthought next to how loud
          every other module's hero is; this is the fix for that. */}
      <div className="hero-card hero-identity" style={{ marginBottom: 14 }}>
        <div className="hero-content">
          <div>
            <div className="hero-eyebrow">Your identity statement</div>
            <p style={{ fontSize: 21, fontStyle: 'italic', fontWeight: 600, lineHeight: 1.45, margin: '0 0 12px' }}>
              &ldquo;{IDENTITY_STATEMENT}&rdquo;
            </p>
            <p className="hero-copy">
              {taggedCount} of {IDENTITY_THREADS.length} threads have an active goal behind them right now.
              {taggedCount < IDENTITY_THREADS.length && ' The uncovered ones are below, named — not hidden.'}
            </p>
          </div>
          <Ring score={coveragePct} sub={`${taggedCount} of ${IDENTITY_THREADS.length}`} />
        </div>
      </div>

      {goals.error && <ErrorNote>{goals.error.message}</ErrorNote>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {IDENTITY_THREADS.map((t) => {
          const list = goalsByThread[t.key] || []
          return (
            <Card key={t.key} style={{ borderLeft: `3px solid ${MODULES.identity.color}` }}>
              <CardHead
                title={t.label}
                sub={t.hint}
                right={
                  <div className="tile-ic" style={{ background: MODULES.identity.tint, color: MODULES.identity.color }}>
                    <Icon name={t.icon} size={17} />
                  </div>
                }
              />
              {loading ? <Loading /> : !list.length ? (
                <Empty icon={t.icon} title="Nothing tagged yet"
                  action={<Link to="/goals" className="btn btn-secondary btn-sm">Tag a goal</Link>}>
                  No active goal is serving this thread right now.
                </Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {list.map((g) => {
                    const exec = execForGoal(g.id)
                    return (
                      <div key={g.id}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{g.title}</span>
                          {exec != null
                            ? <Badge tone={scoreBadgeTone(exec)}>{exec}% exec</Badge>
                            : <Badge tone="muted">no live cycle</Badge>}
                        </div>
                        {exec != null && (
                          <div className="score-meter" style={{ height: 6 }}>
                            <span style={{ width: `${exec}%`, background: scoreColor(exec) }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>

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
