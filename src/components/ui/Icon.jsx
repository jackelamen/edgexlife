/**
 * Material Symbols Rounded, same icon set the original modules used.
 * `fill` switches the variable-font FILL axis, which is how the originals
 * marked active nav items.
 */
export default function Icon({ name, size = 19, fill = false, className = '', style }) {
  return (
    <span
      className={`icon${fill ? ' fill' : ''}${className ? ' ' + className : ''}`}
      style={{ fontSize: size, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}
