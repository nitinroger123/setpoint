-- Migration 012: Make tournament_series.format_id nullable.
-- format_id references the legacy tournament_formats table (single row: 'revco-roundrobin-4s').
-- It has been superseded by game_format_id + competition_type_id (added in migration 010).
-- Pool+playoff series have no meaningful value for format_id, so we drop the NOT NULL constraint.

ALTER TABLE public.tournament_series ALTER COLUMN format_id DROP NOT NULL;
