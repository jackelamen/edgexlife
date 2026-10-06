import { useState } from 'react'
import toast from 'react-hot-toast'
import Wordmark from '../components/shell/Wordmark'
import BrandMark from '../components/shell/BrandMark'
import { Field } from '../components/ui/Kit'
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
    <div className="login-bg">
      <form onSubmit={submit} className="card card-pad login-card">
        <div style={{ marginBottom: 28 }}>
          <BrandMark size={44} />
          <h1 className="page-title" style={{ fontSize: 26, margin: '18px 0 4px' }}>
            Welcome back to <Wordmark size={26} />
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)' }}>
            Sign in with your Pulse account.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
            {busy ? 'Signing in…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}
