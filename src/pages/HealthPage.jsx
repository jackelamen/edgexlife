import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import {
  Card, CardHead, PageHeader, StatCard, Badge, Tabs, Modal, Field, SectionLabel,
  Empty, Loading, ErrorNote, CoachCard, Ring, ScoreRow, DriverRow, useConfirm,
  MetricLegend, StatusDots, DesignLegend,
} from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  fetchHealthIndex, fetchHealthLogs, fetchHealthSettings, saveHealthLog,
  deleteHealthLog, saveHealthSettings, fetchRoutines, saveRoutines,
  fetchChecks, setRoutineCheck, newId,
} from '../lib/data'
import {
  healthDetails, healthLabel, weakestComponent, healthDrivers, METRIC_ADVICE,
} from '../lib/scores'
import { today, daysAgo, pretty, prettyShort } from '../lib/dates'
import WorkoutModule from '../components/health/WorkoutModule'
import FastingModule, { FastingStatusCard } from '../components/health/FastingModule'
import TrendChart from '../components/health/TrendChart'

const VIEWS = [
  { value: 'today', label: 'Today' },
  { value: 'log', label: 'Daily Log' },
  { value: 'workout', label: 'Workout' },
  { value: 'fasting', label: 'Fasting' },
  { value: 'routines', label: 'Routines' },
  { value: 'trends', label: 'Trends' },
  { value: 'settings', label: 'Settings' },
]

export default function HealthPage() {
  const [view, setView] = useState('today')
  const [editDate, setEditDate] = useState(null)

  const settings = useAsync((f) => fetchHealthSettings({ force: f }))
  const index = useAsync((f) => fetchHealthIndex({ force: f }))

  return (
    <View>
      {view !== 'workout' && (
        <PageHeader
          kicker={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          title="EDGE Health"
          sub="Build and protect a high Health Score."
          actions={
            <button className="btn btn-primary" onClick={() => setEditDate(today())}>
              <Icon name="add" size={17} /> Log Today
            </button>
          }
        />
      )}

      <Tabs value={view} onChange={setView} options={VIEWS} />

      {view === 'today' && <TodayView settings={settings.data} onEdit={setEditDate} onNavFasting={() => setView('fasting')} />}
      {view === 'log' && <LogView settings={settings.data} index={index} onEdit={setEditDate} />}
      {view === 'workout' && <WorkoutModule />}
      {view === 'fasting' && <FastingModule />}
      {view === 'routines' && <RoutinesView />}
      {view === 'trends' && <TrendsView settings={settings.data} index={index} />}
      {view === 'settings' && <SettingsView settings={settings} />}

      <LogEditor
        date={editDate}
        settings={settings.data}
        onClose={() => setEditDate(null)}
        onSaved={() => index.reload()}
      />
    </View>
  )
}

/* ═══════════════ Today ═══════════════ */

function TodayView({ settings, onEdit, onNavFasting }) {
  const t = today()
  const logs = useAsync((f) => fetchHealthLogs(t, t, { force: f }), [t])
  const routines = useAsync((f) => fetchRoutines({ force: f }))
  const checks = useAsync((f) => fetchChecks(t, t, { force: f }), [t])
  // 14 days of scores for the status-dot strip.
  const recent = useAsync((f) => fetchHealthLogs(daysAgo(13), t, { force: f }), [t])

  const log = (logs.data || [])[0] || null
  const details = log ? healthDetails(log, settings) : null
  const [title, copy] = healthLabel(details?.score ?? null)
  const weakest = weakestComponent(details)
  const todayChecks = checks.data?.[t] || {}
  const list = routines.data || []
  const done = list.filter((r) => todayChecks[r.id]).length

  // Percent-of-target per metric — drives both tile fill and status pill.
  const pctOf = (v, target) => (v == null || !target ? null : Math.min(100, (v / target) * 100))
  const sleepPct = pctOf(log?.sleepHours, settings?.sleepTarget ?? 7.5)
  const stepsPct = pctOf(log?.steps, settings?.stepTarget ?? 10000)
  const waterPct = pctOf(log?.water, settings?.waterTarget ?? 2)
  const exPct = pctOf(log?.exerciseMins, (settings?.weeklyExerciseTarget ?? 150) / 5)

  // Map each of the last 14 days to its score (null where unlogged).
  const byDate = {}
  ;(recent.data || []).forEach((l) => { byDate[l.date] = healthDetails(l, settings)?.score ?? null })
  const dots = Array.from({ length: 14 }).map((_, idx) => byDate[daysAgo(13 - idx)] ?? null)
  const onTrack = dots.filter((d) => d != null && d >= 85).length

  return (
    <>
      <div className="hero-card" style={{ marginBottom: 14 }}>
        <div className="hero-content">
          <div>
            <div className="hero-eyebrow">Health score</div>
            <div className="hero-h">{title}</div>
            <p className="hero-copy">{copy}</p>
            {!log && (
              <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => onEdit(t)}>
                <Icon name="edit_note" size={17} /> Log today
              </button>
            )}
          </div>
          <Ring score={details?.score ?? null} sub="today" />
        </div>
      </div>

      <FastingStatusCard onNav={onNavFasting} />

      <MetricLegend keys={['sleepHours', 'steps', 'water', 'exercise', 'energy']} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginBottom: 14 }}>
        <StatCard metricKey="sleepHours" label="Sleep" pct={sleepPct}
          value={log?.sleepHours != null ? `${log.sleepHours}h` : '--'}
          sub={settings ? `of ${settings.sleepTarget}h target` : ''} />
        <StatCard metricKey="steps" label="Steps" pct={stepsPct}
          value={log?.steps != null ? log.steps.toLocaleString() : '--'}
          sub={settings ? `of ${settings.stepTarget.toLocaleString()} target` : ''} />
        <StatCard metricKey="water" label="Water" pct={waterPct}
          value={log?.water != null ? `${log.water}L` : '--'}
          sub={settings ? `of ${settings.waterTarget}L target` : ''} />
        <StatCard metricKey="exercise" label="Movement" pct={exPct}
          value={log?.exerciseMins != null ? `${log.exerciseMins}m` : '--'}
          sub="daily share of weekly target" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Card>
          <CardHead title="What's driving your score" sub="Same hue as the tile above — heaviest weight first." />
          {details ? (
            [...details.components]
              .sort((a, b) => b.weight - a.weight)
              .map((c) => (
                <ScoreRow key={c.key} metricKey={c.key} label={c.label} detail={c.detail}
                  value={c.value} weight={c.weight} />
              ))
          ) : (
            <Empty icon="monitor_heart" title="No log today">
              Capture sleep, movement, hydration, energy, sleep quality and pain to see the breakdown.
            </Empty>
          )}

          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)',
          }}>
            <div>
              <strong style={{ fontSize: 13.5, fontWeight: 800 }}>Last 14 days</strong>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>
                Colour here is status, not metric
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{onTrack} on track</span>
          </div>
          <StatusDots values={dots} />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {weakest && (
          <CoachCard
            kicker="What would move it"
            title={`${weakest.label} is your weakest lever`}
            metricKey={weakest.key}
            chip={`at ${Math.round(weakest.value)} of 100`}
          >
            {weakest.advice}
          </CoachCard>
        )}

        <Card>
          <CardHead
            title="Today Routines"
            sub="The anchors you repeat."
            right={<Badge tone={done === list.length && list.length ? 'green' : 'blue'}>{done}/{list.length}</Badge>}
          />
          {routines.loading ? (
            <Loading />
          ) : !list.length ? (
            <Empty icon="checklist" title="No routines yet">
              Add repeatable daily anchors in the Routines tab.
            </Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((r) => {
                const isDone = Boolean(todayChecks[r.id])
                return (
                  <label key={r.id} className={`habit-row${isDone ? ' done' : ''}`} style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={isDone}
                      onChange={async (e) => {
                        try { await setRoutineCheck(t, r.id, e.target.checked); checks.reload() }
                        catch (err) { toast.error(err.message) }
                      }} />
                    <span style={{ fontWeight: 700, flex: 1 }}>{r.name}</span>
                    {r.slot && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.slot}</span>}
                  </label>
                )
              })}
            </div>
          )}
        </Card>
        </div>
      </div>
    </>
  )
}

/* ═══════════════ Daily Log ═══════════════ */

const WINDOWS = [
  { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: '1 year' },
]

function LogView({ settings, index, onEdit }) {
  const [days, setDays] = useState(90)
  const from = daysAgo(days)
  const to = today()
  const logs = useAsync((f) => fetchHealthLogs(from, to, { force: f }), [from, to])
  const confirm = useConfirm()

  const latest = index.data?.[0]
  const stale = latest && latest < from

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <CardHead
          title="Log History"
          sub="Every day you have recorded."
          right={<Tabs value={days} onChange={setDays} options={WINDOWS} />}
        />
        {stale && (
          <div style={{ background: 'var(--orange-light)', color: 'var(--orange)', borderRadius: 12, padding: '11px 13px', fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>
            Your most recent log is {pretty(latest)}. Widen the window to see it.
          </div>
        )}
        <ErrorNote error={logs.error} />
        {logs.loading ? (
          <Loading />
        ) : !(logs.data || []).length ? (
          <Empty icon="edit_calendar" title="Nothing logged in this window"
            action={<button className="btn btn-primary" onClick={() => onEdit(today())}>
              <Icon name="add" size={17} /> Log today</button>} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logs.data.map((l) => {
              const score = healthDetails(l, settings)?.score
              return (
                <div key={l.date} style={{
                  display: 'grid', gridTemplateColumns: '1.1fr 2fr auto', gap: 14, alignItems: 'center',
                  padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--white)',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{pretty(l.date)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                      Score {score ?? '--'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {l.sleepHours != null && <span className="log-chip"><Icon name="bedtime" size={13} />{l.sleepHours}h</span>}
                    {l.steps != null && <span className="log-chip"><Icon name="steps" size={13} />{l.steps.toLocaleString()}</span>}
                    {l.water != null && <span className="log-chip"><Icon name="water_drop" size={13} />{l.water}L</span>}
                    {l.exerciseMins ? <span className="log-chip"><Icon name="fitness_center" size={13} />{l.exerciseMins}m</span> : null}
                    {l.weight != null && <span className="log-chip"><Icon name="monitor_weight" size={13} />{l.weight}kg</span>}
                    {l.energy != null && <span className="log-chip"><Icon name="bolt" size={13} />{l.energy}/5</span>}
                    {l.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6, flexBasis: '100%' }}>{l.notes}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-icon btn-sm" onClick={() => onEdit(l.date)} aria-label="Edit">
                      <Icon name="edit" size={15} />
                    </button>
                    <button className={`btn btn-icon btn-sm${confirm.isArmed(l.date) ? ' btn-danger' : ''}`}
                      onClick={async () => {
                        if (!confirm.isArmed(l.date)) return confirm.arm(l.date)
                        await deleteHealthLog(l.date)
                        toast.success('Log deleted'); logs.reload(); index.reload()
                      }} aria-label="Delete">
                      <Icon name="delete" size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}

/* ═══════════════ Log editor ═══════════════ */

function RangeField({ label, value, onChange, low, high }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="range" min={1} max={5} step={1} value={value ?? 3}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="score-pill">{value ?? '–'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
        <span>{low}</span><span>{high}</span>
      </div>
    </div>
  )
}

function LogEditor({ date, settings, onClose, onSaved }) {
  const open = Boolean(date)
  const existing = useAsync((f) => fetchHealthLogs(date, date, { force: f }), [date], { enabled: open })
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) { setForm(null); return }
    const l = (existing.data || [])[0]
    setForm(l ? { ...l } : {
      date, sleepHours: null, sleepQuality: null, steps: null, water: null,
      weight: null, energy: null, pain: null, exerciseMins: null,
      exerciseTypes: [], notes: '',
    })
  }, [open, existing.data, date])

  const f = form
  const set = (k, v) => setForm({ ...f, [k]: v })
  const preview = f ? healthDetails(f, settings)?.score : null

  async function save() {
    setSaving(true)
    try {
      await saveHealthLog(date, {
        sleepHours: f.sleepHours, sleepQuality: f.sleepQuality, steps: f.steps,
        water: f.water, weight: f.weight, energy: f.energy, pain: f.pain,
        exerciseMins: f.exerciseMins, exerciseTypes: f.exerciseTypes || [],
        notes: f.notes || '',
      })
      toast.success('Log saved')
      onSaved?.(); onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={date ? pretty(date) : ''} sub="Log your day" maxWidth={620}>
      {!f ? <Loading /> : (
        <>
          <SectionLabel>The basics</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            <Field label="Sleep (hours)">
              <input type="number" step="0.25" max="24" value={f.sleepHours ?? ''}
                onChange={(e) => set('sleepHours', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Steps">
              <input type="number" step="100" value={f.steps ?? ''}
                onChange={(e) => set('steps', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Water (L)">
              <input type="number" step="0.1" value={f.water ?? ''}
                onChange={(e) => set('water', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Weight (kg)">
              <input type="number" step="0.1" value={f.weight ?? ''}
                onChange={(e) => set('weight', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Movement</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <Field label="Exercise (min)">
                <input type="number" step="5" value={f.exerciseMins ?? ''}
                  onChange={(e) => set('exerciseMins', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
              <Field label="Type" hint="Comma separated">
                <input value={(f.exerciseTypes || []).join(', ')}
                  placeholder="run, lifting"
                  onChange={(e) => set('exerciseTypes', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
              </Field>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>How it felt</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <RangeField label="Energy" value={f.energy} onChange={(v) => set('energy', v)} low="Depleted" high="Charged" />
              <RangeField label="Sleep quality" value={f.sleepQuality} onChange={(v) => set('sleepQuality', v)} low="Broken" high="Deep" />
              <RangeField label="Pain / strain" value={f.pain} onChange={(v) => set('pain', v)} low="None" high="Severe" />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Notes</SectionLabel>
            <textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)}
              placeholder="Anything that explains today's numbers." />
          </div>

          <div style={{
            display: 'flex', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              <Icon name="save" size={17} /> {saving ? 'Saving…' : 'Save log'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>
              Score preview <span className="score-pill" style={{ display: 'inline-flex', marginLeft: 6, verticalAlign: 'middle' }}>{preview ?? '--'}</span>
            </span>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ═══════════════ Routines ═══════════════ */

function RoutinesView() {
  const routines = useAsync((f) => fetchRoutines({ force: f }))
  const [draft, setDraft] = useState('')
  const [slot, setSlot] = useState('Morning')
  const confirm = useConfirm()
  const list = routines.data || []

  const commit = async (next) => { await saveRoutines(next); routines.reload() }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <Card>
        <CardHead title="Routine Library" sub="The anchors you tick off each day." />
        {routines.loading ? (
          <Loading />
        ) : !list.length ? (
          <Empty icon="checklist" title="No routines">
            Routines are the daily anchors you tick off on the Today tab.
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((r, idx) => (
              <div key={r.id} className="habit-row">
                <span style={{ fontWeight: 700, flex: 1 }}>{r.name}</span>
                {r.slot && <Badge tone="blue">{r.slot}</Badge>}
                <button className="btn btn-icon btn-sm" disabled={idx === 0}
                  onClick={() => {
                    const next = [...list]
                    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                    commit(next)
                  }} aria-label="Move up">
                  <Icon name="arrow_upward" size={15} />
                </button>
                <button className={`btn btn-icon btn-sm${confirm.isArmed(r.id) ? ' btn-danger' : ''}`}
                  onClick={() => {
                    if (!confirm.isArmed(r.id)) return confirm.arm(r.id)
                    commit(list.filter((x) => x.id !== r.id))
                  }} aria-label="Delete">
                  <Icon name="delete" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="Add routine" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="10 minute walk"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  commit([...list, { id: newId('r'), name: draft.trim(), slot }]); setDraft('')
                }
              }} />
          </Field>
          <Field label="Slot">
            <select value={slot} onChange={(e) => setSlot(e.target.value)}>
              {['Morning', 'Midday', 'Evening', 'Anytime'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <button className="btn btn-primary" disabled={!draft.trim()}
            onClick={() => { commit([...list, { id: newId('r'), name: draft.trim(), slot }]); setDraft(''); toast.success('Routine added') }}>
            <Icon name="add" size={17} /> Add routine
          </button>
        </div>
      </Card>
    </div>
  )
}

/* ═══════════════ Trends ═══════════════ */

const METRICS = [
  { value: 'score', label: 'Health Score', unit: '' },
  { value: 'sleepHours', label: 'Sleep', unit: 'h', targetKey: 'sleepTarget' },
  { value: 'steps', label: 'Steps', unit: '', targetKey: 'stepTarget' },
  { value: 'water', label: 'Water', unit: 'L', targetKey: 'waterTarget' },
  { value: 'exerciseMins', label: 'Exercise', unit: 'm' },
  { value: 'weight', label: 'Weight', unit: 'kg' },
  { value: 'energy', label: 'Energy', unit: '/5' },
]

function TrendsView({ settings, index }) {
  const [days, setDays] = useState(90)
  const [metric, setMetric] = useState('score')
  const from = daysAgo(days)
  const to = today()
  const logs = useAsync((f) => fetchHealthLogs(from, to, { force: f }), [from, to])

  const rows = logs.data || []
  const series = useMemo(() => [...rows].reverse(), [rows])
  const drivers = useMemo(() => (rows.length ? healthDrivers(rows, settings) : []), [rows, settings])

  const meta = METRICS.find((m) => m.value === metric)
  const points = series.map((l) => ({
    label: prettyShort(l.date),
    value: metric === 'score' ? healthDetails(l, settings)?.score ?? null : l[metric] ?? null,
  }))
  const target = meta?.targetKey ? settings?.[meta.targetKey] : null

  const vals = points.map((p) => p.value).filter((v) => v != null)
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  const best = vals.length ? Math.max(...vals) : null
  const last = vals.length ? vals[vals.length - 1] : null
  const hit = target ? Math.round((vals.filter((v) => v >= target).length / (vals.length || 1)) * 100) : null
  const weakest = drivers[0]

  const latest = index.data?.[0]
  const stale = latest && latest < from

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 16 }}>
        <Tabs value={metric} onChange={setMetric} options={METRICS} />
        <Tabs value={days} onChange={setDays} options={WINDOWS} />
      </div>

      {stale && (
        <div style={{ background: 'var(--orange-light)', color: 'var(--orange)', borderRadius: 12, padding: '11px 13px', fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>
          Your most recent log is {pretty(latest)}. Widen the window to see it.
        </div>
      )}

      {logs.loading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon="insights" title="No patterns yet">
          Log a few days and this will start reading your trends.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" style={{ marginBottom: 16 }}>
            <div className="insight-card"><span>Average</span><strong className="tnum">{avg != null ? (Math.round(avg * 10) / 10) : '--'}</strong><small>{meta.label}</small></div>
            <div className="insight-card"><span>Best</span><strong className="tnum">{best != null ? (Math.round(best * 10) / 10) : '--'}</strong><small>in window</small></div>
            <div className="insight-card"><span>Latest</span><strong className="tnum">{last != null ? (Math.round(last * 10) / 10) : '--'}</strong><small>most recent log</small></div>
            <div className="insight-card"><span>Hit rate</span><strong className="tnum">{hit != null ? hit + '%' : '--'}</strong><small>days at target</small></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4">
            <Card>
              <CardHead title={meta.label} sub={`${rows.length} logged days`} />
              <TrendChart
                points={points}
                target={target}
                unit={meta.unit}
                format={metric === 'steps' ? (v) => Math.round(v).toLocaleString() : undefined}
              />
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardHead title="What Is Driving It" sub="Weakest driver first." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {drivers.map((d) => (
                    <DriverRow key={d.label} label={d.label} detail={d.detail} score={d.score} hitRate={d.hitRate} />
                  ))}
                </div>
              </Card>

              {weakest && (
                <CoachCard title={`Your score is mostly limited by ${weakest.label.toLowerCase()}.`}>
                  {METRIC_ADVICE[weakest.label.toLowerCase().split(' ')[0]] ||
                    'Choose one small support behavior and repeat it for the next few logged days.'}
                </CoachCard>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

/* ═══════════════ Settings ═══════════════ */

function SettingsView({ settings }) {
  const [form, setForm] = useState(null)
  const s = form ?? settings.data
  const [saving, setSaving] = useState(false)
  if (!s) return <Loading />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
    <Card>
      <CardHead title="Targets" sub="These feed the Health Score directly." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        <Field label="Sleep target (h)">
          <input type="number" step="0.25" value={s.sleepTarget}
            onChange={(e) => setForm({ ...s, sleepTarget: Number(e.target.value) })} />
        </Field>
        <Field label="Step target">
          <input type="number" step="500" value={s.stepTarget}
            onChange={(e) => setForm({ ...s, stepTarget: Number(e.target.value) })} />
        </Field>
        <Field label="Water target (L)">
          <input type="number" step="0.1" value={s.waterTarget}
            onChange={(e) => setForm({ ...s, waterTarget: Number(e.target.value) })} />
        </Field>
        <Field label="Weekly exercise (min)">
          <input type="number" step="10" value={s.weeklyExerciseTarget}
            onChange={(e) => setForm({ ...s, weeklyExerciseTarget: Number(e.target.value) })} />
        </Field>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 12 }}>
        Changing a target re-reads every past score, since the score is always computed
        against your current targets.
      </p>
      <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={!form || saving}
        onClick={async () => {
          setSaving(true)
          try { await saveHealthSettings(s); toast.success('Targets saved'); settings.reload(); setForm(null) }
          catch (e) { toast.error(e.message) } finally { setSaving(false) }
        }}>
        <Icon name="save" size={17} /> {saving ? 'Saving…' : 'Save targets'}
      </button>
    </Card>

    <DesignLegend />
    </div>
  )
}
