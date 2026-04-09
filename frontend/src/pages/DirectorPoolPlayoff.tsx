/**
 * DirectorPoolPlayoff — full director workflow for pool play + single-elimination sessions.
 *
 * Tab-based layout:
 *   Setup   — pool config (teams_per_pool, teams_advancing) + scoring rules per stage
 *   Teams   — register teams, add players, set seeds, assign pools
 *   Pool Play — score pool games, see live standings
 *   Bracket  — generate bracket, score bracket games, view bracket tree
 *
 * Tabs unlock progressively as the session advances through its lifecycle.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import directorApi from '../lib/directorApi'
import api from '../lib/api'
import type {
  SessionTeam,
  PoolGame,
  PlayInGame,
  BracketGame,
  SessionPoolConfig,
  StageScoringRule,
  PoolStandingsRow,
} from '../types'
import PoolStandingsTable from '../components/PoolStandingsTable'
import BracketView from '../components/BracketView'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PoolSession {
  id: string
  date: string
  status: string
  tournament_series?: { name: string; game_format_id?: string }
  teams: SessionTeam[]
  pool_config: SessionPoolConfig | null
  scoring_rules: StageScoringRule[]
  pool_games: PoolGame[]
  play_in_games: PlayInGame[]
  bracket_games: BracketGame[]
}

interface PlayerSearchResult { id: string; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildTeamMap(teams: SessionTeam[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const t of teams) map[t.id] = t.name
  return map
}

// ── Setup Tab ─────────────────────────────────────────────────────────────────

function SetupTab({
  session,
  onRefresh,
}: {
  session: PoolSession
  onRefresh: () => void
}) {
  const config  = session.pool_config
  const [teamsPerPool,   setTeamsPerPool]   = useState(config?.teams_per_pool ?? 4)
  const [teamsAdvancing, setTeamsAdvancing] = useState(config?.teams_advancing_per_pool ?? 2)
  const [saving, setSaving] = useState(false)

  async function savePoolConfig(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await directorApi.put(`/api/director/pool/${session.id}/config`, {
        teams_per_pool:           teamsPerPool,
        teams_advancing_per_pool: teamsAdvancing,
      })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Pool config */}
      <div className="border rounded-xl p-5 bg-white space-y-4">
        <h3 className="font-semibold text-lg">Pool Configuration</h3>
        <form onSubmit={savePoolConfig} className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Teams per Pool</label>
            <input
              type="number"
              min={2}
              value={teamsPerPool}
              onChange={e => setTeamsPerPool(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 w-28"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Teams Advancing per Pool</label>
            <input
              type="number"
              min={1}
              max={teamsPerPool - 1}
              value={teamsAdvancing}
              onChange={e => setTeamsAdvancing(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 w-28"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-light disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>

      {/* Scoring rules per stage */}
      <div className="border rounded-xl p-5 bg-white space-y-4">
        <h3 className="font-semibold text-lg">Scoring Rules</h3>
        {session.scoring_rules.length === 0 ? (
          <p className="text-gray-400 text-sm">No scoring rules configured.</p>
        ) : (
          <div className="grid gap-4">
            {session.scoring_rules.map(rule => (
              <StageScoringEditor
                key={rule.stage}
                sessionId={session.id}
                rule={rule}
                onSaved={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Inline editor for a single stage's scoring rule. */
function StageScoringEditor({
  sessionId,
  rule,
  onSaved,
}: {
  sessionId: string
  rule: StageScoringRule
  onSaved: () => void
}) {
  const [sets,    setSets]    = useState(rule.sets_per_match)
  const [pts,     setPts]     = useState(rule.points_to_win)
  const [winBy,   setWinBy]   = useState(rule.win_by)
  const [cap,     setCap]     = useState<number | ''>(rule.cap ?? '')
  const [saving,  setSaving]  = useState(false)

  const STAGE_LABEL: Record<string, string> = {
    pool:          'Pool Play',
    playoff:       'Playoff',
    playoff_final: 'Final',
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await directorApi.put(`/api/director/pool/${sessionId}/scoring/${rule.stage}`, {
        sets_per_match: sets,
        points_to_win:  pts,
        win_by:         winBy,
        cap:            cap === '' ? null : Number(cap),
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="p-4 border rounded-lg space-y-3">
      <p className="font-medium text-sm">{STAGE_LABEL[rule.stage] ?? rule.stage}</p>
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Sets per Match</label>
          <input type="number" min={1} value={sets} onChange={e => setSets(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Points to Win</label>
          <input type="number" min={1} value={pts} onChange={e => setPts(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Win By</label>
          <input type="number" min={1} value={winBy} onChange={e => setWinBy(Number(e.target.value))}
            className="border rounded px-2 py-1 w-16 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Cap (blank = none)</label>
          <input type="number" value={cap} onChange={e => setCap(e.target.value === '' ? '' : Number(e.target.value))}
            className="border rounded px-2 py-1 w-20 text-sm" placeholder="none" />
        </div>
      </div>
      <button type="submit" disabled={saving} className="text-sm bg-primary/10 text-primary font-medium px-3 py-1 rounded hover:bg-primary/20 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

// ── Teams Tab ─────────────────────────────────────────────────────────────────

function TeamsTab({
  session,
  onRefresh,
}: {
  session: PoolSession
  onRefresh: () => void
}) {
  const [newTeamName, setNewTeamName]   = useState('')
  const [newTeamSeed, setNewTeamSeed]   = useState<number | ''>('')
  const [creating, setCreating]         = useState(false)
  const [assigning, setAssigning]       = useState(false)
  const [playerSearch, setPlayerSearch] = useState<Record<string, string>>({})
  const [playerResults, setPlayerResults] = useState<Record<string, PlayerSearchResult[]>>({})
  const [activatingPools, setActivatingPools] = useState(false)

  async function createTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!newTeamName.trim()) return
    setCreating(true)
    try {
      await directorApi.post(`/api/director/pool/${session.id}/teams`, {
        name: newTeamName.trim(),
        seed: newTeamSeed === '' ? null : Number(newTeamSeed),
      })
      setNewTeamName('')
      setNewTeamSeed('')
      onRefresh()
    } finally {
      setCreating(false)
    }
  }

  async function deleteTeam(teamId: string) {
    if (!window.confirm('Remove this team from the tournament? This cannot be undone.')) return
    await directorApi.delete(`/api/director/pool/${session.id}/teams/${teamId}`)
    onRefresh()
  }

  async function searchPlayers(teamId: string, query: string) {
    setPlayerSearch(prev => ({ ...prev, [teamId]: query }))
    if (query.length < 2) {
      setPlayerResults(prev => ({ ...prev, [teamId]: [] }))
      return
    }
    const res = await api.get(`/api/players?search=${encodeURIComponent(query)}`)
    setPlayerResults(prev => ({ ...prev, [teamId]: res.data }))
  }

  async function addPlayerToTeam(teamId: string, playerId: string) {
    await directorApi.post(`/api/director/pool/${session.id}/teams/${teamId}/players`, {
      player_id: playerId,
    })
    setPlayerSearch(prev => ({ ...prev, [teamId]: '' }))
    setPlayerResults(prev => ({ ...prev, [teamId]: [] }))
    onRefresh()
  }

  async function removePlayerFromTeam(teamId: string, playerId: string) {
    if (!window.confirm('Remove this player from the team?')) return
    await directorApi.delete(`/api/director/pool/${session.id}/teams/${teamId}/players/${playerId}`)
    onRefresh()
  }

  async function setTeamPool(teamId: string, pool: string) {
    await directorApi.put(`/api/director/pool/${session.id}/teams/${teamId}/pool`, { pool })
    onRefresh()
  }

  async function autoAssignPools() {
    setAssigning(true)
    try {
      await directorApi.post(`/api/director/pool/${session.id}/assign-pools`)
      onRefresh()
    } finally {
      setAssigning(false)
    }
  }

  async function activateSession() {
    setActivatingPools(true)
    try {
      await directorApi.post(`/api/director/pool/${session.id}/activate`)
      onRefresh()
    } finally {
      setActivatingPools(false)
    }
  }

  const poolLabels = ['A', 'B', 'C', 'D', 'E', 'F']

  return (
    <div className="space-y-6">
      {/* Add team form */}
      {session.status === 'draft' && (
        <form onSubmit={createTeam} className="border rounded-xl p-5 bg-white space-y-3">
          <h3 className="font-semibold text-lg">Add Team</h3>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Team name"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              className="border rounded-lg px-3 py-2 flex-1 min-w-40"
              required
            />
            <input
              type="number"
              placeholder="Seed (opt)"
              value={newTeamSeed}
              onChange={e => setNewTeamSeed(e.target.value === '' ? '' : Number(e.target.value))}
              className="border rounded-lg px-3 py-2 w-32"
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-light disabled:opacity-50"
            >
              {creating ? 'Adding…' : 'Add Team'}
            </button>
          </div>
        </form>
      )}

      {/* Pool assignment controls */}
      {session.status === 'draft' && session.teams.length > 0 && (
        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={autoAssignPools}
            disabled={assigning}
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            {assigning ? 'Assigning…' : 'Auto-Assign Pools'}
          </button>
          <button
            onClick={activateSession}
            disabled={activatingPools}
            className="bg-primary text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow hover:bg-primary-light disabled:opacity-50"
          >
            {activatingPools ? 'Activating…' : 'Activate Pool Play'}
          </button>
        </div>
      )}

      {/* Team list */}
      {session.teams.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border rounded-xl">No teams registered yet.</div>
      ) : (
        <div className="grid gap-4">
          {session.teams.map(team => (
            <div key={team.id} className="border rounded-xl p-4 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{team.name}</span>
                  {team.seed != null && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">#{team.seed}</span>
                  )}
                  {team.pool && (
                    <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded">Pool {team.pool}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Manual pool assignment dropdown */}
                  {session.status === 'draft' && (
                    <select
                      value={team.pool ?? ''}
                      onChange={e => setTeamPool(team.id, e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      <option value="">— pool —</option>
                      {poolLabels.map(l => <option key={l} value={l}>Pool {l}</option>)}
                    </select>
                  )}
                  {session.status === 'draft' && (
                    <button
                      onClick={() => deleteTeam(team.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Players */}
              <div className="flex flex-wrap gap-2">
                {team.players.map(p => (
                  <div key={p.id} className="flex items-center gap-1 bg-gray-50 rounded-full px-3 py-1 text-sm">
                    <span>{p.name}</span>
                    {session.status === 'draft' && (
                      <button
                        onClick={() => removePlayerFromTeam(team.id, p.id)}
                        className="text-gray-400 hover:text-red-500 ml-1"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add player search */}
              {session.status === 'draft' && (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search players to add…"
                    value={playerSearch[team.id] ?? ''}
                    onChange={e => searchPlayers(team.id, e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm w-full max-w-xs"
                  />
                  {(playerResults[team.id] ?? []).length > 0 && (
                    <div className="absolute top-full left-0 mt-1 bg-white border rounded-xl shadow-lg z-10 w-64 max-h-48 overflow-y-auto">
                      {playerResults[team.id].map(p => (
                        <button
                          key={p.id}
                          onClick={() => addPlayerToTeam(team.id, p.id)}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-cream-light"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pool Play Tab ──────────────────────────────────────────────────────────────

function PoolPlayTab({
  session,
  standings,
  onRefresh,
}: {
  session: PoolSession
  standings: Record<string, PoolStandingsRow[]>
  onRefresh: () => void
}) {
  const teamMap = buildTeamMap(session.teams)
  const teamsAdvancing = session.pool_config?.teams_advancing_per_pool ?? 2
  const poolLabels = [...new Set(session.teams.map(t => t.pool).filter(Boolean) as string[])].sort()

  // Group pool games by pool
  const poolGamesByPool: Record<string, PoolGame[]> = {}
  for (const g of session.pool_games) {
    if (!poolGamesByPool[g.pool]) poolGamesByPool[g.pool] = []
    poolGamesByPool[g.pool].push(g)
  }

  return (
    <div className="space-y-8">
      {/* Standings per pool */}
      {poolLabels.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Pool Standings</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {poolLabels.map(pool => (
              <PoolStandingsTable
                key={pool}
                poolLabel={pool}
                standings={standings[pool] ?? []}
                teamsAdvancing={teamsAdvancing}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pool games per pool */}
      {poolLabels.map(pool => {
        const games = poolGamesByPool[pool] ?? []
        if (!games.length) return null
        return (
          <div key={pool}>
            <h2 className="text-xl font-semibold mb-3">Pool {pool} Games</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {games.map(g => (
                <PoolGameScorer
                  key={g.id}
                  game={g}
                  teamMap={teamMap}
                  sessionId={session.id}
                  scoringRule={session.scoring_rules.find(r => r.stage === 'pool')}
                  onScored={onRefresh}
                  canScore={session.status === 'active'}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Play-in games */}
      {session.play_in_games.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Play-in Games</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {session.play_in_games.map(g => (
              <PlayInScorer
                key={g.id}
                game={g}
                teamMap={teamMap}
                sessionId={session.id}
                onScored={onRefresh}
                canScore={session.status === 'active'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Score entry form for a single pool game. */
function PoolGameScorer({
  game,
  teamMap,
  sessionId,
  scoringRule,
  onScored,
  canScore,
}: {
  game: PoolGame
  teamMap: Record<string, string>
  sessionId: string
  scoringRule?: StageScoringRule
  onScored: () => void
  canScore: boolean
}) {
  const setsPerMatch = scoringRule?.sets_per_match ?? 2
  // Build initial score state: array of [scoreA, scoreB] per set
  const [scores, setScores] = useState<[string, string][]>(
    Array.from({ length: setsPerMatch }, () => ['', ''])
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const teamAName = game.team_a_id ? (teamMap[game.team_a_id] ?? 'Team A') : 'TBD'
  const teamBName = game.team_b_id ? (teamMap[game.team_b_id] ?? 'Team B') : 'TBD'
  const isScored  = game.winner_id !== null

  async function submitScore(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, number> = {}
      for (let i = 0; i < setsPerMatch; i++) {
        body[`set${i + 1}_score_a`] = Number(scores[i][0])
        body[`set${i + 1}_score_b`] = Number(scores[i][1])
      }
      await api.post(`/api/pool/${sessionId}/pool-games/${game.id}/score`, body)
      onScored()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to submit score.')
    } finally {
      setSubmitting(false)
    }
  }

  async function resetScore() {
    if (!window.confirm('Reset this score? The game will need to be re-scored.')) return
    await directorApi.delete(`/api/director/pool/${sessionId}/pool-games/${game.id}/score`)
    onScored()
  }

  return (
    <div className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{teamAName}</span>
        <span className="text-gray-400">vs</span>
        <span>{teamBName}</span>
      </div>

      {isScored ? (
        <div className="space-y-1">
          {[1, 2, 3].map(n => {
            const sa = (game as any)[`set${n}_score_a`]
            const sb = (game as any)[`set${n}_score_b`]
            if (sa === null || sa === undefined) return null
            return (
              <p key={n} className="text-xs text-center text-gray-600">
                Set {n}: <strong>{sa}</strong>–<strong>{sb}</strong>
              </p>
            )
          })}
          <p className="text-xs text-center text-green-600 font-medium">
            Winner: {teamMap[game.winner_id!] ?? '?'}
          </p>
          <button onClick={resetScore} className="text-xs text-red-500 hover:underline block mx-auto">
            Reset score
          </button>
        </div>
      ) : canScore ? (
        <form onSubmit={submitScore} className="space-y-2">
          {scores.map((pair, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8">Set {i + 1}</span>
              <input
                type="number"
                min={0}
                value={pair[0]}
                onChange={e => {
                  const next = [...scores] as [string, string][]
                  next[i] = [e.target.value, pair[1]]
                  setScores(next)
                }}
                placeholder={teamAName.slice(0, 4)}
                className="border rounded px-2 py-1 w-16 text-sm text-center"
                required
              />
              <span className="text-gray-300">–</span>
              <input
                type="number"
                min={0}
                value={pair[1]}
                onChange={e => {
                  const next = [...scores] as [string, string][]
                  next[i] = [pair[0], e.target.value]
                  setScores(next)
                }}
                placeholder={teamBName.slice(0, 4)}
                className="border rounded px-2 py-1 w-16 text-sm text-center"
                required
              />
            </div>
          ))}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-white text-sm font-medium py-1.5 rounded-lg hover:bg-primary-light disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Score'}
          </button>
        </form>
      ) : (
        <p className="text-xs text-center text-gray-400">Not yet scored</p>
      )}
    </div>
  )
}

/** Score entry form for a single play-in game. */
function PlayInScorer({
  game,
  teamMap,
  sessionId,
  onScored,
  canScore,
}: {
  game: PlayInGame
  teamMap: Record<string, string>
  sessionId: string
  onScored: () => void
  canScore: boolean
}) {
  const [scoreA, setScoreA]     = useState('')
  const [scoreB, setScoreB]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const teamAName = game.team_a_id ? (teamMap[game.team_a_id] ?? 'Team A') : 'TBD'
  const teamBName = game.team_b_id ? (teamMap[game.team_b_id] ?? 'Team B') : 'TBD'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post(`/api/pool/${sessionId}/play-in/${game.id}/score`, {
        set1_score_a: Number(scoreA),
        set1_score_b: Number(scoreB),
      })
      onScored()
    } finally {
      setSubmitting(false)
    }
  }

  async function manualOverride(winnerId: string) {
    await directorApi.post(`/api/director/pool/${sessionId}/play-in/${game.id}/override`, {
      winner_id: winnerId,
    })
    onScored()
  }

  const isScored = game.winner_id !== null

  return (
    <div className="border rounded-xl p-4 bg-white border-amber-200 space-y-3">
      <p className="text-xs text-amber-600 font-semibold uppercase">Play-in — Pool {game.pool} Spot {game.playoff_spot}</p>
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{teamAName}</span>
        <span className="text-gray-400">vs</span>
        <span>{teamBName}</span>
      </div>
      {isScored ? (
        <p className="text-xs text-center text-green-600 font-medium">
          Winner: {teamMap[game.winner_id!] ?? '?'}
          {game.director_override && ' (manual)'}
        </p>
      ) : canScore ? (
        <div className="space-y-2">
          <form onSubmit={submit} className="flex items-center gap-2">
            <input type="number" min={0} value={scoreA} onChange={e => setScoreA(e.target.value)}
              className="border rounded px-2 py-1 w-16 text-sm text-center" required />
            <span className="text-gray-300">–</span>
            <input type="number" min={0} value={scoreB} onChange={e => setScoreB(e.target.value)}
              className="border rounded px-2 py-1 w-16 text-sm text-center" required />
            <button type="submit" disabled={submitting}
              className="flex-1 bg-primary text-white text-sm font-medium py-1 rounded-lg hover:bg-primary-light disabled:opacity-50">
              {submitting ? '…' : 'Submit'}
            </button>
          </form>
          <div className="flex gap-2">
            {[game.team_a_id, game.team_b_id].filter(Boolean).map(tid => (
              <button key={tid} onClick={() => manualOverride(tid!)}
                className="flex-1 text-xs border rounded py-1 hover:bg-amber-50 text-amber-700">
                Pick {teamMap[tid!] ?? '?'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Bracket Tab ────────────────────────────────────────────────────────────────

function BracketTab({
  session,
  onRefresh,
}: {
  session: PoolSession
  onRefresh: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [message, setMessage]       = useState<string | null>(null)
  const teamMap = buildTeamMap(session.teams)

  async function generateBracket() {
    setGenerating(true)
    setMessage(null)
    try {
      const res = await directorApi.post(`/api/director/pool/${session.id}/generate-bracket`)
      if (!res.data.ok) {
        setMessage(res.data.message ?? 'Play-in games needed. Score them and try again.')
      } else {
        setMessage(`Bracket generated: ${res.data.num_teams} teams, ${res.data.num_rounds} rounds.`)
        onRefresh()
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.detail ?? 'Failed to generate bracket.')
    } finally {
      setGenerating(false)
    }
  }

  async function completeSession() {
    setCompleting(true)
    try {
      await directorApi.post(`/api/director/pool/${session.id}/complete`)
      onRefresh()
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      {session.status !== 'completed' && (
        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={generateBracket}
            disabled={generating}
            className="bg-white border-2 border-primary/20 text-primary font-medium px-4 py-2 rounded-lg hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          >
            {generating ? 'Generating…' : session.bracket_games.length > 0 ? 'Regenerate Bracket' : 'Generate Bracket'}
          </button>
          {session.bracket_games.length > 0 && (
            <button
              onClick={completeSession}
              disabled={completing}
              className="bg-primary text-white font-semibold px-4 py-2 rounded-lg shadow-sm hover:shadow hover:bg-primary-light disabled:opacity-50"
            >
              {completing ? 'Completing…' : 'Complete Session'}
            </button>
          )}
        </div>
      )}
      {message && <p className="text-sm text-amber-600">{message}</p>}

      {/* Bracket scores */}
      {session.bracket_games.length > 0 && (
        <>
          <BracketView bracketGames={session.bracket_games} teamMap={teamMap} />

          {/* Individual bracket game scorers */}
          {session.status === 'active' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Score Bracket Games</h3>
              {(() => {
                const maxRound = Math.max(...session.bracket_games.map(g => g.round_number))
                const unscored = session.bracket_games.filter(
                  g => !g.winner_id && !g.is_bye && g.team_a_id && g.team_b_id
                )
                return (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {unscored.map(g => (
                      <BracketGameScorer
                        key={g.id}
                        game={g}
                        teamMap={teamMap}
                        sessionId={session.id}
                        scoringRule={
                          g.round_number === maxRound
                            ? session.scoring_rules.find(r => r.stage === 'playoff_final')
                            : session.scoring_rules.find(r => r.stage === 'playoff')
                        }
                        onScored={onRefresh}
                      />
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Score entry form for a single bracket game. */
function BracketGameScorer({
  game,
  teamMap,
  sessionId,
  scoringRule,
  onScored,
}: {
  game: BracketGame
  teamMap: Record<string, string>
  sessionId: string
  scoringRule?: StageScoringRule
  onScored: () => void
}) {
  const setsPerMatch = scoringRule?.sets_per_match ?? 3
  const [scores, setScores] = useState<[string, string][]>(
    Array.from({ length: setsPerMatch }, () => ['', ''])
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const teamAName = game.team_a_id ? (teamMap[game.team_a_id] ?? 'Team A') : 'TBD'
  const teamBName = game.team_b_id ? (teamMap[game.team_b_id] ?? 'Team B') : 'TBD'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, number> = {}
      for (let i = 0; i < setsPerMatch; i++) {
        if (!scores[i][0] || !scores[i][1]) continue  // skip empty trailing sets
        body[`set${i + 1}_score_a`] = Number(scores[i][0])
        body[`set${i + 1}_score_b`] = Number(scores[i][1])
      }
      // Ensure at least set1 is present
      if (!body.set1_score_a && body.set1_score_a !== 0) {
        setError('Set 1 score is required.')
        return
      }
      await api.post(`/api/pool/${sessionId}/bracket/${game.id}/score`, body)
      onScored()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to submit score.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{teamAName}</span>
        <span className="text-gray-400 text-xs">R{game.round_number}</span>
        <span>{teamBName}</span>
      </div>
      <form onSubmit={submit} className="space-y-2">
        {scores.map((pair, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-8">Set {i + 1}</span>
            <input type="number" min={0} value={pair[0]}
              onChange={e => {
                const next = [...scores] as [string, string][]
                next[i] = [e.target.value, pair[1]]
                setScores(next)
              }}
              className="border rounded px-2 py-1 w-16 text-sm text-center" />
            <span className="text-gray-300">–</span>
            <input type="number" min={0} value={pair[1]}
              onChange={e => {
                const next = [...scores] as [string, string][]
                next[i] = [pair[0], e.target.value]
                setScores(next)
              }}
              className="border rounded px-2 py-1 w-16 text-sm text-center" />
          </div>
        ))}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="submit" disabled={submitting}
          className="w-full bg-primary text-white text-sm font-medium py-1.5 rounded-lg hover:bg-primary-light disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

type TabId = 'setup' | 'teams' | 'pool' | 'bracket'

export default function DirectorPoolPlayoff() {
  const { id } = useParams<{ id: string }>()
  const [session,   setSession]   = useState<PoolSession | null>(null)
  const [standings, setStandings] = useState<Record<string, PoolStandingsRow[]>>({})
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('setup')

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      const sessionRes = await directorApi.get(`/api/pool/${id}`)
      setSession(sessionRes.data)
      // Load standings in parallel (may be empty for draft sessions)
      try {
        const standingsRes = await api.get(`/api/pool/${id}/standings`)
        setStandings(standingsRes.data)
      } catch {
        // Standings unavailable if no teams yet — ignore
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!session) return <div className="p-8 text-center">Session not found</div>

  const isActive    = session.status === 'active'
  const isCompleted = session.status === 'completed'

  const TABS: { id: TabId; label: string; locked: boolean }[] = [
    { id: 'setup',   label: 'Setup',     locked: false },
    { id: 'teams',   label: 'Teams',     locked: false },
    { id: 'pool',    label: 'Pool Play', locked: !isActive && !isCompleted },
    { id: 'bracket', label: 'Bracket',   locked: !isActive && !isCompleted },
  ]

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link to="/director" className="text-gray-500 hover:underline text-sm block mb-1">← Director</Link>
          <h1 className="text-3xl font-bold">
            {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
            })}
          </h1>
          {session.tournament_series?.name && (
            <p className="text-gray-500 text-sm">{session.tournament_series.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
            isCompleted ? 'bg-primary/10 text-primary' :
            isActive    ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-500'
          }`}>
            {session.status}
          </span>
          <span className="text-xs text-gray-400">{session.teams.length} teams</span>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.locked && setActiveTab(tab.id)}
            disabled={tab.locked}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : tab.locked
                ? 'border-transparent text-gray-300 cursor-not-allowed'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'setup' && <SetupTab session={session} onRefresh={loadData} />}
      {activeTab === 'teams' && <TeamsTab session={session} onRefresh={loadData} />}
      {activeTab === 'pool'  && (
        <PoolPlayTab session={session} standings={standings} onRefresh={loadData} />
      )}
      {activeTab === 'bracket' && (
        <BracketTab session={session} onRefresh={loadData} />
      )}
    </div>
  )
}
