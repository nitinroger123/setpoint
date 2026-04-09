# Setpoint — Operational Guide

A complete reference for how the codebase is structured, how it's deployed, how things are wired together, and how to run a session end-to-end.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack & Design Choices](#tech-stack--design-choices)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Backend — FastAPI](#backend--fastapi)
6. [Frontend — React](#frontend--react)
7. [Director Mode — Running a Session](#director-mode--running-a-session)
8. [Deployment](#deployment)
9. [Environment Variables](#environment-variables)
10. [Local Development](#local-development)
11. [Adding New Features](#adding-new-features)
12. [Common Gotchas](#common-gotchas)
13. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Browser (Vercel)
      │
      ├── HTTPS API calls (Axios) ──────────────────────► FastAPI Backend (Railway)
      │                                                          │
      └── Supabase Auth (magic link) ──► Supabase Auth     Supabase Python client
                                              │                  │
                                              └──────────────────┴──► Supabase (PostgreSQL)
```

- The **frontend** (React + Vite) is a Single Page Application deployed on Vercel. It talks to the backend via REST API calls using Axios.
- The **backend** (Python + FastAPI) runs on Railway inside a Docker container. It handles all business logic and communicates with the database.
- The **database** (Supabase / PostgreSQL) stores all data. Supabase also provides auth (magic link email), file storage (avatars), and row-level security.
- **Supabase Auth** handles sign-in via email magic links. The frontend calls Supabase directly for auth; the resulting JWT is then sent to the backend on authenticated requests.
- **Resend** is the custom SMTP provider for transactional email (magic links, etc.), sending from `noreply@nitinnatarajan.com`.

---

## Tech Stack & Design Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + TypeScript + Vite | Fast builds, strong typing, React Native compatibility for future mobile app |
| Styling | Tailwind CSS v3 | Utility-first, no CSS files to maintain |
| HTTP Client | Axios | Simple, interceptor support for auth headers |
| Backend | Python + FastAPI | Learnable from Java background, async, auto-generates API docs at `/docs` |
| Data validation | Pydantic v2 | Type-safe request/response models, pairs naturally with FastAPI |
| Database | Supabase (PostgreSQL) | Managed Postgres with built-in auth, storage, RLS, and a dashboard for inspecting data |
| Deployment | Vercel + Railway | Vercel = zero-config frontend deploys from GitHub. Railway = Docker-based backend. Both auto-deploy on git push. |

---

## Project Structure

```
setpoint/
├── backend/
│   ├── main.py                  # App entry point, CORS config, router registration
│   ├── database.py              # Supabase client + fetch_all() pagination helper
│   ├── standings_helper.py      # Shared compute_live_standings() used by director + public views
│   ├── requirements.txt
│   ├── .env.example
│   ├── Dockerfile
│   ├── start.sh                 # Reads $PORT from Railway
│   ├── railway.json
│   ├── schemas/
│   │   ├── player.py            # PlayerCreate, PlayerOut
│   │   ├── session.py           # SessionCreate, SessionOut
│   │   └── game.py
│   └── routers/
│       ├── players.py           # GET /api/players, /profile, /teammate-stats
│       ├── sessions.py          # GET /api/sessions, /api/sessions/:id (public)
│       ├── series.py            # GET /api/series, /api/series/:id/leaderboard
│       ├── games.py             # POST /api/games
│       ├── director.py          # All /api/director/* endpoints (PIN-protected)
│       ├── auth.py              # POST /api/auth/claim — link JWT to player record
│       └── me.py                # GET/PUT /api/me/ — player self-service profile
│
├── frontend/src/
│   ├── App.tsx                  # Router: /, /dashboard, /tournaments, /series/:id,
│   │                            #         /sessions/:id, /players/:id, /login, /claim,
│   │                            #         /director, /director/sessions/:id,
│   │                            #         /director/players, /terms
│   ├── context/
│   │   └── AuthContext.tsx      # Auth state: session, player record, signOut, refreshPlayer
│   ├── lib/
│   │   ├── api.ts               # Axios client for public endpoints (no auth)
│   │   ├── directorApi.ts       # Axios wrapper with X-Director-Pin header from localStorage
│   │   ├── playerApi.ts         # Axios factory: injects Supabase JWT for player-auth endpoints
│   │   └── supabase.ts          # Supabase JS client (auth + direct DB)
│   └── pages/
│       ├── PlayerDashboard.tsx  # / and /dashboard — player's own stats + edit profile
│       ├── Sessions.tsx         # /tournaments — format tabs + series cards
│       ├── SeriesDetail.tsx     # /series/:id — leaderboard + sessions list
│       ├── SessionDetail.tsx    # /sessions/:id — live view or completed view
│       ├── PlayerProfile.tsx    # /players/:id — career stats, teammate chemistry
│       ├── Login.tsx            # /login — email magic link sign-in
│       ├── Claim.tsx            # /claim — enter claim code to link profile
│       ├── Director.tsx         # /director — PIN gate + session list + create
│       ├── DirectorSession.tsx  # /director/sessions/:id — full session management
│       ├── DirectorPlayers.tsx  # /director/players — player CRUD + gender + claim codes
│       └── Terms.tsx            # /terms — terms and conditions
│
├── scripts/
│   └── backfill_round_assignments.py  # Infers historical team assignments from point diffs
│
├── supabase/migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_tournament_series.sql
│   ├── 003_director_mode.sql    # gender on players, status on sessions, session_roster, round_assignments
│   ├── 004_scoring.sql          # round_games table
│   ├── 005_session_standings.sql # session_standings table
│   └── 006_session_media.sql    # session_media table (photos, YouTube, links)
│
└── GUIDE.md
```

---

## Database Schema

### `tournament_formats`
Defines the rules of each tournament type. Data-driven so new formats don't require code changes.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | e.g. `revco-roundrobin-4s` |
| name | text | Human-readable name |
| team_count | int | Number of teams (3) |
| players_per_team | int | Players per team (4) |
| num_rounds | int | Rounds per session (4) |
| games_per_round | int | Games per team per round (2) |
| total_games_per_player | int | 8 |
| scoring_type | text | `point_diff` |
| gender_rule | text | `reverse_coed` |
| active | bool | Show/hide from UI |

### `tournament_series`
A named recurring tournament (e.g. "Revco 4s at ThePostBK 2025-2026").

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| format_id | text FK | |
| location | text | |
| active | bool | |

### `players`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | First name — editable by player |
| last_name | text | Optional — editable by player |
| phone | text unique | Optional |
| email | text unique | Optional |
| gender | text | `m` or `f` — set by director |
| auth_user_id | uuid | Supabase auth user ID — null until claimed |
| avatar_url | text | Supabase Storage URL — null until uploaded |
| instagram_handle | text | Optional social handle |

### `claim_codes`
One-time codes generated by the director to let players link their email to a player record.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| player_id | uuid FK | References `players` |
| code | text unique | e.g. `NITI-4829` — uppercase alphanumeric |
| expires_at | timestamptz | Typically 7 days from creation |
| claimed_at | timestamptz | null until used; set on successful claim |

### `organizations`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | e.g. `vballnyc` |
| slug | text unique | URL-safe identifier |

### `org_memberships`
Players can belong to one or more orgs (currently just `vballnyc`).

| Column | Type | Notes |
|--------|------|-------|
| org_id | uuid FK | |
| player_id | uuid FK | Unique together with org_id |
| role | text | `player`, `director`, etc. |
| status | text | `active` or `inactive` |
| joined_at | timestamptz | |

### `sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| date | date unique | |
| format_id | text FK | |
| series_id | uuid FK | |
| status | text | `draft` → `active` → `completed` |

### `session_roster`
Players registered for a specific session.

| Column | Type | Notes |
|--------|------|-------|
| session_id | uuid FK | |
| player_id | uuid FK | |

### `round_assignments`
Which team each player was on per round. This is the source of truth for teammate stats and team display.

| Column | Type | Notes |
|--------|------|-------|
| session_id | uuid FK | |
| round_number | int | 1–4 |
| player_id | uuid FK | |
| team | text | `Aces`, `Kings`, or `Queens` |

### `round_games`
One row per game in a round. Created by the director as games are scored.

| Column | Type | Notes |
|--------|------|-------|
| session_id | uuid FK | |
| round_number | int | 1–4 |
| game_number | int | 1, 2, or 3 |
| team_a | text | |
| team_b | text | |
| score_a | int | null until scored |
| score_b | int | null until scored |

### `game_results`
One row per player per game. Written when a session is completed. Used for historical display.

| Column | Type | Notes |
|--------|------|-------|
| session_id | uuid FK | |
| player_id | uuid FK | |
| round_number | int | |
| game_number | int | |
| team | text | |
| point_diff | int | +ve = won, -ve = lost |
| total_wins | int | Denormalized session total |
| total_diff | int | Denormalized session total |
| place | int | Final ranking (1–12) |

### `session_standings`
One row per player per session. Written when a session is completed. Used by leaderboard and player profiles.

| Column | Type | Notes |
|--------|------|-------|
| session_id | uuid FK | |
| player_id | uuid FK | |
| total_wins | int | |
| total_diff | int | |
| place | int | 1–12 |

### `session_media`
Photos, YouTube links, and other URLs attached to a session. The featured item appears beside the standings table on the public session view.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| session_id | uuid FK | Cascades on delete |
| url | text | Any URL — image, YouTube, or generic link |
| caption | text | Optional label shown below the media |
| media_type | text | Auto-detected: `image`, `youtube`, or `link` |
| is_featured | bool | Only one per session; shown in the "Winning Team" pane |
| created_at | timestamptz | |

### Row Level Security
All tables have RLS enabled with **public read** policies. Writes go through the backend `service_role` key (bypasses RLS).

---

## Backend — FastAPI

### Key Utilities

**`database.py`** — two exports:
```python
from database import get_supabase, fetch_all

sb = get_supabase()                        # creates Supabase client
rows = fetch_all(sb.table("x").select("*").eq("session_id", sid))  # paginates automatically
```
Always use `fetch_all()` for queries that could return more than 1000 rows (leaderboard, game_results across sessions, round_assignments).

**`standings_helper.py`** — `compute_live_standings(session_id, sb)`:
Used by both `director.py` (live view during scoring) and `sessions.py` (public session view when status=active). Takes `round_games` + `round_assignments` and returns a ranked list of players.

### Director Auth
All `/api/director/*` endpoints require the `X-Director-Pin` header:
```
X-Director-Pin: <value of DIRECTOR_PIN env var>
```
Default PIN is `1234` if env var is not set.

### Route Pattern
```python
@router.get("")          # No trailing slash — avoids 307 redirects breaking CORS
def list_things():
    sb = get_supabase()
    return sb.table("things").select("*").execute().data
```

### API Docs
FastAPI auto-generates interactive docs at **http://localhost:8000/docs**

---

## Frontend — React

### Routes (`App.tsx`)
```
/                        → PlayerDashboard (player's own stats; shows public tournaments if not logged in)
/dashboard               → PlayerDashboard (alias for /)
/tournaments             → Public tournament/session list
/series/:id              → Series leaderboard + sessions
/sessions/:id            → Session detail (public)
/players                 → All players list
/players/:id             → Player profile
/login                   → Email magic link sign-in
/claim                   → Enter claim code to link email to player record
/director                → Director: PIN gate + session list
/director/sessions/:id   → Director: session management
/director/players        → Director: player management (add/edit/delete/gender/claim codes)
/terms                   → Terms & conditions
```

### Director API (`lib/directorApi.ts`)
All director page calls use this instead of the regular `api.ts`:
```typescript
import directorApi from '../lib/directorApi'
directorApi.post(`/api/director/sessions/${id}/activate`)
```
The PIN is read from `localStorage.getItem('directorPin')` and sent as the `X-Director-Pin` header on every request.

### SPA Routing
`frontend/vercel.json` rewrites all paths to `index.html` so deep links work:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## Player Auth & Profile Claiming

### How Sign-In Works

Setpoint uses **Supabase email magic links** — no passwords.

1. Player goes to `/login`, enters their email.
2. The frontend calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
3. Supabase (via Resend SMTP) sends an email with a magic link to the player.
4. Player clicks the link → redirects back to the app. Supabase sets a session cookie.
5. `AuthContext` detects the new session via `onAuthStateChange`, then calls `GET /api/me/` with the JWT.
6. If a player record is linked, `player` is populated. If not (not yet claimed), `player` is `null`.

### Profile Claiming

Players are created by the director before they ever sign in. To link their email to their player record:

1. Director goes to `/director/players`, finds the player row, clicks "Claim Code" to generate a claim code (e.g. `NITI-4829`).
2. Director shares the code with the player (out of band).
3. Player signs in at `/login`, then goes to `/claim` and enters the code.
4. The frontend calls `POST /api/auth/claim` with `{ code }` and the player's JWT in the `Authorization` header.
5. The backend validates the JWT, looks up the code in `claim_codes`, links `auth_user_id` on the player row, and marks the code as used.
6. `AuthContext.refreshPlayer()` is called to update state. Player is redirected to `/dashboard`.

### Auth State in the Frontend

`AuthContext` exposes:
- `session` — the Supabase session (contains `access_token` JWT)
- `player` — the linked player record from `GET /api/me/`, or `null` if not claimed yet
- `loading` — true while the initial auth check is in flight
- `signOut()` — signs out of Supabase and clears state
- `refreshPlayer()` — re-fetches the player record (call after profile updates or claiming)

### Authenticated API Calls

Use `playerApi(session)` (from `lib/playerApi.ts`) for any endpoint that requires auth. It creates an axios instance with the `Authorization: Bearer <JWT>` header:

```tsx
import playerApi from '../lib/playerApi'
const { session } = useAuth()
const res = await playerApi(session).get('/api/me/')
const res = await playerApi(session).put('/api/me/', { name: 'Nitin' })
```

### Backend Auth Dependencies

Both new routers use dependencies from `routers/auth.py`:

- `get_auth_user` — validates the JWT, returns the Supabase user object. Used in `/api/auth/claim`.
- `get_current_player` (in `routers/me.py`) — validates the JWT and looks up the linked player. Returns 404 if not yet claimed.

---

## Director Mode — Running a Session

### Player Management (`/director/players`)

Manage the player registry before session day:
- **Add players** — name required; phone, email, gender optional
- **Edit players** — click Edit on any row to update inline
- **Delete players** — cannot delete if the player has session history (prevents data loss)
- **Set gender** — set M/F once per player here; persists across all sessions

### Full Workflow

1. **Go to `/director`** → enter PIN
2. **Set up players** → click "Players" button → add/edit players and set gender in Player Management
3. **Create session** → pick a date and optional series → status becomes `draft`
4. **Add players** to the session roster (select from player list)
5. **Assign teams for Round 1** → click "Assign Teams" → auto-shuffles into Aces/Kings/Queens
   - If roster is 6M+6F: exactly 2M+2F per team
   - If roster is uneven (e.g. 7F+5M): guarantees at least 1M+1F per team, fills randomly
   - **Manual swaps**: click any player in the team grid to select, click another to swap teams; hit "Save Teams" to persist
6. **Activate session** → click "Start Session" → status becomes `active`, public view shows live standings
7. **Score games**: for each round, score G1 first → G2/G3 matchups appear automatically based on who won G1
8. **Assign teams for each subsequent round** as the round starts (rounds 2–4); re-shuffle or swap manually as needed
9. **Add media** → paste image URLs, YouTube links, or any other URL in the "Session Media" panel; mark one as Featured to show it beside the standings on the public view
10. **Complete session** → click "End Session" → finalizes standings, writes session_standings + game_results, status → `completed`

### Round Schedule (hardcoded in `director.py`)
| Round | G1 Matchup | Waiting Team |
|-------|------------|--------------|
| 1 | Aces vs Kings | Queens |
| 2 | Aces vs Queens | Kings |
| 3 | Kings vs Queens | Aces |
| 4 | Aces vs Kings | Queens |

After G1 is scored: G2 = winner vs waiting, G3 = loser vs waiting.

### Session Statuses
- `draft` — created but not started; roster and teams can be edited freely
- `active` — live; scoring is enabled; public view shows live standings and auto-refreshes every 30s
- `completed` — finalized; standings locked; leaderboard updated

---

## Deployment

### Infrastructure

| Service | What | URL |
|---------|------|-----|
| Vercel | Frontend | https://setpoint-alpha.vercel.app |
| Railway | Backend API | https://setpoint-production-a3f5.up.railway.app |
| Supabase | PostgreSQL | https://bwjrtafijohuyvdbwuye.supabase.co |
| GitHub | Source | https://github.com/nitinroger123/setpoint |

### Auto-Deploy
Push to `main` → Vercel rebuilds frontend + Railway rebuilds Docker image. Both usually live within 2–3 minutes.

### Running Database Migrations
Supabase migrations are **not** auto-applied:
1. Write SQL in `supabase/migrations/00X_description.sql`
2. Go to Supabase dashboard → **SQL Editor**
3. Paste and run the SQL
4. Commit the migration file to git

### Railway Environment Variables
Use the CLI for long values (the UI truncates them):
```bash
cd backend
railway link
railway variables set DIRECTOR_PIN="your-pin"
railway variables set SUPABASE_SERVICE_KEY="eyJ..."
```

---

## Environment Variables

### Backend (Railway)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role JWT (bypasses RLS — keep secret) |
| `SUPABASE_ANON_KEY` | Anon JWT (public access) |
| `DIRECTOR_PIN` | PIN for director endpoints (default: `1234`) |

### Frontend (Vercel)
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon JWT (safe to expose in browser — Supabase RLS is the security layer) |
| `VITE_API_URL` | Railway backend URL |

> **Never** use the service role key in the frontend.

### Supabase Auth Configuration
These are set in the Supabase dashboard (not env vars), but must be correct for auth to work:

| Setting | Where | Value |
|---------|-------|-------|
| Site URL | Auth → URL Configuration | Vercel deployment URL (e.g. `https://setpoint-alpha.vercel.app`) |
| SMTP provider | Auth → SMTP Settings | Custom SMTP via Resend |
| SMTP host | Auth → SMTP Settings | `smtp.resend.com` |
| SMTP port | Auth → SMTP Settings | `465` |
| SMTP user | Auth → SMTP Settings | `resend` |
| SMTP password | Auth → SMTP Settings | Resend API key |
| From address | Auth → SMTP Settings | `noreply@nitinnatarajan.com` |

> **Critical:** If Site URL is set to `localhost`, magic links will redirect players to localhost instead of the live app. Update it every time the Vercel URL changes.

---

## Local Development

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in keys
uvicorn main:app --reload   # http://localhost:8000
# Docs: http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # set VITE_API_URL=http://localhost:8000
npm run dev                  # http://localhost:5173
```

---

## Adding New Features

### New Tournament Format
Insert a row into `tournament_formats` in Supabase — it appears in the UI automatically.

### New API Endpoint
1. Add route to the appropriate router (no trailing slash)
2. Use `fetch_all()` for any query that isn't scoped to a single session
3. Test at http://localhost:8000/docs
4. Push → Railway auto-deploys

### New Page
1. Create `frontend/src/pages/NewPage.tsx`
2. Add route in `App.tsx`
3. Push → Vercel auto-deploys

### New Database Table
1. Write migration SQL in `supabase/migrations/00X_name.sql`
2. Run it in Supabase SQL Editor
3. Add public read RLS policy
4. Commit the file

---

## Common Gotchas

### CORS + Trailing Slashes
FastAPI 307-redirects mismatched slashes → browsers block CORS on the redirect.
**Rule:** `@router.get("")` (not `"/"`) everywhere. No trailing slash in frontend API calls.

### Supabase 1000-Row Default Limit
Queries return at most 1000 rows unless paginated. With 21+ sessions × 12 players, `game_results` already has ~2000 rows.
**Solution:** Use `fetch_all()` from `database.py` for any cross-session query. Per-session queries are fine as-is (max ~100 rows each).

### CORS Errors Are Downstream of 500s
If you see CORS errors in the browser, the real error is a 500 on the backend — FastAPI doesn't attach CORS headers to error responses. Check Railway logs for the actual Python exception.

### Railway Variable Truncation
Railway's web UI truncates long values when pasting. Use the CLI (`railway variables set`) for Supabase keys and the director PIN.

### Vite Env Vars Are Build-Time
`VITE_*` variables are baked into the JS bundle at build time. Changing them in Vercel requires a new build (push a commit), not just a redeploy.

### Supabase JWT Keys Format
The Python `supabase` SDK only accepts legacy JWT format (`eyJ...`). Use the keys from Supabase → Settings → Data API → legacy section, not the newer `sb_secret_` format.

### Supabase Site URL Must Point to Production
If `Site URL` in Supabase Auth settings is `localhost:5173`, magic link emails will redirect players to localhost, not the live app. Always set it to the Vercel URL.

### Supabase Free Tier Email Rate Limit
Supabase's built-in email (without custom SMTP) is rate-limited to 2 emails/hour. With multiple players signing in simultaneously this will fail. Custom SMTP via Resend on `nitinnatarajan.com` bypasses this limit.

### Magic Links Use a Hash Token, Not a 6-Digit Code
`supabase.auth.signInWithOtp({ email })` sends a magic link with a hash token. The `{{ .Token }}` in email templates is that hash — it's not a short numeric OTP. Do not prompt users to enter a code; the link itself handles verification automatically.

### Anon Key Is Intentionally Public
The `VITE_SUPABASE_ANON_KEY` appears in browser network requests. This is expected — Supabase's security model is RLS policies on the database, not key secrecy. The service role key (bypasses RLS) must never reach the frontend.

### Session Status Stuck on Draft
Historical sessions imported before `status` column was added default to `draft`. The public view handles this: if `status = draft` but `game_results` exist, it shows the completed view anyway.

---

## Troubleshooting

### Session won't activate
**Symptom:** "Assign Round 1 teams before activating" error.
**Fix:** You must assign teams for Round 1 before activating. Go to the Round 1 tab in the director view and click "Assign Round 1 Teams".

**Symptom:** Activate button gives a 400 "Session is already completed."
**Fix:** The session was already completed. You cannot re-activate a completed session. If scores need correcting, use the "Re-finalize" flow (call `/complete` again after fixing scores — it re-writes standings).

---

### Scores won't submit
**Symptom:** "Game not found. Score Game 1 first."
**Fix:** G2 and G3 don't exist until G1 is scored. Always score G1 first — the backend creates G2/G3 matchups automatically after G1.

**Symptom:** Score submit does nothing / CORS error in console.
**Fix:** The backend threw a 500. Check Railway logs. Most common cause: a migration hasn't been run yet (e.g. `round_games` table missing).

---

### Teams won't assign
**Symptom:** "Gender not set for: PlayerA, PlayerB..." with a link to Player Management.
**Fix:** All roster players must have gender set before teams can be assigned. Go to `/director/players` and set M/F for each player — it persists across all sessions.

**Symptom:** "Need at least 3M + 3F to assign teams."
**Fix:** You need at least 1 player of each gender per team (3 teams = minimum 3M + 3F). The roster doesn't need to be exactly 6/6 — any split works as long as you have at least 3 of each gender. If you have fewer than 3 of one gender, add a ghost player and assign them the minority gender.

---

### Live standings not updating
**Symptom:** Public session view shows old data.
**Fix:** The public view auto-refreshes every 30 seconds. Click the "↻ Refresh" button for an immediate update. If standings still look wrong, check that games are scored in the director view.

**Symptom:** Live standings are empty even after scoring.
**Fix:** `round_assignments` must exist for the session. If teams were never assigned for a round, standings can't be computed (standings require knowing which players were on which team). Assign teams in the director view.

---

### Session completion fails
**Symptom:** "No scored games found — cannot complete session."
**Fix:** At least one game must be scored before a session can be completed. Score all games you have, then complete.

**Symptom:** Player is missing from final standings.
**Fix:** The player must have a `round_assignment` for at least one round AND at least one `round_game` must be scored for that round. Check that all rounds have both teams assigned and games scored.

---

### Director page shows 401
**Symptom:** All director API calls return 401 Unauthorized.
**Fix:** The PIN stored in localStorage doesn't match the `DIRECTOR_PIN` env var on Railway. Go to `/director`, log out, and re-enter the correct PIN. If you've changed the PIN on Railway, remember it's a build-time environment variable — you may need to redeploy.

---

### Magic link redirects to localhost
**Symptom:** Player clicks the magic link email and lands on `localhost:5173`.
**Fix:** Update **Site URL** in Supabase → Authentication → URL Configuration to the Vercel deployment URL (e.g. `https://setpoint-alpha.vercel.app`).

---

### "Error sending confirmation email"
**Symptom:** Player tries to sign in and gets an error about email delivery.
**Fix:**
1. Check that Resend is connected in Supabase → Auth → SMTP Settings.
2. Verify that `nitinnatarajan.com` is verified in Resend (both DNS and domain status green).
3. If DNS was recently changed, wait up to 24 hours for propagation.
4. Check Resend logs for bounce or rejection details.

---

### Player logs in but sees "claim your profile" instead of dashboard
**Symptom:** Player authenticated successfully but `player` is null in `AuthContext`.
**Fix:** The player's `auth_user_id` isn't linked yet. They need to go to `/claim` and enter the code given to them by the director. If the code expired (> 7 days), generate a new one in `/director/players`.

---

### "Invalid or expired claim code"
**Symptom:** Player enters claim code at `/claim` and gets an error.
**Fix:**
1. Verify the code is exactly as generated (case-insensitive input is normalized automatically).
2. Check if the code was already used — each code can only be claimed once.
3. Check if the code is older than 7 days — it may have expired. Generate a new one.
4. Confirm the player is signed in before trying to claim.

---

### "Failed to execute 'fetch': Invalid value" on sign-in
**Symptom:** Browser console shows a fetch error immediately when the sign-in form is submitted.
**Fix:** The `VITE_SUPABASE_ANON_KEY` in Vercel has a hidden newline character from copy-paste wrapping. Go to Vercel → Settings → Environment Variables, delete the variable, and re-paste the key as a single unbroken string (no line breaks).

---

### Vercel 404 on direct URL
**Symptom:** Navigating directly to `/director` or `/sessions/:id` gives a 404 on Vercel.
**Fix:** `frontend/vercel.json` must exist with the SPA rewrite rule. If it's missing, add it:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
Then push to trigger a Vercel redeploy.

---

### Railway backend not responding
**Symptom:** All API calls fail / hang.
**Fix:**
1. Check Railway dashboard — is the deployment green?
2. Check Railway logs for crash on startup (usually a missing env var or import error)
3. Common cause: `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` not set. Verify with `railway variables`
4. If the service is sleeping (free tier): trigger a wake-up by hitting `https://setpoint-production-a3f5.up.railway.app/docs`
