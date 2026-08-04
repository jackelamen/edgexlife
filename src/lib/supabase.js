import { createClient } from '@supabase/supabase-js'

// EdgeX Life shares the Pulse / xFocus cloud project (mdkyijbgvxedelcqcouu)
// so goals can reference Pulse tasks and habits under the same user id.
// Sign in with the PULSE account, same as xFocus.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://mdkyijbgvxedelcqcouu.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      // Distinct storage key so Life and xFocus don't fight over one session
      // slot when both are open on the same origin during local dev.
      storageKey: 'edgex-life-auth',
      storage: localStorage,
    },
    // Realtime is intentionally never used in this app. A single-user
    // journalling app gains nothing from live sockets and they were a
    // meaningful slice of the egress that took the project over quota.
    realtime: { params: { eventsPerSecond: 0 } },
  }
)
