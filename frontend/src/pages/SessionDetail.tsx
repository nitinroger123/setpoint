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

  return Object.values(byPlayer).sort((a, b) => a.place - b.place)
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
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅' }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link to="/sessions" className="text-blue-500 hover:underline text-sm mb-4 block">← Back to Tournaments</Link>
      <h1 className="text-3xl font-bold mb-1">
        {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}
      </h1>
      <p className="text-gray-500 mb-6 capitalize">{session.format_id?.replace(/-/g, ' ')}</p>

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
  )
}
