from fastapi import APIRouter, HTTPException
from database import get_supabase
from collections import defaultdict

router = APIRouter()

@router.get("")
def list_series(format_id: str | None = None):
    sb = get_supabase()
    query = sb.table("tournament_series").select("*").eq("active", True).order("name")
    if format_id:
        query = query.eq("format_id", format_id)
    return query.execute().data

@router.get("/{series_id}/leaderboard")
def get_leaderboard(series_id: str):
    sb = get_supabase()

    # Get all session IDs in this series
    sessions = sb.table("sessions").select("id").eq("series_id", series_id).execute()
    session_ids = [s["id"] for s in sessions.data]
    if not session_ids:
        return []

    # Use session_standings for one clean row per player per session.
    # This replaces the old game_results round=1/game=1 anchor hack.
    per_session = sb.table("session_standings") \
        .select("player_id, session_id, total_wins, total_diff, place, players(name)") \
        .in_("session_id", session_ids) \
        .execute().data

    # Aggregate per player
    stats: dict[str, dict] = defaultdict(lambda: {
        "player_id": "", "name": "", "sessions": 0,
        "first": 0, "second": 0, "third": 0, "fourth": 0,
        "total_wins": 0, "total_games": 0
    })

    for r in per_session:
        pid = r["player_id"]
        s = stats[pid]
        s["player_id"] = pid
        s["name"] = r["players"]["name"]
        s["sessions"] += 1
        place = r["place"]
        if place == 1: s["first"] += 1
        elif place == 2: s["second"] += 1
        elif place == 3: s["third"] += 1
        elif place == 4: s["fourth"] += 1
        s["total_wins"] += r["total_wins"] or 0
        s["total_games"] += 8  # 4 rounds x 2 games per format

    # Compute win % and sort by sessions desc, then win % desc
    leaderboard = []
    for s in stats.values():
        s["win_pct"] = round(s["total_wins"] / s["total_games"] * 100, 1) if s["total_games"] > 0 else 0.0
        leaderboard.append(s)

    leaderboard.sort(key=lambda x: (-x["sessions"], -x["win_pct"]))
    return leaderboard

@router.get("/{series_id}")
def get_series(series_id: str):
    sb = get_supabase()
    series = sb.table("tournament_series").select("*").eq("id", series_id).single().execute()
    if not series.data:
        raise HTTPException(status_code=404, detail="Series not found")
    sessions = sb.table("sessions").select("*").eq("series_id", series_id).order("date", desc=True).execute()
    return {**series.data, "sessions": sessions.data}
