# Setpoint — Developer Guide

This guide is for anyone contributing to the Setpoint codebase. It covers how to get set up, how the code is organized, how a request flows through the system end-to-end, and exactly what to touch when adding new features.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [How the System Fits Together](#how-the-system-fits-together)
3. [Code Path Walkthroughs](#code-path-walkthroughs)
4. [Backend Patterns](#backend-patterns)
5. [Frontend Patterns](#frontend-patterns)
6. [Adding New Features](#adding-new-features)
7. [Database Conventions](#database-conventions)
8. [Testing](#testing)
9. [Submitting Code](#submitting-code)
10. [Things to Know Before You Touch Anything](#things-to-know-before-you-touch-anything)

---

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- A Supabase account (or use the existing project keys from `.env.example`)
- Git

### Clone and Set Up

```bash
git clone https://github.com/nitinroger123/setpoint.git
cd setpoint
```

**Backend:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # Keys are already filled in .env.example for the shared dev DB
uvicorn main:app --reload      # Starts at http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env.local     # or set VITE_API_URL=http://localhost:8000 manually
npm run dev                    # Starts at http://localhost:5173
```

Both `.env.example` files contain working keys pointed at the shared Supabase development database. You're ready to go — no additional provisioning needed.

**Verify everything is working:**
- Backend: http://localhost:8000/docs — should show the interactive API explorer
- Frontend: http://localhost:5173 — should show the tournament list

---

## How the System Fits Together

```
Browser
  │
  │  axios (lib/api.ts or lib/directorApi.ts)
  ▼
FastAPI (backend/main.py)
  │  registers 5 routers:
  │  /api/players   → routers/players.py
  │  /api/sessions  → routers/sessions.py
  │  /api/series    → routers/series.py
  │  /api/games     → routers/games.py
  │  /api/director  → routers/director.py  ← PIN-protected
  │
  │  database.py: get_supabase() + fetch_all()
  ▼
Supabase (PostgreSQL)
  Tables: tournament_formats, tournament_series, players, sessions,
          session_roster, round_assignments, round_games,
          game_results, session_standings
```

### Two API clients on the frontend

| Client | File | Used for | Auth |
|--------|------|----------|------|
| `api` | `lib/api.ts` | All public-facing pages | None |
| `directorApi` | `lib/directorApi.ts` | Director pages only | Reads PIN from `localStorage`, sends as `X-Director-Pin` header |

The two clients share the same `baseURL` (`VITE_API_URL`). `directorApi` just adds the header.

### Session lifecycle

```
draft ──► active ──► completed
  │          │            │
  │       Scoring      Standings
  │       enabled      locked,
  │       Public       leaderboard
  │       auto-        updated
  │       refreshes
  │
  └─ Roster + teams editable freely
```

---

## Code Path Walkthroughs

These are the most important flows in the app. Reading these will give you a mental model of how everything connects.

---

### 1. Public session page loads (`/sessions/:id`)

**Frontend: `SessionDetail.tsx`**
```
useEffect → api.get('/api/sessions/<id>')
         → renders based on session.status:
             'active'    → <LiveView>   (auto-refreshes every 30s)
             'completed' → standings table + round-by-round + teams panel
             'draft'     → "hasn't started yet" (unless historical data exists)
```

**Backend: `routers/sessions.py` → `get_session()`**
```python
# 1. Fetch session row (+ series name via FK join)
session = sb.table("sessions").select("*, tournament_series(name)") ...

# 2. Branch on status:
if status == "active":
    # Fetch round_games, round_assignments, compute live standings
    round_games = sb.table("round_games")...
    assignments = sb.table("round_assignments")...
    live_standings = compute_live_standings(session_id, sb)
    return {**session.data, "round_games": ..., "round_assignments": ..., "live_standings": ...}

# completed/draft:
results = sb.table("game_results").select("*, players(name)")...
assignments = sb.table("round_assignments")...
return {**session.data, "results": ..., "round_assignments": ...}
```

**Key shared utility: `standings_helper.py`**
```python
# Takes round_games (with scores) + round_assignments (who was on which team)
# Returns [{id, name, wins, diff, place}, ...]
compute_live_standings(session_id, sb)
```

---

### 2. Leaderboard loads (`/series/:id`)

**Frontend: `SeriesDetail.tsx`**
```
api.get('/api/series/<id>')
  → returns series info + list of sessions
api.get('/api/series/<id>/leaderboard')
  → returns ranked player list
```

**Backend: `routers/series.py` → `get_leaderboard()`**
```python
# 1. Get all session IDs in this series
sessions = sb.table("sessions").select("id").eq("series_id", series_id)

# 2. Fetch all session_standings rows for those sessions (paginated)
per_session = fetch_all(
    sb.table("session_standings")
    .select("player_id, session_id, total_wins, total_diff, place, players(name)")
    .in_("session_id", session_ids)
)

# 3. Aggregate per player: count sessions, wins, podium finishes, compute win%
# 4. Sort by sessions desc, then win% desc
```

`session_standings` is the key table here — one clean row per player per session. It's written when a session is completed (`director.py → complete_session()`).

---

### 3. Director scores a game

**Frontend: `DirectorSession.tsx`**
```
User enters score_a, score_b → submit button
  → directorApi.post('/api/director/sessions/<id>/rounds/<r>/games/<g>/score',
                     { score_a, score_b })
  → response is updated live_standings → re-renders standings table
```

**Backend: `routers/director.py` → `submit_score()`**
```python
# 1. Verify the round_games row exists (error if game 2/3 submitted before game 1)
existing = sb.table("round_games").select("id")
            .eq(...game_number=game_number)

# 2. Write the score
sb.table("round_games").update({"score_a": score_a, "score_b": score_b})

# 3. If this was game 1: auto-create game 2 and game 3 matchups
#    G2 = winner(G1) vs waiting team
#    G3 = loser(G1) vs waiting team

# 4. Return updated live standings
return compute_live_standings(session_id, sb)
```

---

### 4. Session is completed

**Frontend: `DirectorSession.tsx`**
```
"End Session" button → directorApi.post('/api/director/sessions/<id>/complete')
```

**Backend: `routers/director.py` → `complete_session()`**
```python
# 1. Compute final standings from round_games + round_assignments
standings = compute_live_standings(session_id, sb)

# 2. Write session_standings (one row per player — used by leaderboard/profiles)
sb.table("session_standings").delete().eq("session_id")
sb.table("session_standings").insert([...])

# 3. Write game_results (one row per player per game — used by historical views)
#    Denormalize total_wins/total_diff/place onto each row
sb.table("game_results").delete().eq("session_id")
sb.table("game_results").insert([...])

# 4. Mark session as completed
sb.table("sessions").update({"status": "completed"})
```

---

### 5. Player profile loads (`/players/:id`)

**Frontend: `PlayerProfile.tsx`**
```
# Two parallel requests:
Promise.all([
  api.get('/api/players/<id>/profile'),
  api.get('/api/players/<id>/teammate-stats'),
])
```

**Backend: `routers/players.py`**

`get_player_profile()`:
```python
# Reads session_standings joined to sessions + tournament_series
# Aggregates career totals (sessions, wins, podiums, win%)
# Returns player info + overall stats + per-session history
```

`get_teammate_stats()`:
```python
# 1. Get all round_assignments for this player → session_ids
# 2. Bulk fetch all round_assignments for those sessions (to find teammates)
# 3. Bulk fetch all game_results for this player (to get wins per round)
# 4. For each round, attribute wins/games to all teammates in that round
# 5. Filter: >= 8 games together
# 6. Top 5: sort by win% desc | Worst 5: sort by win% asc
```

---

## Backend Patterns

### Every router looks like this

```python
# routers/my_resource.py
from fastapi import APIRouter, HTTPException
from database import get_supabase, fetch_all

router = APIRouter()

@router.get("")          # ← no trailing slash, ever
def list_things():
    sb = get_supabase()
    return sb.table("things").select("*").order("name").execute().data

@router.get("/{thing_id}")
def get_thing(thing_id: str):
    sb = get_supabase()
    res = sb.table("things").select("*").eq("id", thing_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Not found")
    return res.data

@router.post("")
def create_thing(body: dict):
    sb = get_supabase()
    res = sb.table("things").insert(body).execute()
    return res.data[0]
```

Register it in `main.py`:
```python
from routers import my_resource
app.include_router(my_resource.router, prefix="/api/things", tags=["things"])
```

### When to use `fetch_all()` vs `.execute()`

| Situation | Use |
|-----------|-----|
| Query scoped to a single session or player | `.execute().data` — max ~100 rows, fine |
| Query spans multiple sessions or all players | `fetch_all(query)` — paginates through Supabase's 1000-row limit |

```python
# Single session — fine
rows = sb.table("round_games").select("*").eq("session_id", sid).execute().data

# Cross-session — use fetch_all
rows = fetch_all(
    sb.table("session_standings")
    .select("*")
    .in_("session_id", session_ids)
)
```

### Supabase FK joins (fetching related data in one query)

```python
# Join to a parent table
sb.table("sessions").select("*, tournament_series(name)")

# Join to a child table
sb.table("round_assignments").select("round_number, team, players(id, name, gender)")

# Multi-level join
sb.table("session_standings").select(
    "session_id, place, sessions(date, tournament_series(name))"
)
```

### Route ordering matters

FastAPI matches routes top-to-bottom. Fixed path segments must come before parameters:

```python
# ✅ correct order
@router.get("/{player_id}/profile")     # defined first
@router.get("/{player_id}/teammate-stats")
@router.get("/{player_id}")             # catch-all last

# ❌ wrong — "profile" would be treated as a player_id
@router.get("/{player_id}")
@router.get("/{player_id}/profile")
```

### Director auth

Protected endpoints use `Depends(require_director)`:

```python
from director import require_director  # already defined in routers/director.py

@router.post("/sessions/{session_id}/my-action")
def my_action(session_id: str, _: None = Depends(require_director)):
    ...
```

`require_director` reads the `X-Director-Pin` header and compares it to `DIRECTOR_PIN` env var. Returns 401 if it doesn't match.

---

## Frontend Patterns

### Fetching data on page load

```tsx
const [data, setData] = useState<MyType | null>(null)
const [loading, setLoading] = useState(true)

useEffect(() => {
  api.get(`/api/things/${id}`)
    .then(res => { setData(res.data); setLoading(false) })
    .catch(() => setLoading(false))
}, [id])

if (loading) return <div>Loading...</div>
if (!data) return <div>Not found</div>
```

### Parallel requests (when two calls don't depend on each other)

```tsx
useEffect(() => {
  Promise.all([
    api.get(`/api/players/${id}/profile`),
    api.get(`/api/players/${id}/teammate-stats`),
  ]).then(([profileRes, statsRes]) => {
    setProfile(profileRes.data)
    setStats(statsRes.data)
    setLoading(false)
  })
}, [id])
```

### Director pages use `directorApi`, not `api`

```tsx
import directorApi from '../lib/directorApi'

// Public data (read-only)
api.get('/api/sessions')

// Director actions
directorApi.post(`/api/director/sessions/${id}/activate`)
directorApi.delete(`/api/director/sessions/${id}`)
```

### TypeScript types

Shared interfaces live in `src/types/index.ts`. Add new ones there when a new resource is introduced. Local component-only shapes can be defined inline at the top of the file.

### Tailwind conventions in this codebase

- Tables: `border rounded-xl overflow-hidden` container, `w-full text-sm` on `<table>`, `bg-gray-50 text-gray-500 uppercase text-xs` on `<thead>`
- Cards/panels: `border rounded-xl p-4 bg-white`
- Status badges: `bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full`
- Team colors: `Aces` = yellow, `Kings` = blue, `Queens` = purple (defined in `TEAM_STYLE` in `SessionDetail.tsx`)

---

## Adding New Features

### Add a new public API endpoint

1. Open the appropriate router in `backend/routers/`
2. Add the route function (no trailing slash)
3. If the query spans many rows, use `fetch_all()`
4. Test at http://localhost:8000/docs
5. No migration needed unless you're adding a table

**Example — add `GET /api/players/:id/rival-stats`:**
```python
# In routers/players.py, before the /{player_id} catch-all route:
@router.get("/{player_id}/rival-stats")
def get_rival_stats(player_id: str):
    sb = get_supabase()
    # ... your logic
    return result
```

---

### Add a new director endpoint

Same as above but in `routers/director.py` and add `_: None = Depends(require_director)`:

```python
@router.post("/sessions/{session_id}/my-action")
def my_action(session_id: str, body: dict, _: None = Depends(require_director)):
    sb = get_supabase()
    ...
```

---

### Add a new frontend page

1. Create `frontend/src/pages/MyPage.tsx`
2. Register in `App.tsx`:
   ```tsx
   import MyPage from './pages/MyPage'
   // inside <Routes>:
   <Route path="/my-path/:id" element={<MyPage />} />
   ```
3. Add TypeScript types to `src/types/index.ts` if the page introduces new data shapes
4. Use `api.get(...)` (or `directorApi` if it's a director page) for data fetching

---

### Add a new database table

1. Write the migration:
   ```bash
   # Create supabase/migrations/006_my_feature.sql
   ```
   ```sql
   create table public.my_table (
     id uuid primary key default gen_random_uuid(),
     session_id uuid references public.sessions(id) on delete cascade,
     some_column text not null
   );

   alter table public.my_table enable row level security;

   create policy "Public read" on public.my_table
     for select using (true);
   ```
2. Run it in Supabase dashboard → SQL Editor
3. Commit the file to git (migrations are version history, never delete them)
4. Add the corresponding backend logic and, if it's a new resource, a new router

---

### Add a new stat to the player profile

The player profile pulls from two places:
- **`session_standings`** — for per-session totals (wins, place, diff)
- **`round_assignments` + `game_results`** — for round-level stats (teammate chemistry, per-round win rates)

If your new stat is session-level, add it to `get_player_profile()` in `players.py`.
If it requires round-level data, add a new endpoint like `/teammate-stats` and fetch it in parallel in `PlayerProfile.tsx`.

---

### Extend the director session workflow

The session lifecycle is managed in `routers/director.py`. The key constant is `ROUND_SCHEDULE`:

```python
ROUND_SCHEDULE = {
    1: {"g1": ("Aces", "Kings"),   "waiting": "Queens"},
    2: {"g1": ("Aces", "Queens"),  "waiting": "Kings"},
    3: {"g1": ("Kings", "Queens"), "waiting": "Aces"},
    4: {"g1": ("Aces", "Kings"),   "waiting": "Queens"},
}
```

This drives which teams play G1 and which team waits (and plays G2+G3). If you ever need to change the round format, this is the only place to change it.

---

## Database Conventions

| Convention | Why |
|------------|-----|
| All tables use `uuid` PKs with `gen_random_uuid()` | Avoids sequential ID enumeration, works cleanly with Supabase |
| Foreign keys use `on delete cascade` | Deleting a session cleans up all related rows automatically |
| RLS enabled on every table, public read policy always present | Security by default; write access via service_role key in backend |
| `session_standings` for leaderboard/profile queries | One clean row per player per session — avoids aggregating 8 game_results rows per player per query |
| `round_assignments` for team membership | Decoupled from `game_results` so teams can be tracked even before scoring |
| Migrations numbered sequentially (`001_`, `002_`, ...) | Git history tracks schema evolution; never modify an already-run migration |

---

## Testing

There are no automated tests yet. The recommended workflow is:

**Backend:**
- Use the interactive docs at http://localhost:8000/docs to call endpoints manually
- For complex logic, use a quick Python script in the `scripts/` directory (see `backfill_round_assignments.py` as an example)

**Frontend:**
- Test locally against the shared dev database (`npm run dev`)
- The dev database is safe to write to — sessions/roster changes don't affect production

**Before pushing:**
1. Run the frontend build to catch TypeScript errors: `npm run build` inside `frontend/`
2. Make sure the backend starts cleanly: `uvicorn main:app --reload`

---

## Submitting Code

### Workflow

1. **Pull latest `main` before starting:**
   ```bash
   git pull origin main
   ```

2. **Create a branch for your feature:**
   ```bash
   git checkout -b feature/my-feature-name
   ```

3. **Make your changes.** Keep commits focused — one logical change per commit.

4. **Build the frontend to catch TypeScript errors before pushing:**
   ```bash
   cd frontend && npm run build
   ```

5. **Push your branch and open a PR:**
   ```bash
   git push origin feature/my-feature-name
   # Open a PR on GitHub against main
   ```

6. **PR description should include:**
   - What the feature/fix does
   - Which endpoints or pages are affected
   - Any new env vars or migrations required

### Commit message style

Short, imperative, lowercase:
```
add teammate stats endpoint to player profile
fix live standings not updating after game 2 scored
update round assignments to handle 11-player sessions
```

No ticket numbers, no "WIP", no Co-Authored-By trailers.

### What gets auto-deployed on merge to `main`

| What changed | What deploys |
|---|---|
| Anything in `backend/` | Railway rebuilds Docker image (~2 min) |
| Anything in `frontend/src/` or `frontend/*.json` | Vercel rebuilds and deploys (~1 min) |
| `supabase/migrations/` | **Nothing auto-runs.** You must manually run the SQL in Supabase SQL Editor |
| `scripts/` | Nothing — scripts are run manually |

---

## Things to Know Before You Touch Anything

### No trailing slashes — ever
FastAPI 307-redirects mismatched slashes, and browsers block CORS on the redirect. Use `@router.get("")` (not `"/"`) and never add a trailing slash to an API call on the frontend.

### CORS errors almost always mean a 500 on the backend
FastAPI doesn't attach CORS headers to error responses. If you see a CORS error in the browser console, the real error is in Railway logs.

### `fetch_all()` for cross-session queries
Supabase returns max 1000 rows by default. Any query that isn't scoped to a single session can silently truncate results. Use `fetch_all()` from `database.py`.

### Route order in players.py (and any router with sub-paths)
Routes like `/{player_id}/profile` must be defined *before* `/{player_id}` in the file. FastAPI matches top-to-bottom and would otherwise treat the literal string `"profile"` as a player ID.

### Migrations must be run manually
There is no migration runner. After writing a `.sql` file in `supabase/migrations/`, you must paste it into the Supabase SQL Editor and run it. Commit the file regardless — it's the version history.

### `session_standings` is the leaderboard source of truth
Don't query `game_results` for leaderboard or profile totals. `session_standings` has one clean row per player per session with pre-computed `total_wins`, `total_diff`, and `place`. It's written by `complete_session()` in `director.py`.

### Supabase JWT key format
The Python `supabase` SDK only accepts the legacy `eyJ...` JWT format. Don't use `sb_secret_` format keys even if Supabase suggests them.
