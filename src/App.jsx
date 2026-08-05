import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './store/authStore'
import Shell from './components/shell/Shell'
import Login from './pages/Login'
import TodayPage from './pages/TodayPage'
import GoalsPage from './pages/GoalsPage'
import HealthPage from './pages/HealthPage'
import WellnessPage from './pages/WellnessPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const { user, ready, init } = useAuth()
  useEffect(() => { init() }, [init])

  if (!ready) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontWeight: 700 }}>
        EDGEx Life
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
          <Route path="/" element={<TodayPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/wellness" element={<WellnessPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Shell>
  )
}
