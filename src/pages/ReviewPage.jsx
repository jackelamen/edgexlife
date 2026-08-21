import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import {
  Card, CardHead, PageHeader, Empty, Loading, Badge, ErrorNote, Tabs, SectionLabel,
} from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  fetchWeeklyReviews, saveWeeklyReview,
  fetchHealthLogs, fetchHealthSettings, fetchWellnessCheckins, fetchWellnessNotes,
  fetchWorkoutSessions, fetchHabitLogs, fetchSprints, fetchSprintPhases, fetchSprintTactics,
} from '../lib/data'
import { healthDetails, clarityDetails } from '../lib/scores'
import { isSprintActive, sprintCurrentWeek, tacticWeekRows } from '../lib/goals'
import { statusFor } from '../lib/design'
import {
  REVIEW_PROMPTS, PLAN_PROMPTS, EMPTY_REVIEW, weekIdFor, weekRange, prevWeekId, nextWeekId,
  prettyWeek, gatherWeek, tacticBreakdown, isReviewStarted, reviewTargetWeekId,
} from '../lib/review'
import { IDENTITY_STATEMENT } from '../lib/identity'

/*
  Weekly review.

  xLife records continuously and reflects never: `sprints.reflections` is
  written on every cycle save and read by nothing, `retro.carry` is
  written once and never read again, and the cycle-complete moment only
  fires if you happen to click into a tab. The 12-week system's actual
  engine is the weekly review, and this is the surface for it.

  Two principles shape the page:

  1. THE NUMBERS COME FIRST, AND YOU DIDN'T TYPE THEM. You arrive at the
     prompts with the week's facts already on screen. People are reliably
     wrong about the week they just had — a week with two bad days
     remembers as a bad week — and the whole value of reviewing against
     logged data is that it argues back.

  2. THE LOOP HAS TO CLOSE. Last week's priorities are rendered at the top
     of this week's review. A review that only ever writes and never reads
     back what you committed to is journalling, not reviewing, which is
     precisely how the two 2026 reviews in this table died.
*/

const DRAFT_KEY = (weekId) => `xlife.review.draft.${weekId}`

export default function ReviewPage() {
  const [tab, setTab] = useState('week')
  // Which week is being reviewed. Opens on whatever is actually due:
  // Sat/Sun close out the week you're in, Mon/Tue the one that just ended.
  const [weekId, setWeekId] = useState(() => reviewTargetWeekId())
  const { from, to } = weekRange(weekId)

  /* ── Reads ────────────────────────────────────────────────────────
     Everything week-scoped is bounded to the seven days on screen; the
     rest are app-wide caches already warm from other pages. Nothing here
     opens a new unbounded query. */
  const reviews = useAsync((f) => fetchWeeklyReviews(prevWeekId(prevWeekId(weekId)), nextWeekId(weekId), { force: f }), [weekId])
  const allReviews = useAsync((f) => fetchWeeklyReviews('2000-01-01', weekIdFor(), { force: f }), [], { enabled: tab === 'history' })

  const settings = useAsync((f) => fetchHealthSettings({ force: f }))
  const healthLogs = useAsync((f) => fetchHealthLogs(from, to, { force: f }), [from, to])
  const checkins = useAsync((f) => fetchWellnessCheckins(from, to, { force: f }), [from, to])
  const habitLogs = useAsync((f) => fetchHabitLogs(from, to, { force: f }), [from, to])
  const sessions = useAsync((f) => fetchWorkoutSessions({ force: f }))
  const notes = useAsync((f) => fetchWellnessNotes({ force: f }))
  const sprints = useAsync((f) => fetchSprints({ force: f }))
  const phases = useAsync((f) => fetchSprintPhases({ force: f }))
  const tactics = useAsync((f) => fetchSprintTactics({ force: f }))

  const saved = useMemo(
    () => (reviews.data || []).find((r) => r.week_id === weekId) || null,
    [reviews.data, weekId])
  const lastWeek = useMemo(
    () => (reviews.data || []).find((r) => r.week_id === prevWeekId(weekId)) || null,
    [reviews.data, weekId])

  /* ── Draft state ──────────────────────────────────────────────────
     Persisted to localStorage per week. The Visions textarea in Goals
     loses everything typed the moment you switch tabs, and this is the
     longest-form writing in the app — it does not get to repeat that. */
  const [draft, setDraft] = useState(EMPTY_REVIEW)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let restored = null
    try { restored = JSON.parse(localStorage.getItem(DRAFT_KEY(weekId)) || 'null') } catch { /* private mode */ }
    const base = { ...EMPTY_REVIEW, ...(saved || {}), week_id: weekId }
    // A local draft only wins if it is genuinely newer than the saved row,
    // so opening the page on a second device doesn't resurrect a stale
    // half-written draft over a review already filed from the phone.
    const useDraft = restored && (!saved || (restored.__at || 0) > new Date(saved.updated_at || 0).getTime())
    setDraft(useDraft ? { ...base, ...restored } : base)
    setDirty(Boolean(useDraft))
  }, [weekId, saved])

  function edit(patch) {
    setDraft((d) => {
      const next = { ...d, ...patch, week_id: weekId }
      try { localStorage.setItem(DRAFT_KEY(weekId), JSON.stringify({ ...next, __at: Date.now() })) } catch { /* ignore */ }
      return next
    })
    setDirty(true)
  }

  async function save() {
    setBusy(true)
    try {
      await saveWeeklyReview({ ...draft, week_id: weekId })
      try { localStorage.removeItem(DRAFT_KEY(weekId)) } catch { /* ignore */ }
      setDirty(false)
      toast.success('Review saved')
      reviews.reload()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  /* ── The week, as the data saw it ─────────────────────────────── */
  const summary = useMemo(() => gatherWeek({
    weekId,
    healthLogs: healthLogs.data,
    checkins: checkins.data,
    sessions: sessions.data,
    habitLogs: habitLogs.data,
    practices: notes.data?.practices,
    scoreOf: (l) => healthDetails(l, settings.data)?.score ?? null,
    clarityOf: (c) => clarityDetails(c)?.score ?? null,
  }), [weekId, healthLogs.data, checkins.data, sessions.data, habitLogs.data, notes.data, settings.data])

  /* Per-tactic completion for whichever cycle was live that week. Sorted
     worst first: the point of this block is to name what slipped, not to
     congratulate the tactics that didn't. */
  const cycleRows = useMemo(() => {
    const live = (sprints.data || []).filter((s) => isSprintActive(s) && !s.archived)
    return live.flatMap((sp) => {
      const wk = sprintCurrentWeek(sp)
      const rows = tacticWeekRows(
        (phases.data || []).filter((p) => p.sprint_id === sp.id),
        (tactics.data || []).filter((t) => t.sprint_id === sp.id),
        sp, wk)
      return tacticBreakdown(rows).map((r) => ({ ...r, cycle: sp.name, week: wk }))
    })
  }, [sprints.data, phases.data, tactics.data])

  const loading = healthLogs.loading || checkins.loading || reviews.loading
  const isThisWeek = weekId === weekIdFor()
  const status = saved ? 'Saved' : isReviewStarted(draft) ? 'Draft' : 'Not started'

  return (
    <View>
      <PageHeader
        kicker="Weekly review"
        title={prettyWeek(weekId)}
        sub="What the week actually did, then what you make of it."
        actions={
          <div className="rv-weeknav">
            <button className="btn btn-secondary btn-sm" onClick={() => setWeekId(prevWeekId(weekId))}
              aria-label="Previous week"><Icon name="chevron_left" size={16} /></button>
            {!isThisWeek && (
              <button className="btn btn-secondary btn-sm" onClick={() => setWeekId(weekIdFor())}>This week</button>
            )}
            <button className="btn btn-secondary btn-sm" disabled={isThisWeek}
              onClick={() => setWeekId(nextWeekId(weekId))}
              aria-label="Next week"><Icon name="chevron_right" size={16} /></button>
          </div>
        }
      />

      {/* Same statement, same wording, as Today — see lib/identity.js.
          This is the page that closes the loop on it weekly; the
          "Identity check" reflection further down is where it actually
          gets answered to, not just displayed. */}
      <div className="north-star">
        <Icon name="star" size={13} />
        <span>{IDENTITY_STATEMENT}</span>
      </div>

      <ErrorNote error={reviews.error || healthLogs.error} />

      <Tabs value={tab} onChange={setTab} options={[
        { value: 'week', label: 'The week', icon: 'event_note' },
        { value: 'history', label: 'History', icon: 'history' },
      ]} />

      {tab === 'history' ? (
        <HistoryView state={allReviews} onOpen={(id) => { setWeekId(id); setTab('week') }} />
      ) : (
        <>
          <div className="rv-status">
            <Badge tone={saved ? 'green' : status === 'Draft' ? 'orange' : 'muted'}>{status}</Badge>
            {dirty && <span className="rv-unsaved">Unsaved changes, kept on this device</span>}
          </div>

          {/* ── 1. The week in numbers ── */}
          <Card style={{ marginTop: 12 }}>
            <CardHead title="What the data says"
              sub="Gathered from what you logged. You did not type any of this." />
            {loading ? <Loading /> : <WeekStats s={summary} />}
          </Card>

          {/* ── 2. Close last week's loop ── */}
          {lastWeek && (lastWeek.priority_1 || lastWeek.priority_2 || lastWeek.priority_3) && (
            <Card style={{ marginTop: 14 }}>
              <CardHead title="What you said you'd do"
                sub={`Set in your review of ${prettyWeek(prevWeekId(weekId))}.`} />
              <div className="rv-carry">
                {[lastWeek.priority_1, lastWeek.priority_2, lastWeek.priority_3]
                  .filter(Boolean).map((p, i) => (
                    <div key={i} className="rv-carry-row">
                      <span className="rv-carry-n">{i + 1}</span>
                      <span>{p}</span>
                    </div>
                  ))}
                {lastWeek.protect && (
                  <div className="rv-carry-row rv-carry-aside">
                    <Icon name="shield" size={15} /><span>Protect: {lastWeek.protect}</span>
                  </div>
                )}
                {lastWeek.let_go && (
                  <div className="rv-carry-row rv-carry-aside">
                    <Icon name="do_not_disturb_on" size={15} /><span>Let go: {lastWeek.let_go}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── 3. What slipped ── */}
          {cycleRows.length > 0 && (
            <Card style={{ marginTop: 14 }}>
              <CardHead title="Commitments, one by one"
                sub="Worst first. A cycle score tells you how far off you were; this tells you which action did it." />
              <div className="rv-tactics">
                {cycleRows.map((r, i) => {
                  const st = r.pct == null ? null : statusFor(r.pct)
                  return (
                    <div key={i} className="rv-tactic">
                      <span className="rv-tactic-bar"
                        style={{ background: st?.color || 'var(--border-med)' }} />
                      <span className="rv-tactic-txt">
                        {r.text || 'Untitled action'}
                        <small>{r.cycle} &middot; week {r.week}</small>
                      </span>
                      <span className="rv-tactic-n tnum">
                        {r.possible ? `${r.done}/${r.possible}` : 'not due'}
                      </span>
                      {r.pct != null && (
                        <Badge tone={r.pct >= 85 ? 'green' : r.pct >= 60 ? 'orange' : 'red'}>{r.pct}%</Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* ── 4. Identity check ──────────────────────────────────────
              The reason this whole app exists, and the one question
              nothing else on this page can answer for you — the data
              above says what happened, this asks what it meant. Its own
              card, not folded into "How was it" below: naming it
              separately is the difference between a real checkpoint and
              one more textarea in a list. Written to `module_notes`, a
              column that already existed in the schema and had no
              consumer anywhere in the app until this. */}
          <Card style={{ marginTop: 14 }} className="rv-identity">
            <CardHead title="Identity check"
              sub="Where this week actually served it, and where it didn't." />
            <p className="rv-hint">
              Be specific — "led with compassion" or "cut a corner on integrity" is
              something you can act on next week; "did okay" isn't.
            </p>
            <textarea value={draft.module_notes || ''} rows={4}
              placeholder="Where did you live it? Where did you fall short?"
              onChange={(e) => edit({ module_notes: e.target.value })} />
          </Card>

          {/* ── 5. The reflection ── */}
          <Card style={{ marginTop: 14 }}>
            <CardHead title="How was it" sub="Your read on the week, in your words." />

            <SectionLabel>Overall, out of 10</SectionLabel>
            <div className="rv-score">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button"
                  className={`rv-score-btn${Number(draft.score) === n ? ' on' : ''}`}
                  onClick={() => edit({ score: Number(draft.score) === n ? null : n })}>
                  {n}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <SectionLabel>One word for this week</SectionLabel>
              <input value={draft.theme_word || ''} placeholder="Focus, scattered, steady&hellip;"
                onChange={(e) => edit({ theme_word: e.target.value })} />
            </div>

            {REVIEW_PROMPTS.map((p) => (
              <div key={p.key} style={{ marginTop: 16 }}>
                <SectionLabel>{p.label}</SectionLabel>
                {p.hint && <p className="rv-hint">{p.hint}</p>}
                <textarea value={draft[p.key] || ''} rows={3}
                  onChange={(e) => edit({ [p.key]: e.target.value })} />
              </div>
            ))}
          </Card>

          {/* ── 6. Forward ── */}
          <Card style={{ marginTop: 14 }}>
            <CardHead title="Next week"
              sub="Three things, not ten. These come back to you in next week's review." />
            {PLAN_PROMPTS.map((p, i) => (
              <div key={p.key} className="rv-prio">
                <span className="rv-carry-n">{i + 1}</span>
                <input value={draft[p.key] || ''} placeholder={i === 0 ? 'The one that matters most' : ''}
                  onChange={(e) => edit({ [p.key]: e.target.value })} />
              </div>
            ))}
            <div className="rv-pair">
              <div>
                <SectionLabel>Protect</SectionLabel>
                <input value={draft.protect || ''} placeholder="Time, energy, a boundary"
                  onChange={(e) => edit({ protect: e.target.value })} />
              </div>
              <div>
                <SectionLabel>Let go</SectionLabel>
                <input value={draft.let_go || ''} placeholder="What you are dropping on purpose"
                  onChange={(e) => edit({ let_go: e.target.value })} />
              </div>
            </div>
          </Card>

          <div className="rv-save">
            <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
              <Icon name="check" size={17} /> {busy ? 'Saving…' : saved ? 'Update review' : 'Save review'}
            </button>
            {saved && !dirty && (
              <span className="rv-unsaved">Saved. Reopen any time to add to it.</span>
            )}
          </div>
        </>
      )}
    </View>
  )
}

/* ── The auto-gathered strip ──────────────────────────────────────
   Every tile reports its own coverage ("4 of 7 days") rather than only an
   average, because an average over two logged days is a different claim
   from an average over seven, and the review is the one place that
   distinction actually changes what you conclude. */
function WeekStats({ s }) {
  const tiles = [
    { k: 'Health', v: s.health, sub: `${s.daysLogged} of 7 days logged`, score: true },
    { k: 'Clarity', v: s.clarity, sub: `${s.checkins} check-in${s.checkins === 1 ? '' : 's'}`, score: true },
    { k: 'Sleep', v: s.sleepAvg, sub: 'nightly average', unit: 'h' },
    { k: 'Training', v: s.workouts, sub: s.trainingMinutes ? `${s.trainingMinutes} min total` : 'sessions' },
    { k: 'Practice', v: s.practiceMinutes, sub: `${s.practices} session${s.practices === 1 ? '' : 's'}`, unit: 'm' },
    { k: 'Habits', v: s.habitsDone, sub: 'ticked this week' },
  ]
  return (
    <div className="rv-stats">
      {tiles.map((t) => (
        <div key={t.k} className="rv-stat">
          <div className="rv-stat-v tnum"
            style={t.score && t.v != null ? { color: statusFor(t.v)?.color } : undefined}>
            {t.v == null ? '—' : t.v}{t.v != null && t.unit ? <small>{t.unit}</small> : null}
          </div>
          <div className="rv-stat-k">{t.k}</div>
          <div className="rv-stat-s">{t.sub}</div>
        </div>
      ))}
    </div>
  )
}

function HistoryView({ state, onOpen }) {
  if (state.loading) return <Loading />
  const rows = state.data || []
  if (!rows.length) {
    return (
      <Card style={{ marginTop: 12 }}>
        <Empty icon="history" title="No reviews yet">
          Close out a week and it will show up here.
        </Empty>
      </Card>
    )
  }
  return (
    <div className="rv-history">
      {rows.map((r) => (
        <button key={r.week_id} className="rv-hist-row" onClick={() => onOpen(r.week_id)}>
          <span className="rv-hist-score tnum"
            style={{ color: r.score != null ? statusFor(r.score * 10)?.color : 'var(--text-3)' }}>
            {r.score ?? '—'}
          </span>
          <span className="rv-hist-txt">
            <strong>{prettyWeek(r.week_id)}</strong>
            <small>{r.theme_word ? `“${r.theme_word}” · ` : ''}{firstLine(r.wins) || 'No notes'}</small>
          </span>
          <Icon name="chevron_right" size={18} style={{ color: 'var(--text-3)' }} />
        </button>
      ))}
    </div>
  )
}

const firstLine = (t) => {
  const line = String(t || '').trim().split('\n')[0]
  return line.length > 90 ? `${line.slice(0, 90)}…` : line
}
