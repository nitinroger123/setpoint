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
      │ HTTPS API calls (Axios)
      ▼
FastAPI Backend (Railway)
      │
      │ Supabase Python client
      ▼
Supabase (PostgreSQL)
```

- The **frontend** (React + Vite) is a Single Page Application deployed on Vercel. It talks to the backend via REST API calls using Axios.
- The **backend** (Python + FastAPI) runs on Railway inside a Docker container. It handles all business logic and communicates with the database.
- The **database** (Supabase / PostgreSQL) stores all data. Supabase also provides auth (planned), file storage (planned), and row-level security.

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
│       └── director.py          # All /api/director/* endpoints (PIN-protected)
│
├── frontend/src/
│   ├── App.tsx                  # Router: /, /tournaments, /series/:id, /sessions/:id,
│   │                            #         /players/:id, /director, /director/sessions/:id
│   ├── lib/
│   │   ├── api.ts               # Axios client (points to VITE_API_URL)
│   │   ├── directorApi.ts       # Axios wrapper with X-Director-Pin header from localStorage
│   │   └── supabase.ts          # Supabase direct client (for future real-time)
│   └── pages/
│       ├── Sessions.tsx         # /tournaments — format tabs + series cards
│       ├── SeriesDetail.tsx     # /series/:id — leaderboard + sessions list
│       ├── SessionDetail.tsx    # /sessions/:id — live view or completed view
│       ├── PlayerProfile.tsx    # /players/:id — career stats, teammate chemistry
│       ├── Director.tsx         # /director — PIN gate + session list + create
│       └── DirectorSession.tsx  # /director/sessions/:id — full session management
│
├── scripts/
│   └── backfill_round_assignments.py  # Infers historical team assignments from point diffs
│
├── supabase/migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_tournament_series.sql
│   ├── 003_director_mode.sql    # gender on players, status on sessions, session_roster, round_assignments
│   ├── 004_scoring.sql          # round_games table
│   └── 005_session_standings.sql # session_standings table
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
| name | text | |
| phone | text unique | |
| email | text unique | |
| gender | text | `m` or `f` — set by director |

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
/                        → Tournaments list
/tournaments             → Tournaments list
/series/:id              → Series leaderboard + sessions
/sessions/:id            → Session detail (public)
/players/:id             → Player profile
/director                → Director: PIN gate + session list
/director/sessions/:id   → Director: session management
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

## Director Mode — Running a Session

### Full Workflow

1. **Go to `/director`** → enter PIN
2. **Create session** → pick a date → status becomes `draft`
3. **Add players** to the roster (search by name)
4. **Set gender** for each player (M/F toggles) — required before assigning teams
5. **Assign teams for Round 1** → click "Assign Round 1 Teams" → randomly splits into Aces/Kings/Queens with 2M+2F each
6. **Activate session** → click "Activate" → session status becomes `active`, public view shows live standings
7. **Score games**: for each round, score G1 first → G2/G3 matchups appear automatically based on who won G1
8. **Assign teams for each subsequent round** as the round starts (rounds 2–4)
9. **Complete session** → click "End Session" → finalizes standings, writes session_standings + game_results, status → `completed`

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
| `VITE_SUPABASE_ANON_KEY` | Anon JWT (safe to expose in browser) |
| `VITE_API_URL` | Railway backend URL |

> **Never** use the service role key in the frontend.

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
**Symptom:** "Gender not set for: PlayerA, PlayerB..."
**Fix:** All 12 roster players must have gender set (M or F) before teams can be assigned. Set gender via the M/F toggles next to each player's name.

**Symptom:** "Need exactly 6 men and 6 women."
**Fix:** The roster must have exactly 6M + 6F. Check current counts in the roster section and add/remove players accordingly.

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
