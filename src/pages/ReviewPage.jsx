import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import {
  Card, PageHeader, Empty, Loading, Badge, ErrorNote, Tabs,
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
  prettyWeek, gatherWeek, tacticBreakdown, reviewTargetWeekId,
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
  // [tab] as the dep, not [] — useAsync only (re)fetches when its deps
  // array changes, not whenever `enabled` flips on its own. With [], this
  // fetched once at mount (tab starts as 'week', so enabled: false) and
  // never again once the History tab was actually opened — same bug as
  // GoalPhotoPicker/IntentionCard's task picker (see those commits).
  const allReviews = useAsync((f) => fetchWeeklyReviews('2000-01-01', weekIdFor(), { force: f }), [tab], { enabled: tab === 'history' })

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
  // Guided flow: which step is open, and whether a SAVED review has been
  // reopened for editing (a saved week shows its recap instead). Both
  // reset whenever the week changes.
  const [step, setStep] = useState(0)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setStep(0); setEditing(false) }, [weekId])

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
      setEditing(false)
      toast.success('Week closed out')
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
      <ErrorNote error={reviews.error || healthLogs.error} />

      <Tabs value={tab} onChange={setTab} options={[
        { value: 'week', label: 'The week', icon: 'event_note' },
        { value: 'history', label: 'History', icon: 'history' },
      ]} />

      {tab === 'history' ? (
        <HistoryView state={allReviews} onOpen={(id) => { setWeekId(id); setTab('week') }} />
      ) : saved && !editing && !dirty ? (
        <ReviewRecap review={saved} summary={summary} loading={loading}
          onEdit={() => { setEditing(true); setStep(0) }} />
      ) : (
        <ReviewFlow
          step={step} setStep={setStep}
          draft={draft} edit={edit} dirty={dirty} busy={busy} saved={saved} onSave={save}
          summary={summary} loading={loading} lastWeek={lastWeek} lastWeekId={prevWeekId(weekId)}
          cycleRows={cycleRows} weekLabel={prettyWeek(weekId)}
        />
      )}
    </View>
  )
}

/* ── Guided review ────────────────────────────────────────────────
   Rebuilt 2026-09-24. The review used to be six stacked cards of
   textareas, all visible at once, which read as a form to fill in
   rather than a ritual worth sitting down for. Now one question at a
   time with a progress rail: the data first (it argues back against
   memory, see the note at the top of this file), then last week's
   promises, then the rating, reflection, identity check and next
   week's priorities. Same draft/save mechanics as before; only the
   presentation changed. */
const SCORE_WORD = (n) => (n <= 3 ? 'Rough' : n <= 5 ? 'Mixed' : n <= 7 ? 'Solid' : n <= 9 ? 'Strong' : 'Best in a while')
const CORE = ['wins', 'challenges', 'learning']

export function ReviewFlow({ step, setStep, draft, edit, dirty, busy, saved, onSave,
  summary, loading, lastWeek, lastWeekId, cycleRows, weekLabel }) {
  const promised = lastWeek && [lastWeek.priority_1, lastWeek.priority_2, lastWeek.priority_3].filter(Boolean)
  const hasPromises = (promised && promised.length) || cycleRows.length
  const steps = [
    { id: 'look', label: 'The week', done: true },
    ...(hasPromises ? [{ id: 'promises', label: 'Promises', done: true }] : []),
    { id: 'rate', label: 'Rate it', done: draft.score != null },
    { id: 'reflect', label: 'Reflect', done: CORE.some((k) => String(draft[k] || '').trim()) },
    { id: 'identity', label: 'Identity', done: Boolean(String(draft.module_notes || '').trim()) },
    { id: 'forward', label: 'Next week', done: Boolean(String(draft.priority_1 || '').trim()) },
    { id: 'finish', label: 'Finish', done: Boolean(saved) && !dirty },
  ]
  const i = Math.min(step, steps.length - 1)
  const cur = steps[i]
  const last = i === steps.length - 1
  const go = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="rvf">
      <ol className="rvf-rail">
        {steps.map((st, n) => (
          <li key={st.id}>
            <button type="button" onClick={() => go(n)}
              className={`rvf-dot${n === i ? ' is-cur' : ''}${st.done && n !== i ? ' is-done' : ''}`}>
              <span className="rvf-dot-n">{st.done && n !== i ? <Icon name="check" size={13} /> : n + 1}</span>
              <span className="rvf-dot-l">{st.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rvf-card" key={cur.id}>
        <div className="rvf-kicker">{weekLabel} · Step {i + 1} of {steps.length}</div>

        {cur.id === 'look' && (
          <>
            <h2 className="rvf-q">Here's what the week actually did.</h2>
            <p className="rvf-sub">Gathered from what you logged, before you write anything. Memory rounds a week off; this doesn't.</p>
            {loading ? <Loading /> : <WeekStats s={summary} />}
          </>
        )}

        {cur.id === 'promises' && (
          <>
            <h2 className="rvf-q">Did you keep your word?</h2>
            <p className="rvf-sub">What you committed to last week, and how each cycle action went.</p>
            {promised && promised.length > 0 && (
              <div className="rvf-block">
                <div className="rvf-label">From your review of {prettyWeek(lastWeekId)}</div>
                {promised.map((p, n) => (
                  <div key={n} className="rvf-promise"><span className="rv-carry-n">{n + 1}</span><span>{p}</span></div>
                ))}
                {lastWeek.protect && <div className="rvf-aside"><Icon name="shield" size={15} /> Protect: {lastWeek.protect}</div>}
                {lastWeek.let_go && <div className="rvf-aside"><Icon name="do_not_disturb_on" size={15} /> Let go: {lastWeek.let_go}</div>}
              </div>
            )}
            {cycleRows.length > 0 && (
              <div className="rvf-block">
                <div className="rvf-label">Cycle actions, worst first</div>
                <div className="rv-tactics">
                  {cycleRows.map((r, n) => {
                    const st = r.pct == null ? null : statusFor(r.pct)
                    return (
                      <div key={n} className="rv-tactic">
                        <span className="rv-tactic-bar" style={{ background: st?.color || 'var(--border-med)' }} />
                        <span className="rv-tactic-txt">{r.text || 'Untitled action'}<small>{r.cycle} &middot; week {r.week}</small></span>
                        <span className="rv-tactic-n tnum">{r.possible ? `${r.done}/${r.possible}` : 'not due'}</span>
                        {r.pct != null && <Badge tone={r.pct >= 85 ? 'green' : r.pct >= 60 ? 'orange' : 'red'}>{r.pct}%</Badge>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {cur.id === 'rate' && (
          <>
            <h2 className="rvf-q">How was this week, honestly?</h2>
            <p className="rvf-sub">Your gut call, out of 10. The numbers were step one; this is your read.</p>
            <div className="rvf-score">
              {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                <button key={n} type="button" className={`rvf-score-btn${Number(draft.score) === n ? ' on' : ''}`}
                  onClick={() => edit({ score: Number(draft.score) === n ? null : n })}>{n}</button>
              ))}
            </div>
            <div className="rvf-score-word">{draft.score ? SCORE_WORD(Number(draft.score)) : '\u00a0'}</div>
            <div className="rvf-block">
              <div className="rvf-label">One word for this week</div>
              <input className="rvf-word" value={draft.theme_word || ''} placeholder="Focused, scattered, steady..."
                onChange={(e) => edit({ theme_word: e.target.value })} />
            </div>
          </>
        )}

        {cur.id === 'reflect' && (
          <>
            <h2 className="rvf-q">What happened, in your words?</h2>
            <p className="rvf-sub">Specific beats thorough. A line each is enough.</p>
            {REVIEW_PROMPTS.filter((p) => CORE.includes(p.key)).map((p) => (
              <Prompt key={p.key} p={p} value={draft[p.key]} onChange={(v) => edit({ [p.key]: v })} />
            ))}
            <details className="rvf-more" open={REVIEW_PROMPTS.some((p) => !CORE.includes(p.key) && String(draft[p.key] || '').trim())}>
              <summary>More, if you want it <small>energy, gratitude, anything else</small></summary>
              {REVIEW_PROMPTS.filter((p) => !CORE.includes(p.key)).map((p) => (
                <Prompt key={p.key} p={p} value={draft[p.key]} onChange={(v) => edit({ [p.key]: v })} />
              ))}
            </details>
          </>
        )}

        {cur.id === 'identity' && (
          <>
            <h2 className="rvf-q">Did this week sound like you?</h2>
            <blockquote className="rvf-statement">{IDENTITY_STATEMENT}</blockquote>
            <p className="rvf-sub">Where did you live it, and where did you fall short? "Led with compassion when it cost me" is something to build on; "did okay" isn't.</p>
            <textarea className="rvf-text" rows={5} value={draft.module_notes || ''}
              placeholder="Where I lived it... Where I didn't..."
              onChange={(e) => edit({ module_notes: e.target.value })} />
          </>
        )}

        {cur.id === 'forward' && (
          <>
            <h2 className="rvf-q">What matters next week?</h2>
            <p className="rvf-sub">Three things, not ten. They'll be waiting for you at the start of next week's review.</p>
            {PLAN_PROMPTS.map((p, n) => (
              <div key={p.key} className="rvf-prio">
                <span className="rv-carry-n">{n + 1}</span>
                <input value={draft[p.key] || ''} placeholder={n === 0 ? 'The one that matters most' : n === 1 ? 'Second' : 'Third'}
                  onChange={(e) => edit({ [p.key]: e.target.value })} />
              </div>
            ))}
            <div className="rv-pair">
              <div>
                <div className="rvf-label"><Icon name="shield" size={14} /> Protect</div>
                <input value={draft.protect || ''} placeholder="Time, energy, a boundary"
                  onChange={(e) => edit({ protect: e.target.value })} />
              </div>
              <div>
                <div className="rvf-label"><Icon name="do_not_disturb_on" size={14} /> Let go</div>
                <input value={draft.let_go || ''} placeholder="What you're dropping on purpose"
                  onChange={(e) => edit({ let_go: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {cur.id === 'finish' && (
          <>
            <h2 className="rvf-q">Close out the week.</h2>
            <p className="rvf-sub">Here's what you're filing. You can reopen it any time.</p>
            <RecapBody review={draft} />
          </>
        )}

        <div className="rvf-nav">
          <button className="btn btn-ghost" onClick={() => go(i - 1)} disabled={i === 0}>
            <Icon name="arrow_back" size={17} /> Back
          </button>
          <span className="rvf-saved">{dirty ? 'Draft kept on this device' : saved ? 'Saved' : ''}</span>
          {last ? (
            <button className="btn btn-primary" onClick={onSave} disabled={busy || (!dirty && saved)}>
              <Icon name="check" size={17} /> {busy ? 'Saving...' : saved ? 'Update review' : 'Close out the week'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => go(i + 1)}>
              Next <Icon name="arrow_forward" size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Prompt({ p, value, onChange }) {
  return (
    <div className="rvf-prompt">
      <div className="rvf-prompt-hd">
        <span className="rvf-prompt-ic"><Icon name={p.icon} size={16} /></span>
        <span>{p.label}</span>
      </div>
      {p.hint && <p className="rvf-hint">{p.hint}</p>}
      <textarea className="rvf-text" rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/* The shape of a filed review: rating, word, wins, next week. Shared by
   the Finish step (a preview of what you're about to save) and the recap
   a saved week opens to. */
function RecapBody({ review }) {
  const prios = [review.priority_1, review.priority_2, review.priority_3].filter((p) => String(p || '').trim())
  const score = review.score != null ? Number(review.score) : null
  return (
    <div className="rvr">
      <div className="rvr-top">
        <div className="rvr-score" style={score ? { color: statusFor(score * 10)?.color } : undefined}>
          <span className="tnum">{score ?? '–'}</span><small>/10</small>
        </div>
        <div>
          <div className="rvr-word">{review.theme_word ? `"${review.theme_word}"` : 'No word yet'}</div>
          <div className="rvr-word-sub">{score ? SCORE_WORD(score) : 'Not rated'}</div>
        </div>
      </div>
      {String(review.wins || '').trim() && (
        <div className="rvr-sec"><div className="rvf-label">What went well</div><p>{review.wins}</p></div>
      )}
      {String(review.module_notes || '').trim() && (
        <div className="rvr-sec"><div className="rvf-label">Identity check</div><p>{review.module_notes}</p></div>
      )}
      <div className="rvr-sec">
        <div className="rvf-label">Next week</div>
        {prios.length ? prios.map((p, n) => (
          <div key={n} className="rvf-promise"><span className="rv-carry-n">{n + 1}</span><span>{p}</span></div>
        )) : <p className="rvf-hint">No priorities set.</p>}
      </div>
    </div>
  )
}

export function ReviewRecap({ review, summary, loading, onEdit }) {
  return (
    <div className="rvf">
      <div className="rvf-card">
        <div className="rvr-hd">
          <div>
            <div className="rvf-kicker"><Icon name="check_circle" size={14} /> Week closed out</div>
            <h2 className="rvf-q" style={{ marginBottom: 0 }}>Your review</h2>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onEdit}><Icon name="edit" size={15} /> Edit</button>
        </div>
        <RecapBody review={review} />
      </div>
      <div className="rvf-card" style={{ marginTop: 14 }}>
        <div className="rvf-label" style={{ marginBottom: 12 }}>The week in numbers</div>
        {loading ? <Loading /> : <WeekStats s={summary} />}
      </div>
    </div>
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
