/*
  Brand mark — three angled bars, one per life-system (Goals, Health,
  Wellness), left-flush and edge-cut on the right. It's the one place all
  three module hues appear together on purpose: the mark itself is "three
  systems, one edge." Matches public/icons/favicon.svg exactly — regenerate
  both from the same geometry if this ever changes.

  These are brightened versions of each module's accent (#8a4b1f/#0e5f52/
  #5b2c63 in lib/design.js), not the literal hex — same hue, +16 lightness
  and +8 saturation. The deep band in design.js exists so module colour
  never collides with a metric's; that constraint doesn't apply to a mark
  sitting on solid ink, where the deeper values just read as muddy. Brand
  identity and functional UI accent are allowed to diverge slightly for
  that reason — this is the one deliberate exception.

  Single source for the mark: Shell (sidebar + mobile topbar) and Login
  both render this component instead of keeping their own copies.
*/
export default function BrandMark({ size = 30 }) {
  const r = size * 0.22
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <rect x="0" y="0" width="48" height="48" rx={r * (48 / size)} fill="#14140f" />
      <polygon points="9.89,11.70 28.44,11.70 25.21,17.75 9.89,17.75" fill="#d76d24" />
      <polygon points="9.89,20.98 33.27,20.98 30.05,27.02 9.89,27.02" fill="#11ae95" />
      <polygon points="9.89,30.25 38.11,30.25 34.89,36.30 9.89,36.30" fill="#953ca4" />
    </svg>
  )
}
