import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import type { TournamentSeries, Session } from '../types'

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>()
  const [series, setSeries] = useState<TournamentSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/api/series/${id}`)
      .then(res => {
        setSeries(res.data)
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load series.')
        setLoading(false)
      })
  }, [id])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>
  if (!series) return <div className="p-8 text-center">Series not found</div>

  const sessions: Session[] = series.sessions || []

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to="/tournaments" className="text-blue-500 hover:underline text-sm mb-4 block">← Back to Tournaments</Link>

      <h1 className="text-3xl font-bold mb-1">{series.name}</h1>
      {series.location && <p className="text-gray-500 mb-1">📍 {series.location}</p>}
      {series.description && <p className="text-gray-400 text-sm mb-6">{series.description}</p>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Sessions</h2>
        <span className="text-sm text-gray-400">{sessions.length} total</span>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No sessions yet.</div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s, i) => (
            <Link
              key={s.id}
              to={`/sessions/${s.id}`}
              className="flex items-center justify-between border rounded-xl px-5 py-4 hover:shadow-md transition bg-white"
            >
              <div className="flex items-center gap-4">
                <span className="text-gray-300 text-sm font-mono w-6 text-right">
                  #{sessions.length - i}
                </span>
                <div>
                  <p className="font-semibold">
                    {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              <span className="text-blue-500 font-medium">View →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
