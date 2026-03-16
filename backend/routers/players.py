from fastapi import APIRouter, HTTPException
from database import get_supabase, fetch_all
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

@router.get("/{player_id}/teammate-stats")
def get_teammate_stats(player_id: str):
    # Returns top 5 and worst 5 teammates based on games played together.
    # Win/loss counts are taken from the player's own game_results for each round.
    sb = get_supabase()

    my_assignments = sb.table("round_assignments") \
        .select("session_id, round_number, team") \
        .eq("player_id", player_id) \
        .execute().data

    if not my_assignments:
        return {"top_teammates": [], "worst_teammates": []}

    session_ids = list({a["session_id"] for a in my_assignments})

    # Fetch all round_assignments and game_results for those sessions in bulk
    all_assignments = fetch_all(
        sb.table("round_assignments")
        .select("session_id, round_number, team, player_id, players(name)")
        .in_("session_id", session_ids)
    )
    my_games = fetch_all(
        sb.table("game_results")
        .select("session_id, round_number, point_diff")
        .eq("player_id", player_id)
        .in_("session_id", session_ids)
    )

    # (session_id, round_number) -> {wins, games}
    round_results: dict = {}
    for g in my_games:
        key = (g["session_id"], g["round_number"])
        if key not in round_results:
            round_results[key] = {"wins": 0, "games": 0}
        round_results[key]["games"] += 1
        if g["point_diff"] > 0:
            round_results[key]["wins"] += 1

    # (session_id, round_number, team) -> [player_ids]
    team_members: dict = defaultdict(list)
    player_names: dict = {}
    for a in all_assignments:
        team_members[(a["session_id"], a["round_number"], a["team"])].append(a["player_id"])
        if a.get("players"):
            player_names[a["player_id"]] = a["players"]["name"]

    # Aggregate wins/games per teammate
    teammate_stats: dict = {}
    for a in my_assignments:
        team_key = (a["session_id"], a["round_number"], a["team"])
        round_key = (a["session_id"], a["round_number"])
        r = round_results.get(round_key, {"wins": 0, "games": 0})
        for tid in team_members.get(team_key, []):
            if tid == player_id:
                continue
            if tid not in teammate_stats:
                teammate_stats[tid] = {"id": tid, "name": player_names.get(tid, "Unknown"), "games": 0, "wins": 0}
            teammate_stats[tid]["games"] += r["games"]
            teammate_stats[tid]["wins"] += r["wins"]

    all_stats = list(teammate_stats.values())
    for s in all_stats:
        s["losses"] = s["games"] - s["wins"]
        s["win_pct"] = round(s["wins"] / s["games"] * 100, 1) if s["games"] > 0 else 0.0

    # Minimum sample size of 8 games together
    qualified = [s for s in all_stats if s["games"] >= 8]

    # Top: highest win % first, then most wins as tiebreaker
    top   = sorted(qualified, key=lambda x: (-x["win_pct"], -x["wins"]))[:5]
    # Worst: lowest win % first, then most losses as tiebreaker
    worst = sorted(qualified, key=lambda x: (x["win_pct"], -x["losses"]))[:5]

    return {"top_teammates": top, "worst_teammates": worst}


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
