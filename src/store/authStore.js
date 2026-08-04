import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuth = create((set) => ({
  user: null,
  ready: false,

  init: async () => {
    const { data } = await supabase.auth.getSession()
    set({ user: data?.session?.user ?? null, ready: true })
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
