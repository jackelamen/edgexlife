import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Tab/sub-view state backed by the URL's `?v=` param instead of local
 * `useState`. Same [value, setValue] shape as useState so it drops into
 * existing `<Tabs value={view} onChange={setView} ...>` call sites and
 * `setView('cycles')` navigation shortcuts unchanged.
 *
 * Why this exists: every module page (Health, Wellness, Goals) held its
 * active tab in plain useState, which meant a reload always landed back
 * on the default tab, browser back left the whole module instead of the
 * previous tab, and nothing outside the page — Today's alert links, ⌘K —
 * could deep-link to a specific sub-view. Backing it with the URL fixes
 * all three for free.
 *
 * Tab switches use `replace` (not push) so clicking through Health's 7
 * tabs doesn't bury the module itself 7 entries deep in history — back
 * from any tab leaves the module, same as it always has, but now reload
 * and sharing the URL both keep you on the tab you're looking at.
 */
export function useViewParam(defaultValue, param = 'v') {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(param) || defaultValue

  const setValue = useCallback((next) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next === defaultValue) params.delete(param)
      else params.set(param, next)
      return params
    }, { replace: true })
  }, [setSearchParams, defaultValue, param])

  return [value, setValue]
}
