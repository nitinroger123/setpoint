-- Migration 010: Add game format and competition metadata FK columns to tournament_series.
-- Existing revco 4s series rows are backfilled to keep data consistent.

ALTER TABLE public.tournament_series
  ADD COLUMN game_format_id      text REFERENCES public.game_formats(id),
  ADD COLUMN competition_type_id text REFERENCES public.competition_types(id),
  ADD COLUMN level_id            text REFERENCES public.levels(id),
  ADD COLUMN surface_id          text REFERENCES public.surfaces(id),
  ADD COLUMN division_id         text REFERENCES public.divisions(id);

-- Backfill existing revco round-robin series with their correct metadata
UPDATE public.tournament_series
SET
  game_format_id      = 'fours',
  competition_type_id = 'round_robin',
  level_id            = 'open',
  surface_id          = 'indoor',
  division_id         = 'coed_reverse'
WHERE format_id = 'revco-roundrobin-4s';
