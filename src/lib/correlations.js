/*
  Cross-module pattern-finding for Mission Control — "your clarity runs
  higher on days you slept more" is the one insight three separate
  trackers couldn't give you, and Health/Wellness logs already live in the
  same place here, so it's just a join.

  Deliberately plain bucket comparisons (average of one number on days
  matching a condition vs days that don't) rather than a formal
  correlation coefficient — a Pearson r computed on a handful of matched
  days is false precision, and this app's coaching voice is plain
  sentences, not a statistics dashboard. Every pattern also states its own
  sample size so it's never presented as more certain than it is.

  Fixed 2026-08-21 (xLife review, Aug 2026 — "Instrument critiques"):
  the sample-size and gap thresholds below used to be flat numbers picked
  by feel (3 days, a 5-point gap). Neither actually supports a sentence
  as confident as "clarity runs N points higher" — the standard error of
  a 3-day mean is roughly the same size as a 5-point gap, so a good chunk
  of what got reported as "a pattern" was noise that happened to land on
  the right side of an arbitrary line. Two changes fix that: a real
  standard-error gate (see seOfDiff below) alongside the raw-magnitude
  floor, and a higher minimum bucket size so that gate has something to
  work with. See the two other fixes inline: a bug in what counted as
  "unrated," and the health↔clarity pattern being dropped outright.
*/
import { clarityDetails } from './scores'

const MIN_DAYS_PER_BUCKET = 8 // was 3 — see header comment
const MIN_SCORE_GAP = 5 // 0-100 scale — a floor on practical size, not on its own sufficient
const MIN_RATING_GAP = 0.4 // 1-5 scale — same role, for the mood pattern
const SE_MULTIPLE = 1.5 // gap must clear this many standard errors of itself

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

// Sample standard deviation (n-1 denominator). Needs at least 2 points;
// callers only reach here once MIN_DAYS_PER_BUCKET (8) already guarantees
// that, so the n<2 branch is just a defensive floor, not a real path.
function sampleSD(arr, avg) {
  if (arr.length < 2) return 0
  const ss = arr.reduce((s, v) => s + (v - avg) ** 2, 0)
  return Math.sqrt(ss / (arr.length - 1))
}

/** Standard error of the DIFFERENCE between two independent sample means —
    the actual question a "is this gap real" test needs answered, not just
    each bucket's own spread. */
function seOfDiff(yesVals, yesAvg, noVals, noAvg) {
  const sdYes = sampleSD(yesVals, yesAvg)
  const sdNo = sampleSD(noVals, noAvg)
  return Math.sqrt((sdYes ** 2) / yesVals.length + (sdNo ** 2) / noVals.length)
}

function bucketAvg(rows, predicate, valueFn) {
  const yes = [], no = []
  rows.forEach((r) => {
    const v = valueFn(r)
    if (v == null || Number.isNaN(v)) return
    ;(predicate(r) ? yes : no).push(v)
  })
  const yesAvg = mean(yes), noAvg = mean(no)
  return {
    yesAvg, noAvg, yesN: yes.length, noN: no.length,
    // null until both buckets clear MIN_DAYS_PER_BUCKET — see isSignificant.
    se: yes.length >= 2 && no.length >= 2 ? seOfDiff(yes, yesAvg, no, noAvg) : null,
  }
}

/** A gap counts as a real pattern only if it clears BOTH a practical-size
    floor (minGap, in the metric's own units) AND SE_MULTIPLE standard
    errors of the gap itself — large enough to matter, and larger than the
    noise two 8-day samples of a self-rated number would produce by
    chance. Either alone let too much through: the old code only checked
    the first. */
function isSignificant(split, diff, minGap) {
  if (split.yesN < MIN_DAYS_PER_BUCKET || split.noN < MIN_DAYS_PER_BUCKET) return false
  if (Math.abs(diff) < minGap) return false
  if (split.se == null) return false
  return Math.abs(diff) >= SE_MULTIPLE * split.se
}

/** clarityDetails() defaults every unrated field to 3 (a sane behavior
    for a live-editing form, so it never returns "undefined" mid-entry)
    and never returns null for a genuinely-empty checkin — so a day where
    the wellness checkin row exists but nothing was actually rated used
    to sail straight through bucketAvg's null guard as a full-credit
    "neutral" score, inflating both the sample size and pulling every
    average toward 60. This is the correlations-only fix: only trust a
    day's clarity score here if all four inputs were actually rated. */
function ratedClarityScore(checkin) {
  if (!checkin) return null
  const { mood, clarity, grounded, stress } = checkin
  if (mood == null || clarity == null || grounded == null || stress == null) return null
  return clarityDetails(checkin)?.score ?? null
}

/**
 * `matched`: array of { date, health, checkin }, where `health` is a
 * normalized health log or null and `checkin` is a wellness entry or null
 * for that date. Only dates carrying BOTH are useful for a cross-module
 * read; `matchedDays` in the return value is that count, surfaced so the
 * empty/thin-data state can say something honest about why.
 */
export function findPatterns(matched, settings) {
  const both = (matched || []).filter((m) => m.health && m.checkin)
  const patterns = []

  const sleepTarget = settings?.sleepTarget ?? 7.5
  const sleepSplit = bucketAvg(both,
    (m) => (m.health.sleepHours ?? 0) >= sleepTarget,
    (m) => ratedClarityScore(m.checkin))
  const sleepDiff = sleepSplit.yesAvg != null && sleepSplit.noAvg != null
    ? Math.round(sleepSplit.yesAvg - sleepSplit.noAvg) : 0
  if (isSignificant(sleepSplit, sleepDiff, MIN_SCORE_GAP)) {
    patterns.push({
      key: 'sleep-clarity', icon: 'bedtime', metricKey: 'sleepHours', up: sleepDiff > 0,
      text: sleepDiff > 0
        ? `Clarity runs ${sleepDiff} points higher on days you hit your sleep target — ${Math.round(sleepSplit.yesAvg)} vs ${Math.round(sleepSplit.noAvg)}, over ${sleepSplit.yesN} vs ${sleepSplit.noN} days.`
        : `Clarity runs ${Math.abs(sleepDiff)} points lower on days you hit your sleep target (${Math.round(sleepSplit.yesAvg)} vs ${Math.round(sleepSplit.noAvg)}) — worth a second look, that's the opposite of what you'd expect.`,
    })
  }

  const exSplit = bucketAvg(both,
    (m) => (m.health.exerciseMins ?? 0) > 0,
    (m) => Number(m.checkin.mood) || null)
  const exDiff = exSplit.yesAvg != null && exSplit.noAvg != null
    ? Math.round((exSplit.yesAvg - exSplit.noAvg) * 10) / 10 : 0
  if (isSignificant(exSplit, exDiff, MIN_RATING_GAP)) {
    patterns.push({
      key: 'exercise-mood', icon: 'fitness_center', metricKey: 'exercise', up: exDiff > 0,
      text: exDiff > 0
        ? `Mood averages ${exDiff.toFixed(1)} points higher (of 5) on days with any exercise logged — ${exSplit.yesN} vs ${exSplit.noN} days.`
        : `Mood averages ${Math.abs(exDiff).toFixed(1)} points lower on exercise days — could be timing or soreness, not necessarily exercise itself.`,
    })
  }

  // health↔clarity dropped (2026-08-21, xLife review): Health Score is
  // ~35% self-report (energy + sleep quality) and Clarity Score is 100%
  // self-report — comparing them mostly measures whether the same person
  // rated themselves well on two different forms on the same day, which
  // is close to tautological rather than a genuine cross-instrument
  // finding. The sleep↔clarity pattern above stays: sleep hours is a
  // logged number, not a feeling, so that one actually crosses instruments.

  return { patterns, matchedDays: both.length }
}
