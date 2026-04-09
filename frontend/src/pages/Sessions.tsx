import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { TournamentSeries } from '../types'

// Competition type tabs shown at the top of the page
const COMPETITION_TABS = [
  { id: 'all',                       label: 'All' },
  { id: 'pool_playoff_single_elim',  label: 'Pool + Bracket' },
  { id: 'round_robin',               label: 'Round Robin' },
]

export default function Sessions() {
  const [activeType, setActiveType] = useState<string>('all')
  const [seriesList, setSeriesList] = useState<TournamentSeries[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (activeType !== 'all') params.competition_type_id = activeType

    api.get('/api/series', { params })
      .then(res => {
        setSeriesList(res.data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load series.')
        setLoading(false)
      })
  }, [activeType])

  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Tournaments</h1>

      {/* Competition type tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {COMPETITION_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveType(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeType === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Series cards */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : seriesList.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No series yet.</div>
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
                  {/* Metadata badges: division, level, surface */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.divisions?.name && (
                      <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {s.divisions.name}
                      </span>
                    )}
                    {s.levels?.name && (
                      <span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {s.levels.name}
                      </span>
                    )}
                    {s.surfaces?.name && (
                      <span className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {s.surfaces.name}
                      </span>
                    )}
                    {s.game_formats?.name && (
                      <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                        {s.game_formats.name}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-gold font-medium shrink-0 ml-4">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
