import os
import random
from fastapi import APIRouter, HTTPException, Depends, Header
from database import get_supabase

router = APIRouter()


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
    """Get a session with its full roster and all round assignments."""
    sb = get_supabase()

    session = sb.table("sessions").select("*, tournament_series(name)") \
        .eq("id", session_id).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    # Roster: flat list of player objects
    roster_rows = sb.table("session_roster") \
        .select("players(id, name, gender)") \
        .eq("session_id", session_id) \
        .execute().data
    roster = [r["players"] for r in roster_rows]

    # Assignments: all rounds, grouped by round_number for convenience
    assignment_rows = sb.table("round_assignments") \
        .select("round_number, team, players(id, name, gender)") \
        .eq("session_id", session_id) \
        .order("round_number") \
        .execute().data

    # Group assignments by round: { 1: {Aces: [...], Kings: [...], Queens: [...]}, ... }
    assignments: dict = {}
    for row in assignment_rows:
        rn = row["round_number"]
        team = row["team"]
        if rn not in assignments:
            assignments[rn] = {"Aces": [], "Kings": [], "Queens": []}
        assignments[rn][team].append(row["players"])

    return {**session.data, "roster": roster, "assignments": assignments}


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


# ---------- Team assignment ----------

@router.post("/sessions/{session_id}/rounds/{round_number}/assign-teams")
def assign_teams(session_id: str, round_number: int, _: None = Depends(require_director)):
    """
    Randomly assign roster players to Aces / Kings / Queens for the given round.
    Requires exactly 6 men and 6 women in the roster (2M + 2F per team).
    Calling this again for the same round overwrites previous assignments.
    """
    if round_number < 1 or round_number > 4:
        raise HTTPException(status_code=400, detail="round_number must be 1–4")

    sb = get_supabase()

    # Pull roster with gender
    roster_rows = sb.table("session_roster") \
        .select("players(id, name, gender)") \
        .eq("session_id", session_id) \
        .execute().data
    players = [r["players"] for r in roster_rows]

    men   = [p for p in players if p["gender"] == "m"]
    women = [p for p in players if p["gender"] == "f"]
    ungenderered = [p for p in players if not p["gender"]]

    if ungenderered:
        names = ", ".join(p["name"] for p in ungenderered)
        raise HTTPException(
            status_code=400,
            detail=f"Gender not set for: {names}. Please set gender before assigning teams."
        )
    if len(men) != 6 or len(women) != 6:
        raise HTTPException(
            status_code=400,
            detail=f"Need exactly 6 men and 6 women. Currently: {len(men)}M / {len(women)}F."
        )

    # Shuffle and split into 3 groups of 2M + 2F
    random.shuffle(men)
    random.shuffle(women)

    team_names = ["Aces", "Kings", "Queens"]
    records = []
    for i, team in enumerate(team_names):
        for player in men[i*2:(i+1)*2] + women[i*2:(i+1)*2]:
            records.append({
                "session_id": session_id,
                "round_number": round_number,
                "player_id": player["id"],
                "team": team,
            })

    # Delete any existing assignments for this round before reinserting
    sb.table("round_assignments") \
        .delete() \
        .eq("session_id", session_id) \
        .eq("round_number", round_number) \
        .execute()

    sb.table("round_assignments").insert(records).execute()
    return records
