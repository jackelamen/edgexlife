import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import { Card, CardHead, PageHeader, Empty, Loading, Badge, ErrorNote } from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  fetchGoals, fetchSprints, fetchSprintPhases, fetchSprintTactics, fetchWeeklyReviews,
} from '../lib/data'
import { avgExecScore, isSprintActive } from '../lib/goals'
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
  executing — not a vibe, the same avgExecScore() everything else on
  Goals is judged by. An untagged, uncovered thread is left visibly
  empty on purpose: that gap IS the signal this page exists to surface.

  Deliberately does NOT compute an "Identity Score." scores.js and
  correlations.js both got a real pass (2026-08-21) for overclaiming —
  dressing up self-report and heuristics as measurement. A single number
  for something as genuinely unquantifiable as character would repeat
  that exact mistake, worse. Coverage is honest; a score wouldn't be.

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
    const scores = mySprints
      .map((s) => {
        const myPhases = (phases.data || []).filter((p) => p.sprint_id === s.id)
        const myTactics = (tactics.data || []).filter((t) => t.sprint_id === s.id)
        return avgExecScore(myPhases, myTactics, s)
      })
      .filter((v) => v != null)
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  }

  const reflections = (reviews.data || []).filter((r) => r.module_notes && r.module_notes.trim())

  const taggedCount = IDENTITY_THREADS.reduce((n, t) => n + (goalsByThread[t.key]?.length ? 1 : 0), 0)

  return (
    <View>
      <PageHeader
        kicker="The reason the rest of xLife exists"
        title="Identity"
        sub="Everything else in this app measures something. This is the standard the measuring is for."
      />

      <Card style={{ borderLeft: `4px solid ${MODULES.identity.color}`, marginBottom: 14 }}>
        <p style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.65, color: 'var(--text)' }}>
          &ldquo;{IDENTITY_STATEMENT}&rdquo;
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 10 }}>
          {taggedCount} of {IDENTITY_THREADS.length} threads have an active goal behind them right now.
        </p>
      </Card>

      {goals.error && <ErrorNote>{goals.error.message}</ErrorNote>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {IDENTITY_THREADS.map((t) => {
          const list = goalsByThread[t.key] || []
          return (
            <Card key={t.key}>
              <CardHead
                title={t.label}
                sub={t.hint}
                right={
                  <span style={{ color: MODULES.identity.color, display: 'flex' }}>
                    <Icon name={t.icon} size={18} />
                  </span>
                }
              />
              {loading ? <Loading /> : !list.length ? (
                <Empty icon={t.icon} title="Nothing tagged yet"
                  action={<Link to="/goals" className="btn btn-secondary btn-sm">Tag a goal</Link>}>
                  No active goal is serving this thread right now.
                </Empty>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map((g) => {
                    const exec = execForGoal(g.id)
                    return (
                      <div key={g.id} className="mini-item">
                        <span>{g.title}</span>
                        {exec != null
                          ? <Badge tone={exec >= 85 ? 'green' : exec >= 60 ? 'orange' : 'red'}>{exec}% exec</Badge>
                          : <Badge tone="muted">no live cycle</Badge>}
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
