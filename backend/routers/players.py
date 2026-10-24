from fastapi import APIRouter, HTTPException, Query
from database import get_supabase, fetch_all
from schemas.player import PlayerCreate, PlayerOut
from collections import defaultdict

router = APIRouter()

# NOTE: Static path segments (/search, /profile) must be defined before
# /{player_id} so FastAPI doesn't treat them as player IDs and return 404s.

@router.get("/search")
def search_players(q: str = Query(default="", min_length=1)):
    """Public player search by name. Returns id, name, and avatar_url.

    Performs a case-insensitive partial match on the player name.
    Used by the /players discovery page in the frontend.
    Results are sorted alphabetically and capped at 20.
    """
    sb = get_supabase()
    res = sb.table("players") \
        .select("id, name, avatar_url") \
        .ilike("name", f"%{q}%") \
        .order("name") \
        .limit(20) \
        .execute()
    return res.data


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

    # Fetch org memberships so the public profile can display which orgs the player belongs to
    memberships = sb.table("org_memberships") \
        .select("role, organizations(id, name, slug)") \
        .eq("player_id", player_id) \
        .eq("status", "active") \
        .execute().data
    orgs = [
        {"id": m["organizations"]["id"], "name": m["organizations"]["name"], "slug": m["organizations"]["slug"], "role": m["role"]}
        for m in memberships if m.get("organizations")
    ]

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
        "player": {**player.data, "orgs": orgs},
        "overall": overall,
        "history": history,
    }

@router.get("/{player_id}/teammate-stats")
def get_teammate_stats(player_id: str, series_id: str = Query(default=None)):
    # Returns teammate win/loss stats for a player, optionally filtered to one series.
    # When series_id is provided only sessions in that series are included — used
    # to show per-series teammate chemistry on the player dashboard.
    # Win/loss counts are taken from the player's own game_results for each round.
    sb = get_supabase()

    assignments_query = sb.table("round_assignments") \
        .select("session_id, round_number, team") \
        .eq("player_id", player_id)

    # If filtering by series, first resolve which session IDs belong to that series
    if series_id:
        series_sessions = sb.table("sessions") \
            .select("id") \
            .eq("series_id", series_id) \
            .execute().data
        session_ids_in_series = [s["id"] for s in series_sessions]
        if not session_ids_in_series:
            return {"most_played": [], "top_teammates": [], "worst_teammates": []}
        assignments_query = assignments_query.in_("session_id", session_ids_in_series)

    my_assignments = assignments_query.execute().data

    if not my_assignments:
        return {"most_played": [], "top_teammates": [], "worst_teammates": []}

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

    # All teammates sorted by most games together
    most_played = sorted(all_stats, key=lambda x: (-x["games"], -x["wins"]))

    # Minimum sample size: 8 games overall, 4 when filtered to a single series
    min_games = 4 if series_id else 8
    qualified = [s for s in all_stats if s["games"] >= min_games]

    # Top: highest win % first, then most wins as tiebreaker
    top   = sorted(qualified, key=lambda x: (-x["win_pct"], -x["wins"]))[:5]
    # Worst: lowest win % first, then most losses as tiebreaker
    worst = sorted(qualified, key=lambda x: (x["win_pct"], -x["losses"]))[:5]

    return {"most_played": most_played, "top_teammates": top, "worst_teammates": worst}


@router.get("/{player_id}/nemesis")
def get_player_nemesis(player_id: str, series_id: str = Query(default=None)):
    """
    Returns the single toughest opponent for a player — the person they have the lowest
    win rate against with a minimum of 3 head-to-head games, optionally scoped to one series.

    Handles both round-robin (round_assignments + round_games) and pool+playoff
    (session_team_players + pool_games + bracket_games + play_in_games) session formats.

    Returns {"nemesis": {id, name, games, wins, losses, win_pct}} or {"nemesis": null}.
    """
    sb = get_supabase()

    # ── Step 1: Resolve which completed sessions to consider ──────────────────
    standings_query = sb.table("session_standings") \
        .select("session_id") \
        .eq("player_id", player_id)

    if series_id:
        series_sessions = sb.table("sessions") \
            .select("id") \
            .eq("series_id", series_id) \
            .execute().data
        series_session_ids = [s["id"] for s in series_sessions]
        if not series_session_ids:
            return {"nemesis": None}
        standings_query = standings_query.in_("session_id", series_session_ids)

    player_sessions = standings_query.execute().data
    if not player_sessions:
        return {"nemesis": None}

    session_ids = [r["session_id"] for r in player_sessions]

    # ── Step 2: Split sessions by competition format ──────────────────────────
    # competition_type_id lives on tournament_series, not sessions — join through.
    # Null competition_type_id or 'round_robin' → round-robin path.
    # Any other value (e.g. 'pool_playoff_single_elim') → pool play path.
    sessions_meta = sb.table("sessions") \
        .select("id, tournament_series(competition_type_id)") \
        .in_("id", session_ids) \
        .execute().data

    def get_competition_type(session_row: dict) -> str | None:
        """Extract competition_type_id by traversing the series FK join."""
        series = session_row.get("tournament_series")
        if not series:
            return None
        return series.get("competition_type_id")

    roundrobin_ids = [
        s["id"] for s in sessions_meta
        if not get_competition_type(s) or get_competition_type(s) == "round_robin"
    ]
    poolplay_ids = [
        s["id"] for s in sessions_meta
        if get_competition_type(s) and get_competition_type(s) != "round_robin"
    ]

    # opponent_stats[opp_player_id] = {id, name, games, wins}
    opponent_stats: dict = {}
    player_names: dict = {}

    # ── Step 3a: Round-robin path ─────────────────────────────────────────────
    if roundrobin_ids:
        # Get the player's team assignment per (session, round)
        my_assignments = fetch_all(
            sb.table("round_assignments")
            .select("session_id, round_number, team")
            .eq("player_id", player_id)
            .in_("session_id", roundrobin_ids)
        )

        # All scored games for those sessions
        all_round_games = fetch_all(
            sb.table("round_games")
            .select("session_id, round_number, team_a, team_b, score_a, score_b")
            .in_("session_id", roundrobin_ids)
        )

        # All assignments for those sessions — needed to identify opponent player IDs
        all_assignments = fetch_all(
            sb.table("round_assignments")
            .select("session_id, round_number, team, player_id, players(name)")
            .in_("session_id", roundrobin_ids)
        )

        # Build (session_id, round_number, team) → [player_ids]
        team_members: dict = defaultdict(list)
        for a in all_assignments:
            team_members[(a["session_id"], a["round_number"], a["team"])].append(a["player_id"])
            if a.get("players"):
                player_names[a["player_id"]] = a["players"]["name"]

        my_team_per_round = {
            (a["session_id"], a["round_number"]): a["team"]
            for a in my_assignments
        }

        for game in all_round_games:
            rr_key = (game["session_id"], game["round_number"])
            if rr_key not in my_team_per_round:
                continue

            score_a = game.get("score_a") or 0
            score_b = game.get("score_b") or 0
            if score_a == 0 and score_b == 0:
                continue  # Game not yet scored

            my_team_name = my_team_per_round[rr_key]

            if game["team_a"] == my_team_name:
                opponent_team = game["team_b"]
                player_won = score_a > score_b
            elif game["team_b"] == my_team_name:
                opponent_team = game["team_a"]
                player_won = score_b > score_a
            else:
                continue  # Player's team not in this game

            # Attribute win/loss to every player on the opposing team
            opp_key = (game["session_id"], game["round_number"], opponent_team)
            for opp_id in team_members.get(opp_key, []):
                if opp_id == player_id:
                    continue
                if opp_id not in opponent_stats:
                    opponent_stats[opp_id] = {
                        "id": opp_id,
                        "name": player_names.get(opp_id, "Unknown"),
                        "games": 0,
                        "wins": 0,
                    }
                opponent_stats[opp_id]["games"] += 1
                if player_won:
                    opponent_stats[opp_id]["wins"] += 1

    # ── Step 3b: Pool play path ───────────────────────────────────────────────
    if poolplay_ids:
        # Find which team(s) the player was on in each pool play session
        my_team_rows = fetch_all(
            sb.table("session_team_players")
            .select("team_id, session_teams(id, session_id)")
            .eq("player_id", player_id)
        )

        # Keep only rows belonging to our target sessions
        my_pool_team_ids = {
            row["team_id"]
            for row in my_team_rows
            if row.get("session_teams") and row["session_teams"]["session_id"] in poolplay_ids
        }

        if my_pool_team_ids:
            # Fetch all teams in those sessions so we can look up opponent players
            all_session_teams = fetch_all(
                sb.table("session_teams")
                .select("id, session_id")
                .in_("session_id", poolplay_ids)
            )
            all_team_ids_in_sessions = [t["id"] for t in all_session_teams]

            all_team_players = fetch_all(
                sb.table("session_team_players")
                .select("team_id, player_id, players(name)")
                .in_("team_id", all_team_ids_in_sessions)
            )

            # Build team_id → [player_ids] lookup
            pool_team_members: dict = defaultdict(list)
            for tp in all_team_players:
                pool_team_members[tp["team_id"]].append(tp["player_id"])
                if tp.get("players"):
                    player_names[tp["player_id"]] = tp["players"]["name"]

            def count_sets(game: dict, is_player_team_a: bool) -> tuple[int, int]:
                """
                Returns (sets_played, sets_won_by_player's_team) for one pool/bracket game.
                Per-set counting matches the pool standings calculation.
                """
                sets_played = 0
                sets_won = 0
                for set_num in range(1, 4):
                    sa = game.get(f"set{set_num}_score_a")
                    sb_score = game.get(f"set{set_num}_score_b")
                    if sa is None or sb_score is None:
                        break  # No more sets
                    if sa == 0 and sb_score == 0:
                        break  # Set wasn't played
                    sets_played += 1
                    player_team_score = sa if is_player_team_a else sb_score
                    opponent_score = sb_score if is_player_team_a else sa
                    if player_team_score > opponent_score:
                        sets_won += 1
                return sets_played, sets_won

            def process_pool_game(game: dict) -> None:
                """Attribute per-set wins/losses against each opponent player for one game."""
                team_a = game.get("team_a_id")
                team_b = game.get("team_b_id")
                if not team_a or not team_b:
                    return
                if game.get("is_bye"):
                    return

                if team_a in my_pool_team_ids:
                    opponent_team_id = team_b
                    is_player_team_a = True
                elif team_b in my_pool_team_ids:
                    opponent_team_id = team_a
                    is_player_team_a = False
                else:
                    return  # Player's team not in this game

                sets_played, sets_won = count_sets(game, is_player_team_a)
                if sets_played == 0:
                    return  # Game not yet scored

                for opp_id in pool_team_members.get(opponent_team_id, []):
                    if opp_id == player_id:
                        continue
                    if opp_id not in opponent_stats:
                        opponent_stats[opp_id] = {
                            "id": opp_id,
                            "name": player_names.get(opp_id, "Unknown"),
                            "games": 0,
                            "wins": 0,
                        }
                    opponent_stats[opp_id]["games"] += sets_played
                    opponent_stats[opp_id]["wins"] += sets_won

            # Process all three pool play game tables
            for game in fetch_all(
                sb.table("pool_games")
                .select("session_id, team_a_id, team_b_id, set1_score_a, set1_score_b, set2_score_a, set2_score_b, set3_score_a, set3_score_b")
                .in_("session_id", poolplay_ids)
            ):
                process_pool_game(game)

            for game in fetch_all(
                sb.table("play_in_games")
                .select("session_id, team_a_id, team_b_id, set1_score_a, set1_score_b, set2_score_a, set2_score_b")
                .in_("session_id", poolplay_ids)
            ):
                process_pool_game(game)

            for game in fetch_all(
                sb.table("bracket_games")
                .select("session_id, team_a_id, team_b_id, is_bye, set1_score_a, set1_score_b, set2_score_a, set2_score_b, set3_score_a, set3_score_b")
                .in_("session_id", poolplay_ids)
            ):
                process_pool_game(game)

    # ── Step 4: Compute stats for all opponents, then split into lists ───────
    MIN_GAMES = 3
    TOP_N = 5

    # Annotate every opponent regardless of game count (needed for full history)
    all_opponents = list(opponent_stats.values())
    for stat in all_opponents:
        stat["losses"] = stat["games"] - stat["wins"]
        stat["win_pct"] = round(stat["wins"] / stat["games"] * 100, 1) if stat["games"] > 0 else 0.0

    # Full history: all opponents sorted by most games together
    all_opponents_sorted = sorted(all_opponents, key=lambda x: (-x["games"], -x["wins"]))

    # Highlights use only opponents with enough head-to-head games
    qualified = [s for s in all_opponents if s["games"] >= MIN_GAMES]

    # Nemesis: lowest win%, most losses as tiebreaker
    nemeses = sorted(qualified, key=lambda x: (x["win_pct"], -x["losses"]))[:TOP_N]

    # Barbecue Chicken: highest win%, most wins as tiebreaker
    barbecue_chicken = sorted(qualified, key=lambda x: (-x["win_pct"], -x["wins"]))[:TOP_N]

    return {
        "nemeses": nemeses,
        "barbecue_chicken": barbecue_chicken,
        "all_opponents": all_opponents_sorted,
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
