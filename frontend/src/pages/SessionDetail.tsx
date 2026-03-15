import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import type { Session, GameResult } from '../types'

function getPlayerSummary(results: GameResult[]) {
  const byPlayer: Record<string, {
    name: string, wins: number, diff: number, place: number, games: GameResult[]
  }> = {}

  for (const r of results) {
    const key = r.player_id
    if (!byPlayer[key]) {
      byPlayer[key] = { name: (r as any).players?.name || 'Unknown', wins: r.total_wins, diff: r.total_diff, place: r.place, games: [] }
    }
    byPlayer[key].games.push(r)
  }

  const players = Object.values(byPlayer).sort((a, b) => a.place - b.place)
  // Sort each player's games by round then game number
  for (const p of players) {
    p.games.sort((a, b) => a.round_number !== b.round_number ? a.round_number - b.round_number : a.game_number - b.game_number)
  }
  return players
}

// Detect how many rounds/games exist in data
function getRoundGameKeys(players: ReturnType<typeof getPlayerSummary>) {
  const keys = new Set<string>()
  for (const p of players) {
    for (const g of p.games) {
      keys.add(`${g.round_number}-${g.game_number}`)
    }
  }
  return [...keys].sort()
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/sessions/${id}`).then(res => {
      setSession(res.data)
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!session) return <div className="p-8 text-center">Session not found</div>

  const players = getPlayerSummary(session.results || [])
  const roundGameKeys = getRoundGameKeys(players)
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅' }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div>
        <Link to="/tournaments" className="text-blue-500 hover:underline text-sm mb-4 block">← Back to Tournaments</Link>
        <h1 className="text-3xl font-bold mb-1">
          {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </h1>
        <p className="text-gray-500 capitalize">{session.format_id?.replace(/-/g, ' ')}</p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-3">Standings</h2>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Place</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-center">Wins</th>
                <th className="px-4 py-3 text-center">Point Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {players.map(p => (
                <tr key={p.name} className={p.place <= 4 ? 'bg-yellow-50' : 'bg-white'}>
                  <td className="px-4 py-3 font-medium">{medals[p.place] || p.place}</td>
                  <td className="px-4 py-3 font-semibold">{p.name}</td>
                  <td className="px-4 py-3 text-center">{p.wins}</td>
                  <td className={`px-4 py-3 text-center font-medium ${p.diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {p.diff > 0 ? '+' : ''}{p.diff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {roundGameKeys.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Round-by-Round Results</h2>
          <div className="border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left sticky left-0 bg-gray-50">Player</th>
                  {roundGameKeys.map(key => {
                    const [r, g] = key.split('-')
                    return (
                      <th key={key} className="px-3 py-3 text-center whitespace-nowrap">
                        R{r} G{g}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {players.map((p, i) => {
                  const gameByKey: Record<string, GameResult> = {}
                  for (const g of p.games) {
                    gameByKey[`${g.round_number}-${g.game_number}`] = g
                  }
                  return (
                    <tr key={p.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 font-semibold sticky left-0 bg-inherit whitespace-nowrap">
                        {medals[p.place] && <span className="mr-1">{medals[p.place]}</span>}
                        {p.name}
                      </td>
                      {roundGameKeys.map(key => {
                        const g = gameByKey[key]
                        if (!g) return <td key={key} className="px-3 py-3 text-center text-gray-300">—</td>
                        const win = g.point_diff > 0
                        const lose = g.point_diff < 0
                        return (
                          <td
                            key={key}
                            className={`px-3 py-3 text-center font-medium ${win ? 'text-green-600' : lose ? 'text-red-500' : 'text-gray-400'}`}
                          >
                            {g.point_diff > 0 ? '+' : ''}{g.point_diff}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
