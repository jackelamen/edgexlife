/*
  Brand mark — three angled bars, one per life-system (Goals clay, Health
  pine, Wellness plum), left-flush and edge-cut on the right. It's the one
  place all three module hues appear together on purpose: the mark itself
  is "three systems, one edge." Matches public/icons/favicon.svg exactly —
  regenerate both from the same geometry if this ever changes.

  Single source for the mark: Shell (sidebar + mobile topbar) and Login
  both render this component instead of keeping their own copies.
*/
export default function BrandMark({ size = 30 }) {
  const r = size * 0.22
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <rect x="0" y="0" width="48" height="48" rx={r * (48 / size)} fill="#14140f" />
      <polygon points="9.89,11.70 28.44,11.70 25.21,17.75 9.89,17.75" fill="#8a4b1f" />
      <polygon points="9.89,20.98 33.27,20.98 30.05,27.02 9.89,27.02" fill="#0e5f52" />
      <polygon points="9.89,30.25 38.11,30.25 34.89,36.30 9.89,36.30" fill="#5b2c63" />
    </svg>
  )
}
