import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import {
  Card, CardHead, PageHeader, Ring, Empty, Loading, Badge,
} from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  fetchGoals, fetchGoalRollup, fetchHabits, fetchHabitLogs,
  fetchHealthIndex, fetchHealthLogs, fetchHealthSettings,
  fetchWellnessIndex, fetchWellnessCheckins, logHabit, unlogHabit,
  fetchSprints, fetchSprintPhases, fetchSprintTactics, saveSprint,
} from '../lib/data'
import { healthDetails, clarityDetails, healthLabel, weakestComponent } from '../lib/scores'
import {
  isSprintActive, sprintCurrentWeek, tacticsForWeek,
  checkKey, tacticKeyId, todayDayIdx, xpwTarget, xpwDoneCount, xpwDidToday,
} from '../lib/goals'
import { MODULES, STATUS, metric } from '../lib/design'
import { today, daysAgo, pretty } from '../lib/dates'

/*
  Mission control.

  Not a summary of three modules — a command surface over them. The order is
  deliberate: what needs your attention, then what's due right now and can be
  cleared from here, then the standing state of each system.

  Egress discipline is unchanged: Health and Wellness still resolve exactly
  ONE day each via their dates-only index rather than pulling a window.
*/
export default function TodayPage() {
  const t = today()

  const goals = useAsync((f) => fetchGoals({ force: f }))
  const rollup = useAsync((f) => fetchGoalRollup({ force: f }))
  const habits = useAsync((f) => fetchHabits({ force: f }))
  const habitLogs = useAsync((f) => fetchHabitLogs(daysAgo(7), t, { force: f }), [t])
  const settings = useAsync((f) => fetchHealthSettings({ force: f }))

  const sprints = useAsync((f) => fetchSprints({ force: f }))
  const phases = useAsync((f) => fetchSprintPhases({ force: f }))
  const tactics = useAsync((f) => fetchSprintTactics({ force: f }))

  const healthIdx = useAsync((f) => fetchHealthIndex({ force: f }))
  const wellnessIdx = useAsync((f) => fetchWellnessIndex({ force: f }))
  const lastHealthDate = healthIdx.data?.[0] || null
  const lastCheckinDate = wellnessIdx.data?.[0]?.date || null

  const health = useAsync((f) => fetchHealthLogs(lastHealthDate, lastHealthDate, { force: f }),
    [lastHealthDate], { enabled: Boolean(lastHealthDate) })
  const wellness = useAsync((f) => fetchWellnessCheckins(lastCheckinDate, lastCheckinDate, { force: f }),
    [lastCheckinDate], { enabled: Boolean(lastCheckinDate) })

  const lastHealth = (health.data || [])[0]
  const lastCheckin = (wellness.data || [])[0]
  const healthDet = lastHealth ? healthDetails(lastHealth, settings.data) : null
  const healthScore = healthDet?.score ?? null
  const clarity = lastCheckin ? clarityDetails(lastCheckin)?.score : null
  const weakest = weakestComponent(healthDet)

  const daysSince = (d) => (d ? Math.round((new Date(`${t}T12:00`) - new Date(`${d}T12:00`)) / 86400000) : null)
  const healthAge = daysSince(lastHealthDate)
  const checkinAge = daysSince(lastCheckinDate)

  const doneToday = useMemo(() => {
    const s = new Set()
    ;(habitLogs.data || []).forEach((l) => { if (l.logged_on === t && l.count > 0) s.add(l.habit_id) })
    return s
  }, [habitLogs.data, t])

  const goalTitle = useMemo(() => {
    const m = {}
    ;(goals.data || []).forEach((g) => { m[g.id] = g.title })
    return m
  }, [goals.data])

  const activeGoals = (goals.data || []).filter((g) => g.status === 'active')
  const liveCycles = (sprints.data || []).filter((s) => isSprintActive(s) && !s.archived)
  const habitList = habits.data || []

  /* ── Today's due cycle actions, flattened across every live cycle ── */
  const dueActions = useMemo(() => {
    const out = []
    liveCycles.forEach((sp) => {
      const wk = sprintCurrentWeek(sp)
      const myPhases = (phases.data || []).filter((p) => p.sprint_id === sp.id)
      const myTactics = (tactics.data || []).filter((x) => x.sprint_id === sp.id)
      const checks = (sp.week_checks || {})[wk] || {}
      const dayIdx = todayDayIdx()

      tacticsForWeek(myPhases, myTactics, wk).forEach((tac) => {
        const freq = tac.freq || 'weekly'
        if (freq === 'daily') {
          out.push({ sp, tac, wk, dayIdx, done: Boolean(checks[checkKey(tac, dayIdx)]), kind: 'day' })
        } else if (freq === 'custom') {
          if ((tac.days || []).includes(dayIdx)) {
            out.push({ sp, tac, wk, dayIdx, done: Boolean(checks[checkKey(tac, dayIdx)]), kind: 'day' })
          }
        } else if (freq === 'xperweek') {
          const n = xpwTarget(tac), c = xpwDoneCount(tac, checks)
          const didToday = xpwDidToday(tac, checks)
          if (didToday || c < n) {
            const slot = didToday ? null : c // next open slot
            out.push({ sp, tac, wk, done: didToday, kind: 'xpw', slot, c, n })
          }
        } else if (dayIdx === 6 || checks[tacticKeyId(tac)]) {
          out.push({ sp, tac, wk, done: Boolean(checks[tacticKeyId(tac)]), kind: 'once' })
        }
      })
    })
    return out
  }, [liveCycles, phases.data, tactics.data])

  const dueDone = dueActions.filter((a) => a.done).length
  const habitsDone = doneToday.size

  async function toggleAction(a) {
    const wkChecks = { ...((a.sp.week_checks || {})[a.wk] || {}) }
    if (a.kind === 'xpw') {
      if (a.done) {
        // clear whichever slot was marked today
        const stamp = new Date().toISOString().slice(0, 10)
        Object.keys(wkChecks).forEach((k) => {
          if (k.startsWith(`${tacticKeyId(a.tac)}_`) && wkChecks[k] === stamp) delete wkChecks[k]
        })
      } else {
        wkChecks[`${tacticKeyId(a.tac)}_${a.slot}`] = new Date().toISOString().slice(0, 10)
      }
    } else {
      const key = a.kind === 'day' ? checkKey(a.tac, a.dayIdx) : tacticKeyId(a.tac)
      if (wkChecks[key]) delete wkChecks[key]
      else wkChecks[key] = true
    }
    try {
      await saveSprint({ ...a.sp, week_checks: { ...(a.sp.week_checks || {}), [a.wk]: wkChecks } })
      sprints.reload()
    } catch (e) { toast.error(e.message) }
  }

  async function toggleHabit(h) {
    try {
      if (doneToday.has(h.id)) await unlogHabit(h.id, t)
      else await logHabit(h.id, t, 1)
      habitLogs.reload()
    } catch (e) { toast.error(e.message) }
  }

  /* ── The attention queue: computed, ranked, each with a way to act ──
     This is the part that makes it mission control rather than a dashboard.
     Severity uses the reserved status ramp; nothing here is decorative. */
  const alerts = useMemo(() => {
    const a = []
    if (healthAge == null) {
      a.push({ sev: 'risk', icon: 'monitor_heart', text: 'No health log yet', to: '/health', cta: 'Log' })
    } else if (healthAge >= 2) {
      a.push({ sev: healthAge >= 5 ? 'risk' : 'short', icon: 'monitor_heart',
        text: `Health not logged in ${healthAge} days`, to: '/health', cta: 'Log' })
    }
    if (checkinAge == null) {
      a.push({ sev: 'risk', icon: 'self_improvement', text: 'No wellness check-in yet', to: '/wellness', cta: 'Check in' })
    } else if (checkinAge >= 2) {
      a.push({ sev: checkinAge >= 5 ? 'risk' : 'short', icon: 'self_improvement',
        text: `No check-in in ${checkinAge} days`, to: '/wellness', cta: 'Check in' })
    }
    const openDue = dueActions.length - dueDone
    if (openDue > 0) {
      a.push({ sev: 'short', icon: 'flag', text: `${openDue} cycle action${openDue > 1 ? 's' : ''} still open today`, to: '/goals', cta: 'Goals' })
    }
    if (weakest && weakest.value < 60) {
      a.push({ sev: weakest.value < 40 ? 'risk' : 'short', icon: metric(weakest.key).icon,
        text: `${weakest.label} is dragging your score (${Math.round(weakest.value)})`, to: '/health', cta: 'Health',
        metricKey: weakest.key })
    }
    if (!liveCycles.length && activeGoals.length) {
      a.push({ sev: 'short', icon: 'loop', text: 'Active goals with no live cycle', to: '/goals', cta: 'Start one' })
    }
    return a.sort((x, y) => (x.sev === 'risk' ? -1 : 1) - (y.sev === 'risk' ? -1 : 1))
  }, [healthAge, checkinAge, dueActions.length, dueDone, weakest, liveCycles.length, activeGoals.length])

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const allClear = !alerts.length
  const totalOpen = (dueActions.length - dueDone) + (habitList.length - habitsDone)

  return (
    <View>
      <PageHeader
        kicker={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title="Mission control"
        sub="Everything that wants you today, and the state of all three systems."
      />

      {/* Command banner — one verdict, and the number that matters */}
      <div className="hero-card" style={{ marginBottom: 14 }}>
        <div className="hero-content">
          <div>
            <div className="hero-eyebrow">{greeting}, Jack</div>
            <div className="hero-h">
              {allClear && totalOpen === 0 ? 'All clear.'
                : totalOpen === 0 ? <>Nothing due.<br /><em>But something needs a look.</em></>
                : <>{totalOpen} thing{totalOpen === 1 ? '' : 's'} open<br /><em>across your systems.</em></>}
            </div>
            <p className="hero-copy">
              {allClear
                ? 'Every system is current and nothing is overdue. Log as the day goes.'
                : `${alerts.length} item${alerts.length === 1 ? '' : 's'} want attention. They're listed below, each with somewhere to go.`}
            </p>
          </div>
          <Ring score={healthScore} sub="health" />
        </div>
      </div>

      {/* ── Attention queue ── */}
      {!allClear && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {alerts.map((al, i) => {
            const s = STATUS[al.sev]
            return (
              <div key={i} className="alert-row">
                <span className="alert-dot" style={{ background: s.color }} />
                <div className="alert-ic" style={{ background: s.bg }}>
                  <Icon name={al.icon} size={17} style={{ color: s.color }} />
                </div>
                <span className="alert-text">{al.text}</span>
                <Link to={al.to} className="btn btn-secondary btn-xs">
                  {al.cta} <Icon name="arrow_forward" size={14} />
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Three systems, each in its own module hue ── */}
      <div className="system-row">
        <SystemPanel
          module="health" to="/health" score={healthScore}
          lastLabel={lastHealthDate ? `Logged ${pretty(lastHealthDate)}` : 'Never logged'}
          age={healthAge}
          foot={healthScore != null ? healthLabel(healthScore)[0] : 'Log a day to start'}
        />
        <SystemPanel
          module="wellness" to="/wellness" score={clarity}
          lastLabel={lastCheckinDate ? `Checked in ${pretty(lastCheckinDate)}` : 'No check-in'}
          age={checkinAge}
          foot={lastCheckin?.state ? `Felt ${String(lastCheckin.state).toLowerCase()}` : 'Log how you are'}
        />
        <SystemPanel
          module="goals" to="/goals"
          score={dueActions.length ? Math.round((dueDone / dueActions.length) * 100) : null}
          lastLabel={`${liveCycles.length} live cycle${liveCycles.length === 1 ? '' : 's'}`}
          age={null}
          foot={dueActions.length ? `${dueDone} of ${dueActions.length} done today` : `${activeGoals.length} active goals`}
        />
      </div>

      {/* ── Due today: the actionable middle ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5" style={{ marginTop: 14 }}>
        <Card>
          <CardHead
            title="Due today"
            sub="Cycle actions from every live goal — tick them here."
            right={dueActions.length
              ? <Badge tone={dueDone === dueActions.length ? 'green' : 'orange'}>{dueDone}/{dueActions.length}</Badge>
              : null}
          />
          {sprints.loading ? <Loading /> : !dueActions.length ? (
            <Empty icon="flag" title="Nothing due from your cycles"
              action={<Link to="/goals" className="btn btn-secondary btn-sm">Open Goals</Link>}>
              {liveCycles.length ? 'Nothing is scheduled for today.' : 'No live cycle is running right now.'}
            </Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {dueActions.map((a, i) => (
                <button key={i} className={`check-row${a.done ? ' done' : ''}`} onClick={() => toggleAction(a)}>
                  <span className="check-box">{a.done && <Icon name="check" size={14} style={{ color: '#fff' }} />}</span>
                  <span className="check-text">
                    {a.tac.text}
                    <small style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
                      {goalTitle[a.sp.goal_id] || a.sp.name}
                      {a.kind === 'xpw' && ` · ${a.c}/${a.n} this week`}
                      {a.kind === 'once' && ' · weekly'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead
            title="Habits"
            sub="Carried from Pulse."
            right={habitList.length
              ? <Badge tone={habitsDone === habitList.length ? 'green' : 'blue'}>{habitsDone}/{habitList.length}</Badge>
              : null}
          />
          {habits.loading ? <Loading /> : !habitList.length ? (
            <Empty icon="repeat" title="No habits in Pulse yet" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 300, overflowY: 'auto' }}>
              {habitList.map((h) => {
                const done = doneToday.has(h.id)
                return (
                  <button key={h.id} className={`check-row${done ? ' done' : ''}`} onClick={() => toggleHabit(h)}>
                    <span className="check-box">{done && <Icon name="check" size={14} style={{ color: '#fff' }} />}</span>
                    <span className="check-text">
                      {h.name}
                      {h.goal_id && goalTitle[h.goal_id] && (
                        <small style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
                          {goalTitle[h.goal_id]}
                        </small>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Standing goals state ── */}
      <Card style={{ marginTop: 14 }}>
        <CardHead title="Goals in play" sub="Active goals and what's attached to them."
          right={<Link to="/goals" className="btn btn-ghost btn-sm">Open <Icon name="arrow_forward" size={15} /></Link>} />
        {!activeGoals.length ? (
          <Empty icon="flag" title="No active goals" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {activeGoals.map((g) => {
              const r = (rollup.data || []).find((x) => x.goal_id === g.id)
              const cyc = liveCycles.find((s) => s.goal_id === g.id)
              return (
                <div key={g.id} className="goal-line">
                  <span className="goal-line-bar" style={{ background: MODULES.goals.color }} />
                  <span style={{ fontWeight: 700, flex: 1, minWidth: 0 }}>{g.title}</span>
                  {cyc && <Badge tone="green">Week {sprintCurrentWeek(cyc)}/12</Badge>}
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {r?.open_tasks ?? 0} open · {r?.habits ?? 0} habits
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </View>
  )
}

/**
 * One system's standing state. Takes the MODULE's hue (identity — same
 * colour as that module's own hero and nav item) and, where the data can go
 * stale, a freshness dot in the reserved status ramp.
 */
function SystemPanel({ module, to, score, lastLabel, age, foot }) {
  const m = MODULES[module]
  const fresh = age == null ? null : age <= 1 ? STATUS.good : age <= 4 ? STATUS.short : STATUS.risk
  return (
    <Link to={to} className="system-panel" style={{ background: m.color }}>
      <div className="system-top">
        <span className="system-name">{m.label}</span>
        {fresh && <span className="system-fresh" style={{ background: fresh.color }} />}
      </div>
      <div className="system-score tnum">{score == null ? '--' : Math.round(score)}</div>
      <div className="system-last">{lastLabel}</div>
      <div className="system-foot">
        {foot}
        <Icon name="arrow_forward" size={15} />
      </div>
    </Link>
  )
}
