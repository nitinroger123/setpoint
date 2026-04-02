def compute_live_standings(session_id: str, sb) -> list:
    """
    Compute live player standings from scored round_games + round_assignments.
    Returns a list of player dicts sorted by wins desc, then point_diff desc.
    Only counts games where both score_a and score_b are set.
    """
    games = sb.table("round_games").select("*") \
        .eq("session_id", session_id) \
        .execute().data
    completed = [g for g in games if g["score_a"] is not None and g["score_b"] is not None]

    if not completed:
        return []

    # Pull all round assignments with player names
    assignments = sb.table("round_assignments") \
        .select("round_number, team, player_id, players(id, name)") \
        .eq("session_id", session_id) \
        .execute().data

    # Build lookup: (round_number, team) -> [player dicts]
    team_players: dict = {}
    for a in assignments:
        key = (a["round_number"], a["team"])
        if key not in team_players:
            team_players[key] = []
        team_players[key].append({"id": a["player_id"], "name": a["players"]["name"]})

    # Accumulate wins and point_diff per player
    stats: dict = {}
    for g in completed:
        rn = g["round_number"]
        diff = g["score_a"] - g["score_b"]
        winner_team = g["team_a"] if g["score_a"] > g["score_b"] else g["team_b"]

        for team in (g["team_a"], g["team_b"]):
            player_diff = diff if team == g["team_a"] else -diff
            for p in team_players.get((rn, team), []):
                pid = p["id"]
                if pid not in stats:
                    stats[pid] = {"id": pid, "name": p["name"], "wins": 0, "diff": 0}
                stats[pid]["wins"] += 1 if team == winner_team else 0
                stats[pid]["diff"] += player_diff

    sorted_standings = sorted(stats.values(), key=lambda x: (-x["wins"], -x["diff"]))
    place = 1
    for i, s in enumerate(sorted_standings):
        if i > 0:
            prev = sorted_standings[i - 1]
            if s["wins"] != prev["wins"] or s["diff"] != prev["diff"]:
                place += 1
        s["place"] = place
    return sorted_standings
