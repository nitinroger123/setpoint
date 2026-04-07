import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import playerApi from '../lib/playerApi'

// Shape of the player record returned from /api/me
interface PlayerRecord {
  id: string
  name: string
  last_name: string | null
  phone?: string | null
  email?: string | null
  gender?: string | null
  avatar_url?: string | null
  instagram_handle?: string | null
  auth_user_id?: string | null
  orgs?: { id: string; name: string; slug: string; role: string }[]
}

interface AuthContextValue {
  // Supabase session — contains the JWT access_token
  session: Session | null
  // Linked player record — null if not yet claimed or not logged in
  player: PlayerRecord | null
  // True while the initial auth state is being determined
  loading: boolean
  // Signs the user out and clears local state
  signOut: () => Promise<void>
  // Re-fetches the player record (e.g. after updating profile or claiming)
  refreshPlayer: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  player: null,
  loading: true,
  signOut: async () => {},
  refreshPlayer: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [player, setPlayer] = useState<PlayerRecord | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetches the player linked to the current session from /api/me.
  // Returns null if no player is linked (user needs to claim their profile).
  async function fetchPlayer(activeSession: Session): Promise<PlayerRecord | null> {
    try {
      const res = await playerApi(activeSession).get('/api/me/')
      return res.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      // 404 means the user is authenticated but hasn't claimed a profile yet
      if (status === 404) return null
      return null
    }
  }

  async function refreshPlayer() {
    if (!session) return
    const updated = await fetchPlayer(session)
    setPlayer(updated)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setPlayer(null)
  }

  useEffect(() => {
    // Supabase fires onAuthStateChange twice on load: INITIAL_SESSION then
    // SIGNED_IN with the exact same session. We deduplicate by tracking the
    // last processed session user ID so the second fire is a no-op.
    // undefined = nothing processed yet; null = signed-out session processed.
    let lastProcessedUserId: string | null | undefined = undefined

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const incomingUserId = newSession?.user?.id ?? null

      // Skip if we already processed this exact session state
      if (incomingUserId === lastProcessedUserId) return
      lastProcessedUserId = incomingUserId

      if (newSession) {
        const linkedPlayer = await fetchPlayer(newSession)
        setSession(newSession)
        setPlayer(linkedPlayer)
        setLoading(false)
      } else {
        setSession(null)
        setPlayer(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, player, loading, signOut, refreshPlayer }}>
      {children}
    </AuthContext.Provider>
  )
}

// Convenience hook — use this in any component that needs auth state
export function useAuth() {
  return useContext(AuthContext)
}
