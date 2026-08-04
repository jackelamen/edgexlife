import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link2, ListTodo, Repeat2 } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import {
  fetchGoals, fetchGoalRollup, fetchSprints, fetchSprintPhases, fetchSprintTactics,
  fetchVisions, fetchGoalTasks, fetchUnlinkedTasks, linkTaskToGoal,
} from '../lib/data'
import { PageHead, Section, Empty, Loading, ErrorNote } from '../components/common/Bits'
import VisionBoard from '../components/goals/VisionBoard'

// The `area` enum in Postgres is exactly: health | work | family | personal.
// Anything else falls through to the raw value rather than rendering blank.
const AREA_LABEL = { health: 'Health', work: 'Work', family: 'Family', personal: 'Personal' }

export default function GoalsPage() {
  const goals = useAsync((f) => fetchGoals({ force: f }))
  const rollup = useAsync((f) => fetchGoalRollup({ force: f }))
  const visions = useAsync((f) => fetchVisions({ force: f }))
  const sprints = useAsync((f) => fetchSprints({ force: f }))
  const [openGoal, setOpenGoal] = useState(null)

  const rollupBy = useMemo(() => {
    const m = {}
    ;(rollup.data || []).forEach((r) => { m[r.goal_id] = r })
    return m
  }, [rollup.data])

  const sprintsBy = useMemo(() => {
    const m = {}
    ;(sprints.data || []).forEach((s) => { (m[s.goal_id] ||= []).push(s) })
    return m
  }, [sprints.data])

  const active = (goals.data || []).filter((g) => g.status !== 'archived')
  const archived = (goals.data || []).filter((g) => g.status === 'archived')

  return (
    <>
      <PageHead
        eyebrow="Direction"
        title="What you said you were building"
        sub="Vision, goals and sprints carried over from the Goals module, now linked to the tasks and habits you actually run each day."
      />

      <ErrorNote error={goals.error || rollup.error} />

      <Section title="Vision board" note="images load one at a time, then cache">
        <VisionBoard />
      </Section>

      {visions.data?.length > 0 && (
        <Section title="Vision statements">
          <div className="grid gap-3 sm:grid-cols-2">
            {visions.data.map((v) => (
              <article key={v.id} className="lf-card px-5 py-4">
                <div className="lf-eyebrow mb-2">{AREA_LABEL[v.area] || v.area}</div>
                <p className="text-[14px] leading-[1.6]" style={{ color: 'var(--ink-2)' }}>
                  {v.content}
                </p>
              </article>
            ))}
          </div>
        </Section>
      )}

      <Section title="Goals" note={active.length ? `${active.length} active` : null}>
        {goals.loading ? (
          <Loading />
        ) : active.length === 0 ? (
          <Empty>No active goals yet.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {active.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                roll={rollupBy[g.id]}
                sprints={sprintsBy[g.id] || []}
                open={openGoal === g.id}
                onToggle={() => setOpenGoal(openGoal === g.id ? null : g.id)}
                onLinked={() => { rollup.reload() }}
              />
            ))}
          </div>
        )}
      </Section>

      {archived.length > 0 && (
        <Section title="Archived">
          <div className="flex flex-col gap-2">
            {archived.map((g) => (
              <div key={g.id} className="lf-card px-5 py-3 text-[14px]" style={{ color: 'var(--ink-3)' }}>
                {g.title}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function GoalRow({ goal, roll, sprints, open, onToggle, onLinked }) {
  const tasks = useAsync((f) => fetchGoalTasks(goal.id, { force: f }), [goal.id, open], {
    enabled: open,
  })

  const openCount = roll?.open_tasks ?? 0
  const habitCount = roll?.habits ?? 0

  return (
    <article className="lf-card overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="lf-eyebrow mb-1.5">{AREA_LABEL[goal.area] || goal.area}</div>
          <h3 className="text-[17px] leading-snug">{goal.title}</h3>
          {goal.why && (
            <p className="mt-1.5 text-[13.5px] leading-[1.55]" style={{ color: 'var(--ink-2)' }}>
              {goal.why}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-4 pt-1 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          <span className="flex items-center gap-1.5" title="Open Pulse tasks">
            <ListTodo size={14} /> {openCount}
          </span>
          <span className="flex items-center gap-1.5" title="Linked habits">
            <Repeat2 size={14} /> {habitCount}
          </span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
          {sprints.length > 0 && (
            <div className="mt-4">
              <div className="lf-eyebrow mb-2">Sprints</div>
              <div className="flex flex-col gap-2">
                {sprints.map((s) => (
                  <div key={s.id} className="text-[13.5px]">
                    <span>{s.name}</span>
                    {s.outcome && (
                      <span style={{ color: 'var(--ink-3)' }}> — {s.outcome}</span>
                    )}
                    {(s.start_date || s.end_date) && (
                      <span className="ml-2 text-[12px]" style={{ color: 'var(--ink-4)' }}>
                        {s.start_date} → {s.end_date}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="lf-eyebrow mb-2">Open tasks in Pulse</div>
            {tasks.loading ? (
              <Loading />
            ) : tasks.data?.length ? (
              <ul className="flex flex-col gap-1.5">
                {tasks.data.map((t) => (
                  <li key={t.id} className="text-[13.5px] flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: t.priority >= 3 ? 'var(--clay)' : 'var(--ink-4)' }}
                    />
                    {t.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
                Nothing linked yet.
              </p>
            )}
          </div>

          <AttachTask goalId={goal.id} onDone={() => { tasks.reload(); onLinked() }} />
        </div>
      )}
    </article>
  )
}

function AttachTask({ goalId, onDone }) {
  const [openPicker, setOpenPicker] = useState(false)
  const pool = useAsync((f) => fetchUnlinkedTasks({ force: f }), [openPicker], {
    enabled: openPicker,
  })

  async function attach(taskId) {
    try {
      await linkTaskToGoal(taskId, goalId)
      toast.success('Linked to goal')
      setOpenPicker(false)
      onDone()
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (!openPicker) {
    return (
      <button className="lf-btn mt-4" onClick={() => setOpenPicker(true)}>
        <Link2 size={15} /> Link a Pulse task
      </button>
    )
  }

  return (
    <div className="mt-4">
      <div className="lf-eyebrow mb-2">Unlinked open tasks</div>
      {pool.loading ? (
        <Loading />
      ) : pool.data?.length ? (
        <div className="max-h-[240px] overflow-y-auto flex flex-col gap-1">
          {pool.data.map((t) => (
            <button
              key={t.id}
              onClick={() => attach(t.id)}
              className="text-left text-[13.5px] px-3 py-2 rounded-[8px]"
              style={{ background: 'var(--surface-sunk)' }}
            >
              {t.title}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13.5px]" style={{ color: 'var(--ink-3)' }}>
          Every open task is already linked to a goal.
        </p>
      )}
      <button className="lf-btn mt-3" onClick={() => setOpenPicker(false)}>Cancel</button>
    </div>
  )
}
