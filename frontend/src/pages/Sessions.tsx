import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { Session } from '../types'

interface Format {
  id: string
  name: string
  description: string | null
}

export default function Sessions() {
  const [formats, setFormats] = useState<Format[]>([])
  const [activeFormat, setActiveFormat] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
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
    if (activeFormat === null) return
    setLoading(true)
    api.get('/api/sessions', { params: { format_id: activeFormat } })
      .then(res => {
        setSessions(res.data)
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load sessions.')
        setLoading(false)
        console.error(err)
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
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Session list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No tournaments yet for this format.</div>
      ) : (
        <div className="grid gap-4">
          {sessions.map(s => (
            <Link
              key={s.id}
              to={`/sessions/${s.id}`}
              className="block border rounded-xl p-5 hover:shadow-md transition bg-white"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-semibold">
                    {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                  <p className="text-sm text-gray-500 capitalize">
                    {s.format_id?.replace(/-/g, ' ')} · {s.num_rounds ?? 4} rounds
                  </p>
                </div>
                <span className="text-blue-500 font-medium">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
