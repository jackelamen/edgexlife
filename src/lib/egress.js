/*
  Egress discipline
  ---------------------------------------------------------------
  This project once blew through the Supabase free-tier egress allowance.
  The cause is now known: goals.html read the whole `gs2_vb` row on every
  single page load — 1.55 MB of base64 JPEGs — and wellness.html read a
  363 kB blob the same way. A handful of refreshes a day is gigabytes a month.

  Three rules this app holds to:

    1. Never fetch a payload you are not about to render. Metadata first,
       heavy content on demand (see rpcVisionBoard vs rpcVisionImage).
    2. Everything read is cached client-side with a real TTL, and immutable
       content (a vision-board photo) is cached forever.
    3. Every byte is counted, so a regression is visible instead of silent.

  `cachedQuery` is deliberately tiny rather than pulling in TanStack Query:
  the persistence-to-localStorage behaviour is the whole point here, and
  that is the part a library would not give us for free.
*/

const LEDGER_KEY = 'edgex-life-egress-ledger'
const CACHE_PREFIX = 'edgex-life-cache:'

// ── byte ledger ────────────────────────────────────────────────
function loadLedger() {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (!raw) return { month: monthKey(), bytes: 0, calls: 0, byName: {} }
    const l = JSON.parse(raw)
    return l.month === monthKey() ? l : { month: monthKey(), bytes: 0, calls: 0, byName: {} }
  } catch {
    return { month: monthKey(), bytes: 0, calls: 0, byName: {} }
  }
}

function monthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

let ledger = loadLedger()
const listeners = new Set()

export function recordBytes(name, bytes) {
  ledger.bytes += bytes
  ledger.calls += 1
  ledger.byName[name] = (ledger.byName[name] || 0) + bytes
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
  } catch {
    /* quota — the ledger is diagnostic, never worth breaking the app for */
  }
  listeners.forEach((fn) => fn(ledger))
}

export function getLedger() {
  return ledger
}

export function subscribeLedger(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function resetLedger() {
  ledger = { month: monthKey(), bytes: 0, calls: 0, byName: {} }
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
  listeners.forEach((fn) => fn(ledger))
}

function sizeOf(data) {
  if (data == null) return 0
  try {
    return new Blob([typeof data === 'string' ? data : JSON.stringify(data)]).size
  } catch {
    return 0
  }
}

// ── persistent cached query ────────────────────────────────────
const inflight = new Map()

/**
 * Run `fetcher` at most once per `ttlMs` per `key`, persisting the result to
 * localStorage so a reload or PWA relaunch costs zero egress.
 *
 * @param {string}   key      stable cache key
 * @param {Function} fetcher  async () => data
 * @param {object}   opts     { ttlMs, force }
 */
export async function cachedQuery(key, fetcher, opts = {}) {
  const { ttlMs = 5 * 60 * 1000, force = false } = opts
  const storeKey = CACHE_PREFIX + key

  if (!force) {
    try {
      const raw = localStorage.getItem(storeKey)
      if (raw) {
        const hit = JSON.parse(raw)
        if (Date.now() - hit.at < ttlMs) return hit.data
      }
    } catch {
      /* corrupt entry — fall through and refetch */
    }
  }

  // Collapse concurrent callers so mounting three components that all want
  // the same data results in one network round trip, not three — but only
  // for non-forced callers. A force:true caller is explicitly asking for a
  // fresh read (this is how every read-modify-write in the app works —
  // see addExerciseMinutes), and joining someone else's already-in-flight,
  // possibly-stale promise instead of actually forcing silently defeats
  // that. That was a real bug: two addExerciseMinutes calls close enough
  // together meant the second read-modify-write could operate on data
  // read before the first one's write landed, dropping it.
  if (!force && inflight.has(key)) return inflight.get(key)

  const p = (async () => {
    const data = await fetcher()
    recordBytes(key, sizeOf(data))
    try {
      localStorage.setItem(storeKey, JSON.stringify({ at: Date.now(), data }))
    } catch {
      /* over quota: serve from memory this session, don't break */
    }
    return data
  })().finally(() => { if (inflight.get(key) === p) inflight.delete(key) })

  // Always registered (even for force) so a subsequent NON-forced caller
  // still collapses onto this fetch rather than issuing its own.
  inflight.set(key, p)
  return p
}

export function invalidate(prefix) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith(CACHE_PREFIX + prefix)) localStorage.removeItem(k)
  }
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
