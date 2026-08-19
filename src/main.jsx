import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { supabaseConfigured } from './lib/supabase'
import './index.css'

const root = createRoot(document.getElementById('root'))

if (!supabaseConfigured) {
  // The classic Vercel white-screen: env vars never got set on the host.
  root.render(
    <div style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20 }}>xLife is not configured</h1>
      <p style={{ color: '#47574f', lineHeight: 1.6 }}>
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> are missing.
        Set them in <code>.env.local</code> locally, or in the Vercel project
        environment variables, then redeploy.
      </p>
    </div>
  )
} else {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#16241f',
              color: '#f7f8f6',
              borderRadius: 10,
              fontSize: 14,
            },
          }}
        />
      </BrowserRouter>
    </StrictMode>
  )
}
