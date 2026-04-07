import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type LoginStep = 'email' | 'otp'

export default function Login() {
  const navigate = useNavigate()
  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sends a 6-digit OTP to the player's email address via Supabase Auth.
  async function requestOtp(e: React.FormEvent) {
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
        setStep('otp')
      }
    } catch (err: unknown) {
      setError(String(err))
    }
    setLoading(false)
  }

  // Verifies the OTP code entered by the player.
  // On success, navigates to the dashboard (AuthContext picks up the new session).
  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error: authError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }
    if (data.session) {
      navigate('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white border rounded-xl p-8 w-full max-w-sm shadow space-y-6">

        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in to Setpoint</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 'email'
              ? 'Enter your email to receive a sign-in code'
              : `Code sent to ${email}`}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={requestOtp} className="space-y-4">
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
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                autoFocus
                className="border rounded-lg px-4 py-3 w-full text-center text-2xl tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full bg-primary text-white font-semibold py-3 rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setError(null) }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

      </div>
    </div>
  )
}
