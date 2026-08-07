import { useMemo, useState } from 'react'
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
  fetchSprints, saveSprint, deleteSprint, fetchSprintPhases, savePhase, deletePhase,
  fetchSprintTactics, saveTactic, deleteTactic, fetchGoalRollup, fetchSavingsGoals,
  fetchGoalTasks, fetchUnlinkedTasks, linkTaskToGoal,
  fetchHabits, linkHabitToGoal,
} from '../lib/data'
import { today, pretty, prettyShort } from '../lib/dates'
import {
  AREA_META, areaLabel, areaColor, DAY_LABELS, todayDayIdx,
  sprintCurrentWeek, isSprintActive, phaseIdxForWeek, tacticsForWeek,
  xpwTarget, xpwDoneCount, xpwDidToday, tacticCheckpointCount, checkKey,
  execScore, avgExecScore, todayDoneTotals, scoreColor, scoreBadgeTone,
  autoEndDate, DEFAULT_PHASES,
} from '../lib/goals'
import VisionBoard from '../components/goals/VisionBoard'
import StreakChart from '../components/goals/StreakChart'
import DonutChart from '../components/goals/DonutChart'

const VIEWS = [
  { value: 'today', label: 'Today' },
  { value: 'goals', label: 'Goals' },
  { value: 'cycles', label: 'Cycles' },
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'visions', label: 'Visions' },
  { value: 'retros', label: 'Retros' },
]

export default function GoalsPage() {
  const [view, setView] = useState('today')
  const [editGoal, setEditGoal] = useState(null)

  const goals = useAsync((f) => fetchGoals({ force: f }))
  const rollup = useAsync((f) => fetchGoalRollup({ force: f }))
  const sprints = useAsync((f) => fetchSprints({ force: f }))
  const phases = useAsync((f) => fetchSprintPhases({ force: f }))
  const tactics = useAsync((f) => fetchSprintTactics({ force: f }))

  const cycleData = { sprints, phases, tactics }

  return (
    <View>
      <PageHeader
        kicker="Goals"
        title={VIEWS.find((v) => v.value === view)?.label}
        sub="Vision, cycles, and the promises that deserve a plan."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditGoal({})}>
            <Icon name="add" size={15} /> New Goal
          </button>
        }
      />
      <Tabs value={view} onChange={setView} options={VIEWS} />

      {view === 'today' && <TodayView goals={goals} rollup={rollup} cycleData={cycleData} />}
      {view === 'goals' && <GoalRoom goals={goals} rollup={rollup} onEdit={setEditGoal} />}
      {view === 'cycles' && <CyclesView goals={goals} cycleData={cycleData} />}
      {view === 'roadmap' && <RoadmapView goals={goals} sprints={sprints} />}
      {view === 'visions' && <VisionsView />}
      {view === 'retros' && <RetrosView goals={goals} sprints={sprints} />}

      <GoalEditor goal={editGoal} onClose={() => setEditGoal(null)}
        onSaved={() => { goals.reload(); rollup.reload() }} />
    </View>
  )
}

/* ══════════════════ shared: cycle lookups ══════════════════ */

function useLiveCycles({ sprints, phases, tactics }) {
  const t = today()
  const live = (sprints.data || []).filter((s) => isSprintActive(s))
  const forSprint = (sp) => ({
    phases: (phases.data || []).filter((p) => p.sprint_id === sp.id),
    tactics: (tactics.data || []).filter((x) => x.sprint_id === sp.id),
  })
  return { t, live, forSprint }
}

/* ══════════════════ Today ══════════════════ */

function TodayView({ goals, rollup, cycleData }) {
  const { live, forSprint } = useLiveCycles(cycleData)
  const active = (goals.data || []).filter((g) => g.status === 'active')

  const todayTotals = live.reduce((acc, sp) => {
    const { phases, tactics } = forSprint(sp)
    const r = todayDoneTotals(phases, tactics, sp)
    return { done: acc.done + r.done, total: acc.total + r.total }
  }, { done: 0, total: 0 })

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
        <div className="hero-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-green">{live.length} live cycle{live.length === 1 ? '' : 's'}</span>
            <span className="badge badge-blue">{active.length} active goal{active.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <StatCard label="Active goals" value={active.length} />
        <StatCard label="Live cycles" value={live.length} />
        <StatCard label="Open tasks" value={(rollup.data || []).reduce((s, r) => s + r.open_tasks, 0)} sub="in Pulse" />
      </div>

      {cycleData.sprints.loading ? (
        <Loading />
      ) : !live.length ? (
        <Card>
          <Empty icon="rocket_launch" title="Nothing in motion yet"
            action={<button className="btn btn-primary btn-sm" onClick={() => {}}>Start a Cycle</button>}>
            Start a 12-week Focus Cycle and your daily actions will show up here.
          </Empty>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {live.map((sp) => {
            const { phases, tactics } = forSprint(sp)
            const goal = (goals.data || []).find((g) => g.id === sp.goal_id)
            return (
              <CycleCard key={sp.id} sprint={sp} phases={phases} tactics={tactics} goal={goal}
                compact onChanged={() => cycleData.sprints.reload()} />
            )
          })}
        </div>
      )}
    </>
  )
}

/* ══════════════════ Cycle card (shared by Today + Cycles) ══════════════════ */

function CycleCard({ sprint, phases, tactics, goal, compact, onChanged, onDelete, onEdit }) {
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
    const week_checks = { ...(sprint.week_checks || {}), [week]: nextChecks }
    await saveSprint({ ...sprint, week_checks })
    onChanged()
  }

  async function toggleXpw(t, slotIdx) {
    const key = `${t.local_id || t.id}_${slotIdx}`
    const already = checks[key]
    const nextChecks = { ...checks }
    if (already) delete nextChecks[key]
    else nextChecks[key] = new Date().toISOString().slice(0, 10)
    const week_checks = { ...(sprint.week_checks || {}), [week]: nextChecks }
    await saveSprint({ ...sprint, week_checks })
    onChanged()
  }

  return (
    <div className="cycle-card">
      <div className="cycle-header">
        <div className="cycle-ring-section"><Ring score={score} size={72} stroke={7} sub={`wk ${week}`} /></div>
        <div className="cycle-info">
          <div className="cycle-meta">
            {isSprintActive(sprint) && <Badge tone="green">Live</Badge>}
            <span className="cycle-goal-link">{goal?.title || 'No goal'}</span>
          </div>
          <div className="cycle-name">{sprint.name}</div>
          {sprint.outcome && <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{sprint.outcome}</p>}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            {sprint.start_date || '—'} → {sprint.end_date || '—'} · avg {avg ?? '--'}%
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
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
            <span>Week {week} of 12</span>
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
                <TacticRow key={t.id} tactic={t} checks={checks} onToggleDay={(d) => toggle(t, d)}
                  onToggleXpw={(i) => toggleXpw(t, i)} />
              ))}
            </div>
          )}

          {!compact && <StreakChart sprint={sprint} phases={phases} tactics={tactics} />}
        </div>
      )}
    </div>
  )
}

function TacticRow({ tactic: t, checks, onToggleDay, onToggleXpw }) {
  const n = tacticCheckpointCount(t)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t.text}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          {t.freq === 'xperweek' ? `${xpwDoneCount(t, checks)}/${n} this week` :
            t.freq === 'custom' ? (t.days || []).map((d) => DAY_LABELS[d]).join(', ') :
            t.freq}
        </div>
      </div>
      <div className="wk-dot-row">
        {t.freq === 'daily' && DAY_LABELS.map((lbl, d) => (
          <button key={d} className={`wk-dot${checks[checkKey(t, d)] ? ' done' : ''}${d === todayDayIdx() ? ' current' : ''}`}
            onClick={() => onToggleDay(d)} title={lbl}>{lbl[0]}</button>
        ))}
        {t.freq === 'custom' && (t.days || []).map((d) => (
          <button key={d} className={`wk-dot${checks[checkKey(t, d)] ? ' done' : ''}${d === todayDayIdx() ? ' current' : ''}`}
            onClick={() => onToggleDay(d)} title={DAY_LABELS[d]}>{DAY_LABELS[d][0]}</button>
        ))}
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
  )
}

/* ══════════════════ Goal Room ══════════════════ */

function GoalRoom({ goals, rollup, onEdit }) {
  const [filter, setFilter] = useState('active')
  const [open, setOpen] = useState(null)
  const confirm = useConfirm()
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
    </>
  )
}

function GoalCard({ goal, roll, open, onToggle, onEdit, onDelete, armed }) {
  const iconFor = { health: 'favorite', work: 'work', family: 'diversity_3', personal: 'spa' }
  return (
    <div className={`goal-card ${goal.area}`} style={{ borderLeftColor: areaColor(goal.area) }} onClick={onToggle}>
      <div className="goal-grid-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Badge tone="blue">{areaLabel(goal.area)}</Badge>
          {goal.status !== 'active' && <Badge tone="muted">{goal.status}</Badge>}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, lineHeight: 1.3 }}>{goal.title}</h3>
        {goal.why && <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 12 }}>{goal.why}</p>}
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

function GoalDetail({ goal }) {
  const metrics = useAsync((f) => fetchGoalMetrics({ force: f }))
  const logs = useAsync((f) => fetchMetricLogs({ force: f }))
  const tasks = useAsync((f) => fetchGoalTasks(goal.id, { force: f }), [goal.id])
  const habits = useAsync((f) => fetchHabits({ force: f }))
  const [metricOpen, setMetricOpen] = useState(false)
  const [picker, setPicker] = useState(null)
  const confirm = useConfirm()

  const mine = (metrics.data || []).filter((m) => m.goal_id === goal.id)
  const myHabits = (habits.data || []).filter((h) => h.goal_id === goal.id)
  const latestFor = (metricId) => (logs.data || []).find((l) => l.metric_id === metricId)

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
            return (
              <div key={m.id} className="mini-item">
                <div>
                  <strong>{m.name}</strong>
                  <small>{m.type}{m.target ? ` · target ${m.target}` : ''}</small>
                </div>
                {last && <Badge tone="green">{last.value}</Badge>}
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  const v = prompt(`Log a value for "${m.name}"`)
                  if (v == null || v === '') return
                  await logMetric(m.id, goal.id, today(), Number(v))
                  toast.success('Logged'); logs.reload()
                }}>Log</button>
                <button className={`btn btn-icon btn-sm${confirm.isArmed(m.id) ? ' btn-danger' : ''}`}
                  onClick={async () => {
                    if (!confirm.isArmed(m.id)) return confirm.arm(m.id)
                    await deleteMetric(m.id); metrics.reload()
                  }}><Icon name="delete" size={13} /></button>
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
              await saveGoal({ ...cur, id: goal?.id })
              toast.success(goal?.id ? 'Goal updated' : 'Goal created')
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
      </div>
    </Modal>
  )
}

/* ══════════════════ Cycles ══════════════════ */

function CyclesView({ goals, cycleData }) {
  const { sprints, phases, tactics } = cycleData
  const [editing, setEditing] = useState(null)
  const confirm = useConfirm()
  const list = (sprints.data || []).filter((s) => !s.retro?.closed)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{list.length} cycles</span>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
          <Icon name="add" size={15} /> New Cycle
        </button>
      </div>

      {sprints.loading ? <Loading /> : !list.length ? (
        <Card><Empty icon="loop" title="No focus cycles yet"
          action={<button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>Start one</button>}>
          A cycle gives one goal a deadline, phases, and a set of repeatable tactics.
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
                onDelete={async () => {
                  if (!confirm.isArmed(s.id)) return confirm.arm(s.id)
                  await deleteSprint(s.id); toast.success('Cycle deleted'); sprints.reload()
                }} />
            )
          })}
        </div>
      )}

      <CycleEditor sprint={editing} goals={goals.data || []} onClose={() => setEditing(null)}
        onSaved={() => { sprints.reload(); phases.reload(); tactics.reload() }} />
    </>
  )
}

function CycleEditor({ sprint, goals, onClose, onSaved }) {
  const open = Boolean(sprint)
  const [s, setS] = useState(null)
  const cur = s ?? (sprint?.id ? sprint : {
    name: '', outcome: '', goal_id: goals[0]?.id || '', start_date: today(), end_date: autoEndDate(today()),
  })
  const [phaseDrafts, setPhaseDrafts] = useState(DEFAULT_PHASES.map((p) => ({ ...p, tactics: [] })))
  const [saving, setSaving] = useState(false)
  const existingPhases = useAsync((f) => fetchSprintPhases({ force: f }), [sprint?.id], { enabled: Boolean(sprint?.id) })
  const existingTactics = useAsync((f) => fetchSprintTactics({ force: f }), [sprint?.id], { enabled: Boolean(sprint?.id) })

  useMemo(() => {
    if (!sprint?.id) { setPhaseDrafts(DEFAULT_PHASES.map((p) => ({ ...p, tactics: [] }))); return }
    const mine = (existingPhases.data || []).filter((p) => p.sprint_id === sprint.id).sort((a, b) => a.phase_index - b.phase_index)
    if (!mine.length) return
    setPhaseDrafts(mine.map((p) => ({
      id: p.id, name: p.name, description: p.description || '',
      tactics: (existingTactics.data || []).filter((t) => t.phase_id === p.id),
    })))
  }, [sprint?.id, existingPhases.data, existingTactics.data]) // eslint-disable-line

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
    const next = [...phaseDrafts]
    next[pi] = { ...next[pi], tactics: next[pi].tactics.filter((_, i) => i !== ti) }
    setPhaseDrafts(next)
  }

  async function save() {
    setSaving(true)
    try {
      const sprintId = await saveSprint({ ...cur, id: sprint?.id })
      const id = sprint?.id || sprintId
      for (let pi = 0; pi < phaseDrafts.length; pi++) {
        const draft = phaseDrafts[pi]
        const phaseId = draft.id || await savePhase({ sprint_id: id, phase_index: pi, name: draft.name, description: draft.description })
        for (const t of draft.tactics) {
          if (!t.text?.trim()) continue
          await saveTactic({ ...t, id: t.id, phase_id: phaseId, sprint_id: id })
        }
      }
      toast.success('Cycle saved')
      setS(null); onSaved(); onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const PHASE_BADGES = [['Weeks 1–4', 'blue'], ['Weeks 5–8', 'purple'], ['Weeks 9–12', 'orange']]

  return (
    <Modal open={open} onClose={() => { setS(null); onClose() }} title={sprint?.id ? 'Edit Cycle' : 'New Focus Cycle'} width={700}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { setS(null); onClose() }}>Cancel</button>
          <button className="btn btn-primary" disabled={!cur.name?.trim() || !cur.goal_id || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Cycle'}
          </button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cycle Name"><input value={cur.name || ''} onChange={(e) => setS({ ...cur, name: e.target.value })} placeholder="Q3 Foundation Build" /></Field>
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
        <Field label="What does success look like at week 12?">
          <input value={cur.outcome || ''} onChange={(e) => setS({ ...cur, outcome: e.target.value })} placeholder="e.g. Running 3× per week consistently" />
        </Field>

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
      </div>
    </Modal>
  )
}

/* ══════════════════ Roadmap ══════════════════ */

function RoadmapView({ goals, sprints }) {
  const dated = (sprints.data || []).filter((s) => s.start_date && s.end_date)

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
  const todayPct = pctOf(today_.toISOString().slice(0, 10))
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

  const byArea = {}
  ;(visions.data || []).forEach((v) => { byArea[v.area] = v })

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5" style={{ marginBottom: 18 }}>
        {AREAS.map((area) => {
          const v = byArea[area]
          const isEditing = editing === area
          return (
            <Card key={area}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Badge tone="green">{areaLabel(area)}</Badge>
                {!isEditing && (
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(area)}>
                    <Icon name="edit" size={14} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <>
                  <textarea defaultValue={v?.content || ''} id={`vision-${area}`} autoFocus
                    placeholder='"I move through life with real energy..."' />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={async () => {
                      const val = document.getElementById(`vision-${area}`).value
                      await saveVision(area, val)
                      toast.success('Vision saved'); visions.reload(); setEditing(null)
                    }}>Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <p className="visions-statement" style={{ fontSize: 15, fontStyle: v?.content ? 'italic' : 'normal', color: v?.content ? 'var(--text-2)' : 'var(--text-3)', cursor: 'pointer' }}
                  onClick={() => setEditing(area)}>
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

function RetrosView({ goals, sprints }) {
  const [editing, setEditing] = useState(null)
  const t = today()
  const finished = (sprints.data || []).filter((s) => s.end_date && s.end_date < t)

  return (
    <>
      {sprints.loading ? <Loading /> : !finished.length ? (
        <Card><Empty icon="workspace_premium" title="No completed cycles yet">
          When a cycle's end date passes it shows up here for a retrospective.
        </Empty></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {finished.map((s) => {
            const goal = (goals.data || []).find((g) => g.id === s.goal_id)
            const r = s.retro || {}
            const written = r.win || r.lesson || r.carry
            return (
              <Card key={s.id}>
                <CardHead title={s.name} sub={`${goal?.title || ''} · ended ${pretty(s.end_date)}`}
                  right={<button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>
                    <Icon name="edit" size={14} /> {written ? 'Edit' : 'Write retro'}</button>} />
                {!written ? (
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No retrospective written.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <RetroBit label="Biggest win" text={r.win} />
                    <RetroBit label="Biggest lesson" text={r.lesson} />
                    <RetroBit label="Carrying forward" text={r.carry} />
                  </div>
                )}
              </Card>
            )
          })}
        </div>
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
