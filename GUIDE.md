# Setpoint — Operational Guide

A complete reference for how the codebase is structured, how it's deployed, how things are wired together, and how to add new features.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack & Design Choices](#tech-stack--design-choices)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Backend — FastAPI](#backend--fastapi)
6. [Frontend — React](#frontend--react)
7. [Deployment](#deployment)
8. [Environment Variables](#environment-variables)
9. [Local Development](#local-development)
10. [Adding New Features](#adding-new-features)
11. [Common Gotchas](#common-gotchas)

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
- The frontend also has a direct Supabase client (`lib/supabase.ts`) for future real-time features, but currently all data fetching goes through the FastAPI backend.

---

## Tech Stack & Design Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + TypeScript + Vite | Fast builds, strong typing, React Native compatibility for future mobile app |
| Styling | Tailwind CSS v3 | Utility-first, no CSS files to maintain |
| HTTP Client | Axios | Simple, interceptor support for future auth headers |
| Backend | Python + FastAPI | Learnable from Java background, async, auto-generates API docs at `/docs` |
| Data validation | Pydantic v2 | Type-safe request/response models, pairs naturally with FastAPI |
| Database | Supabase (PostgreSQL) | Managed Postgres with built-in auth, storage, RLS, and a dashboard for inspecting data |
| Deployment | Vercel + Railway | Vercel = zero-config frontend deploys from GitHub. Railway = Docker-based backend. Both auto-deploy on git push. |

### Why separate backend instead of Supabase Edge Functions?
The app needs custom Python business logic (team randomization, stats aggregation, Google Sheets import) that's easier to write and test in FastAPI than in Deno edge functions.

### Why not use Supabase directly from the frontend?
For read-only public data we could, but the backend gives us a clean API boundary, makes auth easier to enforce later, and lets us do complex aggregations in Python (e.g. leaderboard calculation).

---

## Project Structure

```
setpoint/
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # App entry point, CORS config, router registration
│   ├── database.py             # Supabase client factory
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Template for environment variables
│   ├── Dockerfile              # Docker build for Railway
│   ├── start.sh                # Container startup script (reads $PORT from Railway)
│   ├── railway.json            # Railway deployment config
│   ├── models/                 # Internal Pydantic data models
│   │   ├── player.py
│   │   ├── session.py
│   │   └── game.py
│   ├── schemas/                # Request/response validation schemas
│   │   ├── player.py           # PlayerCreate, PlayerOut
│   │   ├── session.py          # SessionCreate, SessionOut
│   │   └── game.py             # GameCreate, GameOut
│   ├── routers/                # API route handlers (one file per resource)
│   │   ├── players.py          # GET /api/players, /api/players/:id/profile
│   │   ├── sessions.py         # GET /api/sessions/formats, /api/sessions, /api/sessions/:id
│   │   ├── series.py           # GET /api/series, /api/series/:id, /api/series/:id/leaderboard
│   │   └── games.py            # POST /api/games
│   └── scripts/
│       └── import_sheets.py    # One-time Google Sheets → Supabase import
│
├── frontend/                   # React + TypeScript frontend
│   ├── src/
│   │   ├── main.tsx            # React DOM entry point
│   │   ├── App.tsx             # Router setup, Nav component
│   │   ├── index.css           # Tailwind base imports
│   │   ├── types/
│   │   │   └── index.ts        # Shared TypeScript interfaces
│   │   ├── lib/
│   │   │   ├── api.ts          # Axios client (points to VITE_API_URL)
│   │   │   └── supabase.ts     # Supabase direct client (for future real-time)
│   │   └── pages/
│   │       ├── Sessions.tsx    # /tournaments — format tabs + series cards
│   │       ├── SeriesDetail.tsx# /series/:id — leaderboard + sessions list
│   │       ├── SessionDetail.tsx # /sessions/:id — standings table
│   │       └── PlayerProfile.tsx # /players/:id — player stats + history
│   ├── .env.example
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql   # Core tables: formats, players, sessions, game_results
│       └── 002_tournament_series.sql # tournament_series table + series_id on sessions
│
└── GUIDE.md                    # This file
```

---

## Database Schema

### Tables

#### `tournament_formats`
Defines the rules of each tournament type. Data-driven so new formats don't require code changes.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | e.g. `revco-roundrobin-4s` |
| name | text | Human-readable name |
| team_count | int | Number of teams per session |
| players_per_team | int | Players per team |
| num_rounds | int | Rounds per session |
| games_per_round | int | Games each team plays per round |
| total_games_per_player | int | Derived: num_rounds × games_per_round |
| scoring_type | text | `point_diff` or `win_loss` |
| ranking_primary | text | `wins` |
| ranking_secondary | text | `point_diff` |
| gender_rule | text | `reverse_coed`, `open`, `mens`, `womens` |
| active | bool | Show/hide from UI |

#### `tournament_series`
A named recurring tournament (e.g. "Revco 4s at ThePostBK 2025-2026"). Groups sessions together.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| name | text | Display name |
| format_id | text FK | References tournament_formats |
| location | text | Venue address |
| active | bool | Show/hide from UI |

#### `players`
Individual players. Phone/email are unique — used for future auth.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| name | text | Display name |
| phone | text unique | For SMS auth (future) |
| email | text unique | For OAuth auth (future) |

#### `sessions`
A single tournament day (e.g. one Saturday).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| date | date unique | One session per day |
| format_id | text FK | References tournament_formats |
| series_id | uuid FK | References tournament_series |
| notes | text | Optional notes |

#### `game_results`
One row per player per game. A player plays 8 games per session (4 rounds × 2 games).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| session_id | uuid FK | References sessions |
| player_id | uuid FK | References players |
| round_number | int | 1–4 |
| game_number | int | 1–2 |
| team | text | `Aces`, `Kings`, or `Queens` |
| point_diff | int | +ve = win side, -ve = loss side |
| total_wins | int | Denormalized session total (same for all 8 rows) |
| total_diff | int | Denormalized session total |
| place | int | Final ranking in session (1–12) |

> **Why denormalize total_wins/total_diff/place?**
> These are session-level summaries stored on every game row so the leaderboard query can read just one row per player per session (round=1, game=1) instead of aggregating all 8 rows. This avoids Supabase's 1000-row default query limit.

### Row Level Security
All tables have RLS enabled with **public read** policies. Write access currently goes through the backend using the `service_role` key (bypasses RLS). When player auth is added, write policies will be added per role.

---

## Backend — FastAPI

### Entry Point: `main.py`
Registers all routers and configures CORS. When adding a new resource:
1. Create `routers/my_resource.py`
2. Import and register: `app.include_router(my_resource.router, prefix="/api/my-resource", tags=["my-resource"])`
3. Add allowed CORS origins here when deploying to new domains

### Database Access: `database.py`
```python
from database import get_supabase
sb = get_supabase()
```
Every router calls `get_supabase()` at the start of each request. This creates a new Supabase client using the service role key which bypasses RLS.

### Router Pattern
Each router follows the same pattern:
```python
from fastapi import APIRouter
from database import get_supabase

router = APIRouter()

@router.get("")          # No trailing slash — avoids 307 redirects breaking CORS
def list_things():
    sb = get_supabase()
    return sb.table("things").select("*").execute().data
```

> **Important:** All routes use no trailing slash (e.g. `@router.get("")` not `@router.get("/")`). FastAPI redirects mismatched slashes with a 307, which breaks CORS in browsers.

### API Docs
FastAPI auto-generates interactive API docs. When running locally: **http://localhost:8000/docs**

### Schemas vs Models
- `models/` — internal data shapes (not heavily used yet, can be merged into schemas)
- `schemas/` — Pydantic models used for request validation (`*Create`) and response serialization (`*Out`)

---

## Frontend — React

### Routing (`App.tsx`)
```
/                  → Sessions (tournaments list)
/tournaments       → Sessions (same)
/series/:id        → SeriesDetail
/sessions/:id      → SessionDetail
/players/:id       → PlayerProfile
```

### API Calls (`lib/api.ts`)
All backend calls go through the Axios instance in `lib/api.ts`:
```typescript
import api from '../lib/api'
api.get('/api/sessions/formats')   // no trailing slash
api.get(`/api/series/${id}`)
```

> **Important:** Never add trailing slashes to API calls. The backend routes are defined without them and FastAPI will 307 redirect otherwise, which browsers block due to CORS.

### Adding a New Page
1. Create `frontend/src/pages/MyPage.tsx`
2. Add the route in `App.tsx`: `<Route path="/my-path/:id" element={<MyPage />} />`
3. Add TypeScript types to `types/index.ts` if needed
4. Fetch data with `api.get(...)` inside a `useEffect`

### State Management
Currently uses local `useState` + `useEffect` per page. `@tanstack/react-query` is installed for when data fetching gets more complex (caching, refetching, background sync).

### Styling
Tailwind CSS v3. All styles are utility classes inline on JSX elements. No separate CSS files except `index.css` which just has the Tailwind base imports.

---

## Deployment

### Infrastructure

| Service | What | URL |
|---------|------|-----|
| Vercel | Frontend hosting | https://setpoint-alpha.vercel.app |
| Railway | Backend API | https://setpoint-production-a3f5.up.railway.app |
| Supabase | PostgreSQL database | https://bwjrtafijohuyvdbwuye.supabase.co |

### How Auto-Deploy Works
1. Push to `main` branch on GitHub
2. **Vercel** automatically triggers a new build (`npm run build`) and deploys the frontend
3. **Railway** automatically builds the Docker image from `backend/Dockerfile` and restarts the container

### Backend Docker Build (`backend/Dockerfile`)
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x start.sh
CMD ["./start.sh"]
```

### Backend Startup (`backend/start.sh`)
```bash
#!/bin/sh
exec uvicorn main:app --host 0.0.0.0 --port $PORT
```
Railway injects `$PORT` dynamically — never hardcode the port.

### Running Database Migrations
Supabase migrations are not auto-applied. When you add a new migration file:
1. Write the SQL in `supabase/migrations/00X_description.sql`
2. Go to Supabase dashboard → **SQL Editor**
3. Paste and run the SQL manually
4. Commit the migration file to git for version history

### Railway Environment Variables
Set via Railway CLI (UI truncates long values):
```bash
cd backend
railway link   # select your project
railway variables set KEY=value
```

---

## Environment Variables

### Backend (Railway)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role JWT key (full access, bypasses RLS) |
| `SUPABASE_ANON_KEY` | Anon JWT key (public access) |
| `SHEETS_SPREADSHEET_ID` | Google Sheet ID for historical data import |

### Frontend (Vercel)
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon JWT key (safe to expose in browser) |
| `VITE_API_URL` | Railway backend URL |

> **Never** use the service role key in the frontend. It bypasses all security.

---

## Local Development

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in Supabase keys
uvicorn main:app --reload   # http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # fill in Supabase + API URL
npm run dev                  # http://localhost:5173
```

### VITE_API_URL for local dev
Set to `http://localhost:8000` in `frontend/.env.local` to point at your local backend.

---

## Adding New Features

### Adding a New Tournament Format
1. Insert a row into `tournament_formats` in Supabase:
```sql
insert into public.tournament_formats (id, name, team_count, players_per_team, num_rounds, games_per_round, total_games_per_player, scoring_type, ranking_primary, ranking_secondary, gender_rule)
values ('my-format-id', 'My Format Name', 3, 4, 4, 2, 8, 'point_diff', 'wins', 'point_diff', 'open');
```
2. The format tab appears automatically in the UI — no code changes needed.

### Adding a New API Endpoint
1. Add the route to the appropriate router in `backend/routers/`
2. No trailing slash on the route decorator
3. Test locally at http://localhost:8000/docs
4. Push to main → Railway auto-deploys

### Adding a New Page
1. Create `frontend/src/pages/NewPage.tsx`
2. Add route in `App.tsx`
3. Add any new TypeScript types to `types/index.ts`
4. Push to main → Vercel auto-deploys

### Adding a New Database Table
1. Write migration SQL in `supabase/migrations/00X_name.sql`
2. Run it in Supabase SQL Editor
3. Add RLS policies (at minimum a public read policy)
4. Commit the migration file to git
5. Add the corresponding FastAPI router and Pydantic schema

### Planned Features (in rough priority order)
- **Player auth** — Supabase phone OTP + Google OAuth. Players sign in and see their own profile.
- **Director mode** — Protected routes for tournament directors. Create sessions, assign teams, enter scores live.
- **Live scoring** — Real-time score updates during a session using Supabase Realtime subscriptions.
- **Hall of Fame** — Photo uploads per series using Supabase Storage. Highlights and captions.
- **WhatsApp invite** — Generate invite link with session details when creating a new session.
- **Payment tracking** — Mark players as paid/unpaid per session.
- **Mobile app** — React Native using the same component logic and FastAPI backend.

---

## Common Gotchas

### CORS + Trailing Slashes
FastAPI redirects mismatched trailing slashes (e.g. `/api/series` → `/api/series/`) with a 307. Browsers block CORS on redirects.
**Rule:** All route decorators use no trailing slash (`@router.get("")`), all frontend API calls use no trailing slash.

### Supabase 1000-Row Default Limit
Supabase returns max 1000 rows by default. With 21 sessions × 12 players × 8 game rows = ~2016 rows, fetching all game_results at once will be truncated.
**Solution:** The leaderboard queries only fetch `round_number=1, game_number=1` rows (one per player per session) to stay well under the limit. When adding new aggregation queries, be mindful of this.

### Railway Variable Truncation
Railway's web UI truncates long variable values when pasting. Always use the CLI for long values (like JWT keys):
```bash
railway variables set SUPABASE_SERVICE_KEY="eyJ..."
```

### Vite Env Vars Are Build-Time
`VITE_*` variables are baked into the JavaScript bundle at build time. Changing them in Vercel requires a new build (push a commit), not just a redeploy.

### Supabase JWT Keys vs New Format Keys
Supabase recently introduced `sb_secret_` / `sb_publishable_` format keys. The Python `supabase` SDK (v2.7.4) only accepts the legacy JWT format (`eyJ...`). Use the JWT keys from Supabase → Settings → Data API → legacy section.

### Google Sheets Token Scope
The `token.json` used by the MCP server was created with different OAuth scopes than `spreadsheets.readonly`. The import script uses a separate token at `/Users/nitinn/setpoint_token.json` generated specifically with the sheets read scope.
