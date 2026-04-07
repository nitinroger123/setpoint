/**
 * Shared components used by both the public PlayerProfile page and the
 * authenticated PlayerDashboard.
 *
 * Exports:
 *   SeriesGroup        — type describing one grouped series bucket
 *   groupBySeries      — groups a flat history array into SeriesGroup[]
 *   PlayerSeriesCard   — renders one series card (stats + results + teammate chemistry)
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionHistory {
  session_id: string
  date: string
  series_name: string
  series_id: string | null
  place: number
  total_wins: number
  total_diff: number
}

export interface SeriesGroup {
  series_id: string | null
  series_name: string
  sessions: SessionHistory[]
  session_count: number
  win_pct: number
  first: number
  second: number
  third: number
  fourth: number
}

interface TeammateStat {
  id: string
  name: string
  games: number
  wins: number
  losses: number
  win_pct: number
}

interface TeammateData {
  most_played: TeammateStat[]
  top_teammates: TeammateStat[]
  worst_teammates: TeammateStat[]
}

type SortDir = 'asc' | 'desc'

// ── Sorting hook ──────────────────────────────────────────────────────────────

/**
 * Generic sort hook. Maintains sort key and direction, returns a sorted copy
 * of the input array and a toggle function for column headers.
 *
 * @param data       Array to sort
 * @param defaultKey Initial sort column key
 * @param defaultDir Initial sort direction
 */
function useSortable<T extends Record<string, unknown>>(
  data: T[],
  defaultKey: string,
  defaultDir: SortDir = 'asc'
) {
  const [sortKey, setSortKey] = useState<string>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return { sorted, sortKey, sortDir, toggleSort }
}

// ── Sort header cell ──────────────────────────────────────────────────────────

/**
 * A <th> that shows a sort indicator and calls onSort when clicked.
 * Displays ↑ / ↓ when active, a muted ↕ when inactive.
 */
function SortTh({
  label,
  colKey,
  activeSortKey,
  sortDir,
  onSort,
  align = 'center',
}: {
  label: string
  colKey: string
  activeSortKey: string
  sortDir: SortDir
  onSort: (key: string) => void
  align?: 'left' | 'center'
}) {
  const isActive = colKey === activeSortKey
  return (
    <th
      onClick={() => onSort(colKey)}
      className={`px-3 py-2 ${align === 'left' ? 'text-left' : 'text-center'} cursor-pointer select-none whitespace-nowrap hover:text-primary transition-colors`}
    >
      {label}{' '}
      <span className={isActive ? 'text-primary' : 'text-primary/30'}>
        {isActive ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </th>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '🏅' }

/**
 * Groups a flat session history array into per-series buckets and computes
 * stats (win rate, podium counts) for each group.
 * Sessions with no series fall into a "Standalone Sessions" bucket.
 */
export function groupBySeries(history: SessionHistory[]): SeriesGroup[] {
  const map = new Map<string, SeriesGroup>()

  for (const h of history) {
    const key = h.series_id ?? '__none__'
    if (!map.has(key)) {
      map.set(key, {
        series_id: h.series_id,
        series_name: h.series_name || 'Standalone Sessions',
        sessions: [],
        session_count: 0,
        win_pct: 0,
        first: 0,
        second: 0,
        third: 0,
        fourth: 0,
      })
    }
    map.get(key)!.sessions.push(h)
  }

  for (const group of map.values()) {
    const totalGames = group.sessions.length * 8
    const totalWins = group.sessions.reduce((sum, s) => sum + (s.total_wins || 0), 0)
    group.session_count = group.sessions.length
    group.win_pct = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0
    group.first  = group.sessions.filter(s => s.place === 1).length
    group.second = group.sessions.filter(s => s.place === 2).length
    group.third  = group.sessions.filter(s => s.place === 3).length
    group.fourth = group.sessions.filter(s => s.place === 4).length
  }

  return Array.from(map.values())
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Sortable results table showing each session's date, place, wins, and +/-.
 * Default sort: date descending (most recent first).
 */
function ResultsTable({ sessions }: { sessions: SessionHistory[] }) {
  // Cast to satisfy the generic constraint — all keys map to primitives
  type Row = Record<string, unknown> & SessionHistory
  const rows = sessions as Row[]
  const { sorted, sortKey, sortDir, toggleSort } = useSortable<Row>(rows, 'date', 'desc')

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-primary/5 text-primary uppercase">
          <tr>
            <SortTh label="Date"  colKey="date"       activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
            <SortTh label="Place" colKey="place"      activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortTh label="Wins"  colKey="total_wins" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortTh label="+/-"   colKey="total_diff" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map(h => (
            <tr key={h.session_id} className="bg-white hover:bg-cream-light">
              <td className="px-3 py-2">
                <Link
                  to={`/sessions/${h.session_id}`}
                  className="text-primary underline underline-offset-2 hover:text-primary-lighter"
                >
                  {new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </Link>
              </td>
              <td className="px-3 py-2 text-center font-medium">{medals[h.place] || h.place}</td>
              <td className="px-3 py-2 text-center">{h.total_wins}</td>
              <td className={`px-3 py-2 text-center font-medium ${h.total_diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {h.total_diff > 0 ? '+' : ''}{h.total_diff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Sortable teammate table for best or tough pairings.
 * Default sort: win % descending for best, ascending for tough.
 */
function TeammateTable({
  title,
  subtitle,
  teammates,
  variant,
}: {
  title: string
  subtitle: string
  teammates: TeammateStat[]
  variant: 'best' | 'tough'
}) {
  if (teammates.length === 0) return null
  const isBest = variant === 'best'
  type Row = Record<string, unknown> & TeammateStat
  const rows = teammates as Row[]
  const { sorted, sortKey, sortDir, toggleSort } = useSortable<Row>(rows, 'win_pct', isBest ? 'desc' : 'asc')

  return (
    <div>
      <p className="text-sm font-semibold mb-0.5">{title}</p>
      <p className="text-xs text-gray-400 mb-2">{subtitle}</p>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-primary/5 text-primary uppercase">
            <tr>
              <SortTh label="Player" colKey="name"    activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <SortTh label="G"      colKey="games"   activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortTh label={isBest ? 'W' : 'L'} colKey={isBest ? 'wins' : 'losses'} activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortTh label="Win%"   colKey="win_pct" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map(t => (
              <tr key={t.id} className="bg-white hover:bg-cream-light">
                <td className="px-3 py-2 font-medium">
                  <Link to={`/players/${t.id}`} className="text-primary underline underline-offset-2 hover:text-primary-lighter">
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-center text-gray-500">{t.games}</td>
                <td className={`px-3 py-2 text-center font-medium ${isBest ? 'text-green-600' : 'text-red-500'}`}>
                  {isBest ? t.wins : t.losses}
                </td>
                <td className={`px-3 py-2 text-center font-medium ${isBest ? 'text-green-600' : 'text-red-500'}`}>
                  {t.win_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Sortable full teammate history table shown when the user expands "View all".
 * Default sort: games descending (most games together first).
 */
function FullTeammateTable({ teammates }: { teammates: TeammateStat[] }) {
  type Row = Record<string, unknown> & TeammateStat
  const rows = teammates as Row[]
  const { sorted, sortKey, sortDir, toggleSort } = useSortable<Row>(rows, 'games', 'desc')

  return (
    <div className="mt-2 border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-primary/5 text-primary uppercase">
          <tr>
            <SortTh label="Player" colKey="name"    activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
            <SortTh label="Games"  colKey="games"   activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortTh label="Wins"   colKey="wins"    activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortTh label="Win%"   colKey="win_pct" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map(t => (
            <tr key={t.id} className="bg-white hover:bg-cream-light">
              <td className="px-3 py-2 font-medium">
                <Link to={`/players/${t.id}`} className="text-primary underline underline-offset-2 hover:text-primary-lighter">
                  {t.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-center text-gray-500">{t.games}</td>
              <td className="px-3 py-2 text-center text-gray-600">{t.wins}</td>
              <td className={`px-3 py-2 text-center font-medium ${t.win_pct >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                {t.win_pct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * One card per tournament series. Shows:
 *  - Header: series name (linked to series page) + session count + win rate
 *  - Medal banner: 1st / 2nd / 3rd / 4th place finish counts
 *  - Body: sortable results table (left) + sortable teammate chemistry (right)
 *
 * Fetches its own teammate stats scoped to this series on mount.
 */
export function PlayerSeriesCard({
  group,
  playerId,
}: {
  group: SeriesGroup
  playerId: string
}) {
  const [teammates, setTeammates] = useState<TeammateData | null>(null)
  const [showFullHistory, setShowFullHistory] = useState(false)

  useEffect(() => {
    const params = group.series_id ? `?series_id=${group.series_id}` : ''
    api.get(`/api/players/${playerId}/teammate-stats${params}`)
      .then(res => setTeammates(res.data))
      .catch(() => {})
  }, [playerId, group.series_id])

  return (
    <div className="border rounded-xl overflow-hidden bg-white">

      {/* Header */}
      <div className="bg-primary/5 px-5 py-4 border-b flex items-center justify-between gap-4">
        <h2 className="font-bold text-primary">
          {group.series_id ? (
            <Link to={`/series/${group.series_id}`} className="hover:underline underline-offset-2">
              {group.series_name}
            </Link>
          ) : (
            group.series_name
          )}
        </h2>
        <div className="flex gap-6 text-center shrink-0">
          <div>
            <p className="text-lg font-bold text-primary">{group.session_count}</p>
            <p className="text-xs text-gray-400">Sessions</p>
          </div>
          <div>
            <p className="text-lg font-bold text-primary">{group.win_pct}%</p>
            <p className="text-xs text-gray-400">Win rate</p>
          </div>
        </div>
      </div>

      {/* Medal banner */}
      <div className="border-b px-5 py-3 flex gap-8 justify-center bg-white">
        {[
          { medal: '🥇', label: '1st', count: group.first },
          { medal: '🥈', label: '2nd', count: group.second },
          { medal: '🥉', label: '3rd', count: group.third },
          { medal: '🏅', label: '4th', count: group.fourth },
        ].map(p => (
          <div key={p.label} className="text-center px-4">
            <p className="text-xl">{p.medal}</p>
            <p className="text-lg font-bold text-primary">{p.count}</p>
            <p className="text-xs text-gray-400">{p.label} place</p>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Sortable results */}
        <div>
          <p className="text-sm font-semibold mb-2">Results</p>
          <ResultsTable sessions={group.sessions} />
        </div>

        {/* Teammate chemistry */}
        {teammates && (
          <div className="space-y-4">
            <TeammateTable
              title="Best Teammates"
              subtitle="Highest win % together"
              teammates={teammates.top_teammates}
              variant="best"
            />
            <TeammateTable
              title="Tough Pairings"
              subtitle="Lowest win % together"
              teammates={teammates.worst_teammates}
              variant="tough"
            />

            {/* Expandable full history */}
            {teammates.most_played.length > 0 && (
              <div>
                <button
                  onClick={() => setShowFullHistory(s => !s)}
                  className="text-xs text-primary underline underline-offset-2 hover:text-primary-lighter transition-colors"
                >
                  {showFullHistory
                    ? 'Hide teammate history'
                    : `View full teammate history (${teammates.most_played.length})`}
                </button>
                {showFullHistory && <FullTeammateTable teammates={teammates.most_played} />}
              </div>
            )}

            {teammates.top_teammates.length === 0 && teammates.worst_teammates.length === 0 && teammates.most_played.length === 0 && (
              <p className="text-xs text-gray-400 italic">Not enough games yet for teammate stats.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
