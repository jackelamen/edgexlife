import { ScaleField } from '../ui/Kit'

/* The one-tap before/after rating that makes a practice measurable.
   Deliberately the shared ScaleField so it reads like every other rating
   in the app, with wording that says which end is which. */
export default function SettledRating({ label, value, onChange }) {
  return (
    <ScaleField label={label} value={value} onChange={onChange} low="Wound up" high="Settled" />
  )
}
