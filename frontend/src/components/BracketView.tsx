/**
 * BracketView
 * Visual single-elimination bracket rendered left-to-right by round.
 *
 * Props:
 *   bracketGames - all bracket_games rows for the session
 *   teamMap      - id → name lookup for resolving team names
 */

import type { BracketGame } from '../types'

interface Props {
  bracketGames: BracketGame[]
  teamMap: Record<string, string>
}

/**
 * TeamSlot renders one side of a bracket matchup (name only; scores shown below).
 */
function TeamSlot({
  teamId,
  teamMap,
  isWinner,
}: {
  teamId: string | null
  teamMap: Record<string, string>
  isWinner: boolean
}) {
  const name = teamId ? (teamMap[teamId] ?? 'TBD') : 'TBD'
  return (
    <div
      className={`flex items-center px-2.5 py-1.5 text-sm rounded ${
        isWinner
          ? 'bg-green-50 font-semibold text-green-700'
          : 'bg-white text-gray-700'
      } ${!teamId ? 'text-gray-400 italic' : ''}`}
    >
      {isWinner && <span className="mr-1.5 text-green-600 text-xs">✓</span>}
      <span className="truncate max-w-[140px]">{name}</span>
    </div>
  )
}

/**
 * BracketCard renders one game as a small card with two team slots and per-set scores.
 */
function BracketCard({
  game,
  teamMap,
  roundLabel,
}: {
  game: BracketGame
  teamMap: Record<string, string>
  roundLabel: string
}) {
  // Build a list of scored sets to display below the team rows
  const sets = [
    { a: game.set1_score_a, b: game.set1_score_b },
    { a: game.set2_score_a, b: game.set2_score_b },
    { a: game.set3_score_a, b: game.set3_score_b },
  ].filter(s => s.a !== null && s.b !== null) as { a: number; b: number }[]

  const hasScore  = game.winner_id !== null
  const isByeGame = game.is_bye

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-white w-52 shrink-0">
      <div className="bg-primary/5 px-2.5 py-1 text-xs text-primary font-medium uppercase tracking-wide">
        {roundLabel}
        {isByeGame && <span className="ml-1 text-amber-500">(bye)</span>}
      </div>
      <div className="divide-y">
        <TeamSlot
          teamId={game.team_a_id}
          teamMap={teamMap}
          isWinner={hasScore && game.winner_id === game.team_a_id}
        />
        {isByeGame ? (
          <div className="px-2.5 py-1.5 text-xs text-gray-400 italic">— bye —</div>
        ) : (
          <TeamSlot
            teamId={game.team_b_id}
            teamMap={teamMap}
            isWinner={hasScore && game.winner_id === game.team_b_id}
          />
        )}
      </div>
      {/* Per-set scores shown below both teams */}
      {sets.length > 0 && (
        <div className="flex gap-2 justify-center px-2.5 py-1.5 bg-gray-50 border-t text-xs text-gray-500 font-mono">
          {sets.map((s, i) => (
            <span key={i}>{s.a}–{s.b}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BracketView({ bracketGames, teamMap }: Props) {
  if (!bracketGames.length) {
    return (
      <div className="text-center py-12 text-gray-400 border rounded-xl">
        Bracket not generated yet.
      </div>
    )
  }

  // Group games by round number
  const roundNumbers = [...new Set(bracketGames.map(g => g.round_number))].sort((a, b) => a - b)
  const gamesByRound: Record<number, BracketGame[]> = {}
  for (const g of bracketGames) {
    if (!gamesByRound[g.round_number]) gamesByRound[g.round_number] = []
    gamesByRound[g.round_number].push(g)
  }
  for (const rn of roundNumbers) {
    gamesByRound[rn].sort((a, b) => a.position - b.position)
  }

  const maxRound  = Math.max(...roundNumbers)
  const totalRounds = maxRound

  // Label rounds from left (first round) to right (final)
  function roundLabel(rn: number): string {
    if (rn === maxRound) return 'Final'
    if (rn === maxRound - 1 && totalRounds > 1) return 'Semifinal'
    if (rn === maxRound - 2 && totalRounds > 2) return 'Quarterfinal'
    return `Round ${rn}`
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {roundNumbers.map(rn => (
          <div key={rn} className="flex flex-col justify-around gap-4">
            {gamesByRound[rn].map(game => (
              <BracketCard
                key={game.id}
                game={game}
                teamMap={teamMap}
                roundLabel={roundLabel(rn)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
