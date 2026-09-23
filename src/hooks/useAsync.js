import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal async-state hook. `deps` controls refetch; `fn` is expected to be a
 * cachedQuery-backed loader from lib/data.js, so re-running it is usually free.
 */
/* `keepPrevious`: on a deps change, keep showing the old data (no loading
   state) until the new query answers. Opt-in, not the default: the log
   editors seed their forms from `data`, and pre-filling one day's editor
   with another day's values would be worse than a brief loading line. Use
   it for read-only sections whose deps shift as a side effect of a save. */
export function useAsync(fn, deps = [], { enabled = true, keepPrevious = false } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null })
  const alive = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  /* `background` is the reload() path: refetch the SAME query after a save.
     It deliberately leaves `loading` false and keeps the current data on
     screen. It used to flip `loading: true` like a first load, and nearly
     every section renders `loading ? <Loading /> : content`, so every save
     anywhere unmounted its section for a beat. The page got shorter,
     the browser clamped the scroll position, and you landed back at the top
     after ticking a single box. A deps change (new date window, new id)
     is a different query, so that path still shows the loading state. */
  const run = useCallback(async (force = false, background = false) => {
    if (!enabled) return
    if (!background) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fnRef.current(force)
      if (alive.current) setState({ data, loading: false, error: null })
    } catch (error) {
      // A failed background refresh keeps what's on screen rather than
      // blanking it; the error still surfaces through `error`.
      if (alive.current) setState((s) => ({ data: background ? s.data : null, loading: false, error }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const hasData = state.data != null

  // `enabled` is appended here regardless of what deps the caller passed —
  // three separate call sites (GoalPhotoPicker, IntentionCard, Review's
  // History tab) shipped with `enabled: someState` but someState missing
  // from their own deps array, so the fetch ran once at mount while
  // disabled and never again once the caller actually flipped it on. Fixing
  // it once here, rather than trusting every future call site to remember
  // to include it themselves, is what actually closes off the bug class.
  useEffect(() => {
    alive.current = true
    run(false, keepPrevious && hasData)
    return () => { alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled])

  // Optimistic-update escape hatch. Accepts a value or an updater
  // `(prevData) => nextData`, same shape as useState's setter, so a caller
  // can reflect a mutation immediately (a checkbox tick) without waiting on
  // the round trip, then revert it on error or let the next `reload()`
  // reconcile with the server's real answer.
  const setData = useCallback((next) => {
    setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next }))
  }, [])

  return { ...state, reload: () => run(true, true), setData }
}
