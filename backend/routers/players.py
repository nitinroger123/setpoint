from fastapi import APIRouter, HTTPException
from database import get_supabase
from schemas.player import PlayerCreate, PlayerOut
from collections import defaultdict

router = APIRouter()

# NOTE: /profile must be defined before /{player_id} so FastAPI doesn't
# treat the literal string "profile" as a player ID and return a 404.

@router.get("/", response_model=list[PlayerOut])
def list_players():
    # Returns all players sorted alphabetically. Used for admin/directory views.
    sb = get_supabase()
    res = sb.table("players").select("*").order("name").execute()
    return res.data

@router.get("/{player_id}/profile")
def get_player_profile(player_id: str):
    # Returns a player's full profile: basic info, overall career stats, and
    # a per-session history list. Used by the PlayerProfile page.
    sb = get_supabase()

    player = sb.table("players").select("*").eq("id", player_id).single().execute()
    if not player.data:
        raise HTTPException(status_code=404, detail="Player not found")

    # Use session_standings for one clean row per session — no anchor hack needed.
    # FK join traversal: session_standings -> sessions -> tournament_series
    rows = sb.table("session_standings") \
        .select("session_id, total_wins, total_diff, place, sessions(date, series_id, tournament_series(name))") \
        .eq("player_id", player_id) \
        .order("sessions(date)", desc=True) \
        .execute().data

    history = []
    # Bucket stats by series_id so we can later support per-series breakdowns.
    # Sessions not in any series fall under the "all" bucket.
    totals = defaultdict(lambda: {"sessions": 0, "wins": 0, "games": 0, "first": 0, "second": 0, "third": 0, "fourth": 0})

    for r in rows:
        session = r.get("sessions", {})
        series = session.get("tournament_series") if session else None
        series_name = series["name"] if series else "—"
        series_id = session.get("series_id")

        history.append({
            "session_id": r["session_id"],
            "date": session.get("date"),
            "series_name": series_name,
            "series_id": series_id,
            "place": r["place"],
            "total_wins": r["total_wins"],
            "total_diff": r["total_diff"],
        })

        k = series_id or "all"
        totals[k]["sessions"] += 1
        totals[k]["wins"] += r["total_wins"] or 0
        totals[k]["games"] += 8  # always 8 games per session in revco-roundrobin-4s
        place = r["place"]
        if place == 1: totals[k]["first"] += 1
        elif place == 2: totals[k]["second"] += 1
        elif place == 3: totals[k]["third"] += 1
        elif place == 4: totals[k]["fourth"] += 1

    # Collapse per-series buckets into a single overall stat block.
    overall = {"sessions": 0, "wins": 0, "games": 0, "first": 0, "second": 0, "third": 0, "fourth": 0}
    for v in totals.values():
        for key in overall:
            overall[key] += v[key]
    overall["win_pct"] = round(overall["wins"] / overall["games"] * 100, 1) if overall["games"] > 0 else 0.0

    return {
        "player": player.data,
        "overall": overall,
        "history": history,
    }

@router.get("/{player_id}")
def get_player(player_id: str):
    # Returns a single player's basic info (name, phone, email).
    # Separated from /profile so lightweight lookups don't pay the aggregation cost.
    sb = get_supabase()
    res = sb.table("players").select("*").eq("id", player_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Player not found")
    return res.data

@router.post("/", response_model=PlayerOut)
def create_player(player: PlayerCreate):
    # Creates a new player. Phone and email are optional but unique if provided.
    sb = get_supabase()
    res = sb.table("players").insert(player.model_dump()).execute()
    return res.data[0]
