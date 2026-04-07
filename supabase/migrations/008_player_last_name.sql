-- Migration 008: Add last_name to players
-- Players can set their own last name from the dashboard.
-- The director-set 'name' field remains as the first name / display name.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS last_name text;
