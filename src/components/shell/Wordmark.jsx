/*
  Wordmark — "xLife" set to echo BrandMark instead of sitting next to it
  as plain text. The "x" carries the mark's three bands (same hexes as BrandMark, hard
  stops placed on the glyph's x-height rather than the line box) and
  leans forward like the bars'
  cut edges. It is set larger than "Life" and thickened with a stroke that
  takes the same gradient, so it holds up at sidebar size; the clip-path
  trims the lower-right leg on the slant the bars end on. "Life" uses Bricolage's display optical size, which is where
  the typeface's character actually shows, with tight tracking.

  "Life" takes currentColor so the same component works on the ink
  sidebar and on the light Login card.
*/
export default function Wordmark({ size = 17, color = 'currentColor' }) {
  return (
    <span
      aria-label="xLife"
      style={{
        display: 'inline-flex', alignItems: 'baseline',
        fontSize: size, fontWeight: 800, lineHeight: 1, color,
        fontVariationSettings: '"opsz" 96', letterSpacing: '-.045em',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block', transform: 'skewX(-12deg)',
          fontSize: '1.3em', marginRight: '.05em',
          background: 'linear-gradient(180deg, #d76d24 0 46%, #11ae95 46% 63%, #953ca4 63% 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          WebkitTextStroke: '.035em transparent', paintOrder: 'stroke fill',
          clipPath: 'polygon(0 0, 100% 0, 100% 45%, calc(100% - .16em) 100%, 0 100%)',
        }}
      >
        x
      </span>
      <span aria-hidden="true">Life</span>
    </span>
  )
}
