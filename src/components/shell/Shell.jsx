import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import BrandMark from './BrandMark'
import { useAuth } from '../../store/authStore'

/*
  Sidebar ported from the originals: 256px, #1a1a2e, section labels, and
  Material Symbols that switch to their FILL variant when active. The module
  accent tints the active pill via --accent-rgb.
*/

const NAV = [
  { section: 'Main' },
  { to: '/', label: 'Today', icon: 'today', end: true, module: 'today' },
  { to: '/goals', label: 'Goals', icon: 'flag', module: 'goals' },
  { to: '/health', label: 'Health', icon: 'monitor_heart', module: 'health' },
  { to: '/wellness', label: 'Wellness', icon: 'self_improvement', module: 'wellness' },
  { section: 'Rhythm' },
  { to: '/review', label: 'Review', icon: 'event_note', module: 'review' },
  { to: '/identity', label: 'Identity', icon: 'star', module: 'identity' },
  { section: 'System' },
  { to: '/settings', label: 'Settings', icon: 'settings', module: 'settings' },
]

const LINKS = NAV.filter((n) => n.to)

/* Phone bottom bar: the four daily modules only. Today leads because it's
   the home surface; Settings stays in the drawer with sign-out rather than
   spending a quarter of the bar on something opened once a month. Review
   and Identity are excluded on the same logic — both are rollups you
   check into on your own rhythm (weekly for Review, whenever for
   Identity), not something with a daily due-list, and Today's own
   .north-star line already keeps the statement present on the surface
   that IS on the bar. */
const BOTTOM_NAV = LINKS.filter((n) => n.module !== 'settings' && n.module !== 'review' && n.module !== 'identity')

function useModuleTheme(pathname) {
  const mod = LINKS.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.module || 'today'
  useEffect(() => { document.documentElement.dataset.module = mod }, [mod])
  return mod
}

export default function Shell({ children }) {
  const [open, setOpen] = useState(false)
  const [cmd, setCmd] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()
  useModuleTheme(location.pathname)

  useEffect(() => { setOpen(false) }, [location.pathname])

  // Cmd+K module switcher, same affordance as the originals.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmd((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const sidebar = (
    <>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <BrandMark size={30} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-.01em' }}>
            xLife
          </span>
        </div>
        <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 11.5, fontWeight: 600, marginTop: 3, marginLeft: 39 }}>
          Goals · Health · Wellness
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        {NAV.map((n, i) =>
          n.section ? (
            <div key={'s' + i} className="nav-section-label" style={i === 0 ? { marginTop: 0 } : undefined}>
              {n.section}
            </div>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              {({ isActive }) => (
                <>
                  <Icon name={n.icon} size={19} fill={isActive} />
                  {n.label}
                </>
              )}
            </NavLink>
          )
        )}
      </div>

      <div style={{
        marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8,
        borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16,
      }}>
        <button className="nav-item" onClick={() => setCmd(true)}>
          <Icon name="search" size={19} />
          Switch module
          <kbd style={{
            marginLeft: 'auto', fontSize: 10, background: 'rgba(255,255,255,.08)',
            borderRadius: 4, padding: '2px 5px', color: 'rgba(255,255,255,.45)',
          }}>⌘K</kbd>
        </button>
        <button className="nav-item" onClick={signOut} style={{ color: 'rgba(248,113,113,.85)' }}>
          <Icon name="logout" size={19} />
          Sign out
        </button>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.25)', paddingLeft: 14 }}>
          {user?.email}
        </div>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside id="sidebar-desktop">{sidebar}</aside>

      {/* Mobile top bar — visible only under 1024px, see .mobile-topbar in index.css */}
      <div className="mobile-topbar">
        <button onClick={() => setOpen(true)} aria-label="Menu"
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
          <Icon name="menu" size={22} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BrandMark size={22} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: '-.01em' }}>xLife</span>
        </div>
      </div>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 70 }} />
          <aside id="sidebar-mobile">
            {sidebar}
          </aside>
        </>
      )}

      <main className="app-main">
        {children}
      </main>

      {/*
        Bottom nav — phones only (see .botnav in index.css). Modules are the
        thing you switch between constantly, so they belong under the thumb
        rather than behind a hamburger. The drawer stays for Settings and
        sign-out. The active tab is marked in that module's own hue, the same
        way its hero and desktop nav pill are.
      */}
      <nav className="botnav">
        {BOTTOM_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `botnav-item${isActive ? ' active' : ''}`}>
            {({ isActive }) => (
              <>
                {isActive && <span className="botnav-ind" />}
                <Icon name={n.icon} size={21} fill={isActive} />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {cmd && <CommandPalette onClose={() => setCmd(false)} />}
    </div>
  )
}

function CommandPalette({ onClose }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)

  const items = LINKS.filter((l) => l.label.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose()
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && items[sel]) { nav(items[sel].to); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [items, sel, nav, onClose])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, background: 'var(--sidebar-bg)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <Icon name="search" size={18} style={{ color: 'rgba(255,255,255,.45)' }} />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }}
            placeholder="Jump to…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 15, fontWeight: 500, padding: 0 }} />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
          {items.map((it, i) => (
            <button key={it.to} onClick={() => { nav(it.to); onClose() }}
              onMouseEnter={() => setSel(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 10, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                background: i === sel ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: 'rgba(255,255,255,0.82)', fontFamily: 'inherit',
              }}>
              <span style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.06)' }}>
                <Icon name={it.icon} size={18} />
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{it.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Page padding now lives on the .view wrapper in App, so this is a passthrough. */
export function View({ children }) {
  return <>{children}</>
}

/* Compatibility shims for Goals / Wellness, which are still on the previous
   layout API and get their own deep pass next. Delete as each is rebuilt. */

export function ModuleHeader({ title, views, view, onView, actions }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="page-title">{title}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>
      </div>
      {views?.length > 1 && (
        <div className="tabs" style={{ marginTop: 14, marginBottom: 0 }}>
          {views.map((v) => (
            <button key={v.key} className={`tab${v.key === view ? ' active' : ''}`}
              onClick={() => onView(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ModuleBody({ children }) {
  return <div style={{ paddingTop: 4 }}>{children}</div>
}
