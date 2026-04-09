// ── Lookup table types ────────────────────────────────────────────────────────

export interface GameFormat {
  id: string        // 'twos' | 'threes' | 'fours' | 'sixes'
  name: string      // 'Doubles' | 'Triples' | 'Quads' | 'Sixes'
  team_size: number
}

export interface CompetitionType {
  id: string        // 'round_robin' | 'pool_playoff_single_elim' | ...
  name: string
}

export interface Level {
  id: string        // 'open' | 'aa' | 'a' | 'bb' | 'b'
  name: string
  sort_order: number
}

export interface Surface {
  id: string        // 'grass' | 'sand' | 'indoor'
  name: string
}

export interface Division {
  id: string        // 'mens' | 'womens' | 'coed' | 'coed_reverse'
  name: string
}

// ── Series / Session ──────────────────────────────────────────────────────────

export interface TournamentSeries {
  id: string
  name: string
  format_id: string
  location?: string
  description?: string
  active: boolean
  // FK references to lookup tables (as joined objects or raw IDs)
  game_format_id?: string
  competition_type_id?: string
  level_id?: string
  surface_id?: string
  division_id?: string
  game_formats?: GameFormat | null
  competition_types?: CompetitionType | null
  levels?: Level | null
  surfaces?: Surface | null
  divisions?: Division | null
  sessions?: Session[]
}

export interface Player {
  id: string
  name: string
  phone?: string
  email?: string
}

export interface Session {
  id: string
  date: string
  format_id: string
  num_rounds?: number
  notes?: string
  player_count?: number
  results?: GameResult[]
}

export interface GameResult {
  id: string
  session_id: string
  player_id: string
  player_name?: string
  round_number: number
  game_number: number
  point_diff: number
  total_wins: number
  total_diff: number
  place: number
  team?: string
}

// ── Pool play + bracket types ─────────────────────────────────────────────────

export interface SessionTeam {
  id: string
  session_id: string
  name: string
  seed?: number | null
  pool?: string | null
  players: { id: string; name: string }[]
}

export interface SessionTeamPlayer {
  team_id: string
  player_id: string
}

export interface StageScoringRule {
  id: string
  session_id: string
  stage: string         // 'pool' | 'playoff' | 'playoff_final'
  sets_per_match: number
  pool_play_format: string  // 'per_set' | 'winner_take_all'
  points_to_win: number
  win_by: number
  cap?: number | null
}

export interface SessionPoolConfig {
  session_id: string
  teams_per_pool: number
  teams_advancing_per_pool: number
}

export interface PoolGame {
  id: string
  session_id: string
  pool: string
  team_a_id: string | null
  team_b_id: string | null
  set1_score_a: number | null
  set1_score_b: number | null
  set2_score_a: number | null
  set2_score_b: number | null
  set3_score_a: number | null
  set3_score_b: number | null
  winner_id: string | null
  created_at?: string
}

export interface PlayInGame {
  id: string
  session_id: string
  pool: string
  playoff_spot: number
  team_a_id: string | null
  team_b_id: string | null
  set1_score_a: number | null
  set1_score_b: number | null
  set2_score_a: number | null
  set2_score_b: number | null
  set3_score_a: number | null
  set3_score_b: number | null
  winner_id: string | null
  director_override: boolean
  created_at?: string
}

export interface BracketGame {
  id: string
  session_id: string
  round_number: number
  position: number
  team_a_id: string | null
  team_b_id: string | null
  is_bye: boolean
  set1_score_a: number | null
  set1_score_b: number | null
  set2_score_a: number | null
  set2_score_b: number | null
  set3_score_a: number | null
  set3_score_b: number | null
  winner_id: string | null
  winner_advances_to: string | null
  created_at?: string
}

export interface PoolStandingsRow {
  team_id: string
  team_name: string
  pool?: string | null
  seed?: number | null
  wins: number
  losses: number
  set_diff: number
  points_scored: number
  points_conceded: number
  point_diff: number
  games_played: number
  in_play_in: boolean
}
