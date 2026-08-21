import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuth = create((set) => ({
  user: null,
  ready: false,

  init: async () => {
    // getSession() had no try/catch: any rejection (cold start offline
    // being the realistic one — an installed PWA with no network yet)
    // left this promise permanently unsettled, `ready` never became
    // true, and App.jsx's loading placeholder never got past "xLife" —
    // a splash with no way out short of force-quitting the app.
    // Falling back to signed-out on failure isn't a great outcome, but
    // it's a recoverable one: it reaches the login screen instead of a
    // dead splash, and a real session resumes correctly the moment
    // getSession() actually works.
    try {
      const { data } = await supabase.auth.getSession()
      set({ user: data?.session?.user ?? null, ready: true })
    } catch {
      set({ user: null, ready: true })
    }
    supabase.auth.onAuthStateChange((_e, session) => {
      set({ user: session?.user ?? null, ready: true })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  },
}))
