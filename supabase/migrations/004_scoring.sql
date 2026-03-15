-- Game scores: 3 games per round, winner-stays format
-- G1 matchup is fixed per round schedule; G2/G3 matchups are set after G1 is scored.
CREATE TABLE IF NOT EXISTS public.round_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  game_number int NOT NULL CHECK (game_number BETWEEN 1 AND 3),
  team_a text NOT NULL CHECK (team_a IN ('Aces', 'Kings', 'Queens')),
  team_b text NOT NULL CHECK (team_b IN ('Aces', 'Kings', 'Queens')),
  score_a int,
  score_b int,
  created_at timestamptz DEFAULT now(),
  UNIQUE (session_id, round_number, game_number)
);

ALTER TABLE public.round_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read round_games" ON public.round_games FOR SELECT USING (true);
