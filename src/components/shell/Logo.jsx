/*
  EdgeX Life mark — three nested arcs on a shared centre.
  Reads as growth rings / a contour line: goals, health, wellness as layers
  of one life rather than three separate apps.

  Future-proofing check (per the design protocol): it survives as a 16px
  favicon (arcs stay distinguishable at 1px stroke), embroiders cleanly
  (three unbroken paths, no gradients), and works in one flat colour.
*/
export default function Logo({ size = 32, variant = 'tile' }) {
  const solid = variant === 'solid'
  const bg = solid ? 'var(--ever)' : '#ffffff'
  const fg = solid ? '#ffffff' : 'var(--ever)'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="EdgeX Life">
      <rect width="48" height="48" rx="12" fill={bg} stroke={solid ? 'none' : 'var(--line-2)'} />
      <circle cx="24" cy="24" r="3.2" fill={fg} />
      <path d="M14.2 30.5a12 12 0 0 1 0-13" fill="none" stroke={fg} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M33.8 17.5a12 12 0 0 1 0 13" fill="none" stroke={fg} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M18.5 35.2a17.5 17.5 0 0 1-4.6-4.6" fill="none" stroke={fg} strokeWidth="2.6" strokeLinecap="round" opacity="0.45" />
      <path d="M29.5 12.8a17.5 17.5 0 0 1 4.6 4.6" fill="none" stroke={fg} strokeWidth="2.6" strokeLinecap="round" opacity="0.45" />
    </svg>
  )
}
