import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

interface PlayerResult {
  id: string
  name: string
  avatar_url?: string | null
}

export default function Players() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // Runs the search against the backend. Called on form submit.
  async function searchPlayers(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await api.get('/api/players/search', { params: { q: query.trim() } })
      setResults(res.data)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Players</h1>

      {/* Search form */}
      <form onSubmit={searchPlayers} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          autoFocus
          className="border rounded-lg px-4 py-2 flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="bg-primary text-white font-semibold px-5 py-2 rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50 text-sm"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <div className="text-center py-12 text-gray-400 border rounded-xl">
          No players found for "{query}"
        </div>
      )}

      {results.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          {results.map(player => (
            <Link
              key={player.id}
              to={`/players/${player.id}`}
              className="flex items-center gap-4 px-5 py-4 bg-white hover:bg-cream-light border-b last:border-b-0 transition-colors"
            >
              {/* Avatar or initial */}
              <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 shrink-0 flex items-center justify-center">
                {player.avatar_url ? (
                  <img src={player.avatar_url} alt={player.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary font-bold text-sm">
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="font-medium">{player.name}</span>
              <span className="ml-auto text-gold">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
