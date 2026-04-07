import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { TournamentSeries } from '../types'

interface Format {
  id: string
  name: string
}

export default function Sessions() {
  const [formats, setFormats] = useState<Format[]>([])
  const [activeFormat, setActiveFormat] = useState<string | null>(null)
  const [seriesList, setSeriesList] = useState<TournamentSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/sessions/formats')
      .then(res => {
        setFormats(res.data)
        if (res.data.length > 0) setActiveFormat(res.data[0].id)
      })
      .catch(() => setError('Could not connect to backend. Is the API server running?'))
  }, [])

  useEffect(() => {
    if (!activeFormat) return
    setLoading(true)
    api.get('/api/series', { params: { format_id: activeFormat } })
      .then(res => {
        setSeriesList(res.data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load series.')
        setLoading(false)
      })
  }, [activeFormat])

  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Tournaments</h1>

      {/* Format tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {formats.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFormat(f.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeFormat === f.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Series cards */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : seriesList.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No series yet for this format.</div>
      ) : (
        <div className="grid gap-4">
          {seriesList.map(s => (
            <Link
              key={s.id}
              to={`/series/${s.id}`}
              className="block border rounded-xl p-5 hover:shadow-md transition bg-white"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-semibold">{s.name}</p>
                  {s.location && (
                    <p className="text-sm text-gray-500 mt-0.5">📍 {s.location}</p>
                  )}
                </div>
                <span className="text-gold font-medium">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
