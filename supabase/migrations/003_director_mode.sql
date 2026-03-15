-- Add gender to players
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('m', 'f'));

-- Add status to sessions
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'active', 'completed'));

-- Add series_id to sessions if missing (may already exist from migration 002)
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS series_id uuid
  REFERENCES public.tournament_series(id) ON DELETE SET NULL;

-- Session roster: who is playing in a given session
CREATE TABLE IF NOT EXISTS public.session_roster (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, player_id)
);

-- Per-round team assignments (teams reshuffle after each round)
CREATE TABLE IF NOT EXISTS public.round_assignments (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  round_number int NOT NULL CHECK (round_number BETWEEN 1 AND 4),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team text NOT NULL CHECK (team IN ('Aces', 'Kings', 'Queens')),
  PRIMARY KEY (session_id, round_number, player_id)
);

-- RLS (service_role key used by backend bypasses these; these allow public reads)
ALTER TABLE public.session_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read session_roster"   ON public.session_roster   FOR SELECT USING (true);
CREATE POLICY "Public read round_assignments" ON public.round_assignments FOR SELECT USING (true);
