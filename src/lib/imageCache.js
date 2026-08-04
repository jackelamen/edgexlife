/*
  Vision-board image cache.

  The 15 vision-board photos live as base64 JPEGs inside one JSONB row
  (1.55 MB total). They are historical and effectively immutable, so each
  one should cross the network at most ONCE, ever — not once per page load,
  which is what the old goals.html did.

  Strategy: fetch a single image by id through the `life_vision_image` RPC,
  then park it in the Cache Storage API keyed by item id. Cache Storage is
  used rather than localStorage because these are ~100-350 kB each and would
  blow the ~5 MB localStorage budget immediately.
*/
import { supabase } from './supabase'
import { recordBytes } from './egress'

const CACHE_NAME = 'edgex-life-vision-v1'
const memory = new Map()

function cacheUrl(itemId) {
  // Synthetic same-origin URL — never actually requested over the network,
  // it only exists as a Cache Storage key.
  return `/__vision__/${encodeURIComponent(itemId)}`
}

export async function getVisionImage(itemId) {
  if (memory.has(itemId)) return memory.get(itemId)

  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME)
      const hit = await cache.match(cacheUrl(itemId))
      if (hit) {
        const src = await hit.text()
        memory.set(itemId, src)
        return src
      }
    } catch {
      /* Cache Storage unavailable (private mode) — fall through to fetch */
    }
  }

  const { data, error } = await supabase.rpc('life_vision_image', { p_item_id: itemId })
  if (error) throw error
  const src = data || ''
  recordBytes('vision-image', src.length)

  memory.set(itemId, src)
  if ('caches' in window && src) {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(cacheUrl(itemId), new Response(src))
    } catch {
      /* best effort */
    }
  }
  return src
}

export async function clearVisionCache() {
  memory.clear()
  if ('caches' in window) await caches.delete(CACHE_NAME)
}
