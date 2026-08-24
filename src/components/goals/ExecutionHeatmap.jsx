import {
  dayCommitments, dateKeyForWeekDay, sprintWeeks, sprintCurrentWeek, tacticCommitmentRates, flexibleTargets,
  DAY_LABELS,
} from '../../lib/goals'
import { STATUS } from '../../lib/design'
import { dateKey, pretty } from '../../lib/dates'

/*
  Replaces the 12-week bar chart, which plotted one percentage per week —
  percentages whose denominators meant different things week to week, so
  the bars weren't actually comparable to each other (see the Scoring v2
  note in lib/goals.js).

  This shows raw truth instead, with no denominator at all: one cell per
  real date, columns = weeks, rows = weekdays. Weekday patterns fall out
  of the row structure — a run of misses on the Friday row is visible at
  a glance in a way no single number conveys.

  Only day-specific commitments (daily / custom-day) are plotted; flexible
  weekly/xperweek targets can't be pinned to a day, so they're summarised
  separately underneath rather than smeared across cells they don't
  belong to.
*/

const CELL = 15, GAP = 3, LABEL_W = 26, HEADER_H = 14

function cellFill(state) {
  if (state === 'all') return STATUS.good.color
  if (state === 'some') return STATUS.short.color
  if (state === 'none') return STATUS.risk.color
  return null
}

export default function ExecutionHeatmap({ sprint, phases, tactics }) {
  const weeks = sprintWeeks(sprint)
  const today = dateKey()

  // grid[dayIdx][weekIdx] — one cell per real calendar date.
  const grid = []
  for (let d = 0; d < 7; d++) {
    const row = []
    for (let w = 1; w <= weeks; w++) {
      const iso = dateKeyForWeekDay(sprint, w, d)
      const outside = !iso || (sprint.start_date && iso < sprint.start_date) ||
        (sprint.end_date && iso > sprint.end_date)
      if (outside) { row.push({ iso, state: 'outside' }); continue }
      if (iso > today) { row.push({ iso, state: 'future' }); continue }
      const cs = dayCommitments(phases, tactics, sprint, iso)
      if (!cs.length) { row.push({ iso, state: 'idle' }); continue }
      const done = cs.filter((c) => c.done).length
      row.push({
        iso, done, total: cs.length, isToday: iso === today,
        state: done === cs.length ? 'all' : done > 0 ? 'some' : 'none',
      })
    }
    grid.push(row)
  }

  const perTactic = tacticCommitmentRates(phases, tactics, sprint)
    .sort((a, b) => (a.done / a.total) - (b.done / b.total))
  const flex = flexibleTargets(phases, tactics, sprint)
  const cw = sprintCurrentWeek(sprint)

  const W = LABEL_W + weeks * (CELL + GAP)
  const H = HEADER_H + 7 * (CELL + GAP)

  return (
    <div className="streak-chart-wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div className="streak-chart-title" style={{ marginBottom: 0 }}>Every commitment, by day</div>
        {flex.total > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>
            Weekly targets · {flex.met} of {flex.total} met
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} style={{ maxWidth: '100%', height: 'auto', display: 'block' }}>
          {/* Week numbers, one per column — the whole point of asking for
              these was "so I can see what's what," i.e. tie a cell back
              to a specific week without having to count columns. The
              current week's number gets the same blue as today's cell
              outline below, so both "which week" and "which day" use one
              consistent visual language. */}
          {Array.from({ length: weeks }).map((_, wi) => (
            <text key={wi} x={LABEL_W + wi * (CELL + GAP) + CELL / 2} y={HEADER_H - 4}
              textAnchor="middle" fontSize="8.5" fontWeight={wi + 1 === cw ? '800' : '700'}
              fill={wi + 1 === cw ? '#0ea5e9' : 'var(--text-3)'}>
              {wi + 1}
            </text>
          ))}
          {grid.map((row, d) => (
            <g key={d}>
              <text x={0} y={HEADER_H + d * (CELL + GAP) + CELL - 3} fontSize="9" fontWeight="700" fill="var(--text-3)">
                {DAY_LABELS[d].slice(0, 2)}
              </text>
              {row.map((cell, wi) => {
                const x = LABEL_W + wi * (CELL + GAP)
                const y = HEADER_H + d * (CELL + GAP)
                const fill = cellFill(cell.state)
                if (cell.state === 'outside') return null
                return (
                  <g key={wi}>
                    <title>
                      {cell.iso ? pretty(cell.iso) : ''}
                      {cell.total ? ` — ${cell.done} of ${cell.total} done` :
                        cell.state === 'future' ? ' — upcoming' : ' — nothing due'}
                    </title>
                    <rect x={x} y={y} width={CELL} height={CELL} rx={4}
                      fill={fill || 'var(--white-soft)'}
                      opacity={fill ? (cell.state === 'none' ? .34 : 1) : cell.state === 'future' ? .45 : .8}
                      stroke={cell.isToday ? '#0ea5e9' : 'transparent'} strokeWidth={cell.isToday ? 2 : 0} />
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        {[[STATUS.good.color, 1, 'All done'], [STATUS.short.color, 1, 'Some done'],
          [STATUS.risk.color, .34, 'Missed'], ['var(--white-soft)', .8, 'Nothing due']].map(([c, o, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: c, opacity: o, display: 'inline-block' }} />{l}
          </span>
        ))}
      </div>

      {/* Worst-first, because the useful question is "which one is
          dragging me," not "list my tactics in creation order." */}
      {perTactic.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 14 }}>
          {perTactic.map((r) => (
            <div key={r.tactic.id || r.tactic.local_id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.tactic.text}
              </span>
              <span className="tnum" style={{ fontWeight: 800, color: 'var(--text)' }}>{r.done}<span style={{ color: 'var(--text-3)', fontWeight: 600 }}>/{r.total}</span></span>
              <span style={{ width: 62, height: 5, borderRadius: 99, background: 'var(--white-soft)', overflow: 'hidden', flexShrink: 0 }}>
                <span style={{ display: 'block', height: '100%', borderRadius: 99, width: `${Math.round((r.done / r.total) * 100)}%`, background: STATUS.good.color }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
