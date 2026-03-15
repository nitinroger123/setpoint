-- Clean per-session standings table.
-- Replaces the round_number=1/game_number=1 anchor hack in game_results.
-- Historical sessions are backfilled from game_results; director sessions write here on completion.
CREATE TABLE IF NOT EXISTS public.session_standings (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES public.players(id)  ON DELETE CASCADE,
  total_wins int  NOT NULL DEFAULT 0,
  total_diff int  NOT NULL DEFAULT 0,
  place      int  NOT NULL,
  PRIMARY KEY (session_id, player_id)
);

ALTER TABLE public.session_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read session_standings" ON public.session_standings FOR SELECT USING (true);

-- Backfill from historical game_results using the round=1/game=1 anchor
INSERT INTO public.session_standings (session_id, player_id, total_wins, total_diff, place)
SELECT session_id, player_id, total_wins, total_diff, place
FROM public.game_results
WHERE round_number = 1 AND game_number = 1
ON CONFLICT DO NOTHING;
