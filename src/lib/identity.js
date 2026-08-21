/*
  Jack's identity statement — the reason xLife exists, not a feature of
  it. Every other file in this app measures something: sleep, execution
  percentage, clarity, dollars. This is the one thing the app doesn't
  measure. It's the standard the measuring is FOR.

  Deliberately centralized in one file rather than duplicated across every
  surface that reads it. See project memory (project_xlife_identity.md)
  for the original light-touch design, and project_xlife_identity.md's
  later entry for why it grew from that into this: a quiet line on Today
  and Review (the shared `.north-star` CSS class), a real weekly
  reflection prompt in Review (written to the pre-existing `module_notes`
  column), an optional identity_thread tag on each Goal (new column,
  migration `goals_add_identity_thread`), and a dedicated Identity module
  that turns the statement into a live rollup of which threads have real
  work behind them right now, not just a sentence you re-read.

  IDENTITY_THREADS is now a real, small taxonomy — six fixed keys, used
  as: the value stored in `goals.identity_thread`, the option list in
  GoalsPage's goal editor, the badge icon shown on a tagged goal (Goals,
  Today), and the section list on the Identity page. Deliberately still
  only six and still fixed — this is a tag for "which part of the
  statement is this goal for", not a general tagging system, and it
  should stay that small or it stops meaning anything.

  Icons are chosen only from names already confirmed to render correctly
  elsewhere in this exact app (see components/ui/Icon.jsx) — the
  north_star bug (a name that half-rendered as two unrelated glyphs) is
  exactly the failure mode to avoid here.
*/
export const IDENTITY_STATEMENT =
  'I am a man of unwavering integrity and high moral standards, consciously evolving and leading with compassion across all areas of my life to create lasting success, robust health, and deep connections with my family.'

export const IDENTITY_THREADS = [
  { key: 'integrity', label: 'Integrity & high moral standards', short: 'Integrity', icon: 'shield',
    hint: 'Doing the right thing when no one is checking.' },
  { key: 'evolving', label: 'Consciously evolving', short: 'Evolving', icon: 'sync',
    hint: 'Actively growing, not coasting.' },
  { key: 'compassion', label: 'Leading with compassion', short: 'Compassion', icon: 'favorite',
    hint: 'How you treat people when it costs you something.' },
  { key: 'success', label: 'Lasting success', short: 'Success', icon: 'celebration',
    hint: 'Built to last, not a spike.' },
  { key: 'health', label: 'Robust health', short: 'Health', icon: 'fitness_center',
    hint: 'The body the rest of this runs on.' },
  { key: 'family', label: 'Deep connections with family', short: 'Family', icon: 'diversity_3',
    hint: 'The people this is ultimately for.' },
]

export const identityThreadByKey = Object.fromEntries(IDENTITY_THREADS.map((t) => [t.key, t]))
