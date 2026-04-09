import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import api from '../lib/api'
import type { Session, GameResult } from '../types'

// ── Types for live sessions ───────────────────────────────────────────────────

interface RoundGame {
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

interface Player { id: string; name: string; gender: string | null }
interface TeamAssignments { Aces: Player[]; Kings: Player[]; Queens: Player[] }

// ── Media helpers ─────────────────────────────────────────────────────────────

interface SessionMedia {
  id: string
  url: string
  caption?: string | null
  media_type: 'image' | 'youtube' | 'link'
  is_featured: boolean
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function MediaEmbed({ item }: { item: SessionMedia }) {
  if (item.media_type === 'youtube') {
    const vid = youtubeId(item.url)
    if (!vid) return <a href={item.url} target="_blank" rel="noreferrer" className="text-gray-600 underline">{item.url}</a>
    return (
      <div className="aspect-video w-full">
        <iframe
          src={`https://www.youtube.com/embed/${vid}`}
          className="w-full h-full rounded-lg"
          allowFullScreen
          title={item.caption ?? 'Video'}
        />
      </div>
    )
  }
  if (item.media_type === 'image') {
    return (
      <a href={item.url} target="_blank" rel="noreferrer">
        <img
          src={item.url}
          alt={item.caption ?? ''}
          className="w-full rounded-lg object-cover max-h-80"
          onError={e => {
            const el = e.currentTarget
            el.style.display = 'none'
            const link = document.createElement('a')
            link.href = item.url
            link.target = '_blank'
            link.rel = 'noreferrer'
            link.textContent = item.caption ?? 'View photo →'
            link.className = 'text-gray-600 underline text-sm'
            el.parentElement?.appendChild(link)
          }}
        />
      </a>
    )
  }
  return <a href={item.url} target="_blank" rel="noreferrer" className="text-gray-600 underline break-all">{item.caption ?? item.url}</a>
}

// ── Helpers for completed sessions ───────────────────────────────────────────

function getPlayerSummary(results: GameResult[]) {
  const byPlayer: Record<string, { name: string; wins: number; diff: number; place: number; games: GameResult[] }> = {}
  for (const r of results) {
    const key = r.player_id
    if (!byPlayer[key]) {
      byPlayer[key] = { name: (r as any).players?.name || 'Unknown', wins: r.total_wins, diff: r.total_diff, place: r.place, games: [] }
    }
    byPlayer[key].games.push(r)
  }
  const players = Object.values(byPlayer).sort((a, b) => a.place - b.place)
  for (const p of players) {
    p.games.sort((a, b) => a.round_number !== b.round_number ? a.round_number - b.round_number : a.game_number - b.game_number)
  }
  return players
}

function getRoundGameKeys(players: ReturnType<typeof getPlayerSummary>) {
  const keys = new Set<string>()
  for (const p of players) for (const g of p.games) keys.add(`${g.round_number}-${g.game_number}`)
  return [...keys].sort()
}

const TEAM_STYLE: Record<string, string> = {
  Aces:   'bg-yellow-50 text-yellow-700',
  Kings:  'bg-blue-50 text-blue-700',
  Queens: 'bg-purple-50 text-purple-700',
}
const GENDER_COLOR: Record<string, string> = {
  m: 'bg-blue-100 text-blue-700',
  f: 'bg-pink-100 text-pink-700',
}
const TEAMS = ['Aces', 'Kings', 'Queens'] as const
const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅' }

// ── Live session view ─────────────────────────────────────────────────────────

function LiveView({ session, onRefresh }: { session: any; onRefresh: () => void }) {
  const [activeRound, setActiveRound] = useState(1)

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const t = setInterval(onRefresh, 30_000)
    return () => clearInterval(t)
  }, [onRefresh])

  const roundGames: RoundGame[] = session.round_games ?? []
  const liveStandings: LiveStanding[] = session.live_standings ?? []
  const assignments: Record<string, TeamAssignments> = session.round_assignments ?? {}

  // Determine current round: last round with any scored game, default 1
  const scoredRounds = new Set(roundGames.filter(g => g.score_a != null).map(g => g.round_number))
  const currentRound = scoredRounds.size > 0 ? Math.max(...scoredRounds) : 1

  // Group games by round
  const gamesByRound: Record<number, RoundGame[]> = {}
  for (const g of roundGames) {
    if (!gamesByRound[g.round_number]) gamesByRound[g.round_number] = []
    gamesByRound[g.round_number].push(g)
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <Link to="/tournaments" className="text-gray-600 hover:underline text-sm mb-4 block">← Back to Tournaments</Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">
            {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </h1>
          <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">🟢 Live</span>
        </div>
        {session.tournament_series && <p className="text-gray-500">{session.tournament_series.name}</p>}
        <button onClick={onRefresh} className="mt-2 text-xs text-gray-600 hover:underline">↻ Refresh</button>
      </div>

      {/* Live Standings */}
      {liveStandings.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Live Standings</h2>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-primary/5 text-primary uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Place</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-center">Wins</th>
                  <th className="px-4 py-3 text-center">Point Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {liveStandings.map(p => (
                  <tr key={p.id} className={p.place <= 4 ? 'bg-gold/10' : 'bg-white'}>
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

      {/* Round Scores */}
      {roundGames.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Scores</h2>
          <div className="flex gap-1 mb-4 border-b">
            {[1, 2, 3, 4].map(r => (
              <button key={r} onClick={() => setActiveRound(r)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeRound === r ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Round {r} {r === currentRound ? '●' : ''}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            {(gamesByRound[activeRound] ?? []).map(g => {
              const isScored = g.score_a != null && g.score_b != null
              const winner = isScored ? (g.score_a! > g.score_b! ? g.team_a : g.team_b) : null
              return (
                <div key={`${g.round_number}-${g.game_number}`} className="border rounded-xl p-4 bg-white">
                  <p className="text-xs text-gray-400 uppercase font-medium mb-2">Game {g.game_number}</p>
                  <div className="flex items-center gap-3">
                    <span className={`flex-1 text-center text-sm font-semibold px-2 py-1 rounded-lg ${TEAM_STYLE[g.team_a]}`}>
                      {g.team_a} {winner === g.team_a ? '✓' : ''}
                    </span>
                    {isScored ? (
                      <>
                        <span className={`text-2xl font-bold w-8 text-center ${winner === g.team_a ? 'text-green-600' : 'text-gray-400'}`}>{g.score_a}</span>
                        <span className="text-gray-300">–</span>
                        <span className={`text-2xl font-bold w-8 text-center ${winner === g.team_b ? 'text-green-600' : 'text-gray-400'}`}>{g.score_b}</span>
                      </>
                    ) : (
                      <span className="text-gray-300 text-sm px-2">vs</span>
                    )}
                    <span className={`flex-1 text-center text-sm font-semibold px-2 py-1 rounded-lg ${TEAM_STYLE[g.team_b]}`}>
                      {winner === g.team_b ? '✓' : ''} {g.team_b}
                    </span>
                  </div>
                </div>
              )
            })}
            {!gamesByRound[activeRound] && (
              <div className="text-center py-8 text-gray-400 border rounded-xl">No games yet for Round {activeRound}</div>
            )}
          </div>
        </div>
      )}

      {/* Team Assignments */}
      {Object.keys(assignments).length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Teams</h2>
          <div className="flex gap-1 mb-4 border-b">
            {[1, 2, 3, 4].map(r => (
              <button key={r} onClick={() => setActiveRound(r)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeRound === r ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Round {r}
              </button>
            ))}
          </div>
          {assignments[String(activeRound)] ? (
            <div className="grid grid-cols-3 gap-4">
              {TEAMS.map(team => (
                <div key={team} className="border rounded-xl overflow-hidden">
                  <div className={`px-4 py-2 font-semibold text-sm text-center ${TEAM_STYLE[team]}`}>{team}</div>
                  <ul className="divide-y">
                    {assignments[String(activeRound)][team].map(p => (
                      <li key={p.id} className="px-4 py-2.5 flex items-center justify-between bg-white text-sm">
                        <span className="font-medium">{p.name}</span>
                        {p.gender && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${GENDER_COLOR[p.gender]}`}>
                            {p.gender.toUpperCase()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 border rounded-xl">Teams not assigned for Round {activeRound} yet</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadSession = useCallback(() => {
    api.get(`/api/sessions/${id}`).then(res => {
      setSession(res.data)
      setLoading(false)
    })
  }, [id])

  useEffect(() => { loadSession() }, [loadSession])

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!session) return <div className="p-8 text-center">Session not found</div>

  // Pool+playoff sessions are served by a dedicated public page
  const POOL_TYPES = ['pool_playoff_single_elim', 'pool_playoff_double_elim']
  const competitionType = session.tournament_series?.competition_type_id
  if (competitionType && POOL_TYPES.includes(competitionType)) {
    return <Navigate to={`/pool/${session.id}`} replace />
  }

  // Active sessions get the live view
  if (session.status === 'active') {
    return <LiveView session={session} onRefresh={loadSession} />
  }

  // Draft with no results = truly not started yet
  const hasResults = session.results && session.results.length > 0
  if (session.status === 'draft' && !hasResults) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Link to="/tournaments" className="text-gray-600 hover:underline text-sm mb-4 block">← Back to Tournaments</Link>
        <h1 className="text-3xl font-bold mb-2">
          {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })}
        </h1>
        <p className="text-gray-400 mt-4">This session hasn't started yet.</p>
      </div>
    )
  }

  // Completed sessions (or draft sessions with historical data): standings + round-by-round table
  const players = getPlayerSummary((session as Session).results || [])
  const roundGameKeys = getRoundGameKeys(players)
  const assignments: Record<string, TeamAssignments> = session.round_assignments ?? {}
  const hasAssignments = Object.keys(assignments).length > 0
  const media: SessionMedia[] = session.media ?? []
  const featured = media.find(m => m.is_featured)
  const otherMedia = media.filter(m => !m.is_featured)

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <Link to="/tournaments" className="text-gray-600 hover:underline text-sm mb-4 block">← Back to Tournaments</Link>
        <h1 className="text-3xl font-bold mb-1">
          {new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </h1>
        <p className="text-gray-500 capitalize">{session.format_id?.replace(/-/g, ' ')}</p>
      </div>

      {/* Standings + featured media side by side */}
      <div className={`grid gap-6 ${featured ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <h2 className="text-xl font-semibold mb-3">Standings</h2>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-primary/5 text-primary uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Place</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-center">Wins</th>
                  <th className="px-4 py-3 text-center">Point Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {players.map(p => (
                  <tr key={p.name} className={p.place <= 4 ? 'bg-gold/10' : 'bg-white'}>
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

        {featured && (
          <div>
            <h2 className="text-xl font-semibold mb-3">Winning Team</h2>
            <div className="border rounded-xl p-4 bg-white space-y-3">
              <MediaEmbed item={featured} />
              {featured.caption && <p className="text-sm text-gray-600 text-center">{featured.caption}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Media gallery — horizontal scroll strip */}
      {otherMedia.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Session Media</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {otherMedia.map(item => (
              <div key={item.id} className="flex-none w-64 border rounded-xl p-3 bg-white space-y-2">
                <MediaEmbed item={item} />
                {item.caption && <p className="text-xs text-gray-500 text-center">{item.caption}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Round-by-round results + Team assignments side by side */}
      {(roundGameKeys.length > 0 || hasAssignments) && (
        <div className={`grid gap-6 ${roundGameKeys.length > 0 && hasAssignments ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>

          {roundGameKeys.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-3">Round-by-Round Results</h2>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-primary/5 text-primary uppercase text-xs">
                    <tr>
                      <th className="px-3 py-3 text-left w-24">Player</th>
                      {roundGameKeys.map(key => {
                        const [r, g] = key.split('-')
                        return <th key={key} className="px-1 py-3 text-center">R{r}G{g}</th>
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {players.map((p, i) => {
                      const gameByKey: Record<string, GameResult> = {}
                      for (const g of p.games) gameByKey[`${g.round_number}-${g.game_number}`] = g
                      return (
                        <tr key={p.name} className={i % 2 === 0 ? 'bg-white' : 'bg-cream-light'}>
                          <td className="px-3 py-2.5 font-semibold truncate">
                            {medals[p.place] && <span className="mr-0.5">{medals[p.place]}</span>}
                            {p.name}
                          </td>
                          {roundGameKeys.map(key => {
                            const g = gameByKey[key]
                            if (!g) return <td key={key} className="px-1 py-2.5 text-center text-gray-300">—</td>
                            return (
                              <td key={key} className={`px-1 py-2.5 text-center font-medium ${g.point_diff > 0 ? 'text-green-600' : g.point_diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
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

          {hasAssignments && (
            <CompletedTeamsPanel assignments={assignments} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Team assignments panel for completed sessions ─────────────────────────────

function CompletedTeamsPanel({ assignments }: { assignments: Record<string, TeamAssignments> }) {
  const [activeRound, setActiveRound] = useState(1)
  const rounds = [1, 2, 3, 4].filter(r => assignments[String(r)])

  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">Team Assignments</h2>
      <div className="flex gap-1 mb-4 border-b">
        {rounds.map(r => (
          <button key={r} onClick={() => setActiveRound(r)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeRound === r ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Round {r}
          </button>
        ))}
      </div>
      {assignments[String(activeRound)] ? (
        <div className="grid grid-cols-3 gap-3">
          {TEAMS.map(team => (
            <div key={team} className="border rounded-xl overflow-hidden">
              <div className={`px-3 py-2 font-semibold text-sm text-center ${TEAM_STYLE[team]}`}>{team}</div>
              <ul className="divide-y">
                {assignments[String(activeRound)][team].map(p => (
                  <li key={p.id} className="px-3 py-2 flex items-center justify-between bg-white text-sm">
                    <span className="font-medium">{p.name}</span>
                    {p.gender && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${GENDER_COLOR[p.gender]}`}>
                        {p.gender.toUpperCase()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 border rounded-xl">No team data for Round {activeRound}</div>
      )}
    </div>
  )
}
