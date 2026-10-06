import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './store/authStore'
import Shell from './components/shell/Shell'
import ErrorBoundary from './components/shell/ErrorBoundary'
import Login from './pages/Login'
import TodayPage from './pages/TodayPage'
import GoalsPage from './pages/GoalsPage'
import HealthPage from './pages/HealthPage'
import WellnessPage from './pages/WellnessPage'
import ReviewPage from './pages/ReviewPage'
import IdentityPage from './pages/IdentityPage'
import MomentumPage from './pages/MomentumPage'
import SettingsPage from './pages/SettingsPage'

// Keyed on pathname so navigating to a different page — including away
// from and back to a crashed one — remounts the boundary and clears its
// error state, rather than the error sticking around after the user has
// already left.
function Page({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

export default function App() {
  const { user, ready, init } = useAuth()
  useEffect(() => { init() }, [init])

  if (!ready) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontWeight: 700 }}>
        xLife
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Shell>
      {/* .view carries the page padding, so individual pages don't repeat it */}
      <div className="view">
        <Routes>
          <Route path="/" element={<Page><TodayPage /></Page>} />
          <Route path="/goals" element={<Page><GoalsPage /></Page>} />
          <Route path="/health" element={<Page><HealthPage /></Page>} />
          <Route path="/wellness" element={<Page><WellnessPage /></Page>} />
          <Route path="/review" element={<Page><ReviewPage /></Page>} />
          <Route path="/identity" element={<Page><IdentityPage /></Page>} />
          <Route path="/momentum" element={<Page><MomentumPage /></Page>} />
          <Route path="/settings" element={<Page><SettingsPage /></Page>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Shell>
  )
}
