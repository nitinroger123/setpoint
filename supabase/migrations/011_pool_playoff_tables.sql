-- Migration 011: Pool play + single elimination bracket system tables.
-- Supports any game format and team size.

-- ── Scoring defaults per format+stage ─────────────────────────────────────────

-- Pre-seeded scoring rules per (game_format, competition_type, stage).
-- session_stage_scoring is copied from these defaults when a pool+playoff session is created.
--
-- pool_play_format options:
--   'per_set'       (default): all sets_per_match sets are always played;
--                               each individual set win/loss counts in standings.
--   'winner_take_all': match stops when one team wins majority; column present for future use.
-- Playoff stages always use winner-take-all mechanics (play until one team wins the majority).
CREATE TABLE public.format_stage_scoring_defaults (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_format_id      text REFERENCES public.game_formats(id),
  competition_type_id text REFERENCES public.competition_types(id),
  stage               text NOT NULL,            -- 'pool' | 'playoff' | 'playoff_final'
  sets_per_match      int  NOT NULL DEFAULT 1,  -- sets per matchup
  pool_play_format    text NOT NULL DEFAULT 'per_set',  -- only relevant for pool stage
  points_to_win       int  NOT NULL DEFAULT 21,
  win_by              int  NOT NULL DEFAULT 2,
  cap                 int                        -- NULL = no cap
);

-- Default scoring rules for grass doubles pool+single-elimination
INSERT INTO public.format_stage_scoring_defaults
  (game_format_id, competition_type_id, stage, sets_per_match, pool_play_format, points_to_win, win_by, cap)
VALUES
  ('twos', 'pool_playoff_single_elim', 'pool',          2, 'per_set',         21, 2, 25),
  ('twos', 'pool_playoff_single_elim', 'playoff',        3, 'winner_take_all', 21, 2, 25),
  ('twos', 'pool_playoff_single_elim', 'playoff_final',  3, 'winner_take_all', 25, 2, 27);

-- ── Per-session scoring rules ──────────────────────────────────────────────────

-- Copied from format_stage_scoring_defaults when the session is created;
-- director can edit these any time before the session starts.
CREATE TABLE public.session_stage_scoring (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  stage            text NOT NULL,                       -- 'pool' | 'playoff' | 'playoff_final'
  sets_per_match   int  NOT NULL DEFAULT 1,
  pool_play_format text NOT NULL DEFAULT 'per_set',
  points_to_win    int  NOT NULL DEFAULT 21,
  win_by           int  NOT NULL DEFAULT 2,
  cap              int,
  UNIQUE (session_id, stage)
);

-- ── Pool configuration ────────────────────────────────────────────────────────

-- One row per session; controls how many teams per pool and how many advance.
CREATE TABLE public.session_pool_config (
  session_id               uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  teams_per_pool           int NOT NULL DEFAULT 4,
  teams_advancing_per_pool int NOT NULL DEFAULT 2
);

-- ── Teams ─────────────────────────────────────────────────────────────────────

-- Teams registered for a pool+playoff session (any size: pairs, trios, quads...).
CREATE TABLE public.session_teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  name       text NOT NULL,
  seed       int,               -- optional pre-seeding by director
  pool       text               -- 'A', 'B', 'C'… null until pools are assigned
);

-- Players on each team (junction table; works for any team size).
CREATE TABLE public.session_team_players (
  team_id   uuid REFERENCES public.session_teams(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id)       ON DELETE CASCADE,
  PRIMARY KEY (team_id, player_id)
);

-- ── Pool games (round-robin within each pool) ─────────────────────────────────

-- Auto-generated when the director activates pool play.
-- Supports up to 3 sets per match; unused set columns stay NULL.
CREATE TABLE public.pool_games (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES public.sessions(id)       ON DELETE CASCADE,
  pool         text NOT NULL,
  team_a_id    uuid REFERENCES public.session_teams(id),
  team_b_id    uuid REFERENCES public.session_teams(id),
  set1_score_a int, set1_score_b int,
  set2_score_a int, set2_score_b int,
  set3_score_a int, set3_score_b int,
  winner_id    uuid REFERENCES public.session_teams(id),  -- NULL until scored
  created_at   timestamptz DEFAULT now()
);

-- ── Play-in games (tiebreakers for last advancing spots) ─────────────────────

-- Created automatically when standings have tied teams contending for
-- the last advancing spot from a pool.
CREATE TABLE public.play_in_games (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid REFERENCES public.sessions(id)       ON DELETE CASCADE,
  pool            text NOT NULL,
  playoff_spot    int  NOT NULL,   -- which advancing spot is being contested
  team_a_id       uuid REFERENCES public.session_teams(id),
  team_b_id       uuid REFERENCES public.session_teams(id),
  set1_score_a    int, set1_score_b int,
  set2_score_a    int, set2_score_b int,
  set3_score_a    int, set3_score_b int,
  winner_id       uuid REFERENCES public.session_teams(id),
  director_override bool DEFAULT false,  -- true if director manually picked winner
  created_at      timestamptz DEFAULT now()
);

-- ── Bracket games (single elimination) ───────────────────────────────────────

-- Self-referential: winner_advances_to points to the next round's game.
-- round_number 1 = first round, highest round_number = final.
-- is_bye = true means team_a advances automatically (no opponent).
CREATE TABLE public.bracket_games (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid REFERENCES public.sessions(id)       ON DELETE CASCADE,
  round_number         int  NOT NULL,
  position             int  NOT NULL,   -- ordering within round (1, 2, 3…)
  team_a_id            uuid REFERENCES public.session_teams(id),
  team_b_id            uuid REFERENCES public.session_teams(id),  -- NULL = bye
  is_bye               bool DEFAULT false,
  set1_score_a         int, set1_score_b int,
  set2_score_a         int, set2_score_b int,
  set3_score_a         int, set3_score_b int,
  winner_id            uuid REFERENCES public.session_teams(id),
  winner_advances_to   uuid REFERENCES public.bracket_games(id),  -- NULL for final
  created_at           timestamptz DEFAULT now(),
  UNIQUE (session_id, round_number, position)
);

-- ── RLS: public read on all new tables ───────────────────────────────────────

ALTER TABLE public.format_stage_scoring_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_stage_scoring         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_pool_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_team_players          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_games                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_in_games                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_games                 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.format_stage_scoring_defaults FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.session_stage_scoring         FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.session_pool_config           FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.session_teams                 FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.session_team_players          FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.pool_games                    FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.play_in_games                 FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.bracket_games                 FOR SELECT USING (true);
