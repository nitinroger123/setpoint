import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sends a magic link to the player's email address via Supabase Auth.
  // The link redirects back to the app and AuthContext picks up the session.
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      })
      if (authError) {
        setError(authError.message)
      } else {
        setSent(true)
      }
    } catch (err: unknown) {
      setError(String(err))
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white border rounded-xl p-8 w-full max-w-sm shadow text-center space-y-4">
          <div className="text-4xl">📬</div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-gray-500 text-sm">
            We sent a sign-in link to <span className="font-medium text-primary">{email}</span>.
            Click the link in the email to sign in.
          </p>
          <p className="text-xs text-gray-400">
            Didn't get it? Check your spam folder, or{' '}
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="underline hover:text-primary transition-colors"
            >
              try a different email
            </button>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white border rounded-xl p-8 w-full max-w-sm shadow space-y-6">

        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in to Setpoint</h1>
          <p className="text-gray-500 text-sm mt-1">
            Enter your email to receive a sign-in link
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={sendMagicLink} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="border rounded-lg px-4 py-3 w-full text-lg"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full bg-primary text-white font-semibold py-3 rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>

      </div>
    </div>
  )
}
