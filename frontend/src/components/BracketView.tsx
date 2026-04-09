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
 * TeamSlot renders one side of a bracket matchup with an optional score.
 */
function TeamSlot({
  teamId,
  teamMap,
  score,
  isWinner,
}: {
  teamId: string | null
  teamMap: Record<string, string>
  score: number | null
  isWinner: boolean
}) {
  const name = teamId ? (teamMap[teamId] ?? 'TBD') : 'TBD'
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 text-sm rounded ${
        isWinner
          ? 'bg-green-50 font-semibold text-green-700'
          : 'bg-white text-gray-700'
      } ${!teamId ? 'text-gray-400 italic' : ''}`}
    >
      <span className="truncate max-w-[120px]">{name}</span>
      {score !== null && (
        <span className={`ml-2 font-bold tabular-nums ${isWinner ? 'text-green-700' : 'text-gray-400'}`}>
          {score}
        </span>
      )}
    </div>
  )
}

/**
 * BracketCard renders one game as a small card with two team slots.
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
  // Compute total score per team by summing sets
  const scoreA =
    (game.set1_score_a ?? 0) + (game.set2_score_a ?? 0) + (game.set3_score_a ?? 0) > 0 ||
    game.set1_score_a !== null
      ? (game.set1_score_a ?? 0) + (game.set2_score_a ?? 0) + (game.set3_score_a ?? 0)
      : null
  const scoreB =
    game.set1_score_b !== null
      ? (game.set1_score_b ?? 0) + (game.set2_score_b ?? 0) + (game.set3_score_b ?? 0)
      : null

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
          score={hasScore ? scoreA : null}
          isWinner={hasScore && game.winner_id === game.team_a_id}
        />
        {isByeGame ? (
          <div className="px-2.5 py-1.5 text-xs text-gray-400 italic">— bye —</div>
        ) : (
          <TeamSlot
            teamId={game.team_b_id}
            teamMap={teamMap}
            score={hasScore ? scoreB : null}
            isWinner={hasScore && game.winner_id === game.team_b_id}
          />
        )}
      </div>
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
