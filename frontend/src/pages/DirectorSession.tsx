import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import directorApi from '../lib/directorApi'

interface Player {
  id: string
  name: string
  gender: 'm' | 'f' | null
}

interface TeamAssignments {
  Aces: Player[]
  Kings: Player[]
  Queens: Player[]
}

interface SessionData {
  id: string
  date: string
  status: string
  tournament_series: { name: string } | null
  roster: Player[]
  assignments: Record<number, TeamAssignments>
}

const ROUNDS = [1, 2, 3, 4]
const TEAMS = ['Aces', 'Kings', 'Queens'] as const

const GENDER_LABEL: Record<string, string> = { m: 'M', f: 'F' }
const GENDER_COLOR: Record<string, string> = {
  m: 'bg-blue-100 text-blue-700',
  f: 'bg-pink-100 text-pink-700',
}

export default function DirectorSession() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [addPlayerId, setAddPlayerId] = useState('')
  const [assigning, setAssigning] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeRound, setActiveRound] = useState(1)

  useEffect(() => {
    Promise.all([
      directorApi.get(`/api/director/sessions/${id}`),
      api.get('/api/players/'),
    ]).then(([sessRes, playersRes]) => {
      setSession(sessRes.data)
      setAllPlayers(playersRes.data)
      setLoading(false)
    })
  }, [id])

  // Players not yet in the roster
  const rosterIds = new Set(session?.roster.map(p => p.id) ?? [])
  const available = allPlayers.filter(p => !rosterIds.has(p.id))

  async function addPlayer() {
    if (!addPlayerId || !session) return
    await directorApi.post(`/api/director/sessions/${session.id}/roster`, {
      player_id: addPlayerId,
    })
    const player = allPlayers.find(p => p.id === addPlayerId)!
    setSession(s => s ? { ...s, roster: [...s.roster, player] } : s)
    setAddPlayerId('')
  }

  async function removePlayer(playerId: string) {
    if (!session) return
    await directorApi.delete(`/api/director/sessions/${session.id}/roster/${playerId}`)
    setSession(s => s ? { ...s, roster: s.roster.filter(p => p.id !== playerId) } : s)
  }

  async function setGender(player: Player, gender: 'm' | 'f') {
    // Toggle: clicking the same gender clears it
    const newGender = player.gender === gender ? null : gender
    await directorApi.put(`/api/director/players/${player.id}/gender`, { gender: newGender })
    // Update in roster
    setSession(s => s ? {
      ...s,
      roster: s.roster.map(p => p.id === player.id ? { ...p, gender: newGender } : p),
    } : s)
    // Update in allPlayers so it persists if they're re-added
    setAllPlayers(prev => prev.map(p => p.id === player.id ? { ...p, gender: newGender } : p))
  }

  async function assignTeams(round: number) {
    if (!session) return
    setAssigning(round)
    setError(null)
    try {
      await directorApi.post(`/api/director/sessions/${session.id}/rounds/${round}/assign-teams`)
      // Reload session to get fresh assignments
      const res = await directorApi.get(`/api/director/sessions/${session.id}`)
      setSession(res.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Assignment failed')
    } finally {
      setAssigning(null)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!session) return <div className="p-8 text-center">Session not found</div>

  const men = session.roster.filter(p => p.gender === 'm')
  const women = session.roster.filter(p => p.gender === 'f')
  const ungenderered = session.roster.filter(p => !p.gender)
  const canAssign = men.length === 6 && women.length === 6

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <Link to="/director" className="text-blue-500 hover:underline text-sm mb-4 block">← Back to Director</Link>
        <h1 className="text-3xl font-bold">
          {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </h1>
        {session.tournament_series && (
          <p className="text-gray-500">{session.tournament_series.name}</p>
        )}
      </div>

      {/* ── Roster ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Roster</h2>
          <div className="text-sm text-gray-500">
            <span className="text-blue-600 font-medium">{men.length}M</span>
            {' / '}
            <span className="text-pink-600 font-medium">{women.length}F</span>
            {ungenderered.length > 0 && (
              <span className="text-orange-500 ml-1">· {ungenderered.length} unset</span>
            )}
            {' · '}{session.roster.length} total
          </div>
        </div>

        {/* Add player */}
        <div className="flex gap-2 mb-4">
          <select
            value={addPlayerId}
            onChange={e => setAddPlayerId(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Add a player…</option>
            {available.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={addPlayer}
            disabled={!addPlayerId}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {/* Player list */}
        {session.roster.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border rounded-xl">No players yet</div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-center">Gender</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {session.roster.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <tr key={p.id} className="bg-white">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        {(['m', 'f'] as const).map(g => (
                          <button
                            key={g}
                            onClick={() => setGender(p, g)}
                            className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                              p.gender === g
                                ? GENDER_COLOR[g] + ' border-transparent'
                                : 'text-gray-300 border-gray-200 hover:border-gray-400 hover:text-gray-500'
                            }`}
                          >
                            {GENDER_LABEL[g]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removePlayer(p.id)}
                        className="text-gray-300 hover:text-red-500 text-xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Readiness hint */}
        {!canAssign && session.roster.length > 0 && (
          <p className="text-sm text-orange-500 mt-2">
            {ungenderered.length > 0
              ? `Set gender for ${ungenderered.length} player${ungenderered.length > 1 ? 's' : ''} before assigning teams.`
              : `Need 6M + 6F to assign teams (have ${men.length}M / ${women.length}F).`}
          </p>
        )}
      </div>

      {/* ── Team Assignments ── */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Team Assignments</h2>

        {/* Round tabs */}
        <div className="flex gap-1 mb-4 border-b">
          {ROUNDS.map(r => (
            <button
              key={r}
              onClick={() => setActiveRound(r)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeRound === r
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Round {r}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {session.assignments[activeRound]
              ? 'Teams assigned — click below to reshuffle.'
              : 'No teams assigned yet for this round.'}
          </p>
          <button
            onClick={() => assignTeams(activeRound)}
            disabled={!canAssign || assigning === activeRound}
            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40"
          >
            {assigning === activeRound
              ? 'Assigning…'
              : session.assignments[activeRound]
              ? 'Reshuffle'
              : 'Assign Teams'}
          </button>
        </div>

        {session.assignments[activeRound] ? (
          <div className="grid grid-cols-3 gap-4">
            {TEAMS.map(team => (
              <div key={team} className="border rounded-xl overflow-hidden">
                <div className={`px-4 py-2 font-semibold text-sm text-center ${
                  team === 'Aces'   ? 'bg-yellow-50 text-yellow-700' :
                  team === 'Kings'  ? 'bg-blue-50 text-blue-700' :
                                      'bg-purple-50 text-purple-700'
                }`}>
                  {team}
                </div>
                <ul className="divide-y">
                  {session.assignments[activeRound][team].map(p => (
                    <li key={p.id} className="px-4 py-2.5 flex items-center justify-between bg-white text-sm">
                      <span className="font-medium">{p.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${GENDER_COLOR[p.gender ?? ''] ?? ''}`}>
                        {p.gender?.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="border rounded-xl py-12 text-center text-gray-400">
            {canAssign
              ? 'Press "Assign Teams" to randomly assign players.'
              : 'Add 6 men and 6 women with gender set to enable assignment.'}
          </div>
        )}
      </div>
    </div>
  )
}
