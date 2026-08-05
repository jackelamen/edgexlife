import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import Icon from '../ui/Icon'
import { useAsync } from '../../hooks/useAsync'
import {
  fetchLegacyVision, fetchVisionItems, uploadVisionImage, deleteVisionItem, signVisionUrl, AREAS,
} from '../../lib/data'
import { getVisionImage } from '../../lib/imageCache'
import { formatBytes } from '../../lib/egress'
import { areaLabel, areaColor } from '../../lib/goals'
import { Empty, Loading, Modal, Field, useConfirm } from '../ui/Kit'

/*
  Two sources on one wall:
    - legacy photos still living as base64 inside the gs2_vb blob, pulled one
      at a time through an RPC and cached in Cache Storage forever
    - new uploads in the `life-vision` Storage bucket, served by signed URL

  Either way a tile only fetches once it scrolls into view. The old
  goals.html pulled all 1.55 MB on every page load.

  Two layouts, matching the original: a collage masonry (CSS columns) and a
  by-area grid, switched via .vview-tabs.
*/
export default function VisionBoard() {
  const legacy = useAsync((f) => fetchLegacyVision({ force: f }))
  const items = useAsync((f) => fetchVisionItems({ force: f }))
  const [adding, setAdding] = useState(false)
  const [layout, setLayout] = useState('collage')
  const [lightbox, setLightbox] = useState(null)
  const [meditating, setMeditating] = useState(false)
  const [meditLoading, setMeditLoading] = useState(false)

  const all = [
    ...(items.data || []).map((i) => ({ ...i, kind: 'stored' })),
    ...(legacy.data || []).map((i) => ({ ...i, kind: 'legacy' })),
  ]

  const legacyBytes = (legacy.data || []).reduce((n, i) => n + (i.bytes || 0), 0)

  const onDeleted = (item) => (item.kind === 'stored' ? items.reload() : legacy.reload())

  async function startMeditation() {
    if (!all.length) { toast.error('Add some photos to your vision board first.'); return }
    setMeditLoading(true)
    try {
      const resolved = await Promise.all(all.map(async (item) => {
        const src = item.kind === 'legacy' ? await getVisionImage(item.id) : await signVisionUrl(item.storage_path)
        return src ? { id: item.kind + item.id, src, caption: item.caption } : null
      }))
      const usable = resolved.filter(Boolean)
      if (!usable.length) { toast.error('Could not load any photos.'); return }
      setMeditating(usable)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setMeditLoading(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div className="vview-tabs">
          <button className={`vview-tab${layout === 'collage' ? ' active' : ''}`} onClick={() => setLayout('collage')}>
            <Icon name="grid_view" size={14} /> Collage
          </button>
          <button className={`vview-tab${layout === 'area' ? ' active' : ''}`} onClick={() => setLayout('area')}>
            <Icon name="category" size={14} /> By Area
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
            {all.length} images
            {legacyBytes > 0 && ` · ${formatBytes(legacyBytes)} in legacy blob`}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={meditLoading} onClick={startMeditation}
            style={{ color: '#7c3aed', borderColor: 'rgba(124,58,237,.25)', background: 'rgba(124,58,237,.08)' }}>
            <Icon name="self_improvement" fill size={14} /> {meditLoading ? 'Loading…' : 'Meditate'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Icon name="add_photo_alternate" size={14} /> Add photo
          </button>
        </div>
      </div>

      {legacy.loading && items.loading ? (
        <Loading label="Reading vision board" />
      ) : !all.length ? (
        <Empty icon="add_photo_alternate" title="No images yet"
          action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Icon name="add_photo_alternate" size={14} /> Add your first</button>}>
          Pictures of the life you're actually aiming at.
        </Empty>
      ) : layout === 'collage' ? (
        <div className="vphoto-masonry">
          {all.map((item) => (
            <Tile key={item.kind + item.id} item={item} onDeleted={() => onDeleted(item)}
              onOpen={(src) => setLightbox(src)} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {AREAS.map((a) => {
            const group = all.filter((i) => i.area === a)
            if (!group.length) return null
            return (
              <div key={a}>
                <div className="visions-goal-chip" style={{ borderColor: areaColor(a), color: areaColor(a), marginBottom: 10 }}>
                  {areaLabel(a)} · {group.length}
                </div>
                <div className="vphoto-masonry cols-2">
                  {group.map((item) => (
                    <Tile key={item.kind + item.id} item={item} onDeleted={() => onDeleted(item)}
                      onOpen={(src) => setLightbox(src)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddPhoto open={adding} onClose={() => setAdding(false)} onDone={() => items.reload()} />

      {lightbox && (
        <div className="modal-backdrop" style={{ zIndex: 200 }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: 14, objectFit: 'contain' }} />
        </div>
      )}

      {meditating && <MeditationOverlay photos={meditating} onClose={() => setMeditating(false)} />}
    </>
  )
}

/*
  Fullscreen Ken Burns slideshow, ported from goals.html's openMeditation/
  closeMeditation. Grid layout (cols/rows for a given photo count) and the
  idle-hide-controls behavior are ported verbatim; the mosaic loops photos
  to fill every cell and staggers each tile's animation-delay so the drift
  doesn't read as synchronized.
*/
function MeditationOverlay({ photos, onClose }) {
  const [hidden, setHidden] = useState(false)
  const overlayRef = useRef(null)
  const idleTimer = useRef(null)

  const n = photos.length
  let cols, rows
  if (n <= 2) { cols = n; rows = 1 }
  else if (n <= 4) { cols = 2; rows = 2 }
  else if (n <= 6) { cols = 3; rows = 2 }
  else if (n <= 9) { cols = 3; rows = 3 }
  else if (n <= 12) { cols = 4; rows = 3 }
  else if (n <= 16) { cols = 4; rows = 4 }
  else if (n <= 20) { cols = 5; rows = 4 }
  else { cols = 5; rows = Math.ceil(n / 5) }

  const shuffled = useRef([...photos].sort(() => Math.random() - 0.5)).current
  const totalCells = cols * rows
  const tiles = Array.from({ length: totalCells }).map((_, i) => shuffled[i % shuffled.length])

  const startIdle = () => {
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setHidden(true), 3000)
  }

  useEffect(() => {
    const el = overlayRef.current
    const onActivity = () => { setHidden(false); startIdle() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    el?.addEventListener('mousemove', onActivity)
    el?.addEventListener('touchstart', onActivity)
    document.addEventListener('keydown', onKey)
    startIdle()
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {})
    return () => {
      el?.removeEventListener('mousemove', onActivity)
      el?.removeEventListener('touchstart', onActivity)
      document.removeEventListener('keydown', onKey)
      clearTimeout(idleTimer.current)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div id="meditation-overlay" className="open" ref={overlayRef}>
      <div className="medit-vignette" />
      <div className={`medit-bar${hidden ? ' hidden-ui' : ''}`}>
        <div>
          <div className="medit-title">Vision Images</div>
          <div className="medit-hint">Move your mouse or tap to show controls</div>
        </div>
        <button className="medit-close" onClick={onClose}>
          <Icon name="close_fullscreen" size={16} /> Exit
        </button>
      </div>
      <div className="medit-mosaic" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, height: '100%' }}>
        {tiles.map((p, i) => (
          <div className="medit-tile" key={i}>
            <img src={p.src} alt={p.caption || ''} style={{ animationDelay: `-${(i * 0.9).toFixed(1)}s` }} />
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}

function Tile({ item, onDeleted, onOpen }) {
  const [src, setSrc] = useState(null)
  const [state, setState] = useState('idle')
  const [node, setNode] = useState(null)
  const confirm = useConfirm()

  useEffect(() => {
    if (!node || state !== 'idle') return
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      setState('loading')
      const load = item.kind === 'legacy'
        ? getVisionImage(item.id)
        : signVisionUrl(item.storage_path)
      load.then((s) => { setSrc(s); setState(s ? 'done' : 'error') })
        .catch(() => setState('error'))
    }, { rootMargin: '300px' })
    io.observe(node)
    return () => io.disconnect()
  }, [node, item, state])

  return (
    <div ref={setNode} className="vphoto-item">
      {state === 'done' && src ? (
        <img src={src} alt={item.caption || ''} onClick={() => onOpen(src)} />
      ) : state === 'error' ? (
        <div style={{ aspectRatio: '4/5', display: 'grid', placeItems: 'center', background: 'var(--surface-2, #f3f4f6)' }}>
          <Icon name="broken_image" size={18} style={{ color: 'var(--text-3)' }} />
        </div>
      ) : (
        <div style={{ aspectRatio: '4/5', display: 'grid', placeItems: 'center', background: 'var(--surface-2, #f3f4f6)' }}>
          <Icon name="progress_activity" size={16} style={{ color: 'var(--text-3)' }} className="spin" />
        </div>
      )}

      {item.area && <span className="vphoto-area-badge" style={{ background: areaColor(item.area) }}>{areaLabel(item.area)}</span>}

      <div className="vphoto-item-overlay">
        {item.caption && <div className="vphoto-caption">{item.caption}</div>}
      </div>

      <button
        className={`btn btn-icon btn-sm${confirm.isArmed(item.id) ? ' btn-danger' : ''}`}
        style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,.92)' }}
        onClick={async (e) => {
          e.stopPropagation()
          if (!confirm.isArmed(item.id)) return confirm.arm(item.id)
          try {
            if (item.kind === 'stored') await deleteVisionItem(item)
            else {
              const { dropLegacyVision } = await import('../../lib/data')
              await dropLegacyVision(item.id)
            }
            toast.success('Removed')
            onDeleted()
          } catch (e2) { toast.error(e2.message) }
        }}
        aria-label="Remove"
      >
        <Icon name="delete" size={13} />
      </button>
    </div>
  )
}

function AddPhoto({ open, onClose, onDone }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [area, setArea] = useState('personal')
  const [busy, setBusy] = useState(false)

  const reset = () => { setFile(null); setCaption(''); setArea('personal') }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title="Add vision photo"
      width={480}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => { reset(); onClose() }}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await uploadVisionImage(file, { area, caption })
                toast.success('Photo added')
                reset(); onDone(); onClose()
              } catch (e) { toast.error(e.message) } finally { setBusy(false) }
            }}
          >
            {busy ? 'Uploading…' : 'Add'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          className="vbento-add"
          style={{ padding: '28px 0', cursor: 'pointer' }}
          onClick={() => fileRef.current?.click()}
        >
          {file ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{file.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{formatBytes(file.size)}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
              <Icon name="add_photo_alternate" size={20} />
              <div style={{ fontSize: 13, marginTop: 4 }}>Choose an image</div>
              <div style={{ fontSize: 11.5 }}>JPG, PNG or WebP up to 8 MB</div>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <Field label="Area">
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
          </select>
        </Field>
        <Field label="Caption" hint="Present tense, as if it already happened.">
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
