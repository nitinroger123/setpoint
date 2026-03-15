import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import type { TournamentSeries, Session } from '../types'

interface LeaderboardEntry {
  player_id: string
  name: string
  sessions: number
  first: number
  second: number
  third: number
  fourth: number
  win_pct: number
}

type SortKey = 'name' | 'sessions' | 'first' | 'second' | 'third' | 'fourth' | 'win_pct'

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'center' }[] = [
  { key: 'name',     label: 'Player',   align: 'left'   },
  { key: 'sessions', label: 'Sessions', align: 'center' },
  { key: 'first',    label: '🥇',       align: 'center' },
  { key: 'second',   label: '🥈',       align: 'center' },
  { key: 'third',    label: '🥉',       align: 'center' },
  { key: 'fourth',   label: '🏅',       align: 'center' },
  { key: 'win_pct',  label: 'Win %',    align: 'center' },
]

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>()
  const [series, setSeries] = useState<TournamentSeries | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('sessions')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get(`/api/series/${id}`),
      api.get(`/api/series/${id}/leaderboard`),
    ])
      .then(([seriesRes, lbRes]) => {
        setSeries(seriesRes.data)
        setLeaderboard(lbRes.data)
        setLoading(false)
      })
      .catch(() => { setError('Could not load series.'); setLoading(false) })
  }, [id])

  const sorted = useMemo(() => {
    return [...leaderboard].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [leaderboard, sortKey, sortAsc])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(key === 'name') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>
  if (!series) return <div className="p-8 text-center">Series not found</div>

  const sessions: Session[] = series.sessions || []

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <Link to="/tournaments" className="text-blue-500 hover:underline text-sm mb-4 block">← Back to Tournaments</Link>
        <h1 className="text-3xl font-bold mb-1">{series.name}</h1>
        {series.location && <p className="text-gray-500">📍 {series.location}</p>}
      </div>

      <div className="flex gap-6 items-start">
        {/* Leaderboard */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold mb-3">Leaderboard</h2>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-4 py-3 cursor-pointer select-none hover:bg-gray-100 ${col.align === 'left' ? 'text-left' : 'text-center'}`}
                    >
                      {col.label}<SortIcon col={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((p, i) => (
                  <tr key={p.player_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-semibold">
                      <Link to={`/players/${p.player_id}`} className="text-blue-600 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{p.sessions}</td>
                    <td className="px-4 py-3 text-center font-medium">{p.first || '—'}</td>
                    <td className="px-4 py-3 text-center font-medium">{p.second || '—'}</td>
                    <td className="px-4 py-3 text-center font-medium">{p.third || '—'}</td>
                    <td className="px-4 py-3 text-center font-medium">{p.fourth || '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">{p.win_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sessions list */}
        <div className="w-72 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Sessions</h2>
            <span className="text-sm text-gray-400">{sessions.length} total</span>
          </div>
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No sessions yet.</div>
          ) : (
            <div className="grid gap-2 max-h-[600px] overflow-y-auto pr-1">
              {sessions.map((s, i) => (
                <Link
                  key={s.id}
                  to={`/sessions/${s.id}`}
                  className="flex items-center justify-between border rounded-xl px-4 py-3 hover:shadow-md transition bg-white"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-300 text-xs font-mono w-5 text-right shrink-0">
                      #{sessions.length - i}
                    </span>
                    <p className="font-medium text-sm">
                      {new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <span className="text-blue-500 text-sm">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
