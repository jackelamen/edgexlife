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
*/
import { healthDetails, clarityDetails } from './scores'

const MIN_DAYS_PER_BUCKET = 3 // don't report a "pattern" built on 1-2 days
const MIN_SCORE_GAP = 5 // 0-100 scale
const MIN_RATING_GAP = 0.4 // 1-5 scale

function bucketAvg(rows, predicate, valueFn) {
  const yes = [], no = []
  rows.forEach((r) => {
    const v = valueFn(r)
    if (v == null || Number.isNaN(v)) return
    ;(predicate(r) ? yes : no).push(v)
  })
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return { yesAvg: avg(yes), noAvg: avg(no), yesN: yes.length, noN: no.length }
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
    (m) => clarityDetails(m.checkin)?.score)
  if (sleepSplit.yesN >= MIN_DAYS_PER_BUCKET && sleepSplit.noN >= MIN_DAYS_PER_BUCKET) {
    const diff = Math.round(sleepSplit.yesAvg - sleepSplit.noAvg)
    if (Math.abs(diff) >= MIN_SCORE_GAP) {
      patterns.push({
        key: 'sleep-clarity', icon: 'bedtime', metricKey: 'sleepHours', up: diff > 0,
        text: diff > 0
          ? `Clarity runs ${diff} points higher on days you hit your sleep target — ${Math.round(sleepSplit.yesAvg)} vs ${Math.round(sleepSplit.noAvg)}, over ${sleepSplit.yesN} vs ${sleepSplit.noN} days.`
          : `Clarity runs ${Math.abs(diff)} points lower on days you hit your sleep target (${Math.round(sleepSplit.yesAvg)} vs ${Math.round(sleepSplit.noAvg)}) — worth a second look, that's the opposite of what you'd expect.`,
      })
    }
  }

  const exSplit = bucketAvg(both,
    (m) => (m.health.exerciseMins ?? 0) > 0,
    (m) => Number(m.checkin.mood) || null)
  if (exSplit.yesN >= MIN_DAYS_PER_BUCKET && exSplit.noN >= MIN_DAYS_PER_BUCKET) {
    const diff = Math.round((exSplit.yesAvg - exSplit.noAvg) * 10) / 10
    if (Math.abs(diff) >= MIN_RATING_GAP) {
      patterns.push({
        key: 'exercise-mood', icon: 'fitness_center', metricKey: 'exercise', up: diff > 0,
        text: diff > 0
          ? `Mood averages ${diff.toFixed(1)} points higher (of 5) on days with any exercise logged — ${exSplit.yesN} vs ${exSplit.noN} days.`
          : `Mood averages ${Math.abs(diff).toFixed(1)} points lower on exercise days — could be timing or soreness, not necessarily exercise itself.`,
      })
    }
  }

  const scoreSplit = bucketAvg(both,
    (m) => (healthDetails(m.health, settings)?.score ?? 0) >= 70,
    (m) => clarityDetails(m.checkin)?.score)
  if (scoreSplit.yesN >= MIN_DAYS_PER_BUCKET && scoreSplit.noN >= MIN_DAYS_PER_BUCKET) {
    const diff = Math.round(scoreSplit.yesAvg - scoreSplit.noAvg)
    if (Math.abs(diff) >= MIN_SCORE_GAP) {
      patterns.push({
        key: 'health-clarity', icon: 'monitor_heart', metricKey: null, up: diff > 0,
        text: `Clarity runs ${Math.abs(diff)} points ${diff > 0 ? 'higher' : 'lower'} on days your Health Score is 70+ — ${scoreSplit.yesN} vs ${scoreSplit.noN} days.`,
      })
    }
  }

  return { patterns, matchedDays: both.length }
}
