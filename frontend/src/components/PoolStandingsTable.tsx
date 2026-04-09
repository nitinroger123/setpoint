/**
 * PoolStandingsTable
 * Renders the standings for a single pool.
 *
 * Props:
 *   poolLabel            - pool name, e.g. 'A'
 *   standings            - ordered list of PoolStandingsRow for this pool
 *   teamsAdvancing       - how many teams advance from this pool (top N shaded green)
 *   teamMap              - id → name lookup so we can resolve names if needed
 */

import type { PoolStandingsRow } from '../types'

interface Props {
  poolLabel: string
  standings: PoolStandingsRow[]
  teamsAdvancing: number
}

export default function PoolStandingsTable({ poolLabel, standings, teamsAdvancing }: Props) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Pool {poolLabel}</h3>
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-primary/5 text-primary uppercase text-xs">
            <tr>
              <th className="px-4 py-2.5 text-left">Team</th>
              <th className="px-3 py-2.5 text-center">W</th>
              <th className="px-3 py-2.5 text-center">L</th>
              <th className="px-3 py-2.5 text-center">Set Diff</th>
              <th className="px-3 py-2.5 text-center">Pt Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {standings.map((row, index) => {
              // Determine row style: advancing teams are shaded green, play-in teams amber
              const isAdvancing = index < teamsAdvancing && !row.in_play_in
              const isPlayIn    = row.in_play_in
              const rowClass = isAdvancing
                ? 'bg-green-50'
                : isPlayIn
                ? 'bg-amber-50'
                : 'bg-white'

              return (
                <tr key={row.team_id} className={rowClass}>
                  <td className="px-4 py-2.5 font-medium">
                    {row.team_name}
                    {isPlayIn && (
                      <span className="ml-2 text-xs text-amber-600 font-normal">play-in</span>
                    )}
                    {isAdvancing && (
                      <span className="ml-2 text-xs text-green-600 font-normal">advances</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold">{row.wins}</td>
                  <td className="px-3 py-2.5 text-center text-gray-500">{row.losses}</td>
                  <td className={`px-3 py-2.5 text-center font-medium ${row.set_diff > 0 ? 'text-green-600' : row.set_diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {row.set_diff > 0 ? '+' : ''}{row.set_diff}
                  </td>
                  <td className={`px-3 py-2.5 text-center font-medium ${row.point_diff > 0 ? 'text-green-600' : row.point_diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {row.point_diff > 0 ? '+' : ''}{row.point_diff}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
