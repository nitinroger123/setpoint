# Setpoint — Java Developer Guide

This guide covers the Java backend (`backend-java/`). The Python backend (`backend/`) remains in place during the transition — see `DEVELOPER.md` for the Python side. Once the Java backend is deployed and verified, the Python backend will be removed.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [How the System Fits Together](#how-the-system-fits-together)
3. [Code Path Walkthroughs](#code-path-walkthroughs)
4. [Backend Patterns](#backend-patterns)
5. [Adding New Features](#adding-new-features)
6. [Database Conventions](#database-conventions)
7. [Testing](#testing)
8. [Submitting Code](#submitting-code)
9. [Things to Know Before You Touch Anything](#things-to-know-before-you-touch-anything)

---

## Getting Started

### Prerequisites

- Java 21+ (check: `java -version`)
- Maven 3.9+ (check: `mvn -v`). Install on Mac: `brew install maven`
- IntelliJ IDEA Community Edition (recommended) — first-class Spring Boot support
- Node.js 18+ (for the frontend)
- Git

### Clone and Set Up

```bash
git clone https://github.com/nitinroger123/setpoint.git
cd setpoint
```

**Backend:**
```bash
cd backend-java
cp .env.example .env
# Fill in .env — see "Environment Variables" section below
mvn spring-boot:run        # Starts at http://localhost:8080
```

**Frontend** (unchanged from Python guide):
```bash
cd frontend
npm install
cp .env.example .env.local   # Set VITE_API_URL=http://localhost:8080
npm run dev                  # Starts at http://localhost:5173
```

> **Note:** The Java backend runs on port **8080**, not 8000. Update `VITE_API_URL` in your frontend `.env.local` accordingly.

### Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `SUPABASE_DB_URL` | Supabase dashboard → Settings → Database → URI. Prefix with `jdbc:` → `jdbc:postgresql://db.xxxx.supabase.co:5432/postgres` |
| `SUPABASE_DB_USER` | `postgres` (default) |
| `SUPABASE_DB_PASSWORD` | Supabase dashboard → Settings → Database → Database Password |
| `SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard → Settings → API → service_role key |
| `DIRECTOR_PIN` | Same PIN as the Python backend |

`spring-dotenv` loads `.env` automatically on startup — no need to export variables.

### Generating jOOQ classes (optional but recommended)

jOOQ can generate type-safe Java classes directly from your live Supabase schema. Once generated, column names and table names become compile-time checked instead of plain strings.

```bash
mvn jooq-codegen:generate
```

Generated classes land in `src/generated/java/com/setpoint/generated/`. Re-run whenever you change the DB schema. The app works without running this — all current queries use plain SQL strings.

### Verify it's working

- `http://localhost:8080/sessions` — should return your session list as JSON
- `http://localhost:8080/series` — should return active series

There is no interactive API explorer (unlike FastAPI's `/docs`). Use the frontend or a tool like [Bruno](https://www.usebruno.com/) / Postman to test endpoints directly.

---

## How the System Fits Together

```
Browser
  │
  │  axios (lib/api.ts or lib/directorApi.ts)
  ▼
Spring Boot (backend-java/)
  │  5 controllers:
  │  /players            → PlayerController.java
  │  /sessions           → SessionController.java
  │  /series             → SeriesController.java
  │  /director/sessions  → DirectorSessionController.java   ← PIN-protected
  │  /director/players   → DirectorPlayerController.java    ← PIN-protected
  │
  │  StandingsService.java — live standings computation
  │  StorageService.java   — Supabase Storage file uploads
  │  AppConstants.java     — tournament format constants
  │
  │  DSLContext (jOOQ) → PostgreSQL JDBC → Supabase Postgres
  ▼
Supabase (PostgreSQL)
  Tables: tournament_formats, tournament_series, players, sessions,
          session_roster, round_assignments, round_games,
          game_results, session_standings, session_media
```

### Auth: DirectorAuthInterceptor

All `/director/**` routes are intercepted by `DirectorAuthInterceptor`. It reads the `X-Director-Pin` header and compares it to the `DIRECTOR_PIN` env var. Returns 401 if it doesn't match. Registered in `WebConfig.java`.

The frontend sends the PIN the same way as with Python — `directorApi.ts` already attaches `X-Director-Pin` to every request.

### Two API clients on the frontend (unchanged)

| Client | File | Used for |
|--------|------|----------|
| `api` | `lib/api.ts` | All public pages |
| `directorApi` | `lib/directorApi.ts` | Director pages — adds `X-Director-Pin` header |

---

## Code Path Walkthroughs

### 1. Public session page loads (`/sessions/:id`)

**Frontend: `SessionDetail.tsx`** — unchanged, still calls `/api/sessions/<id>`.

**Backend: `SessionController.getSession()`**
```java
// 1. Fetch session row with series name via LEFT JOIN
db.fetch("SELECT s.*, ts.name AS series_name FROM sessions s " +
         "LEFT JOIN tournament_series ts ON ts.id = s.series_id WHERE s.id = ?", sessionId)

// 2. Branch on status:
if ("active".equals(status)) {
    // Fetch round_games, round_assignments, compute live standings
    standingsService.computeLiveStandings(sessionId)
} else {
    // Fetch game_results (with player name JOIN) + round_assignments
}
// 3. Always include media
```

**Key service: `StandingsService.computeLiveStandings()`**
```java
// Reads round_games (scored only) + round_assignments
// Returns List<Map<String, Object>> with {id, name, wins, diff, place}
// Uses dense ranking: tied players share the same place number
```

---

### 2. Director scores a game

**Frontend: `DirectorSession.tsx`** — unchanged, calls `/api/director/sessions/<id>/rounds/<r>/games/<g>/score`.

**Backend: `DirectorSessionController.submitScore()`**
```java
// 1. Verify the game row exists
// 2. UPDATE round_games SET score_a = ?, score_b = ?
// 3. If game_number == 1:
//      winner = higher score team
//      loser  = lower score team
//      INSERT round_games game 2: (winner vs waiting)
//      INSERT round_games game 3: (loser  vs waiting)
// 4. Return standingsService.computeLiveStandings(sessionId)
```

---

### 3. Session is completed

**Backend: `DirectorSessionController.completeSession()`**
```java
// 1. Compute final standings
// 2. DELETE + INSERT session_standings (one row per player)
// 3. DELETE + INSERT game_results (one row per player per game, denormalized)
// 4. UPDATE sessions SET status = 'completed'
```

---

### 4. Leaderboard loads (`/series/:id`)

**Backend: `SeriesController.getLeaderboard()`**
```java
// 1. Get session IDs for the series
// 2. JOIN session_standings → players for all those sessions
// 3. Aggregate per player: sessions, wins, podiums, win%
// 4. Sort: sessions desc, win% desc
```

---

### 5. Player profile loads (`/players/:id`)

**Backend: `PlayerController.getPlayerProfile()`**
```java
// Reads session_standings JOIN sessions JOIN tournament_series
// Aggregates career totals and per-session history
```

**Backend: `PlayerController.getTeammateStats()`**
```java
// 1. Get all round_assignments for this player
// 2. Bulk fetch assignments + game_results for those sessions
// 3. Attribute wins/games to each teammate in same team + round
// 4. Filter >= 8 games, return top 5 / worst 5 by win%
```

---

## Backend Patterns

### Every controller looks like this

```java
@RestController
@RequestMapping("/things")
public class ThingController {

    private final DSLContext db;

    public ThingController(DSLContext db) {
        this.db = db;
    }

    @GetMapping
    public List<Map<String, Object>> listThings() {
        return db.fetch("SELECT * FROM things ORDER BY name").intoMaps();
    }

    @GetMapping("/{thingId}")
    public Map<String, Object> getThing(@PathVariable String thingId) {
        List<Map<String, Object>> result = db.fetch(
                "SELECT * FROM things WHERE id = ?", thingId
        ).intoMaps();
        if (result.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Thing not found");
        }
        return result.get(0);
    }

    @PostMapping
    public Map<String, Object> createThing(@RequestBody Map<String, Object> body) {
        return db.fetch(
                "INSERT INTO things (name) VALUES (?) RETURNING *",
                body.get("name")
        ).intoMaps().get(0);
    }
}
```

### Director-protected controllers

Add `@RequestMapping("/director/things")` — the `WebConfig` interceptor applies the PIN check to all `/director/**` routes automatically. No per-method annotation needed.

```java
@RestController
@RequestMapping("/director/things")
public class DirectorThingController {
    // All methods here are PIN-protected automatically
}
```

### Querying the database with jOOQ

**Fetch multiple rows:**
```java
List<Map<String, Object>> rows = db.fetch(
        "SELECT * FROM sessions WHERE series_id = ? ORDER BY date DESC", seriesId
).intoMaps();
```

**Fetch one row:**
```java
List<Map<String, Object>> rows = db.fetch(
        "SELECT * FROM players WHERE id = ?", playerId
).intoMaps();
if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Player not found");
Map<String, Object> player = rows.get(0);
```

**Insert and return the new row:**
```java
Map<String, Object> created = db.fetch(
        "INSERT INTO things (name, status) VALUES (?, ?) RETURNING *",
        name, "draft"
).intoMaps().get(0);
```

**Update:**
```java
db.execute("UPDATE sessions SET status = 'active' WHERE id = ?", sessionId);
```

**Delete:**
```java
db.execute("DELETE FROM session_roster WHERE session_id = ? AND player_id = ?", sessionId, playerId);
```

**IN clause (list of IDs):**
```java
String inClause = sessionIds.stream().map(id -> "?").collect(Collectors.joining(", "));
List<Map<String, Object>> rows = db.fetch(
        "SELECT * FROM session_standings WHERE session_id IN (" + inClause + ")",
        sessionIds.toArray()
).intoMaps();
```

### Reading typed values from a result row

jOOQ returns `Map<String, Object>` — cast values explicitly:

```java
String id      = (String) row.get("id");
int wins       = (int)    row.get("total_wins");
double winPct  = (double) row.get("win_pct");
Object gender  = row.getOrDefault("gender", null);  // nullable
```

### HTTP errors

```java
throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
throw new ResponseStatusException(HttpStatus.CONFLICT, "Player already in roster");
throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid PIN");
```

### Tournament format constants

All format numbers live in `AppConstants.java`. Import from there:

```java
import static com.setpoint.config.AppConstants.*;

int teamCount = NUM_TEAMS;     // 3
int rounds    = NUM_ROUNDS;    // 4
int games     = GAMES_PER_SESSION; // 8
```

If the format ever changes, edit `AppConstants.java` — one place.

---

## Adding New Features

### Add a new public endpoint

1. Open the appropriate controller in `controllers/`
2. Add a method with `@GetMapping`, `@PostMapping`, etc.
3. Write the SQL query using `db.fetch(...)` or `db.execute(...)`
4. Test using the frontend or Bruno/Postman

**Example — add `GET /players/:id/rival-stats`:**
```java
// In PlayerController.java, before the /{playerId} catch-all:
@GetMapping("/{playerId}/rival-stats")
public Map<String, Object> getRivalStats(@PathVariable String playerId) {
    List<Map<String, Object>> rivals = db.fetch(
            "SELECT ... FROM ... WHERE player_id = ?", playerId
    ).intoMaps();
    return Map.of("rivals", rivals);
}
```

### Add a new director endpoint

Add it to `DirectorSessionController` (for session-related actions) or `DirectorPlayerController` (for player management). No auth annotation needed — the interceptor covers all `/director/**` automatically.

```java
@PostMapping("/sessions/{sessionId}/my-action")
public Map<String, Object> myAction(@PathVariable String sessionId, @RequestBody Map<String, Object> body) {
    // ...
    return Map.of("ok", true);
}
```

### Add a new frontend page

Same as Python guide — `App.tsx` routes, `api.ts` / `directorApi.ts` for data fetching, types in `src/types/index.ts`.

### Add a new database table

Same as Python guide — write the SQL in `supabase/migrations/`, run it in Supabase SQL Editor, commit the file. No Spring/jOOQ migration runner is used.

After changing the schema, re-run jOOQ codegen to refresh generated classes:
```bash
mvn jooq-codegen:generate
```

---

## Database Conventions

Same as the Python guide — see `DEVELOPER.md`. The conventions haven't changed:

- UUIDs as PKs
- `on delete cascade` for FK cleanup
- RLS enabled on every table
- `session_standings` is the source of truth for leaderboard and profile totals
- Migrations are append-only, numbered sequentially

---

## Testing

No automated tests yet. Workflow:

**Backend:**
- Run the app locally and test endpoints with the frontend or Bruno/Postman
- For bulk data scripts, add a `main()` class under `src/main/java/com/setpoint/scripts/` or keep using the Python scripts in `backend/scripts/` (they talk directly to Supabase, not to the backend)

**Frontend:**
- `npm run dev` against local backend on port 8080
- `npm run build` before pushing to catch TypeScript errors

**Before pushing:**
1. `mvn compile` — catches all Java compile errors
2. `cd frontend && npm run build` — catches TypeScript errors

---

## Submitting Code

Same workflow as the Python guide (branch, PR, one logical change per commit). Commit message style:

```
add rival stats endpoint to player controller
fix standings tie-breaking to use dense ranking
port complete_session endpoint to java
```

### What deploys on merge to `main`

| What changed | What deploys |
|---|---|
| Anything in `backend-java/` | Railway rebuilds the Java app (~2-3 min) |
| Anything in `backend/` | Railway rebuilds the Python app (during transition period) |
| Anything in `frontend/src/` | Vercel rebuilds (~1 min) |
| `supabase/migrations/` | Nothing auto-runs — paste into Supabase SQL Editor manually |

---

## Things to Know Before You Touch Anything

### Port is 8080, not 8000
The Java backend runs on 8080. Update `VITE_API_URL` in your frontend `.env.local` to `http://localhost:8080` when developing against the Java backend.

### `db.fetch()` returns `List<Map<String, Object>>`
Always check `if (result.isEmpty())` before calling `result.get(0)`. Unlike Python's `.single().execute()`, jOOQ's `fetch()` does not throw when 0 rows are returned.

### `db.execute()` for fire-and-forget writes
Use `db.execute()` (not `db.fetch()`) for UPDATE/DELETE statements where you don't need the result back. Using `db.fetch()` on a plain UPDATE works too but is wasteful.

### jOOQ plain SQL vs generated classes
The current codebase uses plain SQL strings with `db.fetch("SELECT ...", params)`. After running `mvn jooq-codegen:generate`, you can refactor individual queries to use the type-safe DSL (`db.selectFrom(SESSIONS).where(SESSIONS.ID.eq(id))`). Both styles work and can be mixed.

### IN clause requires manual string building
jOOQ's plain SQL API doesn't auto-expand lists. Build the `IN (?, ?, ?)` clause manually:
```java
String inClause = ids.stream().map(id -> "?").collect(Collectors.joining(", "));
db.fetch("SELECT * FROM t WHERE id IN (" + inClause + ")", ids.toArray())
```

### No interactive API explorer
Unlike FastAPI's `/docs`, Spring Boot has no built-in API browser. Use Bruno, Postman, or just the frontend to test endpoints. Adding Springdoc OpenAPI (`springdoc-openapi-starter-webmvc-ui`) gives you a Swagger UI at `/swagger-ui.html` if you want it.

### CORS errors still mean a 500 on the backend
Same rule as Python — CORS headers aren't added to error responses. Check Railway logs for the real error.

### `session_standings` is the leaderboard source of truth
Same as Python — don't aggregate `game_results` for totals. Use `session_standings` which has one clean pre-computed row per player per session.
