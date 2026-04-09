from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from database import get_supabase
from schemas.session import SessionCreate, SessionOut
from standings_helper import compute_live_standings

router = APIRouter()

@router.get("/formats")
def list_formats():
    """List active tournament format definitions (legacy revco round-robin config)."""
    sb = get_supabase()
    res = sb.table("tournament_formats").select("id, name, description").eq("active", True).execute()
    return res.data


@router.get("/lookups")
def get_lookups():
    """
    Return all five lookup tables in a single call for populating form dropdowns.
    Includes: game_formats, competition_types, levels (sorted), surfaces, divisions.
    """
    sb = get_supabase()
    game_formats     = sb.table("game_formats").select("*").execute().data
    competition_types = sb.table("competition_types").select("*").execute().data
    levels           = sb.table("levels").select("*").order("sort_order").execute().data
    surfaces         = sb.table("surfaces").select("*").execute().data
    divisions        = sb.table("divisions").select("*").execute().data
    return {
        "game_formats":      game_formats,
        "competition_types": competition_types,
        "levels":            levels,
        "surfaces":          surfaces,
        "divisions":         divisions,
    }

@router.get("", response_model=list[SessionOut])
def list_sessions(format_id: Optional[str] = Query(None)):
    sb = get_supabase()
    query = sb.table("sessions").select("*").order("date", desc=True)
    if format_id:
        query = query.eq("format_id", format_id)
    res = query.execute()
    return res.data

@router.get("/{session_id}")
def get_session(session_id: str):
    sb = get_supabase()
    session = (
        sb.table("sessions")
        .select(
            "*, tournament_series(name, competition_type_id, game_format_id, "
            "level_id, surface_id, division_id)"
        )
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    # Pool+playoff sessions are served by the /api/pool router for full data;
    # this endpoint just returns the session shell so the frontend can redirect.
    series_meta = session.data.get("tournament_series") or {}
    if series_meta.get("competition_type_id") in {
        "pool_playoff_single_elim", "pool_playoff_double_elim"
    }:
        return {**session.data, "results": [], "round_assignments": {}, "media": []}

    status = session.data.get("status", "completed")

    if status == "active":
        # Return live scoring data instead of finalized game_results
        round_games = sb.table("round_games").select("*") \
            .eq("session_id", session_id) \
            .order("round_number").order("game_number") \
            .execute().data

        assignment_rows = sb.table("round_assignments") \
            .select("round_number, team, players(id, name, gender)") \
            .eq("session_id", session_id) \
            .execute().data

        assignments: dict = {}
        for row in assignment_rows:
            rn = str(row["round_number"])
            team = row["team"]
            if rn not in assignments:
                assignments[rn] = {"Aces": [], "Kings": [], "Queens": []}
            assignments[rn][team].append(row["players"])

        live_standings = compute_live_standings(session_id, sb)

        media = sb.table("session_media").select("*").eq("session_id", session_id).order("created_at").execute().data

        return {
            **session.data,
            "results": [],
            "round_games": round_games,
            "round_assignments": assignments,
            "live_standings": live_standings,
            "media": media,
        }

    # Completed or draft: return finalized game_results + round_assignments
    results = sb.table("game_results").select("*, players(name)") \
        .eq("session_id", session_id).execute()

    assignment_rows = sb.table("round_assignments") \
        .select("round_number, team, players(id, name, gender)") \
        .eq("session_id", session_id) \
        .execute().data

    assignments: dict = {}
    for row in assignment_rows:
        rn = str(row["round_number"])
        team = row["team"]
        if rn not in assignments:
            assignments[rn] = {"Aces": [], "Kings": [], "Queens": []}
        assignments[rn][team].append(row["players"])

    media = sb.table("session_media").select("*").eq("session_id", session_id).order("created_at").execute().data

    return {**session.data, "results": results.data, "round_assignments": assignments, "media": media}

@router.post("/", response_model=SessionOut)
def create_session(session: SessionCreate):
    sb = get_supabase()
    res = sb.table("sessions").insert(session.model_dump()).execute()
    return res.data[0]
