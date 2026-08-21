import { Component } from 'react'

/*
  There was no error boundary anywhere in src/ — one bad row (a null
  where a number was expected, a malformed date, a shape the code didn't
  anticipate) crashed the whole render tree to a blank white screen. In
  an installed PWA that has no address bar and no back button, that's a
  dead end: the only way out is force-quitting the app.

  This is deliberately per-route, not one boundary around the whole app —
  wrapped around each <Route element> in App.jsx with a key on the
  pathname, so a crash on one page still leaves Shell and navigation
  intact and switching pages (which remounts the boundary via the key
  change) is itself the recovery path, alongside the reload button below.
*/
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('xLife page crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        maxWidth: 460, margin: '48px auto', textAlign: 'center',
        padding: 24, background: 'var(--card-bg, #fff)', borderRadius: 16,
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>This page hit an error</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3, #888)', marginBottom: 16 }}>
          Nothing you had was lost — this page just couldn't render. Try reloading it.
        </p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        {import.meta.env.DEV && (
          <pre style={{
            marginTop: 16, textAlign: 'left', fontSize: 11, overflow: 'auto',
            background: 'rgba(0,0,0,.05)', padding: 12, borderRadius: 8,
          }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    )
  }
}
