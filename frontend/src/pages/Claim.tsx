import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import playerApi from '../lib/playerApi'

export default function Claim() {
  const { session, refreshPlayer } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitClaimCode(e: React.FormEvent) {
    e.preventDefault()
    if (!session) {
      navigate('/login')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await playerApi(session).post('/api/auth/claim', { code: code.trim().toUpperCase() })
      // Refresh the player record in AuthContext so the nav and dashboard update
      await refreshPlayer()
      navigate('/dashboard')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Invalid or expired code. Please ask your director for a new one.')
    } finally {
      setLoading(false)
    }
  }

  // If the user isn't logged in, prompt them to log in first
  if (!session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white border rounded-xl p-8 w-full max-w-sm shadow text-center space-y-4">
          <p className="text-gray-600">You need to be signed in to claim your profile.</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-primary text-white font-semibold px-6 py-2 rounded-lg hover:bg-primary-light transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white border rounded-xl p-8 w-full max-w-sm shadow space-y-6">

        <div className="text-center">
          <h1 className="text-2xl font-bold">Claim your profile</h1>
          <p className="text-gray-500 text-sm mt-2">
            Enter the code your Setpoint admin gave you to link your email to your player profile.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={submitClaimCode} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Claim code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="NITI-4829"
              required
              autoFocus
              className="border rounded-lg px-4 py-3 w-full text-center text-xl tracking-widest font-mono uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full bg-primary text-white font-semibold py-3 rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Claiming…' : 'Claim profile'}
          </button>
        </form>

      </div>
    </div>
  )
}
