/*
  What's going on in the body at each point in a fast.

  Written for this app rather than copied from anywhere, and deliberately
  more careful than most fasting apps: hour boundaries are rough and vary
  a lot with the last meal, activity and metabolic health, and several
  popular claims (72-hour "immune regeneration", big autophagy numbers)
  rest mainly on animal studies. Each stage carries an `evidence` level
  so the UI can say so instead of presenting everything as settled fact.

  `from`/`to` are hours since the fast started; `to: null` = open-ended.
*/
export const EVIDENCE = {
  strong: { label: 'Well established', tone: 'green' },
  moderate: { label: 'Reasonable evidence', tone: 'blue' },
  early: { label: 'Early / mostly animal research', tone: 'orange' },
}

export const FAST_STAGES = [
  {
    id: 'fed', from: 0, to: 4, icon: 'restaurant', name: 'Digesting',
    body: 'Your last meal is still being absorbed. Blood sugar and insulin rise, and the body stores what it doesn\'t need right away as glycogen (in the liver and muscles) and fat.',
    feel: ['Full or satisfied', 'Normal energy'],
    tip: 'Nothing to do yet. If this fast is a long one, a last meal with protein and fibre makes the next few hours easier.',
    evidence: 'strong',
  },
  {
    id: 'settle', from: 4, to: 12, icon: 'water_drop', name: 'Blood sugar settles',
    body: 'Digestion wraps up and insulin falls. The liver starts releasing stored glycogen to keep blood sugar steady, and fat stores begin to open up.',
    feel: ['First hunger waves, often at usual meal times', 'Hunger that passes in 15 to 30 minutes'],
    tip: 'Hunger here is mostly habit and comes in waves. Water, black coffee or plain tea helps it pass.',
    evidence: 'strong',
  },
  {
    id: 'fatburn', from: 12, to: 18, icon: 'local_fire_department', name: 'Fat burning ramps up',
    body: 'Liver glycogen is running lower, so the body leans more on fat for fuel. The liver starts turning some fatty acids into ketones and making glucose from other sources (gluconeogenesis).',
    feel: ['Steadier energy for many people', 'Possible dip in focus if you usually eat often'],
    tip: 'A good point to stop for a 16:8. Light movement like a walk works well here.',
    evidence: 'strong',
  },
  {
    id: 'ketosis', from: 18, to: 24, icon: 'bolt', name: 'Ketosis builds',
    body: 'Ketone levels climb as fat becomes a main fuel. The brain starts using ketones for part of its energy, sparing glucose.',
    feel: ['Mental clarity for some, fogginess for others', 'Hunger often easier than earlier'],
    tip: 'Get enough salt and fluids. Mild headaches at this stage are often electrolytes, not the fast itself.',
    evidence: 'moderate',
  },
  {
    id: 'autophagy', from: 24, to: 48, icon: 'recycling', name: 'Deeper ketosis and cell cleanup',
    body: 'Glycogen is largely used up and ketosis deepens. Autophagy (cells breaking down and recycling their own worn parts) increases. It clearly rises with fasting, but how much in humans, and exactly when, isn\'t well measured.',
    feel: ['Low energy or feeling cold', 'Possible headache, irritability or poor sleep'],
    tip: 'Keep electrolytes up (sodium, potassium, magnesium) and keep training light. Ending here is a perfectly good fast.',
    evidence: 'early',
  },
  {
    id: 'gh', from: 48, to: 72, icon: 'fitness_center', name: 'Growth hormone rises',
    body: 'Growth hormone goes up noticeably in longer fasts, which helps protect muscle while fat supplies most of the fuel. Insulin stays low and insulin sensitivity tends to improve.',
    feel: ['Hunger often quieter than on day one', 'Weakness or dizziness when standing up quickly'],
    tip: 'Stand up slowly and skip hard workouts. Fasts this long are best done with guidance if you have any health conditions or take medication.',
    evidence: 'moderate',
  },
  {
    id: 'extended', from: 72, to: null, icon: 'shield', name: 'Extended fast',
    body: 'The body is fully adapted to running on fat and ketones. Some research links fasts of this length to immune system renewal, but that evidence comes mostly from animal studies and small trials.',
    feel: ['Varies widely', 'Watch for dizziness, palpitations or confusion'],
    tip: 'Past 72 hours, fasting is best done with medical supervision. Break it gently with a small, easy meal.',
    evidence: 'early',
  },
]

/** Index of the stage `hours` falls in (last stage if past every bound). */
export function stageIndexAt(hours) {
  const i = FAST_STAGES.findIndex((s) => hours >= s.from && (s.to == null || hours < s.to))
  return i === -1 ? FAST_STAGES.length - 1 : i
}

/** Hours until the next stage begins, or null if already in the last one. */
export function hoursToNextStage(hours) {
  const s = FAST_STAGES[stageIndexAt(hours)]
  return s.to == null ? null : s.to - hours
}

export const stageRangeLabel = (s) => (s.to == null ? `${s.from}h+` : `${s.from}-${s.to}h`)
