/*
  Wordmark — "xLife" in one colour so it sits beside BrandMark without
  competing with it; the mark carries the three hues, the wordmark stays
  quiet. Bricolage's display optical size, with tight tracking, is where
  the typeface's character actually shows.

  Takes currentColor so the same component works on the ink sidebar
  (white) and on the light Login card (ink).
*/
export default function Wordmark({ size = 17, color = 'currentColor' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: size, fontWeight: 800, lineHeight: 1, color,
        fontVariationSettings: '"opsz" 96', letterSpacing: '-.045em',
      }}
    >
      xLife
    </span>
  )
}
