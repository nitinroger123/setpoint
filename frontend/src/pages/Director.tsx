import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import directorApi from '../lib/directorApi'

interface SessionRow {
  id: string
  date: string
  status: string
  tournament_series: { name: string } | null
}

interface Series {
  id: string
  name: string
}

// ── PIN gate ──────────────────────────────────────────────────────────────────

function PinEntry({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError('')
    try {
      // Verify by hitting any director endpoint
      await api.get('/api/director/sessions', { headers: { 'X-Director-Pin': pin } })
      localStorage.setItem('director_pin', pin)
      onSuccess()
    } catch {
      setError('Wrong PIN')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={submit} className="bg-white border rounded-xl p-8 w-80 space-y-4 shadow">
        <h2 className="text-xl font-bold text-center">Director Login</h2>
        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          className="w-full border rounded-lg px-4 py-2 text-center text-2xl tracking-widest"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={!pin || checking}
          className="w-full bg-primary text-white rounded-lg py-2 font-medium hover:bg-primary-light disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

// ── Session list + create ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-primary/10 text-primary',
}

export default function Director() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('director_pin'))
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newSeriesId, setNewSeriesId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!authed) return
    Promise.all([
      directorApi.get('/api/director/sessions'),
      api.get('/api/series'),
    ])
      .then(([sessRes, seriesRes]) => {
        setSessions(sessRes.data)
        setSeriesList(seriesRes.data)
      })
      .catch(() => {
        // Show empty state rather than infinite loading spinner
      })
      .finally(() => setLoading(false))
  }, [authed])

  async function createSession(e: React.FormEvent) {
    e.preventDefault()
    if (!newDate) return
    setCreating(true)
    const res = await directorApi.post('/api/director/sessions', {
      date: newDate,
      series_id: newSeriesId || null,
    })
    setSessions(prev => [res.data, ...prev])
    setShowCreate(false)
    setNewDate('')
    setNewSeriesId('')
    setCreating(false)
  }

  if (!authed) return <PinEntry onSuccess={() => setAuthed(true)} />

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Director</h1>
        <div className="flex gap-2">
          <Link
            to="/director/players"
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
          >
            Players
          </Link>
          <button
            onClick={() => setShowCreate(s => !s)}
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
          >
            + New Session
          </button>
          <button
            onClick={() => { localStorage.removeItem('director_pin'); setAuthed(false) }}
            className="text-gray-500 hover:text-gray-700 text-sm transition-colors px-2"
          >
            Log out
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={createSession} className="border rounded-xl p-5 bg-white space-y-4">
          <h2 className="font-semibold text-lg">New Session</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                required
                className="border rounded-lg px-3 py-2 w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Series (optional)</label>
              <select
                value={newSeriesId}
                onChange={e => setNewSeriesId(e.target.value)}
                className="border rounded-lg px-3 py-2 w-full"
              >
                <option value="">— none —</option>
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-gray-700 text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={creating} className="bg-primary text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow hover:bg-primary-light transition-all disabled:opacity-50">
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No sessions yet.</div>
      ) : (
        <div className="grid gap-3">
          {sessions.map(s => (
            <Link
              key={s.id}
              to={`/director/sessions/${s.id}`}
              className="flex items-center justify-between border rounded-xl px-5 py-4 bg-white hover:shadow-md transition"
            >
              <div>
                <p className="font-semibold">
                  {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
                {s.tournament_series && (
                  <p className="text-sm text-gray-500">{s.tournament_series.name}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_BADGE[s.status] || ''}`}>
                  {s.status}
                </span>
                <span className="text-gold">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
