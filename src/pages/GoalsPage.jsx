import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import {
  PageHeader, Card, CardHead, StatCard, Badge, Tabs, Field, Empty, Loading,
  ErrorNote, Modal, Ring, useConfirm,
} from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  AREAS, GOAL_STATUSES, METRIC_TYPES,
  fetchGoals, saveGoal, deleteGoal, fetchVisions, saveVision,
  fetchGoalMetrics, saveMetric, deleteMetric, fetchMetricLogs, logMetric,
  fetchSprints, saveSprint, mergeSprintWeekChecks, deleteSprint, setSprintArchived, fetchSprintPhases, savePhase, deletePhase,
  fetchSprintTactics, saveTactic, deleteTactic, fetchGoalRollup, fetchSavingsGoals,
  fetchGoalTasks, fetchUnlinkedTasks, linkTaskToGoal,
  fetchHabits, linkHabitToGoal,
} from '../lib/data'
import { today, pretty, prettyShort } from '../lib/dates'
import {
  areaLabel, areaColor, DAY_LABELS, todayDayIdx,
  sprintCurrentWeek, isSprintActive, phaseIdxForWeek, tacticsForWeek,
  xpwTarget, xpwDoneCount, xpwDidToday, tacticCheckpointCount, checkKey,
  execScore, avgExecScore, todayDoneTotals, scoreColor, scoreBadgeTone,
  autoEndDate, DEFAULT_PHASES, goalStreak, effectiveCustomDays, withDaySwap,
} from '../lib/goals'
import VisionBoard from '../components/goals/VisionBoard'
import StreakChart from '../components/goals/StreakChart'
import DonutChart from '../components/goals/DonutChart'
import { MODULES } from '../lib/design'
import { IDENTITY_THREADS, identityThreadByKey } from '../lib/identity'

const VIEWS = [
  { value: 'today', label: 'Today', sub: "What's due today, and how the week is going." },
  { value: 'goals', label: 'Goals', sub: 'Every active goal, by life area, with what feeds it.' },
  { value: 'cycles', label: 'Cycles', sub: '12-week focus cycles — phases, actions, execution.' },
  { value: 'roadmap', label: 'Roadmap', sub: 'Every cycle plotted against the calendar.' },
  { value: 'visions', label: 'Visions', sub: 'The future state you’re building toward, by area.' },
  { value: 'retros', label: 'Retros', sub: 'What a finished cycle taught you.' },
]

export default function GoalsPage() {
  const [view, setView] = useState('today')
  const [editGoal, setEditGoal] = useState(null)
  // A "start a cycle" request from anywhere in the module (Today's empty
  // state, a goal card with no live cycle) lands here: switch to Cycles and
  // hand it a token + optional goal to pre-fill, rather than each caller
  // needing to know about CyclesView's own local editor state.
  const [cycleIntent, setCycleIntent] = useState(null) // { token, goalId }
  const startCycle = (goalId) => setCycleIntent({ token: Date.now(), goalId: goalId || null })

  const goals = useAsync((f) => fetchGoals({ force: f }))
  const rollup = useAsync((f) => fetchGoalRollup({ force: f }))
  const sprints = useAsync((f) => fetchSprints({ force: f }))
  const phases = useAsync((f) => fetchSprintPhases({ force: f }))
  const tactics = useAsync((f) => fetchSprintTactics({ force: f }))

  const cycleData = { sprints, phases, tactics }
  const activeView = VIEWS.find((v) => v.value === view)

  return (
    <View>
      <PageHeader
        kicker="Goals"
        title={activeView?.label}
        sub={activeView?.sub}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditGoal({})}>
            <Icon name="add" size={15} /> New Goal
          </button>
        }
      />
      <Tabs value={view} onChange={setView} options={VIEWS} />

      {view === 'today' && <TodayView goals={goals} rollup={rollup} cycleData={cycleData} onStartCycle={() => { setView('cycles'); startCycle() }} />}
      {view === 'goals' && <GoalRoom goals={goals} rollup={rollup} sprints={sprints} onEdit={setEditGoal}
        onStartCycle={(goalId) => { setView('cycles'); startCycle(goalId) }} />}
      {view === 'cycles' && <CyclesView goals={goals} cycleData={cycleData} cycleIntent={cycleIntent} />}
      {view === 'roadmap' && <RoadmapView goals={goals} sprints={sprints} />}
      {view === 'visions' && <VisionsView />}
      {view === 'retros' && <RetrosView goals={goals} sprints={sprints} cycleData={cycleData} />}

      <GoalEditor goal={editGoal} onClose={() => setEditGoal(null)}
        onSaved={() => { goals.reload(); rollup.reload() }} />
    </View>
  )
}

/* ══════════════════ shared: cycle lookups ══════════════════ */

function useLiveCycles({ sprints, phases, tactics }) {
  const t = today()
  const live = (sprints.data || []).filter((s) => isSprintActive(s) && !s.archived)
  const forSprint = (sp) => ({
    phases: (phases.data || []).filter((p) => p.sprint_id === sp.id),
    tactics: (tactics.data || []).filter((x) => x.sprint_id === sp.id),
  })
  return { t, live, forSprint }
}

/* ══════════════════ Today ══════════════════ */

function TodayView({ goals, rollup, cycleData, onStartCycle }) {
  const { live, forSprint } = useLiveCycles(cycleData)
  const active = (goals.data || []).filter((g) => g.status === 'active')

  // Per-cycle today totals, computed once and reused both for the combined
  // headline number and to decide which cycle gets featured below — a cycle
  // that still owes something today outranks one that's already clean.
  const perCycle = live.map((sp) => {
    const { phases, tactics } = forSprint(sp)
    const goal = (goals.data || []).find((g) => g.id === sp.goal_id)
    const totals = todayDoneTotals(phases, tactics, sp)
    return { sp, phases, tactics, goal, totals }
  })
  const todayTotals = perCycle.reduce((acc, c) => (
    { done: acc.done + c.totals.done, total: acc.total + c.totals.total }
  ), { done: 0, total: 0 })
  const todayPct = todayTotals.total ? Math.round((todayTotals.done / todayTotals.total) * 100) : null

  // Most-owed cycle first (still due today > already clean > nothing due),
  // so the one thing worth opening by default is the one with real work in
  // it — not just whichever cycle happens to sort first alphabetically.
  const sorted = [...perCycle].sort((a, b) => {
    const owedA = a.totals.total - a.totals.done, owedB = b.totals.total - b.totals.done
    return owedB - owedA
  })
  const featured = sorted[0]
  const rest = sorted.slice(1)

  const streak = useMemo(() => goalStreak(cycleData.sprints.data || []), [cycleData.sprints.data])
  const streakPct = Math.min(100, Math.round((streak / 7) * 100))

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up,' : hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,'
  const todayFmt = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <>
      <div className="hero-banner">
        <div className="hero-greeting">{greeting} {todayFmt}</div>
        <div className="hero-title">
          {!live.length ? 'Nothing in motion yet.' :
            todayTotals.total === 0 ? 'Nothing due today. Rest counts.' :
            todayTotals.done === todayTotals.total ? 'Clean day — everything checked off.' :
            `${todayTotals.done} of ${todayTotals.total} actions done today.`}
        </div>
        {todayTotals.total > 0 && (
          <div className="score-meter" style={{ height: 8, background: 'rgba(255,255,255,.22)', marginTop: 12, maxWidth: 320 }}>
            <span style={{ width: `${todayPct}%`, background: '#fff' }} />
          </div>
        )}
        {/* Second Stop: what the headline number is actually about, not just
            a repeat of it. Also gives the hero a reason to hold the width it
            has — previously the whole right two-thirds sat empty once the
            three duplicate badges were removed from here. */}
        {featured && (
          <p style={{ fontSize: 13, fontWeight: 600, opacity: .82, marginTop: 14, maxWidth: 420 }}>
            {live.length > 1 ? 'Up next: ' : ''}<strong>{featured.sp.name}</strong>
            {featured.goal?.title ? ` · ${featured.goal.title}` : ''}
          </p>
        )}
      </div>

      {/* Three tiles, matching .stat-strip's fixed 3-column grid — a 4th
          tile here used to wrap onto its own row alone with two-thirds of
          the row empty beside it (the actual source of "feels unbalanced").
          Live cycles + active goals are folded into one tile's sub-line
          instead of getting a whole card each. Real fill (rule 2) replaces
          the hero's old badges, which just repeated these same numbers. */}
      <div className="stat-strip">
        <StatCard label="Today" value={todayTotals.total ? `${todayTotals.done}/${todayTotals.total}` : '—'}
          sub="actions done" icon="today" pct={todayPct} color={MODULES.goals.color} tint={MODULES.goals.tint} />
        <StatCard label="Streak" value={streak} sub={streak === 1 ? 'day' : 'days'} icon="local_fire_department"
          pct={streak > 0 ? streakPct : null} color={MODULES.goals.color} tint={MODULES.goals.tint} />
        <StatCard label="Live cycles" value={live.length}
          sub={`${active.length} active goal${active.length === 1 ? '' : 's'}`} />
      </div>

      {cycleData.sprints.loading ? (
        <Loading />
      ) : !live.length ? (
        <Card>
          <Empty icon="rocket_launch" title="Nothing in motion yet"
            action={<button className="btn btn-primary btn-sm" onClick={onStartCycle}>Start a Cycle</button>}>
            Start a 12-week Focus Cycle and your daily actions will show up here.
          </Empty>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CycleCard key={featured.sp.id} sprint={featured.sp} phases={featured.phases} tactics={featured.tactics}
            goal={featured.goal} compact={false} onChanged={() => cycleData.sprints.reload()} />
          {rest.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>
                Also live
              </div>
              {rest.map((c) => (
                <CycleCard key={c.sp.id} sprint={c.sp} phases={c.phases} tactics={c.tactics} goal={c.goal}
                  compact onChanged={() => cycleData.sprints.reload()} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  )
}

/* ══════════════════ Cycle card (shared by Today + Cycles) ══════════════════ */

function CycleCard({ sprint, phases, tactics, goal, compact, onChanged, onDelete, onEdit, onArchive, onDuplicate }) {
  const [open, setOpen] = useState(!compact)
  const [week, setWeek] = useState(sprintCurrentWeek(sprint))
  const cw = sprintCurrentWeek(sprint)
  const score = execScore(phases, tactics, sprint, week)
  const avg = avgExecScore(phases, tactics, sprint)
  const weekTactics = tacticsForWeek(phases, tactics, week)
  const checks = (sprint.week_checks || {})[week] || {}

  async function toggle(t, dayIdx) {
    const key = checkKey(t, dayIdx)
    const nextChecks = { ...checks, [key]: !checks[key] || undefined }
    if (!nextChecks[key]) delete nextChecks[key]
    else nextChecks[key] = true
    await mergeSprintWeekChecks(sprint.id, week, nextChecks)
    onChanged()
  }

  async function toggleXpw(t, slotIdx) {
    const key = `${t.local_id || t.id}_${slotIdx}`
    const already = checks[key]
    const nextChecks = { ...checks }
    if (already) delete nextChecks[key]
    else nextChecks[key] = today()
    await mergeSprintWeekChecks(sprint.id, week, nextChecks)
    onChanged()
  }

  // Custom-day tactics only: move one day's obligation onto a different
  // day for THIS week, without touching the tactic's default schedule.
  // Completion history stays keyed by the original day (see lib/goals.js).
  async function swapDay(t, fromDay, toDay) {
    const day_swaps = withDaySwap(sprint, week, t, fromDay, toDay)
    await saveSprint({ ...sprint, day_swaps })
    onChanged()
  }

  return (
    <div className="cycle-card" style={{ borderLeftColor: areaColor(goal?.area) }}>
      <div className="cycle-header">
        {/* onAccent defaults to true, meant for the ring sitting on a solid
            accent background (hero cards). This card is plain white, so
            without the override the ring's white arc and number were
            rendering white-on-white — invisible. Execution score is a
            genuine performance read, so off-accent correctly falls back to
            the reserved status ramp (red/amber/green) rather than the
            module accent. */}
        <div className="cycle-ring-section" title="Execution — checkpoints hit ÷ checkpoints possible, this week">
          <Ring score={score} size={72} stroke={7} sub={`wk ${week}`} onAccent={false} />
        </div>
        <div className="cycle-info">
          <div className="cycle-meta">
            {isSprintActive(sprint) && !sprint.archived && <Badge tone="green">Live</Badge>}
            {sprint.archived && <Badge tone="muted">Archived</Badge>}
            <span className="cycle-goal-link">{goal?.title || 'No goal'}</span>
          </div>
          <div className="cycle-name">{sprint.name}</div>
          {sprint.outcome && <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{sprint.outcome}</p>}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            {sprint.start_date || '—'} → {sprint.end_date || '—'} · avg {avg ?? '--'}%
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {onDuplicate && <button className="btn btn-icon btn-sm btn-ghost" onClick={onDuplicate} title="Duplicate cycle">
            <Icon name="content_copy" size={15} /></button>}
          {onArchive && <button className="btn btn-icon btn-sm btn-ghost" onClick={onArchive} title={sprint.archived ? 'Unarchive' : 'Archive'}>
            <Icon name={sprint.archived ? 'unarchive' : 'archive'} size={15} /></button>}
          {onEdit && <button className="btn btn-icon btn-sm" onClick={onEdit}><Icon name="edit" size={15} /></button>}
          {onDelete && <button className="btn btn-icon btn-sm" onClick={onDelete}><Icon name="delete" size={15} /></button>}
          <button className={`cycle-toggle-btn${open ? ' open' : ''}`} onClick={() => setOpen(!open)}>
            <Icon name={open ? 'expand_less' : 'expand_more'} size={16} /> {open ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {open && (
        <div className="cycle-section">
          <div className="cycle-section-title">
            <span>
              Week {week} of 12
              <span style={{ fontWeight: 600, color: 'var(--text-3)', marginLeft: 8, fontSize: 11 }}>
                · {score == null ? 'nothing to check yet' : `${score}% of this week's actions checked off`}
              </span>
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-icon btn-sm" onClick={() => setWeek(Math.max(1, week - 1))}>
                <Icon name="chevron_left" size={15} />
              </button>
              {week !== cw && (
                <button className="btn btn-secondary btn-sm" onClick={() => setWeek(cw)}>Today</button>
              )}
              <button className="btn btn-icon btn-sm" onClick={() => setWeek(Math.min(12, week + 1))}>
                <Icon name="chevron_right" size={15} />
              </button>
            </div>
          </div>

          {!weekTactics.length ? (
            <Empty icon="target" title="No actions in this phase yet" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {weekTactics.map((t) => (
                <TacticRow key={t.id} tactic={t} checks={checks} sprint={sprint} week={week}
                  onToggleDay={(d) => toggle(t, d)}
                  onToggleXpw={(i) => toggleXpw(t, i)}
                  onSwapDay={(fromDay, toDay) => swapDay(t, fromDay, toDay)} />
              ))}
            </div>
          )}

          {!compact && <StreakChart sprint={sprint} phases={phases} tactics={tactics} />}
        </div>
      )}
    </div>
  )
}

function TacticRow({ tactic: t, checks, sprint, week, onToggleDay, onToggleXpw, onSwapDay }) {
  const n = tacticCheckpointCount(t)
  const [swapping, setSwapping] = useState(false)
  const isCustom = t.freq === 'custom'
  const effDays = isCustom ? effectiveCustomDays(t, sprint, week) : []
  const anySwapped = isCustom && effDays.some((d, i) => d !== (t.days || [])[i])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t.text}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.freq === 'xperweek' ? `${xpwDoneCount(t, checks)}/${n} this week` :
              isCustom ? effDays.map((d) => DAY_LABELS[d]).join(', ') :
              t.freq}
            {anySwapped && <span className="badge badge-orange" style={{ fontSize: 9.5, padding: '1px 6px' }}>swapped this wk</span>}
            {isCustom && (
              <button type="button" className="btn btn-ghost btn-xs" style={{ padding: '1px 5px' }}
                onClick={() => setSwapping((v) => !v)} title="Swap a day for this week">
                <Icon name="swap_horiz" size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="wk-dot-row">
          {/* Two letters (Mo/Tu/We/Th/Fr/Sa/Su), not one — a single initial
              can't tell Tue from Thu or Sat from Sun apart at a glance. */}
          {t.freq === 'daily' && DAY_LABELS.map((lbl, d) => (
            <button key={d} className={`wk-dot${checks[checkKey(t, d)] ? ' done' : ''}${d === todayDayIdx() ? ' current' : ''}`}
              style={{ fontSize: 9.5 }} onClick={() => onToggleDay(d)} title={lbl}>{lbl.slice(0, 2)}</button>
          ))}
          {isCustom && (t.days || []).map((origDay, i) => {
            const dispDay = effDays[i]
            return (
              <button key={origDay} className={`wk-dot${checks[checkKey(t, origDay)] ? ' done' : ''}${dispDay === todayDayIdx() ? ' current' : ''}`}
                style={{ fontSize: 9.5 }} onClick={() => onToggleDay(origDay)}
                title={dispDay !== origDay ? `${DAY_LABELS[origDay]} → ${DAY_LABELS[dispDay]}` : DAY_LABELS[origDay]}>
                {DAY_LABELS[dispDay].slice(0, 2)}
              </button>
            )
          })}
          {t.freq === 'xperweek' && Array.from({ length: xpwTarget(t) }).map((_, i) => (
            <button key={i} className={`wk-dot${checks[`${t.local_id || t.id}_${i}`] ? ' done' : ''}`}
              onClick={() => onToggleXpw(i)} title={`${i + 1}`}>{i + 1}</button>
          ))}
          {(t.freq === 'weekly' || t.freq === 'onetime') && (
            <button className={`wk-dot${checks[t.local_id || t.id] ? ' done' : ''}`} onClick={() => onToggleDay(null)}>
              <Icon name="check" size={13} />
            </button>
          )}
        </div>
      </div>

      {isCustom && swapping && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 10,
          background: 'var(--white-soft)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700 }}>
            Something came up? Move a day to a different slot for week {week} only.
          </div>
          {(t.days || []).map((origDay, i) => {
            const dispDay = effDays[i]
            // Can't land two of this tactic's own obligations on the same
            // day — exclude days the OTHER slots are currently displaying.
            const taken = new Set(effDays.filter((_, j) => j !== i))
            const options = DAY_LABELS.map((_, d) => d).filter((d) => d === origDay || d === dispDay || !taken.has(d))
            return (
              <div key={origDay} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, width: 40 }}>{DAY_LABELS[origDay]}</span>
                <Icon name="arrow_forward" size={13} style={{ color: 'var(--text-3)' }} />
                <select style={{ fontSize: 12, padding: '3px 6px', flex: 1 }} value={dispDay}
                  onChange={(e) => onSwapDay(origDay, Number(e.target.value))}>
                  {options.map((d) => (
                    <option key={d} value={d}>{DAY_LABELS[d]}{d === origDay ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════ Goal Room ══════════════════ */

function GoalRoom({ goals, rollup, sprints, onEdit, onStartCycle }) {
  const [filter, setFilter] = useState('active')
  const [open, setOpen] = useState(null)
  const confirm = useConfirm()
  // Savings Targets (from the Finance app) stays wired — fetchSavingsGoals
  // is still called and SHOW_SAVINGS flips the panel back on — just not
  // rendered yet. Jack: "that will come later, I'm not ready for that one
  // yet." Remove the flag once Finance data is ready to surface here.
  const SHOW_SAVINGS = false
  const savings = useAsync((f) => fetchSavingsGoals({ force: f }))

  const list = (goals.data || []).filter((g) => (filter === 'all' ? true : g.status === filter))
  const rollupBy = {}
  ;(rollup.data || []).forEach((r) => { rollupBy[r.goal_id] = r })

  const balance = AREAS.map((a) => ({
    label: areaLabel(a), color: areaColor(a),
    value: (goals.data || []).filter((g) => g.area === a && g.status === 'active').length,
  })).filter((d) => d.value > 0)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div className="filter-tabs">
          {[['active', 'Active'], ['completed', 'Done'], ['paused', 'Paused'], ['all', 'All']].map(([v, l]) => (
            <button key={v} className={`filter-tab${filter === v ? ' active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        {balance.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DonutChart data={balance} size={56} />
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>
              {balance.map((d) => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color, display: 'inline-block' }} />
                  {d.label} · {d.value}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ErrorNote error={goals.error} />

      {goals.loading ? (
        <Loading />
      ) : !list.length ? (
        <Card><Empty icon="explore" title="No goals here"
          action={<button className="btn btn-primary btn-sm" onClick={() => onEdit({})}>
            <Icon name="add" size={15} /> New goal</button>} /></Card>
      ) : (
        <div className="goals-grid" style={{ marginBottom: 24 }}>
          {list.map((g) => (
            <GoalCard key={g.id} goal={g} roll={rollupBy[g.id]}
              hasCycle={(sprints?.data || []).some((s) => s.goal_id === g.id)}
              onStartCycle={() => onStartCycle?.(g.id)}
              open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)}
              onEdit={() => onEdit(g)}
              onDelete={async () => {
                if (!confirm.isArmed(g.id)) return confirm.arm(g.id)
                await deleteGoal(g.id); toast.success('Goal deleted'); goals.reload()
              }}
              armed={confirm.isArmed(g.id)} />
          ))}
        </div>
      )}

      {SHOW_SAVINGS && (
        <Card>
          <CardHead title="Savings Targets" sub="From your Finance app — shown here, edited there." />
          {savings.loading ? <Loading /> : !(savings.data || []).length ? (
            <Empty icon="savings" title="No savings goals yet" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {savings.data.map((s) => {
                const pct = s.target ? Math.min(100, Math.round((s.current / s.target) * 100)) : 0
                return (
                  <div key={s.id} className="mini-item" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>{s.name}</strong>
                      <div className="prog-track" style={{ marginTop: 8, marginBottom: 4 }}>
                        <div className="prog-fill green" style={{ width: `${pct}%` }} />
                      </div>
                      <small>${Number(s.current || 0).toLocaleString()} / ${Number(s.target || 0).toLocaleString()}
                        {s.due_date ? ` · due ${pretty(s.due_date)}` : ''}</small>
                    </div>
                    <Badge tone={pct >= 100 ? 'green' : 'blue'}>{pct}%</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </>
  )
}

function GoalCard({ goal, roll, hasCycle, onStartCycle, open, onToggle, onEdit, onDelete, armed }) {
  const iconFor = { health: 'favorite', work: 'work', family: 'diversity_3', personal: 'spa' }
  return (
    <div className={`goal-card ${goal.area}`} style={{ borderLeftColor: areaColor(goal.area) }} onClick={onToggle}>
      <div className="goal-grid-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {/* Area badge now takes its colour from the same areaColor() the
              card's own border-left uses — previously this said "blue" for
              every single area, which fought the border-left colour and
              made the area-colour system look decorative rather than real. */}
          <span className="badge" style={{ background: areaColor(goal.area), color: '#fff' }}>{areaLabel(goal.area)}</span>
          {goal.status !== 'active' && <Badge tone="muted">{goal.status}</Badge>}
          {/* Identity thread tag — see lib/identity.js. One shared hue
              (MODULES.identity) for every thread; the icon is what tells
              them apart, same reasoning as the design-system comment on
              IDENTITY_ACCENT in lib/design.js. */}
          {goal.identity_thread && identityThreadByKey[goal.identity_thread] && (
            <span className="badge" title={identityThreadByKey[goal.identity_thread].hint}
              style={{ background: MODULES.identity.tint, color: MODULES.identity.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={identityThreadByKey[goal.identity_thread].icon} size={12} />
              {identityThreadByKey[goal.identity_thread].short}
            </span>
          )}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, lineHeight: 1.3 }}>{goal.title}</h3>
        {goal.why && <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 12 }}>{goal.why}</p>}
        {/* A brand-new goal used to just sit here with nothing to do next —
            the goal→cycle gap flagged in the critique. A goal with zero
            cycles gets an explicit next step instead of silence. */}
        {!hasCycle && goal.status === 'active' && (
          <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
            onClick={(e) => { e.stopPropagation(); onStartCycle() }}>
            <Icon name="add_circle" size={14} /> No cycle yet — start one
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-3)', marginTop: 'auto' }}>
          <span><Icon name="checklist" size={14} /> {roll?.open_tasks ?? 0}</span>
          <span><Icon name="repeat" size={14} /> {roll?.habits ?? 0}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className="btn btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); onEdit() }}>
              <Icon name="edit" size={14} /></button>
            <button className={`btn btn-icon btn-sm${armed ? ' btn-danger' : ''}`}
              onClick={(e) => { e.stopPropagation(); onDelete() }}><Icon name="delete" size={14} /></button>
          </span>
        </div>
      </div>
      {open && <GoalDetail goal={goal} />}
    </div>
  )
}

// A bare "10000" next to a Currency metric or "target 80" next to a
// Percentage one gives no unit at all, even though the type picker offers
// both — this is the difference between a tracker and an instrument.
function fmtMetricValue(type, val) {
  if (val == null || val === '') return val
  if (type === 'Currency') return `$${Number(val).toLocaleString()}`
  if (type === 'Percentage') return `${val}%`
  return val
}

function GoalDetail({ goal }) {
  const metrics = useAsync((f) => fetchGoalMetrics({ force: f }))
  const logs = useAsync((f) => fetchMetricLogs({ force: f }))
  const tasks = useAsync((f) => fetchGoalTasks(goal.id, { force: f }), [goal.id])
  const habits = useAsync((f) => fetchHabits({ force: f }))
  const [metricOpen, setMetricOpen] = useState(false)
  const [picker, setPicker] = useState(null)
  const [logDrafts, setLogDrafts] = useState({})
  const confirm = useConfirm()

  const mine = (metrics.data || []).filter((m) => m.goal_id === goal.id)
  const myHabits = (habits.data || []).filter((h) => h.goal_id === goal.id)
  const latestFor = (metricId) => (logs.data || []).find((l) => l.metric_id === metricId)

  // Was a native browser prompt() — jarring next to the rest of the app's
  // UI and the most literal "data entry" moment in the module. An inline
  // input that opens in place is the same three keystrokes with none of
  // the popup-box feel.
  async function commitLog(metricId) {
    const raw = logDrafts[metricId]
    if (raw === '' || raw == null || Number.isNaN(Number(raw))) { toast.error('Enter a number'); return }
    await logMetric(metricId, goal.id, today(), Number(raw))
    setLogDrafts((d) => { const n = { ...d }; delete n[metricId]; return n })
    toast.success('Logged'); logs.reload()
  }

  return (
    <div className="cycle-section" onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="form-section-label" style={{ marginBottom: 0 }}>Metrics</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setMetricOpen(true)}><Icon name="add" size={14} /> Add</button>
      </div>
      {!mine.length ? <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No metrics yet.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {mine.map((m) => {
            const last = latestFor(m.id)
            const drafting = logDrafts[m.id] !== undefined
            const pct = m.target && last ? Math.max(0, Math.min(100, (Number(last.value) / Number(m.target)) * 100)) : null
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mini-item">
                  <div>
                    <strong>{m.name}</strong>
                    <small>{m.type}{m.target ? ` · target ${fmtMetricValue(m.type, m.target)}` : ''}</small>
                  </div>
                  {last && <Badge tone="green">{fmtMetricValue(m.type, last.value)}</Badge>}
                  {drafting ? (
                    <>
                      <input type="number" inputMode="decimal" autoFocus
                        value={logDrafts[m.id]}
                        placeholder="value"
                        style={{ width: 84, fontSize: 12.5, padding: '5px 8px' }}
                        onChange={(e) => setLogDrafts({ ...logDrafts, [m.id]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitLog(m.id)
                          if (e.key === 'Escape') setLogDrafts((d) => { const n = { ...d }; delete n[m.id]; return n })
                        }} />
                      <button className="btn btn-icon btn-sm" onClick={() => commitLog(m.id)} aria-label="Save value">
                        <Icon name="check" size={13} /></button>
                      <button className="btn btn-icon btn-sm"
                        onClick={() => setLogDrafts((d) => { const n = { ...d }; delete n[m.id]; return n })}
                        aria-label="Cancel"><Icon name="close" size={13} /></button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setLogDrafts({ ...logDrafts, [m.id]: last ? String(last.value) : '' })}>
                      Log
                    </button>
                  )}
                  <button className={`btn btn-icon btn-sm${confirm.isArmed(m.id) ? ' btn-danger' : ''}`}
                    onClick={async () => {
                      if (!confirm.isArmed(m.id)) return confirm.arm(m.id)
                      await deleteMetric(m.id); metrics.reload()
                    }}><Icon name="delete" size={13} /></button>
                </div>
                {pct != null && (
                  <div className="score-meter" style={{ height: 6 }}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="form-section-label" style={{ marginBottom: 0 }}>Pulse Tasks</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setPicker('task')}><Icon name="link" size={14} /> Link</button>
      </div>
      {tasks.loading ? <Loading /> : !(tasks.data || []).length ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nothing linked.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {tasks.data.map((t) => (
            <div key={t.id} className="mini-item">
              <span>{t.title}</span>
              {t.due_at && <small>{prettyShort(t.due_at.slice(0, 10))}</small>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="form-section-label" style={{ marginBottom: 0 }}>Habits</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setPicker('habit')}><Icon name="link" size={14} /> Link</button>
      </div>
      {!myHabits.length ? <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>None linked.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {myHabits.map((h) => <div key={h.id} className="mini-item"><Icon name="repeat" size={14} />{h.name}</div>)}
        </div>
      )}

      <MetricEditor goalId={goal.id} open={metricOpen} onClose={() => setMetricOpen(false)} onSaved={() => metrics.reload()} />
      <LinkPicker kind={picker} goalId={goal.id} onClose={() => setPicker(null)}
        onDone={() => { tasks.reload(); habits.reload() }} />
    </div>
  )
}

function MetricEditor({ goalId, open, onClose, onSaved }) {
  const [m, setM] = useState({ name: '', type: 'Number', target: '' })
  return (
    <Modal open={open} onClose={onClose} title="Add metric" width={440} footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!m.name.trim()} onClick={async () => {
          await saveMetric({ ...m, goal_id: goalId })
          toast.success('Metric added'); setM({ name: '', type: 'Number', target: '' }); onSaved(); onClose()
        }}>Add</button>
      </>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name"><input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Monthly revenue" /></Field>
        <Field label="Type">
          <select value={m.type} onChange={(e) => setM({ ...m, type: e.target.value })}>
            {METRIC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Target"><input value={m.target} onChange={(e) => setM({ ...m, target: e.target.value })} placeholder="e.g. 10000" /></Field>
      </div>
    </Modal>
  )
}

function LinkPicker({ kind, goalId, onClose, onDone }) {
  const open = Boolean(kind)
  const tasks = useAsync((f) => fetchUnlinkedTasks({ force: f }), [kind], { enabled: kind === 'task' })
  const habits = useAsync((f) => fetchHabits({ force: f }), [kind], { enabled: kind === 'habit' })
  const list = kind === 'task' ? (tasks.data || []) : (habits.data || []).filter((h) => !h.goal_id)

  return (
    <Modal open={open} onClose={onClose} title={kind === 'task' ? 'Link a Pulse task' : 'Link a habit'} width={460}>
      {(kind === 'task' ? tasks.loading : habits.loading) ? <Loading /> : !list.length ? (
        <Empty title="Nothing available" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
          {list.map((x) => (
            <button key={x.id} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={async () => {
              if (kind === 'task') await linkTaskToGoal(x.id, goalId)
              else await linkHabitToGoal(x.id, goalId)
              toast.success('Linked'); onDone(); onClose()
            }}>{x.title || x.name}</button>
          ))}
        </div>
      )}
    </Modal>
  )
}

function GoalEditor({ goal, onClose, onSaved }) {
  const open = Boolean(goal)
  const [g, setG] = useState(null)
  const cur = g ?? (goal?.id ? goal : { title: '', area: 'personal', why: '', status: 'active' })
  const [saving, setSaving] = useState(false)

  return (
    <Modal open={open} onClose={() => { setG(null); onClose() }} title={goal?.id ? 'Edit goal' : 'New goal'} width={520}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { setG(null); onClose() }}>Cancel</button>
          <button className="btn btn-primary" disabled={!cur.title?.trim() || saving} onClick={async () => {
            setSaving(true)
            try {
              const justCompleted = goal?.id && goal.status !== 'completed' && cur.status === 'completed'
              await saveGoal({ ...cur, id: goal?.id })
              if (justCompleted) toast.success(`🎉 "${cur.title}" — goal completed!`, { duration: 4500 })
              else toast.success(goal?.id ? 'Goal updated' : 'Goal created')
              setG(null); onSaved(); onClose()
            } catch (e) { toast.error(e.message) } finally { setSaving(false) }
          }}>{saving ? 'Saving…' : 'Save Goal'}</button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="What's the goal?">
          <input value={cur.title || ''} autoFocus onChange={(e) => setG({ ...cur, title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Life Area">
            <select value={cur.area} onChange={(e) => setG({ ...cur, area: e.target.value })}>
              {AREAS.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={cur.status} onChange={(e) => setG({ ...cur, status: e.target.value })}>
              {GOAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Why does this matter?" hint="The reason that will still matter when motivation dips.">
          <textarea value={cur.why || ''} onChange={(e) => setG({ ...cur, why: e.target.value })} />
        </Field>
        <Field label="Identity thread (optional)"
          hint="Which part of your identity statement is this goal actually for? See it rolled up on the Identity page.">
          <select value={cur.identity_thread || ''} onChange={(e) => setG({ ...cur, identity_thread: e.target.value || null })}>
            <option value="">— none —</option>
            {IDENTITY_THREADS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

/* ══════════════════ Cycles ══════════════════ */

function CyclesView({ goals, cycleData, cycleIntent }) {
  const { sprints, phases, tactics } = cycleData
  const [editing, setEditing] = useState(null)
  const [cloneFrom, setCloneFrom] = useState(null)
  const [filter, setFilter] = useState('active')
  const confirm = useConfirm()
  const all = sprints.data || []
  const list = all.filter((s) => (filter === 'active' ? !s.archived : s.archived))
  const archivedCount = all.filter((s) => s.archived).length

  // A "start a cycle" request from elsewhere in the module (Today's empty
  // state, a goal card with no cycle) lands as a {token, goalId} signal —
  // open the New Cycle editor, pre-filled with that goal if one was given.
  useEffect(() => {
    if (!cycleIntent) return
    setCloneFrom(null)
    setEditing({})
  }, [cycleIntent?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  function closeEditor() { setEditing(null); setCloneFrom(null) }

  function duplicate(s) {
    const myPhases = (phases.data || []).filter((p) => p.sprint_id === s.id).sort((a, b) => a.phase_index - b.phase_index)
    const myTactics = (tactics.data || []).filter((x) => x.sprint_id === s.id)
    setCloneFrom({
      name: `${s.name} (Copy)`, outcome: s.outcome || '', goal_id: s.goal_id,
      phases: myPhases.length
        ? myPhases.map((p) => ({
            name: p.name, description: p.description || '',
            tactics: myTactics.filter((t) => t.phase_id === p.id)
              .map((t) => ({ text: t.text, freq: t.freq || 'daily', days: t.days || [], times_per_week: t.times_per_week || 3 })),
          }))
        : DEFAULT_PHASES.map((p) => ({ ...p, tactics: [] })),
    })
    setEditing({})
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div className="filter-tabs">
          <button className={`filter-tab${filter === 'active' ? ' active' : ''}`} onClick={() => setFilter('active')}>
            Active
          </button>
          <button className={`filter-tab${filter === 'archived' ? ' active' : ''}`} onClick={() => setFilter('archived')}>
            Archived{archivedCount ? ` (${archivedCount})` : ''}
          </button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
          <Icon name="add" size={15} /> New Cycle
        </button>
      </div>

      {sprints.loading ? <Loading /> : !list.length ? (
        <Card><Empty icon="loop" title={filter === 'archived' ? 'Nothing archived' : 'No focus cycles yet'}
          action={filter === 'active' && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>Start one</button>}>
          {filter === 'archived'
            ? 'Cycles you tuck away show up here, still around if you want to duplicate or revisit one.'
            : 'A cycle gives one goal a deadline, phases, and a set of repeatable tactics.'}
        </Empty></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {list.map((s) => {
            const goal = (goals.data || []).find((g) => g.id === s.goal_id)
            const myPhases = (phases.data || []).filter((p) => p.sprint_id === s.id)
            const myTactics = (tactics.data || []).filter((x) => x.sprint_id === s.id)
            return (
              <CycleCard key={s.id} sprint={s} phases={myPhases} tactics={myTactics} goal={goal}
                onChanged={() => sprints.reload()} onEdit={() => setEditing(s)}
                onDuplicate={() => duplicate(s)}
                onArchive={async () => {
                  await setSprintArchived(s.id, !s.archived)
                  toast.success(s.archived ? 'Cycle unarchived' : 'Cycle archived')
                  sprints.reload()
                }}
                onDelete={async () => {
                  if (!confirm.isArmed(s.id)) return confirm.arm(s.id)
                  await deleteSprint(s.id); toast.success('Cycle deleted'); sprints.reload()
                }} />
            )
          })}
        </div>
      )}

      <CycleEditor sprint={editing} cloneFrom={cloneFrom} goals={goals.data || []} onClose={closeEditor}
        seedGoalId={cycleIntent?.goalId}
        onSaved={() => { sprints.reload(); phases.reload(); tactics.reload() }} />
    </>
  )
}

function CycleEditor({ sprint, cloneFrom, goals, seedGoalId, onClose, onSaved }) {
  const open = Boolean(sprint)
  const [s, setS] = useState(null)
  // seedGoalId comes from "start a cycle" being triggered against a
  // specific goal (Today's empty state doesn't have one; a goal card's
  // "No cycle yet" button does) — pre-fills the goal picker instead of
  // defaulting to whichever goal happens to be first in the list.
  const cur = s ?? (sprint?.id ? sprint : {
    name: '', outcome: '', goal_id: seedGoalId || goals[0]?.id || '', start_date: today(), end_date: autoEndDate(today()),
  })
  const [phaseDrafts, setPhaseDrafts] = useState(DEFAULT_PHASES.map((p) => ({ ...p, tactics: [] })))
  const [saving, setSaving] = useState(false)
  // Tactic ids that existed on disk and got removed from the draft this
  // edit. removeTactic only ever mutates local phaseDrafts state — save()
  // upserted whatever survived in the draft but never deleted a tactic
  // the draft dropped, so "remove" toasted "Cycle saved" while the row
  // stayed in the database untouched. This ref is the fix: it tracks what
  // needs an actual DELETE, applied in save() below.
  const removedTacticIds = useRef([])
  const existingPhases = useAsync((f) => fetchSprintPhases({ force: f }), [sprint?.id], { enabled: Boolean(sprint?.id) })
  const existingTactics = useAsync((f) => fetchSprintTactics({ force: f }), [sprint?.id], { enabled: Boolean(sprint?.id) })

  // Quick setup: skip building three phases by hand and just ask for one
  // action, applied across the whole 12 weeks. Only offered for brand-new,
  // non-cloned cycles — editing an existing one, or duplicating one that
  // already has real phases, always shows the full structure so nothing
  // gets silently collapsed. "Full setup" is still one click away for
  // anyone who wants phase-by-phase control up front.
  const [quickMode, setQuickMode] = useState(!sprint?.id && !cloneFrom)
  const [quickTactic, setQuickTactic] = useState({ text: '', freq: 'xperweek', times_per_week: 3, days: [] })
  // Quick mode's real friction wasn't the toggle, it was that Name and
  // Outcome still demanded attention up front even though neither is
  // required to save. Both start collapsed for a brand-new quick cycle —
  // Name gets derived automatically, Outcome is opt-in — and either can be
  // expanded with one click for anyone who wants to fill them in by hand.
  const [showName, setShowName] = useState(false)
  const [showOutcome, setShowOutcome] = useState(false)
  useEffect(() => {
    if (!open) return
    removedTacticIds.current = []
    if (cloneFrom) {
      // Duplicating an existing cycle: same goal/outcome/phases/tactics,
      // fresh dates and a blank slate for checks/retro (those live on the
      // sprint row itself and are never copied — only phaseDrafts, built
      // from cloneFrom.phases, feed the save below).
      setQuickMode(false)
      setS({ name: cloneFrom.name, outcome: cloneFrom.outcome, goal_id: cloneFrom.goal_id,
        start_date: today(), end_date: autoEndDate(today()) })
      setPhaseDrafts(cloneFrom.phases)
      return
    }
    setQuickMode(!sprint?.id)
    setQuickTactic({ text: '', freq: 'xperweek', times_per_week: 3, days: [] })
    setShowName(false); setShowOutcome(false)
  }, [open, cloneFrom]) // eslint-disable-line react-hooks/exhaustive-deps
  const isQuickNew = quickMode && !sprint?.id && !cloneFrom

  // Was `useMemo` doing a setState during render — works today but is a
  // React anti-pattern that will misbehave under StrictMode/concurrent
  // rendering. It only exists to react to sprint/existingPhases/existingTactics
  // changing, which is exactly what useEffect is for.
  useEffect(() => {
    if (!sprint?.id) { setPhaseDrafts(DEFAULT_PHASES.map((p) => ({ ...p, tactics: [] }))); return }
    const mine = (existingPhases.data || []).filter((p) => p.sprint_id === sprint.id).sort((a, b) => a.phase_index - b.phase_index)
    if (!mine.length) return
    setPhaseDrafts(mine.map((p) => ({
      id: p.id, name: p.name, description: p.description || '',
      tactics: (existingTactics.data || []).filter((t) => t.phase_id === p.id),
    })))
  }, [sprint?.id, existingPhases.data, existingTactics.data]) // eslint-disable-line react-hooks/exhaustive-deps

  function addTactic(pi) {
    const next = [...phaseDrafts]
    next[pi] = { ...next[pi], tactics: [...next[pi].tactics, { text: '', freq: 'daily', days: [], times_per_week: 3 }] }
    setPhaseDrafts(next)
  }
  function updateTactic(pi, ti, patch) {
    const next = [...phaseDrafts]
    const tacticsArr = [...next[pi].tactics]
    tacticsArr[ti] = { ...tacticsArr[ti], ...patch }
    next[pi] = { ...next[pi], tactics: tacticsArr }
    setPhaseDrafts(next)
  }
  function removeTactic(pi, ti) {
    const removed = phaseDrafts[pi].tactics[ti]
    // Only an already-saved row (has a real id) needs a DELETE on save —
    // a tactic added and removed within the same edit was never written.
    if (removed?.id) removedTacticIds.current = [...removedTacticIds.current, removed.id]
    const next = [...phaseDrafts]
    next[pi] = { ...next[pi], tactics: next[pi].tactics.filter((_, i) => i !== ti) }
    setPhaseDrafts(next)
  }

  async function save() {
    setSaving(true)
    try {
      const isQuick = quickMode && !sprint?.id
      const drafts = isQuick
        ? DEFAULT_PHASES.map((p) => ({ ...p, tactics: quickTactic.text.trim() ? [{ ...quickTactic }] : [] }))
        : phaseDrafts
      // A name is bookkeeping, not a decision — quick mode never made the
      // user type one, so derive one from the goal + the single action
      // whenever it was left blank (still fully editable via "Name it
      // myself" before this point).
      let payload = cur
      if (isQuick && !cur.name?.trim()) {
        const goalTitle = goals.find((g) => g.id === cur.goal_id)?.title || 'Cycle'
        payload = { ...cur, name: `${goalTitle} — ${quickTactic.text.trim()}`.slice(0, 80) }
      }
      const sprintId = await saveSprint({ ...payload, id: sprint?.id })
      const id = sprint?.id || sprintId
      for (let pi = 0; pi < drafts.length; pi++) {
        const draft = drafts[pi]
        const phaseId = draft.id || await savePhase({ sprint_id: id, phase_index: pi, name: draft.name, description: draft.description })
        for (const t of draft.tactics) {
          if (!t.text?.trim()) continue
          await saveTactic({ ...t, id: t.id, phase_id: phaseId, sprint_id: id })
        }
      }
      // Actually delete whatever removeTactic marked for removal — see the
      // comment on removedTacticIds above. Deletes only, never fabricated
      // from a diff: this is the exact set the user clicked "remove" on.
      for (const tacticId of removedTacticIds.current) {
        await deleteTactic(tacticId)
      }
      removedTacticIds.current = []
      toast.success('Cycle saved')
      setS(null); onSaved(); onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const PHASE_BADGES = [['Weeks 1–4', 'blue'], ['Weeks 5–8', 'purple'], ['Weeks 9–12', 'orange']]

  return (
    <Modal open={open} onClose={() => { setS(null); onClose() }}
      title={sprint?.id ? 'Edit Cycle' : cloneFrom ? 'Duplicate Cycle' : 'New Focus Cycle'} width={700}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { setS(null); onClose() }}>Cancel</button>
          <button className="btn btn-primary"
            disabled={saving || !cur.goal_id || (isQuickNew ? !quickTactic.text.trim() : !cur.name?.trim())}
            onClick={save}>
            {saving ? 'Saving…' : 'Save Cycle'}
          </button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cloneFrom && (
          <div className="badge badge-blue" style={{ width: 'fit-content' }}>
            <Icon name="content_copy" size={12} /> Duplicating "{cloneFrom.name.replace(/ \(Copy\)$/, '')}"
          </div>
        )}
        {!sprint?.id && !cloneFrom && (
          <div>
            <div className="flex gap-1" style={{ background: 'var(--white-soft)', borderRadius: 999, padding: 3, width: 'fit-content', marginBottom: 6 }}>
              <button type="button" className={`btn btn-sm ${quickMode ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 999 }} onClick={() => setQuickMode(true)}>Quick</button>
              <button type="button" className={`btn btn-sm ${!quickMode ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 999 }} onClick={() => setQuickMode(false)}>Full (phases)</button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
              {quickMode
                ? 'One action, applied across all 12 weeks. Switch to Full anytime to break it into phases.'
                : 'Build out Foundation, Build, and Peak phases with their own actions up front.'}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {(!isQuickNew || showName) ? (
            <Field label="Cycle Name"><input autoFocus={isQuickNew} value={cur.name || ''} onChange={(e) => setS({ ...cur, name: e.target.value })} placeholder="Q3 Foundation Build" /></Field>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowName(true)}>
                <Icon name="edit" size={13} /> Name it myself <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>(otherwise auto-named)</span>
              </button>
            </div>
          )}
          <Field label="Goal">
            <select value={cur.goal_id || ''} onChange={(e) => setS({ ...cur, goal_id: e.target.value })}>
              <option value="">Choose a goal…</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date">
            <input type="date" value={cur.start_date || ''}
              onChange={(e) => setS({ ...cur, start_date: e.target.value, end_date: autoEndDate(e.target.value) })} />
          </Field>
          <Field label="End Date (auto)"><input type="date" value={cur.end_date || ''} readOnly style={{ opacity: .5 }} /></Field>
        </div>
        {(!isQuickNew || showOutcome) ? (
          <Field label="What does success look like at week 12?">
            <input value={cur.outcome || ''} onChange={(e) => setS({ ...cur, outcome: e.target.value })} placeholder="e.g. Running 3× per week consistently" />
          </Field>
        ) : (
          <button type="button" className="btn btn-ghost btn-xs" style={{ width: 'fit-content' }} onClick={() => setShowOutcome(true)}>
            <Icon name="add" size={12} /> Add success criteria (optional)
          </button>
        )}

        {quickMode && !sprint?.id ? (
          <>
            <Field label="What will you do, and how often?">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input style={{ flex: '1 1 200px' }} value={quickTactic.text} placeholder="e.g. Go for a run"
                  onChange={(e) => setQuickTactic({ ...quickTactic, text: e.target.value })} />
                <select style={{ width: 110 }} value={quickTactic.freq}
                  onChange={(e) => setQuickTactic({ ...quickTactic, freq: e.target.value })}>
                  <option value="daily">Daily</option>
                  <option value="xperweek">×/week</option>
                  <option value="weekly">Weekly</option>
                </select>
                {quickTactic.freq === 'xperweek' && (
                  <input type="number" min={1} max={7} style={{ width: 56 }} value={quickTactic.times_per_week || 3}
                    onChange={(e) => setQuickTactic({ ...quickTactic, times_per_week: Number(e.target.value) })} />
                )}
              </div>
            </Field>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600, marginTop: -8 }}>
              You can add more actions or split this into phases anytime — edit the cycle and switch to Full setup.
            </p>
          </>
        ) : (
          <>
        <div className="form-section-label">Phases &amp; Weekly Actions</div>
        {phaseDrafts.map((phase, pi) => (
          <div key={pi} className="card-inner" style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--white-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Badge tone={PHASE_BADGES[pi][1]}>{PHASE_BADGES[pi][0]}</Badge>
              <input value={phase.name} style={{ maxWidth: 160, fontSize: 13, fontWeight: 700 }}
                onChange={(e) => { const n = [...phaseDrafts]; n[pi] = { ...n[pi], name: e.target.value }; setPhaseDrafts(n) }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {phase.tactics.map((t, ti) => (
                <div key={ti} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input style={{ flex: '1 1 160px' }} value={t.text} placeholder="Action text"
                    onChange={(e) => updateTactic(pi, ti, { text: e.target.value })} />
                  <select style={{ width: 110 }} value={t.freq} onChange={(e) => updateTactic(pi, ti, { freq: e.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="xperweek">×/week</option>
                    <option value="custom">Custom days</option>
                    <option value="onetime">One-time</option>
                  </select>
                  {t.freq === 'xperweek' && (
                    <input type="number" min={1} max={7} style={{ width: 56 }} value={t.times_per_week || 3}
                      onChange={(e) => updateTactic(pi, ti, { times_per_week: Number(e.target.value) })} />
                  )}
                  {t.freq === 'custom' && (
                    <div style={{ display: 'flex', gap: 3 }}>
                      {DAY_LABELS.map((lbl, d) => (
                        <button key={d} type="button" className="btn btn-xs"
                          style={(t.days || []).includes(d) ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : undefined}
                          onClick={() => {
                            const days = new Set(t.days || [])
                            days.has(d) ? days.delete(d) : days.add(d)
                            updateTactic(pi, ti, { days: [...days].sort() })
                          }}>{lbl[0]}</button>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-icon btn-sm" onClick={() => removeTactic(pi, ti)}><Icon name="close" size={13} /></button>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => addTactic(pi)}><Icon name="add" size={14} /> Add action</button>
          </div>
        ))}
          </>
        )}
      </div>
    </Modal>
  )
}

/* ══════════════════ Roadmap ══════════════════ */

function RoadmapView({ goals, sprints }) {
  const dated = (sprints.data || []).filter((s) => s.start_date && s.end_date && !s.archived)

  if (sprints.loading) return <Loading />
  if (!goals.data?.length) return <Card><Empty icon="map" title="No goals yet">Add goals and cycles to see your roadmap.</Empty></Card>

  const today_ = new Date(); today_.setHours(12, 0, 0, 0)
  const allDates = dated.flatMap((s) => [s.start_date, s.end_date]).map((d) => new Date(d + 'T12:00'))
  const minDate = new Date(Math.min(...allDates, today_)); minDate.setDate(minDate.getDate() - 30)
  const maxDate = new Date(Math.max(...allDates, today_)); maxDate.setDate(maxDate.getDate() + 30)
  const totalMs = maxDate - minDate
  const pctOf = (d) => Math.min(100, Math.max(0, ((new Date(d + 'T12:00') - minDate) / totalMs) * 100))

  const months = []
  const cur = new Date(minDate); cur.setDate(1)
  while (cur <= maxDate) {
    months.push({ label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), pct: ((cur - minDate) / totalMs) * 100 })
    cur.setMonth(cur.getMonth() + 1)
  }
  const todayPct = pctOf(today())
  const activeGoals = (goals.data || []).filter((g) => g.status !== 'completed')

  return (
    <Card style={{ overflowX: 'auto', padding: 24 }}>
      <div style={{ minWidth: 600 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ width: 160, flexShrink: 0 }} />
          <div style={{ flex: 1, position: 'relative', height: 22, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
            {months.map((m, i) => (
              <span key={i} className="roadmap-month-label" style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}>{m.label}</span>
            ))}
          </div>
        </div>
        {activeGoals.map((g) => {
          const mySprints = dated.filter((s) => s.goal_id === g.id)
          const color = areaColor(g.area)
          return (
            <div key={g.id} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: mySprints.length > 1 ? 52 : 36 }}>
              <div className="roadmap-label">
                <div className="roadmap-label-title">{g.title}</div>
                <div className="roadmap-label-sub">{areaLabel(g.area)}</div>
              </div>
              <div style={{ flex: 1, position: 'relative', minHeight: 48 }}>
                <div className="roadmap-today-line" style={{ left: `${todayPct}%` }}>
                  <span className="roadmap-today-label">Today</span>
                </div>
                {!mySprints.length ? (
                  <span style={{ fontSize: 12, color: 'var(--text-3)', paddingTop: 14, display: 'block' }}>No cycles yet</span>
                ) : mySprints.map((sp) => {
                  const left = pctOf(sp.start_date), right = pctOf(sp.end_date)
                  const width = Math.max(right - left, 1)
                  const isAct = isSprintActive(sp)
                  const prog = sprintCurrentWeek(sp) / 12 * 100
                  return (
                    <div key={sp.id} className="roadmap-bar" title={sp.name}
                      style={{ left: `${left}%`, width: `${width}%`, top: 6, background: color, opacity: isAct ? 1 : .55 }}>
                      {isAct && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog}%`, background: 'rgba(255,255,255,.18)', borderRadius: 10 }} />}
                      <span style={{ position: 'relative', zIndex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sp.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
          {AREAS.map((a) => (
            <span key={a} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: areaColor(a), display: 'inline-block' }} />{areaLabel(a)}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ══════════════════ Visions ══════════════════ */

function VisionsView() {
  const visions = useAsync((f) => fetchVisions({ force: f }))
  const [editing, setEditing] = useState(null)
  // Was an uncontrolled <textarea> read via document.getElementById at save
  // time — Cancel, or just navigating away, silently discarded whatever was
  // typed with no warning, in the longest-form writing this module has.
  // A real draft in state means the value can't be lost underneath you.
  const [draft, setDraft] = useState('')

  const byArea = {}
  ;(visions.data || []).forEach((v) => { byArea[v.area] = v })

  function startEditing(area) {
    setDraft(byArea[area]?.content || '')
    setEditing(area)
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5" style={{ marginBottom: 18 }}>
        {AREAS.map((area) => {
          const v = byArea[area]
          const isEditing = editing === area
          return (
            <Card key={area}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                {/* Was tone="green" for all four areas — every card looked
                    like the same category. Now matches the real per-area
                    colour used everywhere else (goal cards, roadmap, donut). */}
                <span className="badge" style={{ background: areaColor(area), color: '#fff' }}>{areaLabel(area)}</span>
                {!isEditing && (
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => startEditing(area)}>
                    <Icon name="edit" size={14} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <>
                  <textarea value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
                    placeholder='"I move through life with real energy..."' />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={async () => {
                      await saveVision(area, draft)
                      toast.success('Vision saved'); visions.reload(); setEditing(null)
                    }}>Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <p className="visions-statement" style={{ fontSize: 15, fontStyle: v?.content ? 'italic' : 'normal', color: v?.content ? 'var(--text-2)' : 'var(--text-3)', cursor: 'pointer' }}
                  onClick={() => startEditing(area)}>
                  {v?.content || 'Write the future state. Click to add.'}
                </p>
              )}
            </Card>
          )
        })}
      </div>

      <Card pad={false}><div style={{ padding: 20 }}><VisionBoard /></div></Card>
    </>
  )
}

/* ══════════════════ Retros ══════════════════ */

const RETRO_OUTCOMES = [['yes', 'Yes, fully'], ['mostly', 'Mostly'], ['partial', 'Partially'], ['no', 'Not really']]
const RETRO_RATINGS = [['1', '😞'], ['2', '😐'], ['3', '🙂'], ['4', '💪'], ['5', '🔥']]

function RetrosView({ goals, sprints, cycleData }) {
  const [editing, setEditing] = useState(null)
  const t = today()
  const finished = (sprints.data || []).filter((s) => s.end_date && s.end_date < t && !s.archived)
  const isWritten = (s) => { const r = s.retro || {}; return Boolean(r.win || r.lesson || r.carry) }
  // A cycle that just crossed its end date and has no retro yet is the one
  // genuine "you finished something" event in this whole module — it used
  // to render exactly like every other card, just with grayer placeholder
  // text. Pulling it out into a hero card gives that moment the fanfare
  // the workout goals' celebration banner already gets.
  const needsRetro = finished.filter((s) => !isWritten(s))
  const written = finished.filter(isWritten)

  return (
    <>
      {sprints.loading ? <Loading /> : !finished.length ? (
        <Card><Empty icon="workspace_premium" title="No completed cycles yet">
          When a cycle's end date passes it shows up here for a retrospective.
        </Empty></Card>
      ) : (
        <>
          {needsRetro.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {needsRetro.map((s) => {
                const goal = (goals.data || []).find((g) => g.id === s.goal_id)
                const myPhases = (cycleData?.phases?.data || []).filter((p) => p.sprint_id === s.id)
                const myTactics = (cycleData?.tactics?.data || []).filter((x) => x.sprint_id === s.id)
                const avg = avgExecScore(myPhases, myTactics, s)
                return (
                  <div key={s.id} className="hero-card" style={{ background: areaColor(goal?.area) || 'var(--accent)' }}>
                    <div className="hero-content">
                      <div>
                        <div className="hero-eyebrow">Cycle complete 🎉</div>
                        <div className="hero-h" style={{ fontSize: 26 }}>{s.name}</div>
                        <p className="hero-copy">
                          {goal?.title ? `${goal.title} · ` : ''}ran {pretty(s.start_date)} → {pretty(s.end_date)}
                          {avg != null ? ` · averaged ${avg}% execution` : ''}.
                        </p>
                        <div className="hero-actions">
                          <button className="btn btn-primary" onClick={() => setEditing(s)}>
                            <Icon name="edit" size={16} /> Write the retro
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {written.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {written.map((s) => {
                const goal = (goals.data || []).find((g) => g.id === s.goal_id)
                const r = s.retro || {}
                return (
                  <Card key={s.id}>
                    <CardHead title={s.name} sub={`${goal?.title || ''} · ended ${pretty(s.end_date)}`}
                      right={<button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>
                        <Icon name="edit" size={14} /> Edit</button>} />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <RetroBit label="Biggest win" text={r.win} />
                      <RetroBit label="Biggest lesson" text={r.lesson} />
                      <RetroBit label="Carrying forward" text={r.carry} />
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <RetroEditor sprint={editing} onClose={() => setEditing(null)} onSaved={() => sprints.reload()} />
    </>
  )
}

const RetroBit = ({ label, text }) => (
  <div>
    <div className="form-section-label">{label}</div>
    <p style={{ fontSize: 13, lineHeight: 1.55, color: text ? 'var(--text-2)' : 'var(--text-3)' }}>{text || '—'}</p>
  </div>
)

function RetroEditor({ sprint, onClose, onSaved }) {
  const open = Boolean(sprint)
  const [r, setR] = useState(null)
  const cur = r ?? (sprint?.retro || { outcome: '', win: '', lesson: '', carry: '', rating: '' })
  const [saving, setSaving] = useState(false)

  return (
    <Modal open={open} onClose={() => { setR(null); onClose() }} title="Cycle Retrospective" width={560}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { setR(null); onClose() }}>Later</button>
          <button className="btn btn-primary" disabled={saving} onClick={async () => {
            setSaving(true)
            try {
              await saveSprint({ ...sprint, retro: cur })
              toast.success('Retro saved'); setR(null); onSaved(); onClose()
            } catch (e) { toast.error(e.message) } finally { setSaving(false) }
          }}>{saving ? 'Saving…' : 'Save Retrospective'}</button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Did you achieve what you set out to?">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RETRO_OUTCOMES.map(([v, l]) => (
              <button key={v} type="button" className="btn btn-sm"
                style={cur.outcome === v ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : undefined}
                onClick={() => setR({ ...cur, outcome: v })}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="Biggest win of the cycle"><textarea value={cur.win} onChange={(e) => setR({ ...cur, win: e.target.value })} /></Field>
        <Field label="Biggest lesson learned"><textarea value={cur.lesson} onChange={(e) => setR({ ...cur, lesson: e.target.value })} /></Field>
        <Field label="What will you carry into the next cycle?"><textarea value={cur.carry} onChange={(e) => setR({ ...cur, carry: e.target.value })} /></Field>
        <Field label="Overall rating">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RETRO_RATINGS.map(([v, emoji]) => (
              <button key={v} type="button" className="btn"
                style={{ width: 48, height: 48, fontSize: 20, ...(cur.rating === v ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}) }}
                onClick={() => setR({ ...cur, rating: v })}>{emoji}</button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
