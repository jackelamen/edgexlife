import { useEffect, useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { fetchVisionItems, fetchLegacyVision, signVisionUrl } from '../../lib/data'
import { getVisionImage } from '../../lib/imageCache'
import { areaColor, areaLabel } from '../../lib/goals'
import { Modal, Empty, Loading } from '../ui/Kit'
import Icon from '../ui/Icon'

/*
  Lets a goal pin one specific Vision Board photo instead of just
  inheriting whatever the area default happens to be (see useGoalPhoto in
  lib/areaPhoto.js). Reuses VisionBoard's own two sources (vision_items +
  the legacy blob) and its lazy-load-on-scroll-into-view pattern (Tile,
  ported here as PickerTile) rather than eagerly signing every photo the
  moment this modal opens.
*/
export default function GoalPhotoPicker({ open, goalArea, current, onClose, onPick }) {
  // useAsync only (re)fetches when its deps array changes, not whenever
  // `enabled` flips — with deps: [], the fetch ran once at mount, while
  // this modal was still closed (enabled: false), and never ran again
  // once `open` actually became true. [open] as the dep is what makes it
  // actually fetch the first time the picker opens.
  const items = useAsync((f) => fetchVisionItems({ force: f }), [open], { enabled: open })
  const legacy = useAsync((f) => fetchLegacyVision({ force: f }), [open], { enabled: open })
  const loading = items.loading || legacy.loading

  const all = [
    ...(items.data || []).map((i) => ({ kind: 'stored', ref: i.storage_path, id: i.id, area: i.area, caption: i.caption })),
    ...(legacy.data || []).map((i) => ({ kind: 'legacy', ref: i.id, id: i.id, area: i.area, caption: i.caption })),
  ]
  // The goal's own area first, since that's the most likely pick, but
  // every other area's photos are still right there — a "run with my
  // son" goal might legitimately want a Family photo, not a Health one.
  const sorted = [...all].sort((a, b) => (a.area === goalArea ? -1 : b.area === goalArea ? 1 : 0))

  return (
    <Modal open={open} onClose={onClose} title="Choose a photo" width={640}
      footer={<button className="btn btn-secondary" onClick={onClose}>Done</button>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
          Pulled from your Vision Board. Pick one to pin it to this goal, or clear it to use the area default.
        </p>
        {current && (
          <button className="btn btn-ghost btn-sm" onClick={() => { onPick(null, null); onClose() }}>
            <Icon name="close" size={13} /> Use area default
          </button>
        )}
      </div>
      {loading ? <Loading /> : !all.length ? (
        <Empty icon="add_photo_alternate" title="No photos yet">
          Add some in the Visions tab first, then come back and pin one here.
        </Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
          {sorted.map((item) => {
            const isCurrent = current && current.kind === item.kind && current.ref === item.ref
            return (
              <PickerTile key={`${item.kind}:${item.id}`} item={item} selected={isCurrent}
                onPick={() => { onPick(item.kind, item.ref); onClose() }} />
            )
          })}
        </div>
      )}
    </Modal>
  )
}

function PickerTile({ item, selected, onPick }) {
  const [src, setSrc] = useState(null)
  const [state, setState] = useState('idle')
  const [node, setNode] = useState(null)

  useEffect(() => {
    if (!node || state !== 'idle') return
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      setState('loading')
      const load = item.kind === 'legacy' ? getVisionImage(item.ref) : signVisionUrl(item.ref)
      load.then((s) => { setSrc(s); setState(s ? 'done' : 'error') }).catch(() => setState('error'))
    }, { rootMargin: '200px' })
    io.observe(node)
    return () => io.disconnect()
  }, [node, item, state])

  return (
    <button ref={setNode} onClick={onPick} title={item.caption || ''}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', padding: 0,
        border: selected ? '3px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer', background: 'var(--white-soft)',
      }}>
      {state === 'done' && src ? (
        <img src={src} alt={item.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
          <Icon name={state === 'error' ? 'broken_image' : 'progress_activity'} size={16}
            className={state === 'error' ? '' : 'spin'} style={{ color: 'var(--text-3)' }} />
        </div>
      )}
      <span style={{
        position: 'absolute', top: 5, left: 5, fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase',
        padding: '2px 6px', borderRadius: 99, background: areaColor(item.area), color: '#fff',
      }}>{areaLabel(item.area)}</span>
      {selected && (
        <span style={{
          position: 'absolute', bottom: 5, right: 5, width: 20, height: 20, borderRadius: '50%',
          background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center',
        }}><Icon name="check" size={13} /></span>
      )}
    </button>
  )
}
