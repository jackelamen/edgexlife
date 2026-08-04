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
      <div className="h-full grid place-items-center" style={{ color: 'var(--ink-3)' }}>
        <span className="lf-eyebrow">EdgeX Life</span>
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
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/wellness" element={<WellnessPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
