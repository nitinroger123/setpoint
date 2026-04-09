-- Migration 009: Lookup tables for game formats, competition types, levels, surfaces, divisions

-- game_formats: what kind of game is being played (twos, threes, fours, sixes)
CREATE TABLE public.game_formats (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  team_size int  NOT NULL
);
INSERT INTO public.game_formats VALUES
  ('twos',   'Doubles', 2),
  ('threes', 'Triples', 3),
  ('fours',  'Quads',   4),
  ('sixes',  'Sixes',   6);

-- competition_types: how the tournament is structured
CREATE TABLE public.competition_types (
  id   text PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO public.competition_types VALUES
  ('round_robin',              'Round Robin'),
  ('pool_playoff_single_elim', 'Pool Play + Single Elimination'),
  ('pool_playoff_double_elim', 'Pool Play + Double Elimination'),
  ('league',                   'League');

-- levels: competitive level (open = highest)
CREATE TABLE public.levels (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  sort_order int  NOT NULL
);
INSERT INTO public.levels VALUES
  ('open', 'Open', 1),
  ('aa',   'AA',   2),
  ('a',    'A',    3),
  ('bb',   'BB',   4),
  ('b',    'B',    5);

-- surfaces: playing surface
CREATE TABLE public.surfaces (
  id   text PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO public.surfaces VALUES
  ('grass',  'Grass'),
  ('sand',   'Sand'),
  ('indoor', 'Indoor');

-- divisions: gender/format division
CREATE TABLE public.divisions (
  id   text PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO public.divisions VALUES
  ('mens',         'Men''s'),
  ('womens',       'Women''s'),
  ('coed',         'Coed'),
  ('coed_reverse', 'Reverse Coed');

-- RLS: all lookup tables are publicly readable
ALTER TABLE public.game_formats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surfaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisions        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.game_formats     FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.competition_types FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.levels           FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.surfaces         FOR SELECT USING (true);
CREATE POLICY "Public read" ON public.divisions        FOR SELECT USING (true);
