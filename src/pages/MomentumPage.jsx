import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import { Card, CardHead, PageHeader, Empty, Loading, Badge, ErrorNote, Ring } from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import { fetchGoals, fetchGoalRollup, fetchMomentumFocus } from '../lib/data'
import { MODULES } from '../lib/design'
import { areaLabel } from '../lib/goals'

/*
  Momentum — the work-side rollup, same standing as Review and Identity:
  a surface that sits above Pulse/xPM/xFocus rather than beside them,
  this time looking at "is there real work behind each goal right now"
  instead of a week or a thread.

  Scoped to goals.area === 'work' only (AREA_META in lib/goals.js labels
  this "Career" in the UI, "work" in the schema). Health, Family and
  Personal goals can be just as actively worked, but they're not what
  Pulse/xPM/xFocus exist to serve, and folding them in here would make
  the coverage ring measure the wrong thing — a Health goal with no open
  Pulse task isn't a Momentum gap, it's just not a work goal.

  xPM is bridged into Pulse (pulse_xpm_task_links), so the existing
  life_goal_rollup() already covers both — this page doesn't add an xPM
  read of its own. The only new read is life_momentum_focus() (trailing
  7-day focus minutes/sessions per goal, from xFocus's focus_sessions),
  date-bounded / count-only per the egress rules in data.js.

  Scoped to goal-linked work only, on purpose — this isn't a general
  "everything in Pulse" surface, it's "what's moving on each career
  goal specifically." A task with no goal_id doesn't belong here; it
  belongs in Pulse, or tagged to a goal from GoalsPage.

  Deliberately no "Momentum Score." Same reasoning IdentityPage documents
  for itself: a single number here would dress up raw counts as
  measurement. The hero Ring shows COVERAGE (goals with any open task,
  habit, or focus session behind them this week) — honest, not a score.
*/
export default function MomentumPage() {
  const goals = useAsync((f) => fetchGoals({ force: f }))
  const rollup = useAsync((f) => fetchGoalRollup({ force: f }))
  const focus = useAsync((f) => fetchMomentumFocus({ force: f }))

  const loading = goals.loading || rollup.loading || focus.loading

  const activeGoals = useMemo(
    () => (goals.data || []).filter((g) => g.status === 'active' && g.area === 'work'),
    [goals.data],
  )

  const rollupByGoal = useMemo(() => {
    const m = {}
    ;(rollup.data || []).forEach((r) => { m[r.goal_id] = r })
    return m
  }, [rollup.data])

  const focusByGoal = useMemo(() => {
    const m = {}
    ;(focus.data || []).forEach((r) => { m[r.goal_id] = r })
    return m
  }, [focus.data])

  const rows = useMemo(() => activeGoals.map((g) => {
    const r = rollupByGoal[g.id] || { open_tasks: 0, done_tasks: 0, habits: 0 }
    const fx = focusByGoal[g.id] || { focus_minutes_7d: 0, focus_sessions_7d: 0 }
    const hasWork = r.open_tasks > 0 || r.done_tasks > 0 || r.habits > 0 || fx.focus_sessions_7d > 0
    return { goal: g, ...r, ...fx, hasWork }
  }), [activeGoals, rollupByGoal, focusByGoal])

  const workingCount = rows.filter((r) => r.hasWork).length
  const coveragePct = rows.length ? Math.round((workingCount / rows.length) * 100) : null

  return (
    <View>
      <PageHeader
        kicker="Pulse, xPM and xFocus, one lens"
        title="Momentum"
        sub={`Is there real work behind each ${areaLabel('work')} goal right now — not a score, just what's actually moving.`}
      />

      <div className="hero-card hero-momentum" style={{ marginBottom: 14 }}>
        <div className="hero-content">
          <div>
            <div className="hero-eyebrow">This week</div>
            <p className="hero-copy" style={{ fontSize: 15 }}>
              {rows.length
                ? <>{workingCount} of {rows.length} active {areaLabel('work').toLowerCase()} goals have open tasks, habits, or a focus session behind them right now.</>
                : 'No active career goals yet.'}
              {rows.length > 0 && workingCount < rows.length && ' The rest are below, named, not hidden.'}
            </p>
          </div>
          {rows.length > 0 && <Ring score={coveragePct} sub={`${workingCount} of ${rows.length}`} />}
        </div>
      </div>

      {(goals.error || rollup.error || focus.error) && (
        <ErrorNote>{(goals.error || rollup.error || focus.error).message}</ErrorNote>
      )}

      {loading ? <Loading /> : !rows.length ? (
        <Empty icon="bolt" title="No active career goals"
          action={<Link to="/goals" className="btn btn-secondary btn-sm">Open Goals</Link>}>
          Momentum only tracks {areaLabel('work')}-area goals — start one to see it here.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {rows.map((r) => (
            <Card key={r.goal.id} style={{ borderLeft: `3px solid ${MODULES.momentum.color}` }}>
              <CardHead
                title={r.goal.title}
                sub={r.goal.why}
                right={
                  <div className="tile-ic" style={{ background: MODULES.momentum.tint, color: MODULES.momentum.color }}>
                    <Icon name="bolt" size={17} />
                  </div>
                }
              />
              {!r.hasWork ? (
                <Empty icon="bolt" title="Nothing moving">
                  No open tasks, habits, or focus sessions tied to this goal right now.
                </Empty>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {r.open_tasks > 0 && <Badge tone="blue">{r.open_tasks} open task{r.open_tasks === 1 ? '' : 's'}</Badge>}
                  {r.done_tasks > 0 && <Badge tone="muted">{r.done_tasks} done</Badge>}
                  {r.habits > 0 && <Badge tone="green">{r.habits} habit{r.habits === 1 ? '' : 's'}</Badge>}
                  {r.focus_sessions_7d > 0
                    ? <Badge tone="orange">{r.focus_minutes_7d}m focus, 7d</Badge>
                    : <Badge tone="muted">no focus time, 7d</Badge>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </View>
  )
}
