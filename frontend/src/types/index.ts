export interface TournamentSeries {
  id: string
  name: string
  format_id: string
  location?: string
  description?: string
  active: boolean
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
