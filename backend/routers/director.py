import os
import random
from fastapi import APIRouter, HTTPException, Depends, Header
from database import get_supabase
from standings_helper import compute_live_standings
from config import ROSTER_SIZE, NUM_TEAMS, TEAM_SIZE, MIN_GENDER_PER_TEAM, NUM_ROUNDS

router = APIRouter()

# Round schedule: G1 opener and the team that sits out G1 (plays G2 + G3)
ROUND_SCHEDULE = {
    1: {"g1": ("Aces", "Kings"),   "waiting": "Queens"},
    2: {"g1": ("Aces", "Queens"),  "waiting": "Kings"},
    3: {"g1": ("Kings", "Queens"), "waiting": "Aces"},
    4: {"g1": ("Aces", "Kings"),   "waiting": "Queens"},
}


def require_director(x_director_pin: str = Header(default=None)):
    """Simple PIN-based auth for director endpoints. PIN set via DIRECTOR_PIN env var."""
    expected = os.environ.get("DIRECTOR_PIN", "1234")
    if x_director_pin != expected:
        raise HTTPException(status_code=401, detail="Invalid director PIN")


# ---------- Sessions ----------

@router.get("/sessions")
def list_sessions(_: None = Depends(require_director)):
    """List all sessions with their series name, newest first."""
    sb = get_supabase()
    res = sb.table("sessions") \
        .select("*, tournament_series(name)") \
        .order("date", desc=True) \
        .execute()
    return res.data


@router.post("/sessions")
def create_session(body: dict, _: None = Depends(require_director)):
    """Create a new draft session. Requires date; series_id and format_id are optional."""
    sb = get_supabase()
    res = sb.table("sessions").insert({
        "date": body["date"],
        "format_id": body.get("format_id", "revco-roundrobin-4s"),
        "series_id": body.get("series_id"),
        "status": "draft",
    }).execute()
    return res.data[0]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, _: None = Depends(require_director)):
    """Get a session with roster, round assignments, round games, and live standings."""
    sb = get_supabase()

    session = sb.table("sessions").select("*, tournament_series(name)") \
        .eq("id", session_id).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    roster_rows = sb.table("session_roster") \
        .select("players(id, name, gender)") \
        .eq("session_id", session_id) \
        .execute().data
    roster = [r["players"] for r in roster_rows]

    assignment_rows = sb.table("round_assignments") \
        .select("round_number, team, players(id, name, gender)") \
        .eq("session_id", session_id) \
        .order("round_number") \
        .execute().data

    assignments: dict = {}
    for row in assignment_rows:
        rn = row["round_number"]
        team = row["team"]
        if rn not in assignments:
            assignments[rn] = {"Aces": [], "Kings": [], "Queens": []}
        assignments[rn][team].append(row["players"])

    try:
        round_games = sb.table("round_games").select("*") \
            .eq("session_id", session_id) \
            .order("round_number").order("game_number") \
            .execute().data
    except Exception:
        round_games = []

    try:
        live_standings = compute_live_standings(session_id, sb)
    except Exception:
        live_standings = []

    return {
        **session.data,
        "roster": roster,
        "assignments": assignments,
        "round_games": round_games,
        "live_standings": live_standings,
    }


@router.post("/sessions/{session_id}/activate")
def activate_session(session_id: str, _: None = Depends(require_director)):
    """
    Transition a draft session to active. Requires round 1 teams to be assigned.
    Pre-creates G1 round_games entries for all 4 rounds (matchups are fixed by schedule).
    """
    sb = get_supabase()

    session = sb.table("sessions").select("status").eq("id", session_id).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.data["status"] == "completed":
        raise HTTPException(status_code=400, detail="Session is already completed.")

    r1 = sb.table("round_assignments") \
        .select("player_id") \
        .eq("session_id", session_id) \
        .eq("round_number", 1) \
        .execute().data
    if len(r1) < ROSTER_SIZE:
        raise HTTPException(status_code=400, detail="Assign Round 1 teams before activating.")

    # Create G1 entries for all 4 rounds (delete first to handle re-activation)
    for rn, schedule in ROUND_SCHEDULE.items():
        team_a, team_b = schedule["g1"]
        sb.table("round_games").delete() \
            .eq("session_id", session_id) \
            .eq("round_number", rn) \
            .eq("game_number", 1) \
            .execute()
        sb.table("round_games").insert({
            "session_id": session_id,
            "round_number": rn,
            "game_number": 1,
            "team_a": team_a,
            "team_b": team_b,
        }).execute()

    sb.table("sessions").update({"status": "active"}).eq("id", session_id).execute()
    return {"ok": True}


# ---------- Roster ----------

@router.post("/sessions/{session_id}/roster")
def add_to_roster(session_id: str, body: dict, _: None = Depends(require_director)):
    """Add a player to the session roster."""
    sb = get_supabase()
    try:
        sb.table("session_roster").insert({
            "session_id": session_id,
            "player_id": body["player_id"],
        }).execute()
    except Exception:
        raise HTTPException(status_code=409, detail="Player already in roster")
    return {"ok": True}


@router.delete("/sessions/{session_id}/roster/{player_id}")
def remove_from_roster(session_id: str, player_id: str, _: None = Depends(require_director)):
    """Remove a player from the session roster."""
    sb = get_supabase()
    sb.table("session_roster") \
        .delete() \
        .eq("session_id", session_id) \
        .eq("player_id", player_id) \
        .execute()
    return {"ok": True}


# ---------- Player gender ----------

@router.put("/players/{player_id}/gender")
def update_player_gender(player_id: str, body: dict, _: None = Depends(require_director)):
    """Set or update a player's gender ('m' or 'f')."""
    gender = body.get("gender")
    if gender not in ("m", "f", None):
        raise HTTPException(status_code=400, detail="gender must be 'm' or 'f'")
    sb = get_supabase()
    sb.table("players").update({"gender": gender}).eq("id", player_id).execute()
    return {"ok": True}


@router.post("/players")
def create_player(body: dict, _: None = Depends(require_director)):
    """Create a new player."""
    if not body.get("name"):
        raise HTTPException(status_code=400, detail="name is required")
    sb = get_supabase()
    data = {k: body[k] for k in ("name", "phone", "email", "gender") if body.get(k)}
    res = sb.table("players").insert(data).execute()
    return res.data[0]


@router.put("/players/{player_id}")
def update_player(player_id: str, body: dict, _: None = Depends(require_director)):
    """Update a player's name, phone, email, or gender."""
    if "name" in body and not body["name"]:
        raise HTTPException(status_code=400, detail="name cannot be empty")
    sb = get_supabase()
    updates = {k: body.get(k) for k in ("name", "phone", "email", "gender") if k in body}
    res = sb.table("players").update(updates).eq("id", player_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Player not found")
    return res.data[0]


@router.delete("/players/{player_id}")
def delete_player(player_id: str, _: None = Depends(require_director)):
    """Delete a player. Will fail if they have session history."""
    sb = get_supabase()
    try:
        sb.table("players").delete().eq("id", player_id).execute()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot delete player: {e}")
    return {"ok": True}


# ---------- Team assignment ----------

@router.post("/sessions/{session_id}/rounds/{round_number}/assign-teams")
def assign_teams(session_id: str, round_number: int, _: None = Depends(require_director)):
    """
    Randomly assign roster players to Aces / Kings / Queens for the given round.
    Requires exactly 6 men and 6 women in the roster (2M + 2F per team).
    Calling this again for the same round overwrites previous assignments.
    """
    if round_number < 1 or round_number > NUM_ROUNDS:
        raise HTTPException(status_code=400, detail=f"round_number must be 1–{NUM_ROUNDS}")

    sb = get_supabase()

    roster_rows = sb.table("session_roster") \
        .select("players(id, name, gender)") \
        .eq("session_id", session_id) \
        .execute().data
    players = [r["players"] for r in roster_rows]

    men         = [p for p in players if p["gender"] == "m"]
    women       = [p for p in players if p["gender"] == "f"]
    ungendered  = [p for p in players if not p["gender"]]

    if ungendered:
        names = ", ".join(p["name"] for p in ungendered)
        raise HTTPException(
            status_code=400,
            detail=f"Gender not set for: {names}. Please set gender before assigning teams."
        )
    min_gender = NUM_TEAMS * MIN_GENDER_PER_TEAM
    if len(men) < min_gender or len(women) < min_gender:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {min_gender} men and {min_gender} women to guarantee 1 of each per team. Currently: {len(men)}M / {len(women)}F."
        )

    random.shuffle(men)
    random.shuffle(women)

    team_names = ["Aces", "Kings", "Queens"]
    records = []

    if len(men) % NUM_TEAMS == 0 and len(women) % NUM_TEAMS == 0:
        # Even split (e.g. 6M+6F → 2M+2F per team): distribute exactly evenly
        m_per_team = len(men) // NUM_TEAMS
        f_per_team = len(women) // NUM_TEAMS
        for i, team in enumerate(team_names):
            team_players = men[i*m_per_team:(i+1)*m_per_team] + women[i*f_per_team:(i+1)*f_per_team]
            for player in team_players:
                records.append({
                    "session_id": session_id,
                    "round_number": round_number,
                    "player_id": player["id"],
                    "team": team,
                })
    else:
        # Uneven split (e.g. 7F+5M): guarantee 1 of each gender per team, fill rest randomly
        guaranteed_m = men[:NUM_TEAMS]
        guaranteed_f = women[:NUM_TEAMS]
        remaining = men[NUM_TEAMS:] + women[NUM_TEAMS:]
        random.shuffle(remaining)
        extras_per_team = TEAM_SIZE - (MIN_GENDER_PER_TEAM * 2)
        for i, team in enumerate(team_names):
            team_players = (
                [guaranteed_m[i], guaranteed_f[i]]
                + remaining[i * extras_per_team:(i + 1) * extras_per_team]
            )
            for player in team_players:
                records.append({
                    "session_id": session_id,
                    "round_number": round_number,
                    "player_id": player["id"],
                    "team": team,
                })

    sb.table("round_assignments") \
        .delete() \
        .eq("session_id", session_id) \
        .eq("round_number", round_number) \
        .execute()
    sb.table("round_assignments").insert(records).execute()
    return records


@router.post("/sessions/{session_id}/rounds/{round_number}/set-teams")
def set_teams(session_id: str, round_number: int, body: dict, _: None = Depends(require_director)):
    """Save a manually arranged team assignment. Expects {assignments: [{player_id, team}]}."""
    assignments = body.get("assignments", [])
    if not assignments:
        raise HTTPException(status_code=400, detail="No assignments provided")
    valid_teams = {"Aces", "Kings", "Queens"}
    for a in assignments:
        if a.get("team") not in valid_teams:
            raise HTTPException(status_code=400, detail=f"Invalid team: {a.get('team')}")
    sb = get_supabase()
    records = [
        {"session_id": session_id, "round_number": round_number,
         "player_id": a["player_id"], "team": a["team"]}
        for a in assignments
    ]
    sb.table("round_assignments").delete().eq("session_id", session_id).eq("round_number", round_number).execute()
    sb.table("round_assignments").insert(records).execute()
    return records


# ---------- Scoring ----------

@router.post("/sessions/{session_id}/rounds/{round_number}/games/{game_number}/score")
def submit_score(
    session_id: str, round_number: int, game_number: int,
    body: dict, _: None = Depends(require_director)
):
    """
    Submit or update the score for a game. After G1 is scored, G2 and G3 matchups are
    determined (winner stays vs waiting team; loser vs waiting team) and their entries
    are created automatically.
    Returns updated live standings.
    """
    if round_number not in ROUND_SCHEDULE:
        raise HTTPException(status_code=400, detail="round_number must be 1–4")

    sb = get_supabase()
    score_a = body["score_a"]
    score_b = body["score_b"]

    # Verify the game row exists before updating
    existing = sb.table("round_games").select("id") \
        .eq("session_id", session_id) \
        .eq("round_number", round_number) \
        .eq("game_number", game_number) \
        .execute().data
    if not existing:
        raise HTTPException(status_code=404, detail=f"Game {game_number} for round {round_number} not found. Score Game 1 first.")

    sb.table("round_games") \
        .update({"score_a": score_a, "score_b": score_b}) \
        .eq("session_id", session_id) \
        .eq("round_number", round_number) \
        .eq("game_number", game_number) \
        .execute()

    # After G1 is scored, determine and create G2 + G3 matchups
    if game_number == 1:
        g1 = sb.table("round_games").select("team_a, team_b") \
            .eq("session_id", session_id) \
            .eq("round_number", round_number) \
            .eq("game_number", 1) \
            .single().execute().data

        waiting = ROUND_SCHEDULE[round_number]["waiting"]
        winner = g1["team_a"] if score_a > score_b else g1["team_b"]
        loser  = g1["team_b"] if score_a > score_b else g1["team_a"]

        for gn, (ta, tb) in [(2, (winner, waiting)), (3, (loser, waiting))]:
            # Delete any existing entry (e.g. if G1 score is being corrected)
            sb.table("round_games").delete() \
                .eq("session_id", session_id) \
                .eq("round_number", round_number) \
                .eq("game_number", gn) \
                .execute()
            sb.table("round_games").insert({
                "session_id": session_id,
                "round_number": round_number,
                "game_number": gn,
                "team_a": ta,
                "team_b": tb,
            }).execute()

    return compute_live_standings(session_id, sb)


@router.post("/sessions/{session_id}/complete")
def complete_session(session_id: str, _: None = Depends(require_director)):
    """
    Finalize a live session:
      1. Compute final standings from round_games + round_assignments
      2. Write session_standings (used by leaderboard and player profiles)
      3. Write game_results (used by the historical round-by-round view)
      4. Mark session as completed
    Can be called again to re-finalize if scores were corrected.
    """
    sb = get_supabase()

    standings = compute_live_standings(session_id, sb)
    if not standings:
        raise HTTPException(status_code=400, detail="No scored games found — cannot complete session.")

    final_stats = {s["id"]: s for s in standings}

    # Write session_standings
    sb.table("session_standings").delete().eq("session_id", session_id).execute()
    sb.table("session_standings").insert([
        {"session_id": session_id, "player_id": s["id"],
         "total_wins": s["wins"], "total_diff": s["diff"], "place": s["place"]}
        for s in standings
    ]).execute()

    # Build team -> player lookup per round from round_assignments
    assignments = sb.table("round_assignments").select("round_number, team, player_id") \
        .eq("session_id", session_id).execute().data
    team_players: dict = {}
    for a in assignments:
        key = (a["round_number"], a["team"])
        if key not in team_players:
            team_players[key] = []
        team_players[key].append(a["player_id"])

    # Write game_results (one row per player per game played, with denormalized totals)
    games = sb.table("round_games").select("*").eq("session_id", session_id).execute().data
    completed_games = [g for g in games if g["score_a"] is not None and g["score_b"] is not None]

    sb.table("game_results").delete().eq("session_id", session_id).execute()
    records = []
    for g in completed_games:
        rn  = g["round_number"]
        diff = g["score_a"] - g["score_b"]
        for team in (g["team_a"], g["team_b"]):
            player_diff = diff if team == g["team_a"] else -diff
            for player_id in team_players.get((rn, team), []):
                s = final_stats.get(player_id, {"wins": 0, "diff": 0, "place": 99})
                records.append({
                    "session_id": session_id, "player_id": player_id,
                    "round_number": rn, "game_number": g["game_number"],
                    "team": team, "point_diff": player_diff,
                    "total_wins": s["wins"], "total_diff": s["diff"], "place": s["place"],
                })
    if records:
        sb.table("game_results").insert(records).execute()

    sb.table("sessions").update({"status": "completed"}).eq("id", session_id).execute()
    return {"ok": True, "players_finalized": len(standings)}


@router.get("/sessions/{session_id}/media")
def list_media(session_id: str, _: None = Depends(require_director)):
    sb = get_supabase()
    return sb.table("session_media").select("*").eq("session_id", session_id).order("created_at").execute().data


@router.post("/sessions/{session_id}/media")
def add_media(session_id: str, body: dict, _: None = Depends(require_director)):
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    # Auto-detect media type from URL
    url_lower = url.lower()
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        media_type = "youtube"
    elif any(url_lower.split("?")[0].endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp")):
        media_type = "image"
    else:
        media_type = "link"
    sb = get_supabase()
    res = sb.table("session_media").insert({
        "session_id": session_id,
        "url": url,
        "caption": (body.get("caption") or "").strip() or None,
        "media_type": media_type,
        "is_featured": False,
    }).execute()
    return res.data[0]


@router.patch("/sessions/{session_id}/media/{media_id}/feature")
def feature_media(session_id: str, media_id: str, _: None = Depends(require_director)):
    sb = get_supabase()
    # Only one item can be featured per session
    sb.table("session_media").update({"is_featured": False}).eq("session_id", session_id).execute()
    res = sb.table("session_media").update({"is_featured": True}).eq("id", media_id).execute()
    return res.data[0]


@router.patch("/sessions/{session_id}/media/{media_id}/unfeature")
def unfeature_media(session_id: str, media_id: str, _: None = Depends(require_director)):
    sb = get_supabase()
    res = sb.table("session_media").update({"is_featured": False}).eq("id", media_id).execute()
    return res.data[0]


@router.delete("/sessions/{session_id}/media/{media_id}")
def delete_media(session_id: str, media_id: str, _: None = Depends(require_director)):
    sb = get_supabase()
    sb.table("session_media").delete().eq("id", media_id).execute()
    return {"ok": True}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, _: None = Depends(require_director)):
    """Delete a session and all associated data (cascades to roster, assignments, games, standings)."""
    sb = get_supabase()
    sb.table("sessions").delete().eq("id", session_id).execute()
    return {"ok": True}


@router.delete("/sessions/{session_id}/rounds/{round_number}/games/{game_number}/score")
def clear_score(
    session_id: str, round_number: int, game_number: int,
    _: None = Depends(require_director)
):
    """Clear a game score (allows re-entry). Clearing G1 also removes G2/G3 entries."""
    sb = get_supabase()

    sb.table("round_games") \
        .update({"score_a": None, "score_b": None}) \
        .eq("session_id", session_id) \
        .eq("round_number", round_number) \
        .eq("game_number", game_number) \
        .execute()

    # If clearing G1, remove G2 and G3 since their matchups depend on G1 result
    if game_number == 1:
        sb.table("round_games").delete() \
            .eq("session_id", session_id) \
            .eq("round_number", round_number) \
            .in_("game_number", [2, 3]) \
            .execute()

    return {"ok": True}
