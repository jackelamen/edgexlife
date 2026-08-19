/* Reset tools and breath presets, carried over from wellness.html verbatim. */

export const RESET_TOOLS = [
  { id: 'breathe', icon: 'air', title: '2-Minute Breathing',
    body: 'Slow inhales, longer exhales. Lower the volume before deciding anything.',
    steps: ['Inhale for four, exhale for six.', 'Relax jaw, shoulders, and hands.', 'Repeat until the timer ends.'] },
  { id: 'dump', icon: 'edit_note', title: 'Brain Dump',
    body: 'Write every open loop. No sorting. Just get it out of working memory.',
    steps: ['List every thought as a separate line.', 'Mark each as hold, action, or release.', 'Choose one next visible action.'] },
  { id: 'name', icon: 'label', title: 'Name the Feeling',
    body: 'Use plain language: anxious, annoyed, sad, excited, tired, pressured.',
    steps: ['Say: I notice I feel...', 'Locate it in the body.', 'Ask what it is trying to protect.'] },
  { id: 'walk', icon: 'directions_walk', title: 'Walk Outside',
    body: 'Ten quiet minutes. Let your body metabolize the noise.',
    steps: ['Leave the phone quiet.', 'Walk at an easy pace.', 'Return with one simpler next step.'] },
  { id: 'boundary', icon: 'do_not_disturb_on', title: 'Boundary Check',
    body: 'Ask what needs a no, a pause, or a later.',
    steps: ['Name the demand that feels heavy.', 'Decide: no, later, smaller, or ask for help.', 'Write the clean sentence you need to send.'] },
  { id: 'reach', icon: 'forum', title: 'Reach Out',
    body: 'Send one honest message to someone steady.',
    steps: ['Pick one safe person.', 'Send a simple true sentence.', 'Ask for presence, not fixing.'] },
]

/** State -> suggested reset, mirroring the original's routing. */
export function suggestedReset(state, score) {
  if (state === 'Overwhelmed') return RESET_TOOLS[1]
  if (state === 'Anxious') return RESET_TOOLS[0]
  if (state === 'Restless') return RESET_TOOLS[3]
  if (score != null && score < 50) return RESET_TOOLS[4]
  return RESET_TOOLS[0]
}

/* Wim Hof Breathing is structurally different from every other preset
   here: those are all a single short cycle (in/hold/out/rest) that LOOPS
   for the whole session via phaseAt's modulo. Wim Hof is a fixed,
   non-repeating sequence — 30 fast breaths, then a breath-hold retention,
   then a recovery hold, three times with a longer retention each round
   (60s / 90s / 120s, per Jack's spec) — so instead it's authored as one
   flat list of phases whose total already equals the full 10-minute
   session. As long as total == minutes*60, elapsed never wraps back to
   the start (phaseAt's modulo only matters if a session outlasts one
   full cycle), so it plays through once and simply holds on the last
   phase for any final second of rounding. */
/*
  Two annotations exist purely so the UI can warn you about what's coming,
  which matters far more here than in the looping presets: in Box or 4-7-8
  you learn the shape after one cycle, but Wim Hof drops a 60-120 second
  breath hold at the end of 30 fast breaths and there is otherwise no signal
  it's about to arrive.

    rep / reps  — breath N of 30, so the round has a visible position.
    cue         — the phase announces itself in advance; BreathTimer counts
                  the final CUE_LEAD_SECONDS down to it ("HOLD IN 3").
*/
function wimHofRound(round, holdSeconds, isLast) {
  const phases = []
  for (let i = 0; i < 30; i++) {
    phases.push({ key: 'in', label: 'Breathe In', seconds: 1.5, from: 0.12, to: 1.14, rep: i + 1, reps: 30, round })
    phases.push({ key: 'out', label: 'Let Go', seconds: 1.5, from: 1.14, to: 0.3, rep: i + 1, reps: 30, round })
  }
  phases.push({ key: 'hold', label: 'Hold — Lungs Empty', seconds: holdSeconds, from: 0.12, to: 0.12, cue: 'Hold', round })
  phases.push({ key: 'in', label: 'Recovery Breath', seconds: 2, from: 0.12, to: 1.3, cue: 'Breathe In', round })
  phases.push({ key: 'hold', label: 'Hold — Lungs Full', seconds: 15, from: 1.3, to: 1.3, round })
  phases.push({ key: 'out', label: isLast ? 'Session Complete' : 'Release', seconds: isLast ? 5 : 2, from: 1.3, to: 0.12, round })
  return phases
}
const WIM_HOF_PHASES = [
  ...wimHofRound(1, 60, false),
  ...wimHofRound(2, 90, false),
  ...wimHofRound(3, 120, true),
]

export const BREATH_PRESETS = [
  { id: 'two-minute', label: '2-Minute Breathing', pattern: '4-2-6-2', minutes: 2,
    practiceType: '2-Minute Breathing',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 4, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 2, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 6, from: 1.14, to: 0.12 },
      { key: 'rest', label: 'Hold', seconds: 2, from: 0.12, to: 0.12 },
    ] },
  { id: 'box', label: 'Box Breathing', pattern: '4-4-4-4', minutes: 5,
    practiceType: 'Box Breathing 4-4-4-4',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 4, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 4, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 4, from: 1.14, to: 0.12 },
      { key: 'rest', label: 'Hold', seconds: 4, from: 0.12, to: 0.12 },
    ] },
  { id: 'four-seven-eight', label: '4-7-8 Breathing', pattern: '4-7-8', minutes: 5,
    practiceType: '4-7-8 Breathing',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 4, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 7, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 8, from: 1.14, to: 0.12 },
    ] },
  { id: 'sama', label: 'Equal Breathing', pattern: '5-5', minutes: 5,
    practiceType: 'Equal Breathing (Sama Vritti)',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 5, from: 0.12, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 5, from: 1.14, to: 0.12 },
    ] },
  { id: 'five-five-eight-two', label: '5-5-8-2', pattern: '5-5-8-2', minutes: 5,
    practiceType: '5-5-8-2 Breathing',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 5, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 5, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 8, from: 1.14, to: 0.12 },
      { key: 'rest', label: 'Hold', seconds: 2, from: 0.12, to: 0.12 },
    ] },
  { id: 'wim-hof', label: 'Wim Hof Breathing', pattern: '30 breaths + hold', minutes: 10,
    practiceType: 'Wim Hof Breathing',
    phases: WIM_HOF_PHASES },
]

export const PRACTICE_TYPES = [
  'Meditation', '2-Minute Breathing', 'Box Breathing 4-4-4-4', '4-7-8 Breathing',
  'Equal Breathing (Sama Vritti)', '5-5-8-2 Breathing', 'Wim Hof Breathing', 'Body Scan', 'Prayer',
  'Quiet Sitting', 'Other',
]
export const AFTER_STATES = ['Clearer', 'Calmer', 'Still Restless', 'Sleepy', 'Emotional', 'Grounded']
export const MEDITATION_FADE_SECONDS = 10

/* Selectable practice tracks for the meditation/breathing audio panel.
   First entry is the default. Add another track by dropping the file in
   public/audio and adding an entry here — nothing else needs to change. */
export const MEDITATION_TRACKS = [
  { id: 'meditation', label: 'Meditation', sub: '20 minute deep meditation track.', src: '/audio/meditation-20min.mp3' },
  { id: 'visualization', label: 'Visualization', sub: 'Guided visualization / breathing track.', src: '/audio/visualization.mp3' },
]

export const cycleSeconds = (preset) => preset.phases.reduce((s, p) => s + p.seconds, 0)

/** How many seconds of lead-in warning a cued phase gets. */
export const CUE_LEAD_SECONDS = 5

/** Any phase at least this long gets a live remaining-seconds readout. */
export const LONG_PHASE_SECONDS = 12

/** Which phase are we in at `elapsed` seconds, and how far through it. */
export function phaseAt(preset, elapsed) {
  const total = cycleSeconds(preset)
  let t = elapsed % total
  for (let i = 0; i < preset.phases.length; i++) {
    const p = preset.phases[i]
    if (t < p.seconds) return { phase: p, progress: t / p.seconds, index: i, remaining: p.seconds - t }
    t -= p.seconds
  }
  const i = preset.phases.length - 1
  return { phase: preset.phases[i], progress: 1, index: i, remaining: 0 }
}

/*
  Look ahead for a phase carrying a `cue` and report how far off it is, but
  only once it's inside the lead window — the caller renders nothing until
  this returns non-null, so no preset without cues pays any attention cost.

  The scan walks at most one full cycle forward and wraps with modulo, which
  is correct for both preset shapes: the looping presets genuinely continue
  past the end, and Wim Hof's flat sequence is authored to be exactly one
  session long, so the wrap is unreachable there in practice.
*/
export function cueAhead(preset, elapsed, lead = CUE_LEAD_SECONDS) {
  const { index, remaining } = phaseAt(preset, elapsed)
  let seconds = remaining
  for (let step = 1; step <= preset.phases.length; step++) {
    const p = preset.phases[(index + step) % preset.phases.length]
    if (p.cue) return seconds <= lead ? { cue: p.cue, seconds } : null
    seconds += p.seconds
    if (seconds > lead) return null
  }
  return null
}
