import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal async-state hook. `deps` controls refetch; `fn` is expected to be a
 * cachedQuery-backed loader from lib/data.js, so re-running it is usually free.
 */
export function useAsync(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null })
  const alive = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async (force = false) => {
    if (!enabled) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fnRef.current(force)
      if (alive.current) setState({ data, loading: false, error: null })
    } catch (error) {
      if (alive.current) setState({ data: null, loading: false, error })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    alive.current = true
    run()
    return () => { alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ...state, reload: () => run(true) }
}
