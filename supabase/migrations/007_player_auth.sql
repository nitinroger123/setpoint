-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Player auth, profile fields, orgs, and claim codes
-- Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Extend players table ───────────────────────────────────────────────────

-- Links a claimed player record to a Supabase Auth user.
-- NULL means the profile has not been claimed yet.
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- URL to the player's uploaded avatar image (stored in Supabase Storage: avatars bucket).
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Player's Instagram handle without the @ symbol (e.g. "volleyballjohn").
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS instagram_handle text;

-- Unique index so two players can't claim the same auth account.
CREATE UNIQUE INDEX IF NOT EXISTS players_auth_user_id_idx
  ON public.players(auth_user_id)
  WHERE auth_user_id IS NOT NULL;


-- ── 2. Organizations ──────────────────────────────────────────────────────────

-- Each organization is a club, league, or group that runs sessions on Setpoint.
-- Directors belong to an org; players join orgs.
CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,  -- URL-safe identifier, e.g. 'vballnyc'
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the first org.
INSERT INTO public.organizations (name, slug, description)
VALUES ('vballnyc', 'vballnyc', 'NYC volleyball community — reverse coed 4s and more')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read organizations"
  ON public.organizations FOR SELECT USING (true);


-- ── 3. Org memberships ────────────────────────────────────────────────────────

-- Links players to organizations. A player can belong to multiple orgs.
-- role: 'player' (default) | 'director' (can manage sessions for this org)
-- status: 'active' (can participate) | 'pending' (awaiting approval — reserved for future use)
CREATE TABLE IF NOT EXISTS public.org_memberships (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'director')),
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, player_id)
);

CREATE INDEX IF NOT EXISTS org_memberships_player_idx ON public.org_memberships(player_id);
CREATE INDEX IF NOT EXISTS org_memberships_org_idx    ON public.org_memberships(org_id);

ALTER TABLE public.org_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read org_memberships"
  ON public.org_memberships FOR SELECT USING (true);


-- ── 4. Claim codes ────────────────────────────────────────────────────────────

-- Director generates a short one-time code for each unclaimed player.
-- Player enters the code during the /claim flow to link their phone-auth account
-- to their existing player record.
-- Codes expire after 7 days and become invalid once claimed.
CREATE TABLE IF NOT EXISTS public.claim_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  code        text        NOT NULL UNIQUE,
  created_by  text,       -- director identifier (e.g. 'director' or future: auth_user_id)
  expires_at  timestamptz NOT NULL DEFAULT now() + INTERVAL '7 days',
  claimed_at  timestamptz             -- NULL until the code is used
);

CREATE INDEX IF NOT EXISTS claim_codes_player_idx ON public.claim_codes(player_id);
CREATE INDEX IF NOT EXISTS claim_codes_code_idx   ON public.claim_codes(code);

ALTER TABLE public.claim_codes ENABLE ROW LEVEL SECURITY;

-- Claim codes must NOT be publicly readable — only the service role (backend) can access them.
-- No public SELECT policy is intentionally omitted here.
-- The backend validates codes using the service role key, which bypasses RLS.
