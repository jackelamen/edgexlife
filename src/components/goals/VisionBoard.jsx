import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { useAsync } from '../../hooks/useAsync'
import { fetchVisionBoard } from '../../lib/data'
import { getVisionImage } from '../../lib/imageCache'
import { formatBytes } from '../../lib/egress'
import { Empty, Loading } from '../common/Bits'

/*
  The old goals.html pulled all 15 base64 photos (1.55 MB) on every load.
  Here the grid renders from metadata alone, and each tile fetches its own
  image only when it scrolls into view — then keeps it in Cache Storage, so
  it never crosses the network again on any future visit.
*/
export default function VisionBoard() {
  const board = useAsync((f) => fetchVisionBoard({ force: f }))

  if (board.loading) return <Loading label="Reading vision board" />
  if (!board.data?.length) return <Empty>No vision board images found.</Empty>

  const total = board.data.reduce((n, i) => n + (i.bytes || 0), 0)

  return (
    <>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {board.data.map((item) => (
          <VisionTile key={item.id} item={item} />
        ))}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
        {board.data.length} images · {formatBytes(total)} total, fetched on demand and cached locally
      </p>
    </>
  )
}

function VisionTile({ item }) {
  const [src, setSrc] = useState(null)
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [node, setNode] = useState(null)

  useEffect(() => {
    if (!node || state !== 'idle') return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        setState('loading')
        getVisionImage(item.id)
          .then((s) => { setSrc(s); setState(s ? 'done' : 'error') })
          .catch(() => setState('error'))
      },
      { rootMargin: '300px' }
    )
    io.observe(node)
    return () => io.disconnect()
  }, [node, item.id, state])

  return (
    <figure
      ref={setNode}
      className="lf-card overflow-hidden m-0"
      style={{ background: 'var(--surface-sunk)' }}
    >
      <div className="aspect-[4/5] grid place-items-center overflow-hidden">
        {state === 'done' && src ? (
          <img src={src} alt={item.caption || ''} className="w-full h-full object-cover" />
        ) : state === 'error' ? (
          <ImageOff size={20} style={{ color: 'var(--ink-4)' }} />
        ) : (
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--ink-4)' }} />
        )}
      </div>
      {item.caption && (
        <figcaption
          className="px-3 py-2.5 text-[12px] leading-[1.45]"
          style={{ color: 'var(--ink-2)', background: 'var(--surface)' }}
        >
          {item.caption}
        </figcaption>
      )}
    </figure>
  )
}
