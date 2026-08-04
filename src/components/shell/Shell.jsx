import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CalendarDays, Compass, HeartPulse, Menu, Settings, Sprout, X } from 'lucide-react'
import Logo from './Logo'
import { useAuth } from '../../store/authStore'

const NAV = [
  { to: '/', label: 'Today', icon: CalendarDays, end: true },
  { to: '/goals', label: 'Goals', icon: Compass },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/wellness', label: 'Wellness', icon: Sprout },
]

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-[14px] font-medium transition-colors"
          style={({ isActive }) => ({
            background: isActive ? 'var(--ever-mist)' : 'transparent',
            color: isActive ? 'var(--ever-deep)' : 'var(--ink-2)',
          })}
        >
          <Icon size={17} strokeWidth={1.9} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Shell({ children }) {
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()

  return (
    <div className="h-full flex">
      {/* Desktop rail */}
      <aside
        className="hidden lg:flex flex-col w-[228px] shrink-0 px-4 py-5 border-r"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-2.5 px-1 pb-6">
          <Logo size={30} variant="solid" />
          <div className="leading-tight">
            <div className="lf-display text-[15px]">EdgeX Life</div>
          </div>
        </div>

        <NavItems />

        <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
          <NavLink
            to="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-[14px]"
            style={{ color: 'var(--ink-2)' }}
          >
            <Settings size={17} strokeWidth={1.9} />
            Settings
          </NavLink>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-[12px]"
            style={{ color: 'var(--ink-3)' }}
          >
            {user?.email}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div
        className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 px-4 h-14 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
      >
        <button onClick={() => setOpen(true)} aria-label="Open menu" style={{ color: 'var(--ink-2)' }}>
          <Menu size={21} />
        </button>
        <Logo size={24} variant="solid" />
        <span className="lf-display text-[15px]">EdgeX Life</span>
      </div>

      {open && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: 'rgba(22,36,31,0.35)' }}
            onClick={() => setOpen(false)}
          />
          <aside
            className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-[250px] px-4 py-5 flex flex-col"
            style={{ background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between pb-6">
              <div className="flex items-center gap-2.5">
                <Logo size={28} variant="solid" />
                <span className="lf-display text-[15px]">EdgeX Life</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" style={{ color: 'var(--ink-3)' }}>
                <X size={19} />
              </button>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
            <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
              <NavLink
                to="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-[14px]"
                style={{ color: 'var(--ink-2)' }}
              >
                <Settings size={17} strokeWidth={1.9} />
                Settings
              </NavLink>
              <button onClick={signOut} className="w-full text-left px-3 py-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}

      <main className="flex-1 min-w-0 overflow-y-auto pt-14 lg:pt-0">
        <div key={location.pathname} className="max-w-[1120px] mx-auto px-5 lg:px-9 py-7 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  )
}
