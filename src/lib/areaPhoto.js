/*
  One representative photo per life area (health/work/family/personal),
  pulled from the Vision Board's own area-tagged uploads — vision_items
  (new, Storage-backed) and the legacy base64 blob, same two sources
  VisionBoard.jsx already reads. This is what lets Today's hero and Goal
  cards borrow a photo you already uploaded instead of needing a second,
  goal-specific upload flow.

  Resolution happens at most ONCE per area per session: a module-level
  Map memoizes the resolved src (signed URL or cached base64) so mounting
  five goal cards in the same area signs/fetches that photo once, not
  five times — same "fetch at most once" rule imageCache.js already
  enforces for legacy images, extended to cover the new Storage path too.

  useGoalPhoto layers a per-goal override on top: a goal can pin one
  specific photo (goals.featured_photo_kind/_ref, set via the picker in
  the goal editor) instead of getting whatever the area default happens
  to be. Same memoization strategy, keyed by kind+ref instead of area.
*/
import { useEffect, useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { fetchVisionItems, fetchLegacyVision, signVisionUrl } from './data'
import { getVisionImage } from './imageCache'

const resolved = new Map() // area -> Promise<string|null>

function resolveAreaPhoto(area, items, legacy) {
  if (resolved.has(area)) return resolved.get(area)
  const stored = (items || []).filter((i) => i.area === area)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const legacyForArea = (legacy || []).filter((i) => i.area === area)
  const p = (async () => {
    if (stored[0]) return await signVisionUrl(stored[0].storage_path)
    if (legacyForArea[0]) return await getVisionImage(legacyForArea[0].id)
    return null
  })().catch(() => null)
  resolved.set(area, p)
  return p
}

/** Returns the resolved photo src for `area`, or null while loading / when
    that area has no vision photos yet — every caller gets a built-in
    no-photo fallback rather than needing to check loading state itself. */
export function useAreaPhoto(area) {
  const items = useAsync((f) => fetchVisionItems({ force: f }))
  const legacy = useAsync((f) => fetchLegacyVision({ force: f }))
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!area || (!items.data && !legacy.data)) return
    let alive = true
    resolveAreaPhoto(area, items.data, legacy.data).then((s) => { if (alive) setSrc(s) })
    return () => { alive = false }
  }, [area, items.data, legacy.data])

  return src
}

const resolvedGoalPhoto = new Map() // "kind:ref" -> Promise<string|null>

function resolveGoalPhoto(kind, ref) {
  const key = `${kind}:${ref}`
  if (resolvedGoalPhoto.has(key)) return resolvedGoalPhoto.get(key)
  const p = (kind === 'legacy' ? getVisionImage(ref) : signVisionUrl(ref)).catch(() => null)
  resolvedGoalPhoto.set(key, p)
  return p
}

/** A goal's own pinned photo (goal.featured_photo_kind/_ref, set from the
    picker in the goal editor) when it has one, otherwise the same area
    default useAreaPhoto returns — callers never need to know which one
    they got. Always calls useAreaPhoto regardless (hooks can't be
    conditional), so the fallback is ready the moment it's needed with no
    extra render delay. */
export function useGoalPhoto(goal) {
  const areaPhoto = useAreaPhoto(goal?.area)
  const [pinnedSrc, setPinnedSrc] = useState(null)
  const kind = goal?.featured_photo_kind, ref = goal?.featured_photo_ref

  useEffect(() => {
    if (!kind || !ref) { setPinnedSrc(null); return }
    let alive = true
    resolveGoalPhoto(kind, ref).then((s) => { if (alive) setPinnedSrc(s) })
    return () => { alive = false }
  }, [kind, ref])

  return kind && ref ? pinnedSrc : areaPhoto
}
