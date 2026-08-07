import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import {
  PageHeader, Card, CardHead, StatCard, Badge, Tabs, Field, Empty, Loading,
  ErrorNote, Modal, CoachCard, Ring, ScoreRow, useConfirm,
} from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  fetchWellnessIndex, fetchWellnessCheckins, fetchWellnessNotes,
  saveCheckin, deleteCheckin, saveThought, deleteThought,
  addPractice, deletePractice, newId,
} from '../lib/data'
import {
  clarityDetails, clarityLabel, MOOD_LABELS, STATES, SLEEP_IMPACTS, THOUGHT_TYPES,
} from '../lib/scores'
import { RESET_TOOLS, suggestedReset, PRACTICE_TYPES, AFTER_STATES } from '../lib/practices'
import { today, daysAgo, shiftDate, pretty } from '../lib/dates'
import { STATUS } from '../lib/design'
import BreathTimer from '../components/wellness/BreathTimer'

const VIEWS = [
  { value: 'today', label: 'Today' },
  { value: 'checkin', label: 'Check In' },
  { value: 'reset', label: 'Reset Tools' },
  { value: 'meditate', label: 'Meditate' },
  { value: 'inbox', label: 'Mental Load' },
  { value: 'journal', label: 'Journal' },
  { value: 'trends', label: 'Trends' },
  { value: 'settings', label: 'Settings' },
]

const excerpt = (text, len = 130) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return clean.length > len ? clean.slice(0, len - 1).trim() + '…' : clean
}
const checkinTime = (c) => c?.savedAt
  ? new Date(c.savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  : 'unsaved time'

/*
  Wellness, ported view-for-view from wellness.html: Today, Check In, Reset
  Tools, Meditate, Mental Load, Journal, Trends, Settings. Multi-check-ins
  per day are a first-class feature of the original (the entry selector on
  Check In) and are preserved here rather than collapsed to "one per day."
*/
export default function WellnessPage() {
  const [view, setView] = useState('today')
  const [editingDate, setEditingDate] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const index = useAsync((f) => fetchWellnessIndex({ force: f }))
  const notes = useAsync((f) => fetchWellnessNotes({ force: f }))

  const t = today()
  const todayCheckins = useAsync((f) => fetchWellnessCheckins(t, t, { force: f }), [t])
  const latest = (todayCheckins.data || [])[(todayCheckins.data || []).length - 1] || null

  const reloadAll = () => { index.reload(); todayCheckins.reload(); notes.reload() }

  function openCheckin(date, id) {
    setEditingDate(date); setEditingId(id || null); setView('checkin')
  }

  return (
    <View>
      <PageHeader
        kicker="Wellness"
        title={VIEWS.find((v) => v.value === view)?.label}
        sub="The clarity and nervous-system layer of your Life OS."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => openCheckin(t, null)}>
            <Icon name="edit_note" size={15} /> Check In
          </button>
        }
      />
      <Tabs value={view} onChange={setView} options={VIEWS} />

      {view === 'today' && (
        <Dashboard latest={latest} notes={notes} todayCheckins={todayCheckins}
          onCheckIn={() => openCheckin(t, latest?.id)} onNav={setView} onOpenCheckin={openCheckin} />
      )}
      {view === 'checkin' && (
        <CheckinView
          date={editingDate || t} entryId={editingId}
          onSaved={(date) => { reloadAll(); setEditingDate(date); setView('today') }}
          onDeleted={() => { reloadAll(); setEditingId(null); setView('today') }}
          onNav={setView}
        />
      )}
      {view === 'reset' && <ResetView latest={latest} onNav={setView} onLogged={reloadAll} />}
      {view === 'meditate' && <MeditateView onLogged={reloadAll} />}
      {view === 'inbox' && <InboxView notes={notes} />}
      {view === 'journal' && <JournalView notes={notes} onEdit={openCheckin} />}
      {view === 'trends' && <TrendsView />}
      {view === 'settings' && <SettingsView onSync={reloadAll} />}
    </View>
  )
}

/* ══════════════════ Today ══════════════════ */

/* The headline figure on each clarity tile — the raw thing you logged,
   not the normalised score (that's what the fill and pill already say).
   Keyed to clarityDetails() component keys. */
const RATING_VALUE = {
  mood: (c) => (c?.mood ? MOOD_LABELS[c.mood] : '--'),
  stress: (c) => (c?.stress != null ? `${c.stress}/5` : '--'),
  clarity: (c) => (c?.clarity != null ? `${c.clarity}/5` : '--'),
  grounded: (c) => (c?.grounded != null ? `${c.grounded}/5` : '--'),
}

/* Shown before the first check-in, so the tiles keep their shape and hues
   rather than collapsing the layout. Mirrors clarityDetails()' order. */
const CLARITY_PLACEHOLDERS = [
  { key: 'mood', label: 'Mood' },
  { key: 'stress', label: 'Stress ease' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'grounded', label: 'Groundedness' },
]

function Dashboard({ latest, notes, todayCheckins, onCheckIn, onNav, onOpenCheckin }) {
  const details = latest ? clarityDetails(latest) : null
  const score = details?.score ?? null
  const [title, copy] = clarityLabel(score)
  const plan = getWellnessPlan(latest, score)
  const tool = suggestedReset(latest?.state, score)
  const practiceMins = (notes.data?.practices || [])
    .filter((p) => p.date === today()).reduce((s, p) => s + (p.minutes || 0), 0)

  return (
    <>
      <div className="hero-card" style={{ marginBottom: 18 }}>
        <div className="hero-content">
          <div>
            <Badge tone="purple"><Icon name="spa" size={14} /> Clarity</Badge>
            <h2 style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: '-.03em', margin: '8px 0' }}>{title}</h2>
            <p style={{ color: 'rgba(255,255,255,.68)', maxWidth: 560 }}>{copy}</p>
          </div>
          <Ring score={score} sub="signal" />
          {/* Spans the full hero width (see .hero-actions) so that on a
              narrow phone, where the ring sits beside the copy, these don't
              get crushed into a half-width column. */}
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onCheckIn}>
              <Icon name="edit_note" size={17} /> {latest ? 'Update Check-In' : 'Check In'}
            </button>
            <button className="btn btn-secondary" onClick={() => onNav('reset')}>
              <Icon name="restart_alt" size={17} /> Reset
            </button>
            <button className="btn btn-secondary" onClick={() => onNav('meditate')}>
              <Icon name="timer" size={17} /> Meditate
            </button>
          </div>
        </div>
      </div>

      {/*
        The four tiles are the four things the Clarity score is actually made
        of, driven straight off clarityDetails — so a tile's hue is that
        metric's identity, its fill is the exact value feeding the score, and
        the pill is how that value is doing. Read a tile and you've read its
        row in the Score Breakdown below; they can't disagree.

        Practice sits apart on purpose: minutes meditated is an activity, not
        a rating against a target, so filling a tile with it would be
        decoration — which rule 2 of the system forbids.
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" style={{ marginBottom: 12 }}>
        {(details?.components ?? CLARITY_PLACEHOLDERS).map((c) => (
          <StatCard key={c.key} metricKey={c.key} label={c.label}
            pct={details ? c.value : null}
            value={details ? RATING_VALUE[c.key](latest) : '--'}
            sub={details ? c.detail : 'not checked in'} />
        ))}
      </div>

      <div className="practice-row" style={{ marginBottom: 18 }}>
        <span className="practice-ic"><Icon name="self_improvement" size={17} fill /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="practice-lbl">Practice today</div>
          <div className="practice-sub">Not part of the score — a thing you did, not a rating.</div>
        </div>
        <span className="practice-val">{practiceMins}m</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5" style={{ marginBottom: 18 }}>
        <Card>
          <CardHead title="Score Breakdown"
            right={<Badge tone="purple">{details ? confidenceLabel(latest) : 'No signal'}</Badge>} />
          {!details ? (
            <Empty icon="psychology" title="Check in to see what the score is responding to." />
          ) : (
            <div>{details.components.map((c) => (
              <ScoreRow key={c.key} label={c.label} detail={c.detail} value={c.value} />
            ))}</div>
          )}
        </Card>
        <Card>
          <CardHead title="What Would Move It" sub="The score points to a lever, not a grade." />
          {!details ? (
            <CoachCard kicker="Start here" title="Start with naming.">
              Mood, stress, clarity, groundedness, and one honest sentence are enough to make this useful.
            </CoachCard>
          ) : (
            <CoachCard kicker={details.components[0] && [...details.components].sort((a, b) => a.value - b.value)[0].label + ' is the main lever'}
              title={[...details.components].sort((a, b) => a.value - b.value)[0].label + ' right now'}>
              {[...details.components].sort((a, b) => a.value - b.value)[0].advice}
            </CoachCard>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5" style={{ marginBottom: 18 }}>
        <Card>
          <CardHead title="Your Plan" sub="State-aware moves for the next hour."
            right={<Badge tone={plan.badgeTone}>{plan.badge}</Badge>} />
          <CoachCard kicker={plan.kicker} title={plan.title} tone={plan.tone}>{plan.copy}</CoachCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {plan.actions.map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 9 }}>
                <Icon name={a.icon} size={18} style={{ color: 'var(--accent)', marginTop: 1 }} />
                <div style={{ fontSize: 13 }}>
                  <strong>{a.title}</strong><br />
                  <span style={{ color: 'var(--text-2)' }}>{a.body}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}
              onClick={() => onNav('reset')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={tool.icon || 'restart_alt'} size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Suggested Reset</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{tool.title}</div>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onNav('reset') }}>
                <Icon name="restart_alt" size={15} /> All Tools
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Recent Check-Ins" sub="Last seven entries." />
          <RecentCheckins onOpen={onOpenCheckin} />
        </Card>
      </div>

      <Card>
        <CardHead title="Today's Journal" sub="The saved words from today's check-in, practice, and mental load." />
        <MemoryTiles latest={latest} notes={notes} />
      </Card>
    </>
  )
}

function RecentCheckins({ onOpen }) {
  const from = daysAgo(30)
  const to = today()
  const recent = useAsync((f) => fetchWellnessCheckins(from, to, { force: f }), [from, to])
  const entries = [...(recent.data || [])]
    .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0)).slice(0, 7)

  if (recent.loading) return <Loading />
  if (!entries.length) return <Empty icon="self_improvement" title="No check-ins yet">Hit Check In to record your first entry.</Empty>

  return (
    <div className="mini-list">
      {entries.map((c) => {
        const s = clarityDetails(c)?.score
        const text = [c.present, c.lighter, c.loop, c.reframe].filter(Boolean).join(' ')
        return (
          <div key={c.id} className="mini-item" style={{ alignItems: 'flex-start' }} onClick={() => onOpen(c.date, c.id)}>
            <div>
              <strong>{pretty(c.date)} · {checkinTime(c)}</strong>
              <small>{c.state || 'Unlabeled'} · stress {c.stress ?? '--'} · clarity {c.clarity ?? '--'}</small>
              {text && <small style={{ color: 'var(--text)', fontWeight: 600, marginTop: 7, display: 'block' }}>{excerpt(text)}</small>}
            </div>
            <Badge tone={s >= 80 ? 'green' : s >= 60 ? 'blue' : s >= 40 ? 'orange' : 'red'}>{s ?? '--'}</Badge>
          </div>
        )
      })}
    </div>
  )
}

function MemoryTiles({ latest, notes }) {
  const practices = (notes.data?.practices || []).filter((p) => p.date === today() && p.note).slice(0, 2)
  const loops = (notes.data?.thoughts || []).filter((t) => !t.done).slice(0, 3)
  if (!latest && !practices.length && !loops.length) {
    return <Empty icon="auto_stories" title="No writing saved today">Check in, save a session note, or add a mental-load item and it will appear here.</Empty>
  }
  const tiles = [
    ['psychology', 'Present', latest?.present, 'Check in to name what is true right now.'],
    ['light_mode', 'Lighter', latest?.lighter, 'Save one adjustment, support, boundary, or reset.'],
    ['loop', 'Loop & reframe', [latest?.loop, latest?.reframe].filter(Boolean).join('\n\n'), 'Optional loops and reframes show here.'],
    ['timer', 'Practice notes', practices.map((p) => `${p.type}: ${p.note}`).join('\n\n'), 'Save a note after meditation or breathwork.'],
    ['inbox', 'Open loops', loops.map((t) => `${t.type}: ${t.text}`).join('\n'), 'Add thoughts to the mental load inbox.'],
  ]
  return (
    <div className="memory-grid">
      {tiles.map(([icon, label, text, empty]) => (
        <div key={label} className="memory-tile">
          <strong><Icon name={icon} size={16} />{label}</strong>
          <p>{(text || '').trim() || empty}</p>
        </div>
      ))}
    </div>
  )
}

function confidenceLabel(c) {
  const filled = ['mood', 'state', 'stress', 'clarity', 'grounded', 'present', 'lighter']
    .filter((k) => c[k] !== '' && c[k] != null).length
  return filled >= 6 ? 'High confidence' : filled >= 4 ? 'Useful signal' : 'Thin signal'
}

/** Ported from wellness.html's getWellnessPlan — state-aware coaching copy. */
function getWellnessPlan(c, score) {
  if (!c) {
    return {
      badge: 'Check in', badgeTone: 'orange', tone: 'soft', kicker: 'Start here',
      title: 'Name the weather before trying to change it.',
      copy: 'A useful check-in should leave you with one kind next step, not a verdict on your day.',
      actions: [
        { icon: 'psychology', title: 'Do a plain check-in', body: 'Mood, stress, clarity, and one honest sentence are enough.' },
        { icon: 'air', title: 'Exhale longer than you inhale', body: 'Two minutes changes the physiology before the story takes over.' },
        { icon: 'inbox', title: 'Park one open loop', body: 'Move the loudest thought into the mental load inbox.' },
      ],
    }
  }
  const stress = Number(c.stress) || 3
  const clarity = Number(c.clarity) || 3
  const grounded = Number(c.grounded) || 3
  const base = []
  if (stress >= 4) base.push({ icon: 'air', title: 'Downshift first', body: 'Two minutes of slow breathing before decisions or messages.' })
  if (clarity <= 2) base.push({ icon: 'edit_note', title: 'Externalize the fog', body: 'Write the next three concerns as separate lines.' })
  if (grounded <= 2) base.push({ icon: 'directions_walk', title: 'Use the body as the anchor', body: 'Walk outside or do a brief body scan before more input.' })
  if (c.loop) base.push({ icon: 'move_to_inbox', title: 'Give the loop a container', body: 'Send it to the inbox, then choose hold, action, or release.' })
  const actions = base.length ? base.slice(0, 3) : [
    { icon: 'forum', title: 'Use the clear window', body: 'Have the honest conversation or make the decision while steady.' },
    { icon: 'do_not_disturb_on', title: 'Protect the signal', body: 'Reduce one avoidable input for the next hour.' },
    { icon: 'timer', title: 'Bank calm', body: 'Five minutes of practice keeps the day from becoming only output.' },
  ]
  if (score < 50) return { badge: 'Regulate', badgeTone: 'red', tone: 'soft', kicker: 'Mode for now', title: 'Do not negotiate with a flooded nervous system.', copy: 'First lower the internal volume. Then choose one small concrete next step.', actions }
  if (score < 70) return { badge: 'Simplify', badgeTone: 'orange', tone: 'soft', kicker: 'Mode for now', title: 'Make the day easier to complete.', copy: 'Clarity improves when the next step is specific and the emotional load has somewhere to go.', actions }
  return { badge: 'Steady', badgeTone: score >= 85 ? 'green' : 'blue', tone: 'blue', kicker: 'Mode for now', title: 'Use steadiness to create more steadiness.', copy: 'This is a good state for decisions, connection, and thoughtful work.', actions }
}

/* ══════════════════ Check In ══════════════════ */

function CheckinView({ date, entryId, onSaved, onDeleted, onNav }) {
  const [d, setD] = useState(date)
  const entries = useAsync((f) => fetchWellnessCheckins(d, d, { force: f }), [d])
  const list = entries.data || []
  const [selectedId, setSelectedId] = useState(entryId || null)
  const current = selectedId ? list.find((c) => c.id === selectedId) : null

  const blank = () => ({
    id: null, date: d, mood: null, state: null, sleepImpact: null,
    stress: 3, clarity: 3, grounded: 3, present: '', lighter: '', loop: '', reframe: '',
  })
  const [form, setForm] = useState(() => current ? { ...current } : blank())
  const [moveDate, setMoveDate] = useState(shiftDate(date, -1))
  const [saving, setSaving] = useState(false)

  // Re-seed the form when a different date/entry is selected.
  useMemo(() => { setForm(current ? { ...current } : blank()) }, [d, selectedId]) // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const preview = clarityDetails(form)?.score

  async function save() {
    setSaving(true)
    try {
      const id = form.id || newId('c')
      await saveCheckin(d, { ...form, id })
      toast.success(form.id ? 'Wellness check-in updated' : 'Wellness check-in saved')
      setSelectedId(id)
      entries.reload()
      onSaved(d)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function remove() {
    if (!current) { toast.error('No check-in for this date'); return }
    if (!confirm(`Delete this wellness check-in for ${d}?`)) return
    await deleteCheckin(d, current.id)
    toast.success('Check-in deleted')
    onDeleted()
  }

  async function sendLoop() {
    if (!form.loop?.trim()) { toast.error('No looping thought to send'); return }
    await saveThought({ text: form.loop.trim(), type: 'Hold', done: false })
    toast.success('Sent to mental load inbox')
  }

  async function moveTo(target) {
    if (!current) { toast.error('No check-in for this date'); return }
    if (!target || target === d) { toast.error('Choose a destination date'); return }
    const moved = { ...current, date: target, movedFrom: d, id: current.id }
    await saveCheckin(target, moved)
    await deleteCheckin(d, current.id)
    toast.success('Check-in moved to ' + target)
    setD(target); setSelectedId(current.id)
    onSaved(target)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3.5">
      <Card>
        <div className="form-section-label">Basics</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Date">
            <input type="date" value={d} onChange={(e) => { setD(e.target.value); setSelectedId(null) }} />
          </Field>
          <Field label="Mood">
            <select value={form.mood ?? ''} onChange={(e) => set('mood', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose</option>
              {Object.entries(MOOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Dominant State">
            <select value={form.state || ''} onChange={(e) => set('state', e.target.value || null)}>
              <option value="">Choose</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Sleep Impact">
            <select value={form.sleepImpact || ''} onChange={(e) => set('sleepImpact', e.target.value || null)}>
              <option value="">Unknown</option>
              {SLEEP_IMPACTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="form-section" style={{ marginTop: 20 }}>
          <div className="form-section-label">Entry</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Field label="Saved check-ins for this date">
              <select value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value || null)}>
                {list.map((c, i) => (
                  <option key={c.id} value={c.id}>{i + 1}. {checkinTime(c)} · {c.state || 'Unlabeled'}</option>
                ))}
                <option value="">+ New check-in</option>
              </select>
            </Field>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setSelectedId(null)}>
                <Icon name="add" size={17} /> New Check-In
              </button>
            </div>
          </div>
        </div>

        <div className="form-section" style={{ marginTop: 20 }}>
          <div className="form-section-label">Scores</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[['stress', 'Stress'], ['clarity', 'Clarity'], ['grounded', 'Groundedness']].map(([k, label]) => (
              <Field key={k} label={label}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="range" min={1} max={5} value={form[k] ?? 3} onChange={(e) => set(k, Number(e.target.value))} />
                  <div className="score-pill">{form[k] ?? 3}</div>
                </div>
              </Field>
            ))}
          </div>
        </div>

        <div className="form-section" style={{ marginTop: 20 }}>
          <div className="form-section-label">Reflection</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Field label="What is present?">
              <textarea value={form.present} placeholder="A plain sentence about what is true right now."
                onChange={(e) => set('present', e.target.value)} />
            </Field>
            <Field label="What would make today lighter?">
              <textarea value={form.lighter} placeholder="One adjustment, support, boundary, or reset."
                onChange={(e) => set('lighter', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="form-section" style={{ marginTop: 20 }}>
          <div className="form-section-label">Loop &amp; Reframe (optional)</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Field label="Looping Thought">
              <textarea value={form.loop} placeholder="Optional: the thought that keeps repeating."
                onChange={(e) => set('loop', e.target.value)} />
            </Field>
            <Field label="Reframe">
              <textarea value={form.reframe} placeholder="Optional: a kinder or more useful interpretation."
                onChange={(e) => set('reframe', e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            <Icon name="save" size={17} /> {saving ? 'Saving…' : form.id ? 'Update Check-In' : 'Save New Check-In'}
          </button>
          <button className="btn btn-secondary" onClick={sendLoop}>
            <Icon name="move_to_inbox" size={17} /> Send Loop to Inbox
          </button>
          <button className="btn btn-secondary" onClick={() => onNav('journal')}>
            <Icon name="auto_stories" size={17} /> View Saved Writing
          </button>
          <button className="btn btn-danger" onClick={remove}>
            <Icon name="delete" size={17} /> Delete This Entry
          </button>
        </div>

        <div className="form-section" style={{ marginTop: 20 }}>
          <div className="form-section-label">Fix Date</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Field label="Move this check-in to">
              <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            </Field>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => moveTo(moveDate)}>
                <Icon name="drive_file_move" size={17} /> Move to Date
              </button>
              <button className="btn btn-secondary" onClick={() => moveTo(shiftDate(d, -1))}>
                <Icon name="undo" size={17} /> Move to Previous Day
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Preview" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Ring score={preview} size={128} stroke={11} sub="clarity" />
          <p style={{ fontSize: 12.5, textAlign: 'center', marginTop: 12, color: 'var(--text-3)' }}>
            {clarityLabel(preview)[1]}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
          {STATES.map((s) => (
            <button key={s} type="button" className="btn btn-sm"
              style={form.state === s ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : undefined}
              onClick={() => set('state', form.state === s ? null : s)}>
              {s}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════ Reset Tools ══════════════════ */

function ResetView({ latest, onNav, onLogged }) {
  const suggested = suggestedReset(latest?.state, latest ? clarityDetails(latest).score : null)
  const [running, setRunning] = useState(null)
  // Breathe and Brain Dump already go somewhere real — a guided timer and
  // the Mental Load inbox, respectively. The other four used to just toast
  // "selected" and do nothing else; those now open a real guided runner.
  function start(tool) {
    if (tool.id === 'breathe') { onNav('meditate'); return }
    if (tool.id === 'dump') { onNav('inbox'); return }
    setRunning(tool)
  }
  return (
    <>
      <div className="reset-grid">
        {RESET_TOOLS.map((t) => (
          <div key={t.id} className="reset-card" onClick={() => start(t)}>
            <div className="reset-icon"><Icon name={t.icon || 'restart_alt'} size={18} /></div>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{t.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t.body}</p>
            <div className="script-list">
              {t.steps.map((s, i) => <div key={i} className="script-line">{s}</div>)}
            </div>
            {t.id === suggested.id && <div style={{ marginTop: 10 }}><Badge tone="purple">Suggested for you</Badge></div>}
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
              <Icon name="play_arrow" size={15} /> Use Reset
            </button>
          </div>
        ))}
      </div>
      <ResetRunner tool={running} onClose={() => setRunning(null)} onLogged={onLogged} />
    </>
  )
}

/** Walks a reset tool's own `steps` one at a time instead of dumping them
    on a card as read-only copy. The walk tool gets a real 10-minute
    countdown on its "walk at an easy pace" step, since the card explicitly
    promises "ten quiet minutes" — the one thing worth special-casing by
    id rather than generalizing, since no other tool has a timed component.
    Every tool ends on an optional reflection capture (copy-to-clipboard
    for pasting into a text or journal entry) and logs completion via
    addPractice under the tool's own title, so finishing a reset leaves a
    real trace in wellness history instead of vanishing into a toast. */
function ResetRunner({ tool, onClose, onLogged }) {
  const [step, setStep] = useState(0)
  const [note, setNote] = useState('')
  const [walkSecs, setWalkSecs] = useState(600)
  const [walkRunning, setWalkRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStep(0); setNote(''); setWalkSecs(600); setWalkRunning(false); setSaving(false)
  }, [tool?.id])

  useEffect(() => {
    if (!walkRunning || walkSecs <= 0) return
    const id = setTimeout(() => setWalkSecs((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [walkRunning, walkSecs])

  if (!tool) return null
  const last = step === tool.steps.length - 1
  const isWalkTimerStep = tool.id === 'walk' && step === 1

  async function finish() {
    setSaving(true)
    try {
      await addPractice({ date: today(), type: tool.title, minutes: tool.id === 'walk' ? 10 : 2, note: note.trim(), after: null })
      toast.success(`${tool.title} logged`)
      onLogged()
      onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={Boolean(tool)} onClose={onClose} title={tool.title} sub={tool.body} width={480}>
      <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
        {tool.steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= step ? 'var(--accent)' : 'var(--white-soft)' }} />
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
        Step {step + 1} of {tool.steps.length}
      </div>
      <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>{tool.steps[step]}</p>

      {isWalkTimerStep && (
        <div style={{ textAlign: 'center', padding: '18px 0 4px' }}>
          <div className="tnum" style={{ fontSize: 40, fontWeight: 800, marginBottom: 10 }}>
            {String(Math.floor(walkSecs / 60)).padStart(2, '0')}:{String(walkSecs % 60).padStart(2, '0')}
          </div>
          <button className={`timer-btn ${walkRunning ? 'stop' : 'start'}`} onClick={() => setWalkRunning((r) => !r)}>
            {walkRunning ? 'Pause' : walkSecs === 600 ? 'Start' : 'Resume'}
          </button>
        </div>
      )}

      {last && (
        <div style={{ marginTop: 16 }}>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Write it here if it helps — optional." />
          {note.trim() && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
              onClick={() => { navigator.clipboard?.writeText(note.trim()); toast.success('Copied') }}>
              <Icon name="content_copy" size={13} /> Copy
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        {step > 0 && <button className="btn btn-secondary" onClick={() => setStep((s) => s - 1)}>Back</button>}
        {!last ? (
          <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>Next</button>
        ) : (
          <button className="btn btn-primary" disabled={saving} onClick={finish}>
            {saving ? 'Saving…' : 'Done'}
          </button>
        )}
      </div>
    </Modal>
  )
}

/* ══════════════════ Meditate ══════════════════ */

function MeditateView({ onLogged }) {
  const [note, setNote] = useState('')
  const [after, setAfter] = useState('')
  const [practiceType, setPracticeType] = useState('Meditation')
  const [last, setLast] = useState(null)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
      <Card>
        <BreathTimer onComplete={(r) => { setLast(r); setPracticeType(r.preset.practiceType) }} />
      </Card>
      <Card>
        <CardHead title="Session Note" sub="Save after a session to build your practice history." />
        <Field label="Practice Type">
          <select value={practiceType} onChange={(e) => setPracticeType(e.target.value)}>
            {PRACTICE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <div style={{ marginTop: 12 }}>
          <Field label="After State">
            <select value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="">Choose</option>
              {AFTER_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Note">
            <textarea value={note} placeholder="What shifted? What did you notice?"
              onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={async () => {
          const minutes = last?.minutes || 1
          await addPractice({ date: today(), type: practiceType, minutes, note, after: after || null })
          toast.success('Practice saved')
          setNote(''); setAfter(''); setLast(null)
          onLogged()
        }}>
          <Icon name="save" size={17} /> Save Session
        </button>
        {last && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
            Last session: {last.preset.label} · {last.minutes} min
          </p>
        )}
      </Card>
    </div>
  )
}

/* ══════════════════ Mental Load / Open Loops ══════════════════ */

function InboxView({ notes }) {
  const [text, setText] = useState('')
  const [type, setType] = useState(THOUGHT_TYPES[0])
  const confirm = useConfirm()
  const list = notes.data?.thoughts || []

  async function add() {
    if (!text.trim()) return
    await saveThought({ text: text.trim(), type, done: false })
    setText(''); notes.reload(); toast.success('Loop added')
  }

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Field label="Thought / Worry / Decision">
            <input type="text" value={text} placeholder="What is taking up space?"
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </Field>
          <Field label="Convert To">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {THOUGHT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={add}>
          <Icon name="add" size={17} /> Add Loop
        </button>
      </Card>

      {notes.loading ? <Loading /> : !list.length ? (
        <Empty icon="loop" title="No open loops">Clear mind. Add a thought above if something keeps circling.</Empty>
      ) : (
        <div className="mini-list">
          {list.map((t) => (
            <div key={t.id} className={`thought-row${t.done ? ' done' : ''}`}>
              <div>
                <strong>{t.text}</strong>
                <small>{t.type} · {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}</small>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-icon" title="Toggle"
                  onClick={async () => { await saveThought({ ...t, done: !t.done }); notes.reload() }}>
                  <Icon name={t.done ? 'undo' : 'check'} size={17} />
                </button>
                <button className={`btn btn-icon${confirm.isArmed(t.id) ? ' btn-danger' : ''}`} title="Delete"
                  onClick={async () => {
                    if (!confirm.isArmed(t.id)) return confirm.arm(t.id)
                    await deleteThought(t.id); notes.reload()
                  }}>
                  <Icon name="close" size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ══════════════════ Journal ══════════════════ */

function JournalView({ notes, onEdit }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('newest')
  const from = daysAgo(180)
  const to = today()
  const checkins = useAsync((f) => fetchWellnessCheckins(from, to, { force: f }), [from, to])

  const entries = useMemo(() => {
    const cs = (checkins.data || []).map((c) => ({
      kind: 'checkin', date: c.date, savedAt: c.savedAt, title: 'Check-in',
      meta: `${checkinTime(c)} · ${c.state || 'Unlabeled'} · mood ${c.mood ?? '--'} · stress ${c.stress ?? '--'} · clarity ${c.clarity ?? '--'}`,
      fields: [['What is present?', c.present], ['What would make today lighter?', c.lighter],
        ['Looping thought', c.loop], ['Reframe', c.reframe]].filter(([, v]) => String(v || '').trim()),
      search: [c.date, c.state, c.present, c.lighter, c.loop, c.reframe].join(' '), ref: c,
    }))
    const ps = (notes.data?.practices || []).map((p) => ({
      kind: 'practice', date: p.date, savedAt: p.savedAt || p.date, title: 'Practice note',
      meta: `${p.type || 'Practice'} · ${p.minutes || 0} min${p.after ? ' · ' + p.after : ''}`,
      fields: [['Note', p.note]].filter(([, v]) => String(v || '').trim()),
      search: [p.date, p.type, p.after, p.note].join(' '), ref: p,
    }))
    const ts = (notes.data?.thoughts || []).map((t) => ({
      kind: 'thought', date: (t.createdAt || '').slice(0, 10) || today(), savedAt: t.createdAt,
      title: t.done ? 'Resolved loop' : 'Open loop', meta: `${t.type || 'Hold'} · ${t.done ? 'resolved' : 'active'}`,
      fields: [['Thought / worry / decision', t.text]].filter(([, v]) => String(v || '').trim()),
      search: [t.type, t.text, t.done ? 'resolved' : 'open'].join(' '), ref: t,
    }))
    let all = [...cs, ...ps, ...ts].filter((e) => e.fields.length)
    if (type !== 'all') all = all.filter((e) => e.kind === type)
    if (q.trim()) all = all.filter((e) => e.search.toLowerCase().includes(q.trim().toLowerCase()))
    all.sort((a, b) => {
      const ad = a.savedAt || a.date, bd = b.savedAt || b.date
      return sort === 'oldest' ? String(ad).localeCompare(String(bd)) : String(bd).localeCompare(String(ad))
    })
    return all
  }, [checkins.data, notes.data, q, type, sort])

  return (
    <Card>
      <div className="journal-toolbar">
        <input type="search" placeholder="Search reflections, reframes, notes, or loops…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All writing</option>
          <option value="checkin">Check-ins</option>
          <option value="practice">Practice notes</option>
          <option value="thought">Open loops</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      <ErrorNote error={checkins.error} />
      {checkins.loading ? <Loading /> : !entries.length ? (
        <Empty icon="search" title="No saved writing found">Try a different search, or add a check-in, practice note, or mental-load item.</Empty>
      ) : (
        <div className="journal-feed">
          {entries.map((e, i) => (
            <div key={i} className="entry-card">
              <div className="entry-head">
                <div>
                  <div className="entry-title">{e.title} · {pretty(e.date)}</div>
                  <div className="entry-meta">{e.meta}</div>
                </div>
                <Badge tone={{ checkin: 'purple', practice: 'blue', thought: 'orange' }[e.kind]}>{e.kind}</Badge>
              </div>
              <div className="entry-body">
                {e.fields.map(([label, value]) => (
                  <div key={label} className="entry-field"><strong>{label}</strong><p>{value}</p></div>
                ))}
              </div>
              <div className="entry-actions">
                {e.kind === 'checkin' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => onEdit(e.date, e.ref.id)}>
                    <Icon name="edit_note" size={15} /> Edit check-in
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ══════════════════ Trends ══════════════════ */

const TREND_METRICS = [
  { value: 'clarityScore', label: 'Clarity Score', max: 100, ticks: 4 },
  { value: 'stress', label: 'Stress', max: 5, ticks: 5 },
  { value: 'mood', label: 'Mood', max: 5, ticks: 5 },
  { value: 'grounded', label: 'Grounded', max: 5, ticks: 5 },
]

function TrendsView() {
  const [metric, setMetric] = useState('clarityScore')
  const meta = TREND_METRICS.find((m) => m.value === metric)
  const from = daysAgo(60)
  const to = today()
  const checkins = useAsync((f) => fetchWellnessCheckins(from, to, { force: f }), [from, to])

  const byDate = useMemo(() => {
    const m = new Map()
    ;(checkins.data || []).forEach((c) => { m.set(c.date, c) }) // last check-in per date wins, matches original
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
  }, [checkins.data])

  const vals = byDate.map(([date, c]) => ({
    date, val: metric === 'clarityScore' ? (clarityDetails(c)?.score || 0) : (Number(c[metric]) || 0),
  }))
  const avg = vals.length ? vals.reduce((s, x) => s + x.val, 0) / vals.length : 0

  // Bar colour is a performance read (good/short/risk), which is exactly
  // what the reserved STATUS ramp is for — see lib/design.js rule 3.
  function barColor(v) {
    if (metric === 'stress') return v <= 2 ? STATUS.good.color : v <= 3 ? STATUS.short.color : STATUS.risk.color
    const pct = v / meta.max
    return pct >= 0.75 ? STATUS.good.color : pct >= 0.5 ? 'var(--accent)' : STATUS.short.color
  }

  return (
    <>
      <Tabs value={metric} onChange={setMetric} options={TREND_METRICS} />
      <Card>
        <CardHead title={meta.label} sub={`Last ${vals.length} check-ins.`}
          right={<Badge tone="purple">Avg {metric === 'clarityScore' ? Math.round(avg) : avg.toFixed(1)}</Badge>} />
        {checkins.loading ? <Loading /> : !vals.length ? (
          <Empty icon="query_stats" title="No check-ins yet" />
        ) : (
          <div className="trend-chart-wrap">
            <div className="trend-y-axis">
              {Array.from({ length: meta.ticks + 1 }).map((_, i) => (
                <div key={i} className="trend-y-tick">{Math.round(meta.max * (meta.ticks - i) / meta.ticks)}</div>
              ))}
            </div>
            <div className="trend-grid-lines">
              {Array.from({ length: meta.ticks + 1 }).map((_, i) => <div key={i} className="trend-grid-line" />)}
            </div>
            <div className="trend-bars">
              {vals.map((x) => {
                const pct = Math.max(4, Math.round((x.val / meta.max) * 100))
                const d = new Date(x.date + 'T12:00:00')
                const display = metric === 'clarityScore' ? Math.round(x.val) : x.val
                return (
                  <div key={x.date} className="trend-bar" style={{ height: `${pct}%`, background: barColor(x.val) }}>
                    <div className="trend-bar-tip">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {display}</div>
                    <span>{d.getDate()}</span>
                  </div>
                )
              })}
              <div className="trend-avg-line" style={{ bottom: `${(avg / meta.max) * 100}%` }}>
                <div className="trend-avg-label">avg</div>
              </div>
            </div>
            {vals.length >= 2 && (
              <div className="trend-chart-footer-row">
                <span>{pretty(vals[0].date)}</span>
                <span>{pretty(vals[vals.length - 1].date)}</span>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

/* ══════════════════ Settings ══════════════════ */

function SettingsView({ onSync }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
      <Card>
        <CardHead title="Sync" sub="Wellness data lives in Supabase, shared across your EdgeX apps." />
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
          Check-ins, practice notes, and mental-load items sync automatically. Use this if you changed
          something on another device and want it here right away.
        </p>
        <button className="btn btn-primary" onClick={() => { onSync(); toast.success('Wellness synced') }}>
          <Icon name="sync" size={17} /> Sync Now
        </button>
      </Card>
    </div>
  )
}
