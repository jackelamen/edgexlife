import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../components/ui/Icon'
import { View } from '../components/shell/Shell'
import {
  Card, CardHead, PageHeader, Ring, Empty, Loading, Badge, Field, RangeScale, ErrorNote,
} from '../components/ui/Kit'
import { useAsync } from '../hooks/useAsync'
import {
  fetchGoals, fetchGoalRollup, fetchHabits, fetchHabitLogs,
  fetchHealthIndex, fetchHealthLogs, fetchHealthSettings, saveHealthLog,
  fetchWellnessIndex, fetchWellnessCheckins, saveCheckin, logHabit, unlogHabit,
  fetchSprints, fetchSprintPhases, fetchSprintTactics, mergeSprintWeekChecks,
} from '../lib/data'
import { healthDetails, clarityDetails, healthLabel, weakestComponent } from '../lib/scores'
import { currentStreak, longestStreak } from '../lib/streaks'
import { findPatterns } from '../lib/correlations'
import {
  isSprintActive, sprintCurrentWeek, tacticsForWeek,
  checkKey, tacticKeyId, todayDayIdx, xpwTarget, xpwDoneCount, xpwDidToday,
  effectiveCustomDays, originalDayFor,
} from '../lib/goals'
import { MODULES, STATUS, metric } from '../lib/design'
import { today, daysAgo, pretty, shiftDate } from '../lib/dates'
import { fetchReviewIndex } from '../lib/data'
import { isReviewWindow, reviewTargetWeekId, prettyWeek } from '../lib/review'
import { IDENTITY_STATEMENT } from '../lib/identity'

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

  /* Review index is week ids only — enough to know whether this week's
     review exists without pulling a line of its prose. */
  const reviewIdx = useAsync((f) => fetchReviewIndex({ force: f }))
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

  /* ── Cross-module patterns ──────────────────────────────────────
     "Nothing correlates the three systems, even though the data already
     lives together" — this is that. Windowed off the more recent of the
     two most-recent entries, not off `today`: this app's data is
     stale-by-design (weeks can pass with nothing logged), so a trailing
     daysAgo(N)-from-today window would often see zero overlapping days. */
  const patternAnchor = lastHealthDate && lastCheckinDate
    ? (lastHealthDate > lastCheckinDate ? lastHealthDate : lastCheckinDate)
    : lastHealthDate || lastCheckinDate
  const patternFrom = patternAnchor ? shiftDate(patternAnchor, -199) : null
  const patternHealth = useAsync((f) => fetchHealthLogs(patternFrom, patternAnchor, { force: f }),
    [patternFrom, patternAnchor], { enabled: Boolean(patternFrom) })
  const patternWellness = useAsync((f) => fetchWellnessCheckins(patternFrom, patternAnchor, { force: f }),
    [patternFrom, patternAnchor], { enabled: Boolean(patternFrom) })

  const { patterns, matchedDays } = useMemo(() => {
    if (!patternFrom) return { patterns: [], matchedDays: 0 }
    const healthByDate = {}
    ;(patternHealth.data || []).forEach((h) => { healthByDate[h.date] = h })
    const checkinByDate = {}
    // last check-in per date wins where a day has more than one entry —
    // matches how Wellness's own Trends view collapses multi-entry days.
    ;(patternWellness.data || []).forEach((c) => { checkinByDate[c.date] = c })
    const allDates = new Set([...Object.keys(healthByDate), ...Object.keys(checkinByDate)])
    const matched = [...allDates].map((date) => ({
      date, health: healthByDate[date] || null, checkin: checkinByDate[date] || null,
    }))
    return findPatterns(matched, settings.data)
  }, [patternHealth.data, patternWellness.data, patternFrom, settings.data])

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
  // fetchHabits() pulls every non-archived habit — the same query Pulse
  // itself uses before Pulse applies its own "due today" filter, which
  // this bridge was never doing. `cadence` + `cadence_config.days` are
  // Pulse's own scheduling fields (already selected in fetchHabits, just
  // never read here): 'daily' habits are due every day; 'custom'/'weekly'
  // habits carry an explicit days array (JS Date.getDay() indices,
  // Sun=0..Sat=6 — confirmed against Jack's real data: a Mon/Wed/Fri habit
  // stores days:[1,3,5]) and are only due when today matches one of them.
  // Any cadence shape this doesn't recognize defaults to "due" rather than
  // silently hiding a habit — Pulse's own due-today algorithm isn't
  // available to copy verbatim from this repo, so this is a best-effort
  // mirror of it, not a guaranteed 1:1 match.
  const isHabitDueToday = (h) => {
    if (h.cadence === 'daily') return true
    const days = h.cadence_config?.days
    if (Array.isArray(days) && days.length) return days.includes(new Date().getDay())
    return true
  }
  const habitList = (habits.data || []).filter(isHabitDueToday)

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
          // Swap-aware: today is due if it's a native day that wasn't
          // moved away, or the destination of a swap from another day
          // this week. The checkmark itself always lives under the
          // ORIGINAL day's key (see lib/goals.js effectiveCustomDays).
          if (effectiveCustomDays(tac, sp, wk).includes(dayIdx)) {
            const origDay = originalDayFor(tac, sp, wk, dayIdx)
            out.push({ sp, tac, wk, dayIdx: origDay, done: Boolean(checks[checkKey(tac, origDay)]), kind: 'day' })
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
        const stamp = today()
        Object.keys(wkChecks).forEach((k) => {
          if (k.startsWith(`${tacticKeyId(a.tac)}_`) && wkChecks[k] === stamp) delete wkChecks[k]
        })
      } else {
        wkChecks[`${tacticKeyId(a.tac)}_${a.slot}`] = today()
      }
    } else {
      const key = a.kind === 'day' ? checkKey(a.tac, a.dayIdx) : tacticKeyId(a.tac)
      if (wkChecks[key]) delete wkChecks[key]
      else wkChecks[key] = true
    }
    try {
      await mergeSprintWeekChecks(a.sp.id, a.wk, wkChecks)
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

  /* ── Quick-capture, right from the attention queue ──────────────────
     "You still have to navigate there and open the full log editor" — this
     closes that gap. Deliberately a small subset of each module's full
     form (the components that move the score most / default sensibly when
     left blank), not a clone of LogEditor/CheckinView — the point is to
     cut the distance between noticing and acting, not to replace the full
     editor. `quickOpen` holds which alert kind ('health' | 'wellness') has
     its inline form expanded; only one at a time. */
  const [quickOpen, setQuickOpen] = useState(null)
  const [quickBusy, setQuickBusy] = useState(false)

  async function quickSaveHealth(vals) {
    setQuickBusy(true)
    try {
      await saveHealthLog(t, vals)
      toast.success('Health logged')
      setQuickOpen(null)
      healthIdx.reload(); health.reload()
    } catch (e) { toast.error(e.message) } finally { setQuickBusy(false) }
  }

  async function quickSaveWellness(vals) {
    setQuickBusy(true)
    try {
      await saveCheckin(t, vals)
      toast.success('Wellness check-in saved')
      setQuickOpen(null)
      wellnessIdx.reload(); wellness.reload()
    } catch (e) { toast.error(e.message) } finally { setQuickBusy(false) }
  }

  /* ── The attention queue: computed, ranked, each with a way to act ──
     This is the part that makes it mission control rather than a dashboard.
     Severity uses the reserved status ramp; nothing here is decorative. */
  const alerts = useMemo(() => {
    const a = []
    if (healthAge == null) {
      a.push({ sev: 'risk', icon: 'monitor_heart', text: 'No health log yet', to: '/health', cta: 'Log', kind: 'health' })
    } else if (healthAge >= 2) {
      a.push({ sev: healthAge >= 5 ? 'risk' : 'short', icon: 'monitor_heart',
        text: `Health not logged in ${healthAge} days`, to: '/health', cta: 'Log', kind: 'health' })
    }
    if (checkinAge == null) {
      a.push({ sev: 'risk', icon: 'self_improvement', text: 'No wellness check-in yet', to: '/wellness', cta: 'Check in', kind: 'wellness' })
    } else if (checkinAge >= 2) {
      a.push({ sev: checkinAge >= 5 ? 'risk' : 'short', icon: 'self_improvement',
        text: `No check-in in ${checkinAge} days`, to: '/wellness', cta: 'Check in', kind: 'wellness' })
    }
    const openDue = dueActions.length - dueDone
    if (openDue > 0) {
      a.push({ sev: 'short', icon: 'flag', text: `${openDue} cycle action${openDue > 1 ? 's' : ''} still open today`, to: '/goals', cta: 'Goals' })
    }
    if (weakest && weakest.value < 60) {
      a.push({ sev: weakest.value < 40 ? 'risk' : 'short', icon: metric(weakest.key).icon,
        text: `${weakest.label} is dragging your score (${weakest.detail})`, to: '/health', cta: 'Health',
        metricKey: weakest.key })
    }
    if (!liveCycles.length && activeGoals.length) {
      a.push({ sev: 'short', icon: 'loop', text: 'Active goals with no live cycle', to: '/goals', cta: 'Start one' })
    }
    return a.sort((x, y) => (x.sev === 'risk' ? -1 : 1) - (y.sev === 'risk' ? -1 : 1))
  }, [healthAge, checkinAge, dueActions.length, dueDone, weakest, liveCycles.length, activeGoals.length])

  /* ── Trajectory ────────────────────────────────────────────────────
     The hero used to restate the alert count that is listed immediately
     below it and repeat the health score already shown in the Health
     system panel. Direction is the one question nothing else on this page
     answers: am I actually getting better?

     Free, egress-wise — this reuses the 200-day health pull "What
     connects" already makes, and issues no query of its own.

     Halves are measured in LOGGED ENTRIES, not calendar days. This app's
     data is stale-by-design (weeks can pass with nothing logged), so
     "last 30 days vs the 30 before" is frequently comparing a handful of
     points against an empty set, which reads as a dramatic collapse that
     never happened. Comparing your last N logs to the N before them
     always compares like with like, whatever the gaps. */
  /* Reusable "last N logs vs the N before" comparator. Measured in LOGGED
     ENTRIES, not calendar days — this app's data is stale-by-design (weeks
     can pass with nothing logged), so a calendar window frequently compares
     a handful of points against an empty set, reading as a collapse that
     never happened. Comparing your last N logs to the N before them always
     compares like with like, whatever the gaps. */
  function trendOf(rows, scoreFn) {
    const pts = (rows || [])
      .filter((r) => r?.date)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((r) => ({ date: r.date, score: scoreFn(r) }))
      .filter((p) => p.score != null)
    if (pts.length < 6) return { delta: null, n: pts.length }
    const half = Math.min(15, Math.floor(pts.length / 2))
    const recent = pts.slice(-half)
    const prior = pts.slice(-half * 2, -half)
    const avg = (xs) => xs.reduce((s, x) => s + x.score, 0) / xs.length
    return { delta: Math.round(avg(recent) - avg(prior)), n: half }
  }

  /* One trend per system — this is the fix for the hero reading as a
     Health widget with two footnotes. Goals has no natural day-over-day
     score to trend (a cycle-action completion rate resets every week by
     design), so it's represented by today's completion instead of a
     delta; Health and Wellness both get a real trend from data already
     loaded for "What connects", at no extra query cost. */
  const healthTrend = useMemo(
    () => trendOf(patternHealth.data, (h) => healthDetails(h, settings.data)?.score),
    [patternHealth.data, settings.data])
  const wellnessTrend = useMemo(
    () => trendOf(patternWellness.data, (c) => clarityDetails(c)?.score),
    [patternWellness.data])
  const goalsPct = dueActions.length ? Math.round((dueDone / dueActions.length) * 100) : null

  /* Direction wording, shared by both trended systems. The 3-point dead
     band is deliberate: day-to-day scores wobble by a couple of points on
     nothing at all, and copy that flips between "climbing" and "slipping"
     on that noise teaches you to stop reading it. */
  function directionOf(trend) {
    if (trend.delta == null) return { tone: 'flat', verb: 'still gathering data' }
    if (trend.delta >= 3) return { tone: 'up', verb: 'climbing' }
    if (trend.delta <= -3) return { tone: 'down', verb: 'slipping' }
    return { tone: 'flat', verb: 'holding steady' }
  }
  const healthDir = directionOf(healthTrend)
  const wellnessDir = directionOf(wellnessTrend)

  /* The headline leads with whichever TRENDED system moved the most —
     Health and Wellness compete for it on |delta|; Goals doesn't have a
     comparable delta so it never leads, but it always gets its own ring
     below. Ties and no-data both fall back to Health so the headline
     never reads as arbitrary. */
  const lead = (() => {
    const hMag = Math.abs(healthTrend.delta ?? -1)
    const wMag = Math.abs(wellnessTrend.delta ?? -1)
    if (healthTrend.delta == null && wellnessTrend.delta == null) return null
    return wMag > hMag ? 'wellness' : 'health'
  })()
  const leadLabel = lead === 'wellness' ? 'Clarity' : 'Health'
  const leadTrend = lead === 'wellness' ? wellnessTrend : healthTrend
  const leadDir = lead === 'wellness' ? wellnessDir : healthDir
  const traj = lead == null
    ? { word: 'Building the picture', em: 'not enough history yet', tone: 'flat' }
    : {
      word: `${leadLabel} is ${leadDir.verb}`,
      em: leadDir.tone === 'flat'
        ? `within ${Math.abs(leadTrend.delta) || 1} point of your last ${leadTrend.n} logs`
        : `${leadTrend.delta > 0 ? '+' : ''}${leadTrend.delta} over your last ${leadTrend.n} logs`,
      tone: leadDir.tone,
    }

  /* One line of substance under the headline, in priority order: a real
     cross-module pattern if one exists, otherwise the component actually
     dragging the score, otherwise an honest "nothing to say yet". */
  const insight = patterns[0]?.text
    || (weakest ? `${weakest.label} is the piece holding your score back — ${weakest.detail}.` : null)
    || 'Log Health and Wellness on the same days and cross-system patterns start surfacing here.'

  const healthStreak = currentStreak(healthIdx.data || [])
  const checkinStreak = currentStreak((wellnessIdx.data || []).map((x) => x.date))
  const bestStreak = longestStreak(healthIdx.data || [])

  /* The review only asks for you inside its own window (Sat through Tue)
     and only when it hasn't been written. Outside that it says nothing at
     all — a prompt that nags every day of the week is one you learn to
     scroll past, which is exactly how the last attempt at this habit
     died. */
  const dueWeekId = reviewTargetWeekId()
  const reviewDue = isReviewWindow()
    && !(reviewIdx.data || []).some((r) => r.week_id === dueWeekId)

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

      {/* The reason any of the rest of this page exists. See lib/identity.js. */}
      <div className="north-star">
        <Icon name="north_star" size={13} />
        <span>{IDENTITY_STATEMENT}</span>
      </div>

      {/* Every other page has this; Today was the one page without it,
          which meant a network failure here rendered indistinguishable
          from "you have never logged anything" — an empty state with the
          same visual weight as a real one, on the one page most likely to
          get checked first thing in the morning on a flaky connection. */}
      <ErrorNote error={healthIdx.error || wellnessIdx.error || sprints.error || habits.error} />

      {/* ── Command banner ──────────────────────────────────────────────
             Rebuilt 2026-08-19. Three panes instead of copy-plus-ring:
             direction (left), the score in context of its own trend
             (right), and the streaks that were previously computed
             nowhere on this page (strip). The open-item and alert counts
             are gone on purpose — both were restating the list rendered
             directly beneath this card. */}
      <div className="hero-card hero-mc-card" style={{ marginBottom: 14 }}>
        <HeroEdge />
        <div className="hero-mc">
          <div className="hero-mc-main">
            <div className="hero-eyebrow">{greeting}, Jack</div>
            <div className="hero-h">
              {traj.word}.<br /><em>{traj.em}.</em>
            </div>
            <p className="hero-copy">{insight}</p>
          </div>

          {/* Three rings, one per system — not one big Health ring with an
              orphaned sparkline hanging off it. The headline above still
              calls out whichever system actually moved; these three give
              equal billing to all of them regardless of which one led. */}
          <div className="hero-mc-rings">
            <HeroRing mod="health" label="Health" score={healthScore} trend={healthTrend} dir={healthDir} />
            <HeroRing mod="wellness" label="Clarity" score={clarity} trend={wellnessTrend} dir={wellnessDir} />
            <HeroRing mod="goals" label="Goals" score={goalsPct}
              caption={dueActions.length ? `${dueDone}/${dueActions.length} today` : `${activeGoals.length} active`} />
          </div>

          <div className="hero-mc-strip">
            <HeroStat mod="health" value={healthStreak} unit={healthStreak === 1 ? 'day' : 'days'} label="Health streak" />
            <HeroStat mod="wellness" value={checkinStreak} unit={checkinStreak === 1 ? 'day' : 'days'} label="Check-in streak" />
            <HeroStat value={bestStreak} unit={bestStreak === 1 ? 'day' : 'days'} label="Best run" />
            <HeroStat mod="goals" value={totalOpen} unit={totalOpen === 1 ? 'item' : 'items'}
              label={allClear ? 'Open · all systems current' : 'Open today'} />
          </div>
        </div>
      </div>

      {reviewDue && (
        <Link to="/review" className="rv-due">
          <span className="rv-due-ic"><Icon name="event_note" size={20} /></span>
          <span className="rv-due-txt">
            <strong>Close out {prettyWeek(dueWeekId)}</strong>
            <small>Your weekly review is ready. The numbers are already gathered.</small>
          </span>
          <Icon name="arrow_forward" size={18} />
        </Link>
      )}

      {/* ── Attention queue ── */}
      {!allClear && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {alerts.map((al, i) => {
            const s = STATUS[al.sev]
            const quickable = al.kind === 'health' || al.kind === 'wellness'
            const open = quickable && quickOpen === al.kind
            return (
              <div key={i}>
                <div className="alert-row">
                  <span className="alert-dot" style={{ background: s.color }} />
                  <div className="alert-ic" style={{ background: s.bg }}>
                    <Icon name={al.icon} size={17} style={{ color: s.color }} />
                  </div>
                  <span className="alert-text">{al.text}</span>
                  {quickable && (
                    <button type="button" className="btn btn-secondary btn-xs"
                      onClick={() => setQuickOpen(open ? null : al.kind)}>
                      {open ? 'Cancel' : al.cta} <Icon name={open ? 'close' : 'bolt'} size={14} />
                    </button>
                  )}
                  <Link to={al.to} className="btn btn-ghost btn-xs">
                    Open <Icon name="arrow_forward" size={14} />
                  </Link>
                </div>
                {open && al.kind === 'health' && (
                  <QuickHealthForm busy={quickBusy} onCancel={() => setQuickOpen(null)} onSave={quickSaveHealth} />
                )}
                {open && al.kind === 'wellness' && (
                  <QuickWellnessForm busy={quickBusy} onCancel={() => setQuickOpen(null)} onSave={quickSaveWellness} />
                )}
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
            sub="Due today, carried from Pulse."
            right={habitList.length
              ? <Badge tone={habitsDone === habitList.length ? 'green' : 'blue'}>{habitsDone}/{habitList.length}</Badge>
              : null}
          />
          {habits.loading ? <Loading /> : !habitList.length ? (
            <Empty icon="repeat"
              title={(habits.data || []).length ? 'Nothing due today' : 'No habits in Pulse yet'} />
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

      {/* ── What connects: the one thing three separate trackers couldn't
             show you, because their data never lived in the same place. ── */}
      <Card style={{ marginTop: 14 }}>
        <CardHead title="What connects" sub="Plain comparisons across your last 200 days of overlapping health and wellness logs." />
        {(patternHealth.loading || patternWellness.loading) ? <Loading /> : !patterns.length ? (
          <Empty icon="hub" title={matchedDays < 3 ? 'Not enough overlapping days yet' : 'No strong pattern yet'}>
            {matchedDays < 3
              ? 'Log both Health and Wellness on the same days a few more times and a pattern can surface here.'
              : `Checked ${matchedDays} days with both a health log and a check-in — nothing crossed the bar to report yet.`}
          </Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {patterns.map((p) => (
              <div key={p.key} className="alert-row">
                <div className="alert-ic" style={{ background: p.up ? STATUS.good.bg : STATUS.short.bg }}>
                  <Icon name={p.icon} size={17} style={{ color: p.up ? STATUS.good.color : STATUS.short.color }} />
                </div>
                <span className="alert-text">{p.text}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

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

/**
 * Inline quick-capture for a health log, right under its alert row. Only
 * the components that move the Health Score most (sleep, steps, water,
 * energy) — sleep quality and pain default sensibly (3/5, 0/5) when left
 * blank, so this stays a few taps, not the full LogEditor. Anything
 * captured here is a normal log row afterward: opening /health later shows
 * it exactly like one made from the full editor, and re-saving there only
 * fills in the rest.
 */
function QuickHealthForm({ busy, onCancel, onSave }) {
  const [sleepHours, setSleepHours] = useState('')
  const [steps, setSteps] = useState('')
  const [water, setWater] = useState('')
  const [energy, setEnergy] = useState(3)

  return (
    <div className="card card-pad" style={{ marginTop: 6, marginLeft: 40 }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sleep (hrs)">
          <input type="number" min="0" max="16" step="0.5" value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)} placeholder="7.5" />
        </Field>
        <Field label="Steps">
          <input type="number" min="0" step="100" value={steps}
            onChange={(e) => setSteps(e.target.value)} placeholder="8000" />
        </Field>
        <Field label="Water (L)">
          <input type="number" min="0" max="8" step="0.25" value={water}
            onChange={(e) => setWater(e.target.value)} placeholder="2" />
        </Field>
        <RangeScale label="Energy" value={energy} onChange={setEnergy} low="Low" high="High" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => onSave({ sleepHours, steps, water, energy })}>
          {busy ? 'Saving…' : 'Save log'}
        </button>
      </div>
    </div>
  )
}

/**
 * Inline quick-capture for a wellness check-in. Unlike Health, all four
 * clarity-score components (mood, stress, clarity, grounded) fit in one
 * screen without trimming anything, so this is the full scoring input —
 * just without the free-text loop/reframe fields the full CheckinView
 * offers for a deeper entry.
 */
function QuickWellnessForm({ busy, onCancel, onSave }) {
  const [mood, setMood] = useState(3)
  const [stress, setStress] = useState(3)
  const [clarity, setClarity] = useState(3)
  const [grounded, setGrounded] = useState(3)

  return (
    <div className="card card-pad" style={{ marginTop: 6, marginLeft: 40 }}>
      <div className="grid grid-cols-2 gap-3">
        <RangeScale label="Mood" value={mood} onChange={setMood} low="Heavy" high="Bright" />
        <RangeScale label="Stress" value={stress} onChange={setStress} low="Easy" high="High" />
        <RangeScale label="Clarity" value={clarity} onChange={setClarity} low="Foggy" high="Clear" />
        <RangeScale label="Grounded" value={grounded} onChange={setGrounded} low="Adrift" high="Grounded" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => onSave({ mood, stress, clarity, grounded })}>
          {busy ? 'Saving…' : 'Save check-in'}
        </button>
      </div>
    </div>
  )
}

/*
  One system's ring inside the hero. A trend (Health, Clarity) gets a small
  delta pill under the ring reusing the same tone/verb logic as the
  headline; a non-trended system (Goals) gets a plain caption instead of a
  pill it can't honestly earn. Deliberately three of these side by side
  rather than one big ring — the whole point of this revision is that the
  hero stopped being a Health widget with footnotes.
*/
function HeroRing({ mod, label, score, trend, dir, caption }) {
  return (
    <div className="hero-ring" data-mod={mod}>
      <Ring score={score} sub={label.toLowerCase()} size={92} stroke={9} />
      {trend ? (
        trend.delta != null ? (
          <span className={`hero-delta is-${dir.tone}`}>
            <Icon name={dir.tone === 'up' ? 'trending_up' : dir.tone === 'down' ? 'trending_down' : 'trending_flat'} size={13} />
            {trend.delta > 0 ? `+${trend.delta}` : trend.delta}
          </span>
        ) : <span className="hero-ring-caption">building history</span>
      ) : caption ? <span className="hero-ring-caption">{caption}</span> : null}
    </div>
  )
}

function HeroStat({ mod, value, unit, label }) {
  return (
    <div className="hero-stat" data-mod={mod}>
      <div className="hero-stat-v">
        <span className="tnum">{value}</span> <small>{unit}</small>
      </div>
      <div className="hero-stat-l">{label}</div>
    </div>
  )
}

/*
  The brand mark's three bars — one per life-system — scaled up and bled
  off the card's right edge as texture. Geometry is copied verbatim from
  components/shell/BrandMark.jsx (and therefore from
  public/icons/favicon.svg); if that mark is ever redrawn, redraw this
  from the same source.

  Using the logo as the hero's ornament rather than a generic blob is what
  gives Mission control an identity of its own: every other hero in the
  app is a flat module colour, and this one wears the mark that means
  "all three systems at once".
*/
function HeroEdge() {
  return (
    <svg className="hero-edge" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <polygon points="9.89,11.70 28.44,11.70 25.21,17.75 9.89,17.75" fill="#d76d24" />
      <polygon points="9.89,20.98 33.27,20.98 30.05,27.02 9.89,27.02" fill="#11ae95" />
      <polygon points="9.89,30.25 38.11,30.25 34.89,36.30 9.89,36.30" fill="#953ca4" />
    </svg>
  )
}
