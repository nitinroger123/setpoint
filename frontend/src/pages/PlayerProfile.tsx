import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'

interface PlayerProfileData {
  player: { id: string; name: string; phone?: string; email?: string }
  overall: {
    sessions: number; wins: number; games: number
    first: number; second: number; third: number; fourth: number; win_pct: number
  }
  history: {
    session_id: string; date: string; series_name: string
    series_id: string | null; place: number; total_wins: number; total_diff: number
  }[]
}

interface TeammateStat {
  id: string; name: string; games: number; wins: number; losses: number; win_pct: number
}

const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅' }

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PlayerProfileData | null>(null)
  const [teammates, setTeammates] = useState<{ most_played: TeammateStat[]; top_teammates: TeammateStat[]; worst_teammates: TeammateStat[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get(`/api/players/${id}/profile`),
      api.get(`/api/players/${id}/teammate-stats`),
    ])
      .then(([profileRes, teammateRes]) => {
        setData(profileRes.data)
        setTeammates(teammateRes.data)
        setLoading(false)
      })
      .catch(() => { setError('Could not load player profile.'); setLoading(false) })
  }, [id])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>
  if (!data) return null

  const { player, overall, history } = data
  const mostPlayed = teammates?.most_played ?? []
  const topTeammates = teammates?.top_teammates ?? []
  const worstTeammates = teammates?.worst_teammates ?? []

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <Link to={-1 as any} className="text-blue-500 hover:underline text-sm mb-4 block">← Back</Link>
        <h1 className="text-3xl font-bold">{player.name}</h1>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Sessions', value: overall.sessions },
          { label: 'Win %', value: `${overall.win_pct}%` },
          { label: 'Podium Finishes', value: overall.first + overall.second + overall.third + overall.fourth },
          { label: '🥇 Wins', value: overall.first },
        ].map(stat => (
          <div key={stat.label} className="border rounded-xl p-4 bg-white text-center">
            <p className="text-2xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Podium breakdown */}
      <div className="border rounded-xl p-4 bg-white flex gap-6 justify-center">
        {[
          { medal: '🥇', label: '1st', count: overall.first },
          { medal: '🥈', label: '2nd', count: overall.second },
          { medal: '🥉', label: '3rd', count: overall.third },
          { medal: '🏅', label: '4th', count: overall.fourth },
        ].map(p => (
          <div key={p.label} className="text-center px-6">
            <p className="text-2xl">{p.medal}</p>
            <p className="text-xl font-bold">{p.count}</p>
            <p className="text-xs text-gray-400">{p.label} place</p>
          </div>
        ))}
      </div>

      {/* Teammate chemistry */}
      {(topTeammates.length > 0 || worstTeammates.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {topTeammates.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-1">Best Teammates</h2>
              <p className="text-sm text-gray-400 mb-3">Highest win % together (min 8 games)</p>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Player</th>
                      <th className="px-4 py-3 text-center">Games</th>
                      <th className="px-4 py-3 text-center">Wins</th>
                      <th className="px-4 py-3 text-center">Win %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {topTeammates.map(t => (
                      <tr key={t.id} className="bg-white hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">
                          <a href={`/players/${t.id}`} className="text-blue-500 hover:underline">{t.name}</a>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">{t.games}</td>
                        <td className="px-4 py-3 text-center text-green-600 font-medium">{t.wins}</td>
                        <td className="px-4 py-3 text-center font-medium text-green-600">{t.win_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {worstTeammates.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-1">Tough Pairings</h2>
              <p className="text-sm text-gray-400 mb-3">Lowest win % together (min 8 games)</p>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Player</th>
                      <th className="px-4 py-3 text-center">Games</th>
                      <th className="px-4 py-3 text-center">Losses</th>
                      <th className="px-4 py-3 text-center">Win %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {worstTeammates.map(t => (
                      <tr key={t.id} className="bg-white hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">
                          <a href={`/players/${t.id}`} className="text-blue-500 hover:underline">{t.name}</a>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">{t.games}</td>
                        <td className="px-4 py-3 text-center text-red-500 font-medium">{t.losses}</td>
                        <td className="px-4 py-3 text-center font-medium text-red-500">{t.win_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session history + Teammate history side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session history */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Session History</h2>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Series</th>
                  <th className="px-4 py-3 text-center">Place</th>
                  <th className="px-4 py-3 text-center">Wins</th>
                  <th className="px-4 py-3 text-center">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map(h => (
                  <tr key={h.session_id} className="bg-white hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/sessions/${h.session_id}`} className="text-blue-500 hover:underline">
                        {new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{h.series_name}</td>
                    <td className="px-4 py-3 text-center font-medium">{medals[h.place] || h.place}</td>
                    <td className="px-4 py-3 text-center">{h.total_wins}</td>
                    <td className={`px-4 py-3 text-center font-medium ${h.total_diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {h.total_diff > 0 ? '+' : ''}{h.total_diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Teammate history */}
        {mostPlayed.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-3">Teammate History</h2>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Player</th>
                    <th className="px-4 py-3 text-center">Games</th>
                    <th className="px-4 py-3 text-center">Wins</th>
                    <th className="px-4 py-3 text-center">Win %</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mostPlayed.map(t => (
                    <tr key={t.id} className="bg-white hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">
                        <a href={`/players/${t.id}`} className="text-blue-500 hover:underline">{t.name}</a>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{t.games}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{t.wins}</td>
                      <td className={`px-4 py-3 text-center font-medium ${t.win_pct >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                        {t.win_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
