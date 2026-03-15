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

interface RoundGame {
  id: string
  round_number: number
  game_number: number
  team_a: string
  team_b: string
  score_a: number | null
  score_b: number | null
}

interface LiveStanding {
  id: string
  name: string
  wins: number
  diff: number
  place: number
}

interface SessionData {
  id: string
  date: string
  status: string
  tournament_series: { name: string } | null
  roster: Player[]
  assignments: Record<number, TeamAssignments>
  round_games: RoundGame[]
  live_standings: LiveStanding[]
}

const ROUNDS = [1, 2, 3, 4]
const TEAMS = ['Aces', 'Kings', 'Queens'] as const

// Fixed G1 opener per round and which team sits G1 (plays G2 + G3)
const ROUND_SCHEDULE: Record<number, { g1: [string, string]; waiting: string }> = {
  1: { g1: ['Aces', 'Kings'],   waiting: 'Queens' },
  2: { g1: ['Aces', 'Queens'],  waiting: 'Kings'  },
  3: { g1: ['Kings', 'Queens'], waiting: 'Aces'   },
  4: { g1: ['Aces', 'Kings'],   waiting: 'Queens' },
}

const GENDER_COLOR: Record<string, string> = {
  m: 'bg-blue-100 text-blue-700',
  f: 'bg-pink-100 text-pink-700',
}

const TEAM_STYLE: Record<string, string> = {
  Aces:   'bg-yellow-50 text-yellow-700',
  Kings:  'bg-blue-50 text-blue-700',
  Queens: 'bg-purple-50 text-purple-700',
}

// ── Score entry card for one game ─────────────────────────────────────────────

function GameCard({
  game,
  sessionId,
  onScored,
}: {
  game: RoundGame | null
  sessionId: string
  gameNumber: number
  roundNumber: number
  onScored: (standings: LiveStanding[]) => void
}) {
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)

  // Reset inputs when game changes
  useEffect(() => {
    setEditing(false)
    setScoreA(game?.score_a != null ? String(game.score_a) : '')
    setScoreB(game?.score_b != null ? String(game.score_b) : '')
  }, [game?.id, game?.score_a, game?.score_b])

  if (!game) {
    return (
      <div className="border rounded-xl px-4 py-3 bg-gray-50 text-sm text-gray-400 text-center">
        Game {game === null ? '—' : ''} · waiting for Game 1 result
      </div>
    )
  }

  const isScored = game.score_a != null && game.score_b != null
  const winner = isScored
    ? (game.score_a! > game.score_b! ? game.team_a : game.team_b)
    : null

  async function submit() {
    const sa = parseInt(scoreA)
    const sb_ = parseInt(scoreB)
    if (isNaN(sa) || isNaN(sb_) || sa === sb_) return
    setSubmitting(true)
    try {
      const res = await directorApi.post(
        `/api/director/sessions/${sessionId}/rounds/${game.round_number}/games/${game.game_number}/score`,
        { score_a: sa, score_b: sb_ }
      )
      onScored(res.data)
      setEditing(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function clearScore() {
    await directorApi.delete(
      `/api/director/sessions/${sessionId}/rounds/${game.round_number}/games/${game.game_number}/score`
    )
    onScored([]) // signal refresh needed
    setScoreA('')
    setScoreB('')
    setEditing(false)
  }

  return (
    <div className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase font-medium">Game {game.game_number}</span>
        {isScored && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-blue-500 hover:underline">Edit</button>
        )}
      </div>

      {/* Team name headers */}
      <div className="flex items-center gap-2">
        <span className={`flex-1 text-center text-sm font-semibold px-2 py-1 rounded-lg ${TEAM_STYLE[game.team_a]}`}>
          {game.team_a} {winner === game.team_a && '✓'}
        </span>
        <span className="text-gray-400 text-xs">vs</span>
        <span className={`flex-1 text-center text-sm font-semibold px-2 py-1 rounded-lg ${TEAM_STYLE[game.team_b]}`}>
          {game.team_b} {winner === game.team_b && '✓'}
        </span>
      </div>

      {/* Score display or entry */}
      {isScored && !editing ? (
        <div className="flex items-center gap-2">
          <span className={`flex-1 text-center text-2xl font-bold ${winner === game.team_a ? 'text-green-600' : 'text-gray-400'}`}>
            {game.score_a}
          </span>
          <span className="text-gray-300">–</span>
          <span className={`flex-1 text-center text-2xl font-bold ${winner === game.team_b ? 'text-green-600' : 'text-gray-400'}`}>
            {game.score_b}
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={scoreA}
              onChange={e => setScoreA(e.target.value)}
              placeholder="0"
              className="flex-1 border rounded-lg px-3 py-2 text-center text-lg font-bold"
            />
            <span className="text-gray-300">–</span>
            <input
              type="number"
              value={scoreB}
              onChange={e => setScoreB(e.target.value)}
              placeholder="0"
              className="flex-1 border rounded-lg px-3 py-2 text-center text-lg font-bold"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={submitting || !scoreA || !scoreB || scoreA === scoreB}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Save Score'}
            </button>
            {(editing || isScored) && (
              <button onClick={clearScore} className="px-3 py-2 text-sm text-red-400 hover:text-red-600 border rounded-lg">
                Clear
              </button>
            )}
            {editing && (
              <button onClick={() => setEditing(false)} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 border rounded-lg">
                Cancel
              </button>
            )}
          </div>
          {scoreA === scoreB && scoreA !== '' && (
            <p className="text-xs text-red-500 text-center">Scores cannot be equal (no ties)</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DirectorSession() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [addPlayerId, setAddPlayerId] = useState('')
  const [assigning, setAssigning] = useState<number | null>(null)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRound, setActiveRound] = useState(1)

  async function reload() {
    const res = await directorApi.get(`/api/director/sessions/${id}`)
    setSession(res.data)
  }

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

  const rosterIds = new Set(session?.roster.map(p => p.id) ?? [])
  const available = allPlayers.filter(p => !rosterIds.has(p.id))

  async function addPlayer() {
    if (!addPlayerId || !session) return
    await directorApi.post(`/api/director/sessions/${session.id}/roster`, { player_id: addPlayerId })
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
    const newGender = player.gender === gender ? null : gender
    await directorApi.put(`/api/director/players/${player.id}/gender`, { gender: newGender })
    setSession(s => s ? { ...s, roster: s.roster.map(p => p.id === player.id ? { ...p, gender: newGender } : p) } : s)
    setAllPlayers(prev => prev.map(p => p.id === player.id ? { ...p, gender: newGender } : p))
  }

  async function assignTeams(round: number) {
    if (!session) return
    setAssigning(round)
    setError(null)
    try {
      await directorApi.post(`/api/director/sessions/${session.id}/rounds/${round}/assign-teams`)
      await reload()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Assignment failed')
    } finally {
      setAssigning(null)
    }
  }

  async function activateSession() {
    if (!session) return
    setActivating(true)
    setError(null)
    try {
      await directorApi.post(`/api/director/sessions/${session.id}/activate`)
      await reload()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Activation failed')
    } finally {
      setActivating(false)
    }
  }

  function handleScored(standings: LiveStanding[]) {
    // If standings returned, update live_standings; otherwise do a full reload
    if (standings.length > 0) {
      setSession(s => s ? { ...s, live_standings: standings } : s)
      reload() // also reload to get updated round_games (G2/G3 matchups)
    } else {
      reload()
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!session) return <div className="p-8 text-center">Session not found</div>

  const men        = session.roster.filter(p => p.gender === 'm')
  const women      = session.roster.filter(p => p.gender === 'f')
  const ungendered = session.roster.filter(p => !p.gender)
  const canAssign  = men.length === 6 && women.length === 6
  const r1Assigned = !!session.assignments[1]
  const isDraft    = session.status === 'draft'
  const isActive   = session.status === 'active'

  // Build a lookup for round_games: (round, game) -> RoundGame
  const gameMap: Record<string, RoundGame> = {}
  for (const g of session.round_games ?? []) {
    gameMap[`${g.round_number}-${g.game_number}`] = g
  }

  // For each round, determine G2/G3 entries (null = not yet available)
  function gamesForRound(round: number): [RoundGame, RoundGame | null, RoundGame | null] {
    const g1 = gameMap[`${round}-1`] ?? {
      id: '', round_number: round, game_number: 1,
      team_a: ROUND_SCHEDULE[round].g1[0],
      team_b: ROUND_SCHEDULE[round].g1[1],
      score_a: null, score_b: null,
    }
    const g2 = gameMap[`${round}-2`] ?? null
    const g3 = gameMap[`${round}-3`] ?? null
    return [g1, g2, g3]
  }

  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅' }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <Link to="/director" className="text-blue-500 hover:underline text-sm mb-4 block">← Back to Director</Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </h1>
            {session.tournament_series && <p className="text-gray-500">{session.tournament_series.name}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-sm font-medium px-3 py-1 rounded-full capitalize ${
              isActive ? 'bg-green-100 text-green-700' :
              session.status === 'completed' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {isActive ? '🟢 Live' : session.status}
            </span>
            {isDraft && r1Assigned && (
              <button
                onClick={activateSession}
                disabled={activating}
                className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {activating ? 'Starting…' : 'Start Session'}
              </button>
            )}
          </div>
        </div>
        {isDraft && !r1Assigned && (
          <p className="text-sm text-orange-500 mt-2">Assign Round 1 teams to enable starting the session.</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* ── Live Standings (active sessions only) ── */}
      {isActive && session.live_standings.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Live Standings</h2>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Place</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-center">Wins</th>
                  <th className="px-4 py-3 text-center">Point Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {session.live_standings.map(p => (
                  <tr key={p.id} className={p.place <= 4 ? 'bg-yellow-50' : 'bg-white'}>
                    <td className="px-4 py-3 font-medium">{medals[p.place] || p.place}</td>
                    <td className="px-4 py-3 font-semibold">{p.name}</td>
                    <td className="px-4 py-3 text-center">{p.wins}</td>
                    <td className={`px-4 py-3 text-center font-medium ${p.diff > 0 ? 'text-green-600' : p.diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {p.diff > 0 ? '+' : ''}{p.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Roster ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Roster</h2>
          <div className="text-sm text-gray-500">
            <span className="text-blue-600 font-medium">{men.length}M</span>
            {' / '}
            <span className="text-pink-600 font-medium">{women.length}F</span>
            {ungendered.length > 0 && <span className="text-orange-500 ml-1">· {ungendered.length} unset</span>}
            {' · '}{session.roster.length} total
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <select value={addPlayerId} onChange={e => setAddPlayerId(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm">
            <option value="">Add a player…</option>
            {available.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={addPlayer} disabled={!addPlayerId} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            Add
          </button>
        </div>

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
                {[...session.roster].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <tr key={p.id} className="bg-white">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        {(['m', 'f'] as const).map(g => (
                          <button key={g} onClick={() => setGender(p, g)}
                            className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                              p.gender === g ? GENDER_COLOR[g] + ' border-transparent' : 'text-gray-300 border-gray-200 hover:border-gray-400 hover:text-gray-500'
                            }`}
                          >
                            {g.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removePlayer(p.id)} className="text-gray-300 hover:text-red-500 text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!canAssign && session.roster.length > 0 && (
          <p className="text-sm text-orange-500 mt-2">
            {ungendered.length > 0
              ? `Set gender for ${ungendered.length} player${ungendered.length > 1 ? 's' : ''} before assigning teams.`
              : `Need 6M + 6F to assign teams (have ${men.length}M / ${women.length}F).`}
          </p>
        )}
      </div>

      {/* ── Rounds: Teams + Scoring ── */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Rounds</h2>

        <div className="flex gap-1 mb-4 border-b">
          {ROUNDS.map(r => (
            <button key={r} onClick={() => setActiveRound(r)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeRound === r ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Round {r}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {session.assignments[activeRound] ? 'Teams assigned' : 'No teams assigned yet'}
          </p>
          <button
            onClick={() => assignTeams(activeRound)}
            disabled={!canAssign || assigning === activeRound}
            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40"
          >
            {assigning === activeRound ? 'Assigning…' : session.assignments[activeRound] ? 'Reshuffle' : 'Assign Teams'}
          </button>
        </div>

        {/* Team assignment grid */}
        {session.assignments[activeRound] ? (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {TEAMS.map(team => (
              <div key={team} className="border rounded-xl overflow-hidden">
                <div className={`px-4 py-2 font-semibold text-sm text-center ${TEAM_STYLE[team]}`}>{team}</div>
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
          <div className="border rounded-xl py-8 text-center text-gray-400 mb-6">
            {canAssign ? 'Press "Assign Teams" to randomly assign players.' : 'Add 6 men and 6 women with gender set.'}
          </div>
        )}

        {/* Scoring (active sessions only) */}
        {isActive && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Scores</h3>
            <div className="grid gap-3">
              {gamesForRound(activeRound).map((game, idx) => (
                <GameCard
                  key={game ? game.id || `${activeRound}-${idx + 1}` : `tbd-${idx}`}
                  game={game}
                  gameNumber={idx + 1}
                  roundNumber={activeRound}
                  sessionId={session.id}
                  onScored={handleScored}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
