/**
 * PoolPlayoffDetail — public-facing view for a pool play + single-elimination session.
 *
 * Shows:
 *   - Session header with metadata (date, series, level, surface, division)
 *   - Pool standings tables (one per pool)
 *   - Play-in games (if any)
 *   - Single-elimination bracket
 * Auto-refreshes every 30 seconds when the session is active.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import type { SessionTeam, PoolGame, PlayInGame, BracketGame, SessionPoolConfig, StageScoringRule, PoolStandingsRow } from '../types'
import PoolStandingsTable from '../components/PoolStandingsTable'
import BracketView from '../components/BracketView'

interface PoolSession {
  id: string
  date: string
  status: string
  tournament_series?: {
    name: string
    competition_type_id: string
    level_id?: string
    surface_id?: string
    division_id?: string
    levels?: { name: string }
    surfaces?: { name: string }
    divisions?: { name: string }
  }
  teams: SessionTeam[]
  pool_config: SessionPoolConfig | null
  scoring_rules: StageScoringRule[]
  pool_games: PoolGame[]
  play_in_games: PlayInGame[]
  bracket_games: BracketGame[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a record from team id → team name for fast lookups in the bracket view.
 */
function buildTeamMap(teams: SessionTeam[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const team of teams) {
    map[team.id] = team.name
  }
  return map
}

/**
 * Fetch and compute pool standings from the API.
 * Returns a dict of pool label → PoolStandingsRow[].
 */
async function fetchStandings(sessionId: string): Promise<Record<string, PoolStandingsRow[]>> {
  const res = await api.get(`/api/pool/${sessionId}/standings`)
  return res.data
}

// ── Pool game score display ────────────────────────────────────────────────────

function SetScoreDisplay({ game, teamMap }: { game: PoolGame | PlayInGame; teamMap: Record<string, string> }) {
  const teamA = game.team_a_id ? (teamMap[game.team_a_id] ?? 'Team A') : 'TBD'
  const teamB = game.team_b_id ? (teamMap[game.team_b_id] ?? 'Team B') : 'TBD'
  const sets = [
    { a: game.set1_score_a, b: game.set1_score_b },
    { a: game.set2_score_a, b: game.set2_score_b },
    { a: 'set3_score_a' in game ? (game as any).set3_score_a : null, b: 'set3_score_b' in game ? (game as any).set3_score_b : null },
  ].filter(s => s.a !== null && s.b !== null)

  const isScored = game.winner_id !== null

  return (
    <div className="border rounded-xl p-4 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <span className={`flex-1 text-center text-sm font-semibold px-2 py-1 rounded-lg ${game.winner_id === game.team_a_id && isScored ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-700'}`}>
          {teamA} {game.winner_id === game.team_a_id ? '✓' : ''}
        </span>
        <span className="text-gray-400 text-xs">vs</span>
        <span className={`flex-1 text-center text-sm font-semibold px-2 py-1 rounded-lg ${game.winner_id === game.team_b_id && isScored ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-700'}`}>
          {game.winner_id === game.team_b_id ? '✓' : ''} {teamB}
        </span>
      </div>
      {sets.length > 0 ? (
        <div className="flex gap-2 justify-center text-xs text-gray-600">
          {sets.map((s, i) => (
            <span key={i} className="font-mono">
              Set {i + 1}: <strong>{s.a}</strong>–<strong>{s.b}</strong>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-gray-400">Not yet scored</p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PoolPlayoffDetail() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<PoolSession | null>(null)
  const [standings, setStandings] = useState<Record<string, PoolStandingsRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pools' | 'bracket'>('pools')

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      const [sessionRes, standingsRes] = await Promise.all([
        api.get(`/api/pool/${id}`),
        fetchStandings(id),
      ])
      setSession(sessionRes.data)
      setStandings(standingsRes)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  // Auto-refresh every 30 s when active
  useEffect(() => {
    if (!session || session.status !== 'active') return
    const t = setInterval(loadData, 30_000)
    return () => clearInterval(t)
  }, [session, loadData])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!session) return <div className="p-8 text-center">Session not found</div>

  const teamMap = buildTeamMap(session.teams)
  const teamsAdvancing = session.pool_config?.teams_advancing_per_pool ?? 2
  const seriesMeta = session.tournament_series
  const poolLabels = [...new Set(session.teams.map(t => t.pool).filter(Boolean) as string[])].sort()
  const hasPlayIns = session.play_in_games.length > 0
  const hasBracket = session.bracket_games.length > 0

  // Group pool games by pool label
  const poolGamesByPool: Record<string, PoolGame[]> = {}
  for (const g of session.pool_games) {
    if (!poolGamesByPool[g.pool]) poolGamesByPool[g.pool] = []
    poolGamesByPool[g.pool].push(g)
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <Link to="/tournaments" className="text-gray-600 hover:underline text-sm mb-4 block">
          ← Back to Tournaments
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">
            {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </h1>
          {session.status === 'active' && (
            <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">
              🟢 Live
            </span>
          )}
          {session.status === 'completed' && (
            <span className="bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-full">
              Completed
            </span>
          )}
        </div>

        {/* Series + metadata badges */}
        {seriesMeta && (
          <div className="flex flex-wrap gap-2 mt-2">
            {seriesMeta.name && <span className="text-gray-500 text-sm">{seriesMeta.name}</span>}
            {seriesMeta.divisions?.name && (
              <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {seriesMeta.divisions.name}
              </span>
            )}
            {seriesMeta.levels?.name && (
              <span className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {seriesMeta.levels.name}
              </span>
            )}
            {seriesMeta.surfaces?.name && (
              <span className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {seriesMeta.surfaces.name}
              </span>
            )}
          </div>
        )}

        {session.status === 'active' && (
          <button onClick={loadData} className="mt-2 text-xs text-gray-500 hover:underline">
            ↻ Refresh
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'pools', label: 'Pool Play' },
          { id: 'bracket', label: 'Bracket' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pool Play tab */}
      {activeTab === 'pools' && (
        <div className="space-y-8">
          {/* Pool standings */}
          {poolLabels.length > 0 ? (
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
          ) : (
            <div className="text-center py-12 text-gray-400 border rounded-xl">
              Pools not assigned yet.
            </div>
          )}

          {/* Pool games */}
          {poolLabels.map(pool => {
            const games = poolGamesByPool[pool] ?? []
            if (!games.length) return null
            return (
              <div key={pool}>
                <h2 className="text-xl font-semibold mb-3">Pool {pool} Games</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {games.map(g => (
                    <SetScoreDisplay key={g.id} game={g} teamMap={teamMap} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Play-in games */}
          {hasPlayIns && (
            <div>
              <h2 className="text-xl font-semibold mb-3">Play-in Games</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {session.play_in_games.map(g => (
                  <SetScoreDisplay key={g.id} game={g} teamMap={teamMap} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bracket tab */}
      {activeTab === 'bracket' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Single Elimination Bracket</h2>
          {hasBracket ? (
            <BracketView bracketGames={session.bracket_games} teamMap={teamMap} />
          ) : (
            <div className="text-center py-12 text-gray-400 border rounded-xl">
              Bracket not generated yet. Pool play must complete first.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
