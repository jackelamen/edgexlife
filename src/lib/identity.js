/*
  Jack's identity statement — the reason xLife exists, not a feature of
  it. Every other file in this app measures something: sleep, execution
  percentage, clarity, dollars. This is the one thing the app doesn't
  measure. It's the standard the measuring is FOR.

  Deliberately centralized in one file rather than duplicated: Today's
  daily anchor and Review's weekly identity check both read the exact
  same string, and it only has to be edited in one place if it's ever
  refined. See project memory (project_xlife_identity.md) for the design
  decisions behind how this is woven in — light-touch on purpose, no
  tagging system on Goals/tactics, no new database columns, no dedicated
  page. It shows up in two places: a quiet line on Today and Review (see
  the shared `.north-star` CSS class), and one real reflection prompt in
  the weekly Review, written to the pre-existing (previously unused)
  `module_notes` column rather than a new field.
*/
export const IDENTITY_STATEMENT =
  'I am a man of unwavering integrity and high moral standards, consciously evolving and leading with compassion across all areas of my life to create lasting success, robust health, and deep connections with my family.'

// Named here only so Review's identity-check hint can gesture at the
// individual threads without retyping them — NOT a tagging taxonomy.
// Nothing in Goals, Health, or Wellness references these; they exist
// purely to write one good reflection prompt.
export const IDENTITY_THREADS = [
  'integrity and high moral standards',
  'consciously evolving',
  'leading with compassion',
  'lasting success',
  'robust health',
  'deep connections with family',
]
