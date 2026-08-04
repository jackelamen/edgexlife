import { useState } from 'react'
import toast from 'react-hot-toast'
import Logo from '../components/shell/Logo'
import { useAuth } from '../store/authStore'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      toast.error(err.message || 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full grid place-items-center px-5">
      <form onSubmit={submit} className="w-full max-w-[360px] lf-settle">
        <div className="flex items-center gap-3 mb-7">
          <Logo size={40} variant="solid" />
          <div>
            <h1 className="text-[22px] leading-tight">EdgeX Life</h1>
            <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
              Sign in with your Pulse account
            </p>
          </div>
        </div>

        <label className="lf-eyebrow block mb-1.5">Email</label>
        <input
          className="lf-input mb-4"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="lf-eyebrow block mb-1.5">Password</label>
        <input
          className="lf-input mb-6"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button className="lf-btn lf-btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Signing in…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
