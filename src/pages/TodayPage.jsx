import { useMemo } from 'react'
import toast from 'react-hot-toast'
import { Check, ExternalLink } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import {
  fetchGoals, fetchGoalRollup, fetchHabits, fetchHabitLogs,
  fetchHealthIndex, fetchHealthLogs, fetchWellnessIndex, fetchWellnessCheckins,
  logHabit,
} from '../lib/data'
import { daysAgo, today, pretty } from '../lib/dates'
import { PageHead, Section, Empty, Loading, ErrorNote } from '../components/common/Bits'

const PULSE_URL = import.meta.env.VITE_PULSE_URL || ''

/*
  Today is the join. It is the only page that reads across all three domains
  at once, and it is why the three modules belong in one app rather than three:
  a habit is the daily edge of a goal, and a check-in is the daily edge of
  wellness. Layout is chronological (now, then the day behind it), not a
  three-card grid — the content is not naturally a set of three.
*/
export default function TodayPage() {
  const t = today()
  const goals = useAsync((f) => fetchGoals({ force: f }))
  const rollup = useAsync((f) => fetchGoalRollup({ force: f }))
  const habits = useAsync((f) => fetchHabits({ force: f }))
  const habitLogs = useAsync((f) => fetchHabitLogs(daysAgo(7), t, { force: f }), [t])
  // Both indexes are dates-only. Today then fetches exactly ONE day's payload
  // each — the most recent — rather than guessing a window and either missing
  // the data or dragging months of it across the wire.
  const healthIdx = useAsync((f) => fetchHealthIndex({ force: f }))
  const wellnessIdx = useAsync((f) => fetchWellnessIndex({ force: f }))

  const lastHealthDate = healthIdx.data?.[0] || null
  const lastCheckinDate = wellnessIdx.data?.[0]?.date || null

  const health = useAsync(
    (f) => fetchHealthLogs(lastHealthDate, lastHealthDate, { force: f }),
    [lastHealthDate],
    { enabled: Boolean(lastHealthDate) }
  )
  const wellness = useAsync(
    (f) => fetchWellnessCheckins(lastCheckinDate, lastCheckinDate, { force: f }),
    [lastCheckinDate],
    { enabled: Boolean(lastCheckinDate) }
  )

  const doneToday = useMemo(() => {
    const s = new Set()
    ;(habitLogs.data || []).forEach((l) => {
      if (l.logged_on === t && l.count > 0) s.add(l.habit_id)
    })
    return s
  }, [habitLogs.data, t])

  const goalTitle = useMemo(() => {
    const m = {}
    ;(goals.data || []).forEach((g) => { m[g.id] = g.title })
    return m
  }, [goals.data])

  const lastHealth = (health.data || [])[0]
  const lastCheckin = (wellness.data || [])[0]
  const activeGoals = (goals.data || []).filter((g) => g.status !== 'archived')

  async function toggle(habit) {
    if (doneToday.has(habit.id)) return
    try {
      await logHabit(habit.id, t, 1)
      toast.success(`${habit.name} logged`)
      habitLogs.reload()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <>
      <PageHead
        eyebrow={pretty(t)}
        title="Today"
        sub="The daily edge of everything else: habits carrying your goals, and the last thing your body and head told you."
      />

      <ErrorNote error={habits.error || health.error} />

      <Section
        title="Habits"
        note={habits.data?.length ? `${doneToday.size} of ${habits.data.length} done` : null}
      >
        {habits.loading ? (
          <Loading />
        ) : !habits.data?.length ? (
          <Empty>No habits in Pulse yet.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {habits.data.map((h) => {
              const done = doneToday.has(h.id)
              return (
                <button
                  key={h.id}
                  onClick={() => toggle(h)}
                  className="lf-card px-4 py-3.5 flex items-center gap-3 text-left"
                  style={done ? { background: 'var(--ever-mist)', borderColor: 'var(--ever-soft)' } : undefined}
                >
                  <span
                    className="w-5 h-5 rounded-full grid place-items-center shrink-0 border"
                    style={{
                      background: done ? 'var(--ever)' : 'transparent',
                      borderColor: done ? 'var(--ever)' : 'var(--ink-4)',
                    }}
                  >
                    {done && <Check size={13} color="#fff" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[14px] block truncate">{h.name}</span>
                    {h.goal_id && goalTitle[h.goal_id] && (
                      <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                        {goalTitle[h.goal_id]}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="lf-card px-5 py-4">
          <div className="lf-eyebrow mb-3">Last health log</div>
          {lastHealth ? (
            <>
              <p className="text-[13px] mb-2" style={{ color: 'var(--ink-3)' }}>{pretty(lastHealth.date)}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
                {lastHealth.sleepHours != null && <span>{lastHealth.sleepHours}h sleep</span>}
                {lastHealth.steps != null && <span>{lastHealth.steps.toLocaleString()} steps</span>}
                {lastHealth.exerciseMins ? <span>{lastHealth.exerciseMins} min moving</span> : null}
                {lastHealth.weight != null && <span>{lastHealth.weight} kg</span>}
              </div>
            </>
          ) : (
            <p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>Nothing logged yet.</p>
          )}
        </div>

        <div className="lf-card px-5 py-4">
          <div className="lf-eyebrow mb-3">Last check-in</div>
          {lastCheckin ? (
            <>
              <p className="text-[13px] mb-2" style={{ color: 'var(--ink-3)' }}>{pretty(lastCheckin.date)}</p>
              {lastCheckin.loop ? (
                <p className="text-[14px] leading-[1.55]">{lastCheckin.loop}</p>
              ) : (
                <p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  {lastCheckin.state || 'Logged, no note.'}
                </p>
              )}
            </>
          ) : (
            <p className="text-[14px]" style={{ color: 'var(--ink-3)' }}>No check-ins recorded.</p>
          )}
        </div>
      </div>

      <Section title="Goals in play" className="mt-9">
        {activeGoals.length === 0 ? (
          <Empty>No active goals.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {activeGoals.map((g) => {
              const r = (rollup.data || []).find((x) => x.goal_id === g.id)
              return (
                <div key={g.id} className="lf-card px-4 py-3 flex items-center justify-between gap-4">
                  <span className="text-[14px] min-w-0 truncate">{g.title}</span>
                  <span className="text-[12.5px] shrink-0" style={{ color: 'var(--ink-3)' }}>
                    {r?.open_tasks ?? 0} open · {r?.habits ?? 0} habits
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {PULSE_URL && (
        <a
          href={PULSE_URL}
          target="_blank"
          rel="noreferrer"
          className="lf-btn"
        >
          Open Pulse <ExternalLink size={14} />
        </a>
      )}
    </>
  )
}
