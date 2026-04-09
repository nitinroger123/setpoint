# CLAUDE.md — Setpoint

This file is the authoritative context document for working with the Setpoint codebase. Read it before making any changes.

---

## Working Preferences

- **Always plan before writing code.** Present the approach, files affected, and tradeoffs. Wait for confirmation before touching any file.
- **Never write code speculatively.** If the plan changes mid-task, pause and re-confirm before continuing.
- **Do not add Co-Authored-By trailers to commits.** Keep commit messages clean.
- **After any platform-level change** (auth flow, new routes, new services, env vars), update `DEVELOPER.md` and `GUIDE.md` in the same work session.
- **Code quality is non-negotiable:** every function needs a docstring/comment, names must be descriptive, booleans read as questions (`is_active`, `has_scored`), functions should be small and single-purpose.

---

## What Setpoint Is

A volleyball tournament management app. The director (owner/operator) runs sessions and scores games. Players view their history, career stats, and teammate chemistry.

**Primary format: Reverse Coed 4s (Saturday sessions)**
- 12 players per session: 6M + 6F, randomly split into 3 teams (Aces, Kings, Queens) of 2M+2F each
- 4 rounds of play using a winner-stays format
- Round schedule:
  - R1: Aces vs Kings (Queens wait); R4: same as R1
  - R2: Aces vs Queens (Kings wait)
  - R3: Kings vs Queens (Aces wait)
- In each round: G1 = opener; G2 = winner(G1) vs waiting team; G3 = loser(G1) vs waiting team
- Each player plays exactly 2 games per round = 8 games total per session
- Top 4 scorers at session end are the winners

**Second format: Pool Play + Single Elimination**
- Any team size (twos, threes, fours, sixes), any division/level/surface
- Teams registered per-session; assigned to pools; round-robin pool play; then bracket
- Pool standings: wins = sets won (not match wins); sort by wins → set_diff → point_diff → total_points_scored
- Bracket: cross-pool snake seeding; byes for top seeds when bracket size isn't a power of 2
- Currently implemented for doubles (twos) on grass

---

## Tech Stack

| Layer | Technology | URL |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS | https://setpoint-alpha.vercel.app |
| Backend | Python 3.12 + FastAPI | https://setpoint-production-a3f5.up.railway.app |
| Database | Supabase (PostgreSQL) | https://bwjrtafijohuyvdbwuye.supabase.co |
| Auth | Supabase magic link email via Resend SMTP | — |
| Hosting | Vercel (frontend), Railway (backend) | — |
| Repo | https://github.com/nitinroger123/setpoint | — |

**Deployment:** Push to `main` → Vercel + Railway auto-deploy. Supabase migrations are **never auto-run** — paste SQL into the Supabase SQL Editor manually, then commit the file.

---

## Key Files Map

### Backend
```
backend/
  main.py                    — FastAPI app, CORS config, all router registrations
  config.py                  — Format constants (ROSTER_SIZE, NUM_ROUNDS, etc.) — change here, not in code
  database.py                — get_supabase() + fetch_all() for paginated queries
  standings_helper.py        — compute_live_standings(): shared by director + public session views
  pool_playoff_helper.py     — Pure logic: pool standings, bracket seeding, score validation (no DB calls)
  routers/
    players.py               — /api/players: list, profile, teammate-stats
    sessions.py              — /api/sessions: list, get (branches on competition_type + status), lookups
    series.py                — /api/series: list (with competition_type filter), get, leaderboard
    games.py                 — /api/games
    director.py              — /api/director: PIN-gated; session CRUD, scoring, series CRUD, media
    pool_playoff.py          — /api/pool: public read + unauthenticated score submission
    pool_playoff_director.py — /api/director/pool: PIN-gated pool+bracket director workflow
    auth.py                  — /api/auth: magic link, claim profile
    me.py                    — /api/me: JWT-validated player self-service
  schemas/
    session.py               — SessionCreate, SessionOut (with pool+bracket metadata fields)
    pool_playoff.py          — All pool+bracket Pydantic models
```

### Frontend
```
frontend/src/
  App.tsx                    — All routes
  types/index.ts             — All shared TypeScript interfaces (add new ones here)
  lib/
    api.ts                   — Public axios client (no auth)
    directorApi.ts           — Director axios client (sends X-Director-Pin from localStorage)
    playerApi.ts             — Player axios client (sends JWT from Supabase session)
    supabase.ts              — Supabase JS client for auth
  context/AuthContext.tsx    — Provides session, player, loading, refreshPlayer
  pages/
    Sessions.tsx             — Public session list, tabbed by competition type
    SessionDetail.tsx        — Public session view; redirects pool sessions to /pool/:id
    SeriesDetail.tsx         — Series header + leaderboard
    PlayerProfile.tsx        — Career stats + teammate chemistry
    Director.tsx             — PIN gate + series CRUD + session list + create session
    DirectorSession.tsx      — Full round-robin session management (roster → teams → score → complete)
    DirectorPoolPlayoff.tsx  — Tab-based pool+bracket director workflow
    PoolPlayoffDetail.tsx    — Public pool+bracket view (standings + bracket, 30s refresh)
    Login.tsx / Claim.tsx    — Player auth
  components/
    BracketView.tsx          — Visual single-elim bracket (rounds left-to-right)
    PoolStandingsTable.tsx   — Pool standings with advancing/play-in indicators
```

---

## Database Schema Overview

### Core tables
| Table | Purpose |
|-------|---------|
| `players` | All players (id, name, gender: m/f, auth_user_id nullable) |
| `tournament_series` | A recurring series (revco 4s Saturdays, etc.) with FK metadata |
| `sessions` | One session per event (status: draft/active/completed) |
| `session_roster` | Which players are in a given session |
| `round_assignments` | (session_id, round_number, player_id, team) — team per round |
| `round_games` | (session_id, round_number, game_number, team_a, team_b, score_a, score_b) |
| `game_results` | Denormalized: one row per player per game, with total_wins/diff/place |
| `session_standings` | **Leaderboard source of truth.** One row per player per session. Written at completion. |
| `session_media` | Photos/links attached to a session |

### Lookup tables (added migration 009)
`game_formats` (twos/threes/fours/sixes), `competition_types` (round_robin/pool_playoff_single_elim/...), `levels` (open/aa/a/bb/b), `surfaces` (grass/sand/indoor), `divisions` (mens/womens/coed/coed_reverse)

### Pool+Playoff tables (added migration 011)
| Table | Purpose |
|-------|---------|
| `session_teams` | Teams registered for a pool+playoff session (name, seed, pool) |
| `session_team_players` | Junction: team ↔ player |
| `pool_games` | Round-robin games within a pool (up to 3 sets per match) |
| `play_in_games` | Tiebreaker games for the last advancing spots |
| `bracket_games` | Single-elim bracket; self-referential via winner_advances_to |
| `session_pool_config` | teams_per_pool, teams_advancing_per_pool per session |
| `session_stage_scoring` | Scoring rules per stage (pool/playoff/playoff_final) per session |
| `format_stage_scoring_defaults` | Seeded defaults per game_format + competition_type |

### Auth tables (added migration 007)
`claim_codes` (one-time codes to link players to auth users), `organizations`, `org_memberships`

### Migration history
```
001 — Initial schema
002 — Tournament series
003 — Director mode (round_games, round_assignments)
004 — Scoring (game_results)
005 — session_standings
006 — session_media
007 — Player auth (claim_codes, organizations, org_memberships)
008 — Player last name
009 — Lookup tables (game_formats, competition_types, levels, surfaces, divisions)
010 — tournament_series metadata FK columns + backfill
011 — Pool+playoff tables
```

---

## Auth Model

### Player auth (Supabase magic link)
- Players sign in via email magic link (Supabase OTP, delivered via Resend SMTP)
- JWT validates in backend via `sb.auth.get_user(token)`
- `players.auth_user_id` links the auth user to the player record
- New users get a `claim_codes` row; they claim their profile at `/claim`
- Frontend: `useAuth()` from `AuthContext` provides `session`, `player`, `loading`, `refreshPlayer`
- Backend dependency: `Depends(get_current_player)` in `me.py` → returns player dict or 401/404

### Director auth (PIN-based)
- Single global PIN stored in `DIRECTOR_PIN` env var (default: `"1234"`)
- Sent as `X-Director-Pin` request header
- Frontend: `directorApi` reads PIN from `localStorage` and injects it automatically
- Backend dependency: `Depends(require_director)` in `director.py` → 401 if PIN mismatch
- **This is intentionally simple.** Org-scoped director roles are a future feature.

---

## Architectural Decisions and Why

### `session_standings` is the leaderboard source of truth
Don't aggregate `game_results` for leaderboard queries. `session_standings` is one clean row per player per session with pre-computed totals. It's written atomically when a session is completed. Query this table for anything involving career stats, win rates, or series leaderboards.

### `fetch_all()` for cross-session queries
Supabase returns max 1000 rows by default and silently truncates. Any query that isn't scoped to a single session or single player must use `fetch_all()` from `database.py`. Single-session queries (e.g. fetching round_games for one session) are safe to `.execute().data` directly.

### No trailing slashes on routes — ever
FastAPI 307-redirects mismatched slashes, and browsers block CORS on the redirect. Routes are defined as `@router.get("")` and API calls never have trailing slashes.

### CORS errors almost always mean a 500 on the backend
FastAPI doesn't attach CORS headers to error responses. A CORS error in the browser usually means the real error is in Railway logs.

### Route order matters in FastAPI
Sub-path routes must be defined before parameter routes. If `/{player_id}` comes before `/{player_id}/profile`, FastAPI treats the literal string `"profile"` as a player_id.

```python
# Correct order:
@router.get("/{player_id}/profile")      # sub-path first
@router.get("/{player_id}")              # catch-all last
```

### Pool standings use per-set counting (not per-match)
In `per_set` pool play format (the default), each individual set result counts independently. A 2-set match split 1-1 gives both teams 1W-1L. This is different from winner-take-all match counting. The `pool_play_format` column on `session_stage_scoring` controls this; `winner_take_all` logic is stubbed but deferred.

### Bracket seeding is cross-pool snake-draft
Top seeds from different pools are separated so pool-mates can't meet until late rounds. Standard pattern for 2-pool 2-advancing (4 teams): 1A vs 2B, 1B vs 2A. `pool_playoff_helper.py` handles this.

### `pool_playoff_helper.py` has no DB calls
All pool+bracket logic (standings computation, bracket seeding, bracket structure generation, score validation) is pure Python. DB calls happen in the routers. This makes the logic testable and reusable.

### `config.py` centralizes format constants
All round-robin format numbers (roster size, team count, rounds per session, etc.) live in `backend/config.py`. Import from there, don't hardcode.

---

## Gotchas

### Supabase JWT key format
The Python `supabase` SDK only accepts the legacy `eyJ...` JWT format for the service key. Do not use `sb_secret_` prefixed keys even if Supabase suggests them — they will silently fail.

### Supabase Site URL must be the live Vercel URL
In Supabase → Auth → URL Configuration, `Site URL` must point to `https://setpoint-alpha.vercel.app`. If it points to localhost, magic link emails will redirect players to localhost instead of the live app.

### `VITE_*` env vars must not have newlines
Supabase keys are long and can pick up invisible newline characters when copy-pasted into Vercel's env var UI. A newline in `VITE_SUPABASE_ANON_KEY` causes a `Failed to execute 'fetch': Invalid value` error at runtime. Always verify single-line.

### Resend SMTP is required for email at volume
Supabase's built-in email sender is limited to 2 emails/hour on the free tier. Resend is connected as a custom SMTP provider using the `nitinnatarajan.com` domain. DNS (DKIM, SPF, DMARC) is managed in Namecheap. Email delivery issues → check Resend dashboard logs first.

### Migrations are never auto-run
Writing a `.sql` file in `supabase/migrations/` does nothing automatically. You must paste the SQL into the Supabase SQL Editor and run it manually. Commit the file regardless — it's the schema version history. Never modify an already-run migration.

### All delete operations require explicit confirmation dialogs
Every director action that deletes data must use `window.confirm()` before calling the API. This is enforced across `DirectorSession.tsx` and `DirectorPoolPlayoff.tsx`. Follow this pattern for any new delete actions.

### `session_pool_config` is pre-created on session creation
When a director creates a session for a pool+playoff series, `director.py → create_session()` automatically pre-populates `session_stage_scoring` (from `format_stage_scoring_defaults`) and creates a `session_pool_config` row. Don't assume these need to be manually created.

---

## Future Plans

### Org-scoped director roles (not yet implemented)
**Current state:** Director = global admin. One `DIRECTOR_PIN` env var with full access to all series and sessions.

**Planned:** Two distinct roles:
- **Admin** — full access across all organizations
- **Director** — can only access and manage tournaments within their own organization

The `organizations` and `org_memberships` tables already exist (migration 007). The `tournament_series` table has a nullable `organization_id` column ready for use.

**Do not hard-bake global assumptions into new features.** Series/session queries should eventually be filterable by org. When building new series or tournament features, keep `organization_id` as a natural future FK. Do not add per-director access control logic until explicitly asked.

### Courts field for scheduling
The director mentioned wanting to enter the number of available courts when setting up a pool+playoff tournament, to drive scheduling/court rotation logic. Not yet implemented. If adding it, it belongs on `session_pool_config`.

### Automated tests
There are currently no automated tests. Backend logic is verified via the FastAPI docs UI (`/docs`) and manual scripts in `scripts/`. Before pushing, always run `npm run build` in `frontend/` to catch TypeScript errors.

---

## Environment Variables

### Backend (Railway)
| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (full DB access, bypasses RLS) |
| `DIRECTOR_PIN` | PIN for director endpoints (default: `"1234"`) |
| `SUPABASE_STORAGE_URL` | Used for session media uploads to Supabase Storage |

### Frontend (Vercel)
| Var | Purpose |
|-----|---------|
| `VITE_API_URL` | Backend URL (Railway) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public, safe to expose) |
