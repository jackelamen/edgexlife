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
  phases.push({ key: 'hold', label: 'Hold, Lungs Empty', seconds: holdSeconds, from: 0.12, to: 0.12, cue: 'Hold', round })
  phases.push({ key: 'in', label: 'Recovery Breath', seconds: 2, from: 0.12, to: 1.3, cue: 'Breathe In', round })
  phases.push({ key: 'hold', label: 'Hold, Lungs Full', seconds: 15, from: 1.3, to: 1.3, round })
  phases.push({ key: 'out', label: isLast ? 'Session Complete' : 'Release', seconds: isLast ? 5 : 2, from: 1.3, to: 0.12, round })
  return phases
}
const WIM_HOF_PHASES = [
  ...wimHofRound(1, 60, false),
  ...wimHofRound(2, 90, false),
  ...wimHofRound(3, 120, true),
]

/* ── What each pattern is actually for ──────────────────────────
   Ground rules for everything written in `use`, `how`, `evidence` and
   `caution` below, because this is health copy and the cost of inventing
   a plausible-sounding claim here is real:

     · Only two mechanisms are asserted as established, because only two
       of them genuinely are. (a) Respiratory sinus arrhythmia: heart rate
       rises on the inhale and falls on the exhale, so lengthening the
       exhale spends more of each cycle in the parasympathetic-dominant
       half. (b) Resonance: breathing near six breaths a minute (~0.1 Hz)
       is where heart-rate-variability amplitude and baroreflex gain peak
       — the finding the whole HRV-biofeedback literature rests on.
     · Everything a given pattern claims beyond those two is traced back
       to them, or the `evidence` line says plainly that the pattern is
       popular rather than well-tested. No pattern here has been shown to
       beat the others head-to-head, and none of them say otherwise.
     · No invented statistics, effect sizes, or citations. The one named
       study (Kox 2014, Wim Hof) is real and is described with its actual
       limits — small, trained participants, whole method not breathing
       alone.
     · Nothing here is medical advice, and the UI says so. Slow breathing
       is not a treatment for a medical or psychiatric condition.

   `rate` is not stored: it's derived from the phase lengths in the UI, so
   editing a pattern can't leave a stale breaths-per-minute label behind.
   `cyclic: false` marks Wim Hof, whose phases are one fixed sequence
   rather than a repeating cycle, so a per-minute rate is meaningless. */

export const BREATH_PRESETS = [
  { id: 'two-minute', label: '2-Minute Breathing', pattern: '4-2-6-2', minutes: 2,
    practiceType: '2-Minute Breathing', cyclic: true,
    use: ['Anxious or wound up', 'Two minutes before you answer or decide', 'Between meetings'],
    how: 'The exhale is longer than the inhale and there is no long breath-hold, so it downshifts without the air hunger a 7-second hold can create when you are already tense.',
    evidence: 'Best-supported use here: extended-exhale breathing measurably shifts heart rate toward the parasympathetic side within a couple of minutes, and short slow-breathing practices show modest, real reductions in self-reported state anxiety.',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 4, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 2, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 6, from: 1.14, to: 0.12 },
      { key: 'rest', label: 'Hold', seconds: 2, from: 0.12, to: 0.12 },
    ] },
  { id: 'box', label: 'Box Breathing', pattern: '4-4-4-4', minutes: 5,
    practiceType: 'Box Breathing 4-4-4-4', cyclic: true,
    use: ['Scattered, can\'t hold a thought', 'Before a hard conversation', 'Composure without sedation'],
    how: 'Four equal counts give attention a fixed thing to hold, and the equal inhale/exhale ratio steadies you without pushing as far toward sleepiness as the long-exhale patterns do.',
    evidence: 'Long used in military and first-responder training as "tactical" or "combat" breathing. Its support comes from the general slow-breathing evidence rather than from studies showing the square pattern beats other slow patterns — no such study exists.',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 4, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 4, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 4, from: 1.14, to: 0.12 },
      { key: 'rest', label: 'Hold', seconds: 4, from: 0.12, to: 0.12 },
    ] },
  { id: 'four-seven-eight', label: '4-7-8 Breathing', pattern: '4-7-8', minutes: 5,
    practiceType: '4-7-8 Breathing', cyclic: true,
    use: ['Winding down at night', 'The strongest downshift here', 'When a gentler pattern is not landing'],
    how: 'The exhale is double the inhale and the whole cycle is slow, which makes it the most strongly parasympathetic pattern in this list. The 7-count hold is also what makes it demanding.',
    evidence: 'Popularised by Dr Andrew Weil from pranayama practice. The extended-exhale mechanism is sound and small studies find acute effects on heart rate variability and anxiety, but the familiar claim that it puts you to sleep in a minute is popular rather than well-tested.',
    caution: 'If the 7-count hold leaves you air-hungry or light-headed, that strain works against the point — shorten the hold or use 5-5-8-2 or the 2-minute pattern instead.',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 4, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 7, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 8, from: 1.14, to: 0.12 },
    ] },
  { id: 'sama', label: 'Equal Breathing', pattern: '5-5', minutes: 5,
    practiceType: 'Equal Breathing (Sama Vritti)', cyclic: true,
    use: ['A sustainable daily default', 'Restless and needing a rhythm', 'Longer sits, and HRV training'],
    how: 'Six breaths a minute with no holds. Nothing to brace for, which is why it is the one that stays comfortable for ten or twenty minutes when the demanding patterns do not.',
    evidence: 'The most directly evidence-backed pattern here: around six breaths a minute is the resonance range where heart-rate-variability amplitude and baroreflex gain peak, which is the effect HRV biofeedback is built on.',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 5, from: 0.12, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 5, from: 1.14, to: 0.12 },
    ] },
  { id: 'five-five-eight-two', label: '5-5-8-2', pattern: '5-5-8-2', minutes: 5,
    practiceType: '5-5-8-2 Breathing', cyclic: true,
    use: ['Overwhelmed, with five minutes to spend', 'Deeper than the 2-minute pattern', 'Easier than 4-7-8'],
    how: 'Long exhale plus a short rest at the bottom, at the slowest rate here. It sits between the other two exhale-led patterns: deeper than the 2-minute one, with a 5-count hold instead of 4-7-8\'s harder 7.',
    evidence: 'A variation rather than a named protocol, so there is no technique-specific research on it. What it rests on is the same extended-exhale mechanism as the other two.',
    phases: [
      { key: 'in', label: 'Inhale', seconds: 5, from: 0.12, to: 1.14 },
      { key: 'hold', label: 'Hold', seconds: 5, from: 1.14, to: 1.14 },
      { key: 'out', label: 'Exhale', seconds: 8, from: 1.14, to: 0.12 },
      { key: 'rest', label: 'Hold', seconds: 2, from: 0.12, to: 0.12 },
    ] },
  { id: 'wim-hof', label: 'Wim Hof Breathing', pattern: '30 breaths + hold', minutes: 10,
    practiceType: 'Wim Hof Breathing', cyclic: false,
    use: ['Flat, and wanting activation', 'Cold exposure training', 'Not for calming down'],
    how: 'This one runs the opposite way to every other pattern here. Thirty fast full breaths blow off carbon dioxide, and that drop — not extra oxygen — is what lets the following breath-hold run so long before the urge to breathe arrives. It raises arousal and adrenaline rather than lowering them.',
    evidence: 'The best-known study is Kox and colleagues (2014, PNAS), where trained practitioners showed an adrenaline rise and a blunted inflammatory response to an injected endotoxin. Real result, narrow claim: a small group of trained participants, testing the whole method — breathing, cold and mindset together — not this breathing on its own.',
    caution: 'Sit or lie down, never in or near water, never in a bath or shower, never while driving or standing. Low carbon dioxide narrows blood flow to the brain, and fainting is a documented risk — the same mechanism behind shallow-water blackout, which is why water is the one absolute rule. Because it drives arousal up, it can also amplify a panicky state rather than settle it. Check with a clinician first if you are pregnant, or have epilepsy, a heart or blood-pressure condition, or a history of fainting.',
    phases: WIM_HOF_PHASES },
]

/* State -> pattern, routed on the two mechanisms in the header note: an
   exhale longer than the inhale settles arousal, ~6 breaths a minute is
   the resonance rate, and Wim Hof is the only pattern here that raises
   arousal instead. `why` is shown to the user, so it says what the
   routing is actually reasoning from rather than asserting a result.

   Deliberately NOT a clinical instrument. It reads one self-reported word
   off the latest check-in and picks a starting point from it; anything
   stronger would be a claim this has no basis to make. */
const BREATH_BY_STATE = {
  Anxious: { id: 'two-minute',
    why: 'Exhale longer than the inhale, and no long hold to fight — holds tend to add air hunger when you are already anxious.' },
  Overwhelmed: { id: 'five-five-eight-two',
    why: 'Same long-exhale idea, slower and with a rest at the bottom. If the noise is thoughts rather than arousal, a brain dump usually beats any of these.' },
  Restless: { id: 'sama',
    why: 'A steady even rhythm at about six breaths a minute, with nothing to brace for — easier to settle into than a pattern with holds when you cannot sit still.' },
  Scattered: { id: 'box',
    why: 'Four equal counts give attention one fixed thing to hold, which is the part that helps when focus keeps sliding off.' },
  Flat: { id: 'wim-hof',
    why: 'The only pattern here that raises arousal rather than lowering it. Read its cautions first — and if you would rather not have the intensity, Equal Breathing is the neutral choice.' },
}

/* Regulated states get maintenance, not rescue — there is nothing to talk
   down, so the resonance-rate pattern is the honest pick. */
const BREATH_STEADY_WHY = 'Nothing here needs settling, so this is training rather than rescue: about six breaths a minute is the rate where heart-rate variability peaks.'

/** Suggested breath pattern for a check-in's dominant state.
    Returns { preset, why, state } — `state` null when nothing was logged. */
export function suggestedBreath(state) {
  const hit = BREATH_BY_STATE[state]
  const preset = BREATH_PRESETS.find((p) => p.id === (hit?.id || 'sama')) || BREATH_PRESETS[0]
  if (hit) return { preset, why: hit.why, state }
  return {
    preset,
    why: state ? BREATH_STEADY_WHY
      : 'No check-in yet today. Equal Breathing is the safe default — six breaths a minute, comfortable to hold for as long as you want to sit.',
    state: state || null,
  }
}

/** Breaths per minute, derived so it can't drift from the phases above.
    Null for Wim Hof, whose sequence has no repeating cycle to rate. */
export function breathsPerMinute(preset) {
  if (!preset?.cyclic) return null
  const cycle = cycleSeconds(preset)
  return cycle > 0 ? 60 / cycle : null
}

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
