import axios from 'axios'
import type { Session } from '@supabase/supabase-js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * Returns an axios instance pre-configured with the player's Supabase JWT.
 * Pass the current session from useAuth() to get an authenticated client.
 *
 * Usage:
 *   const { session } = useAuth()
 *   const res = await playerApi(session).get('/api/me/')
 */
export default function playerApi(session: Session | null) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  })
}
