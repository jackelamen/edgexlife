/**
 * Manual light/dark override on top of the OS preference. Dark mode
 * originally only followed prefers-color-scheme — no in-app toggle,
 * since there was no settings surface for it at the time. Jack asked for
 * one; this is it.
 *
 * Three states, stored as 'system' | 'light' | 'dark' in localStorage.
 * 'system' removes the override entirely and lets index.css's
 * `@media (prefers-color-scheme: dark)` block decide, same as before.
 * 'light'/'dark' set `data-theme` on <html>, which index.css's
 * `:root[data-theme="…"]` rules read with higher specificity than the
 * media query, so an explicit choice always wins over the OS setting.
 */
const KEY = 'xlife-theme'

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme
  } else {
    delete document.documentElement.dataset.theme
  }
}

export function setTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch { /* private mode / storage disabled — still apply for this load */ }
  applyTheme(theme)
}

/** Called once, as early as possible (see main.jsx), so there's no flash
    of the wrong theme before React even mounts. */
export function initTheme() {
  applyTheme(getTheme())
}
