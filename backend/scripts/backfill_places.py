"""
Backfill correct place values for all completed sessions using dense ranking
(tied players share the same place instead of being ordered alphabetically).

Run from the backend/ directory:
    python scripts/backfill_places.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from database import get_supabase
from standings_helper import compute_live_standings


def backfill():
    sb = get_supabase()

    sessions = sb.table("sessions").select("id, date").eq("status", "completed").execute().data
    print(f"Found {len(sessions)} completed sessions to backfill.")

    for session in sessions:
        session_id = session["id"]
        date = session.get("date", session_id)

        standings = compute_live_standings(session_id, sb)
        if not standings:
            # No raw round_games — recompute place from existing session_standings rows
            rows = sb.table("session_standings") \
                .select("player_id, total_wins, total_diff") \
                .eq("session_id", session_id) \
                .execute().data
            rows.sort(key=lambda r: (-r["total_wins"], -r["total_diff"]))
            if not rows:
                print(f"  {date}: no data at all, skipping")
                continue

            # Apply dense ranking
            place = 1
            for i, row in enumerate(rows):
                if i > 0:
                    prev = rows[i - 1]
                    if row["total_wins"] != prev["total_wins"] or row["total_diff"] != prev["total_diff"]:
                        place += 1
                sb.table("session_standings").update({"place": place}) \
                    .eq("session_id", session_id) \
                    .eq("player_id", row["player_id"]) \
                    .execute()
                sb.table("game_results").update({"place": place}) \
                    .eq("session_id", session_id) \
                    .eq("player_id", row["player_id"]) \
                    .execute()

            places = [r["total_wins"] for r in rows]  # just for tie detection
            tied_count = len(rows) - len(set((r["total_wins"], r["total_diff"]) for r in rows))
            print(f"  {date}: {len(rows)} players (sheet import), {tied_count} ties fixed")
            continue

        final_stats = {s["id"]: s for s in standings}

        # Re-write session_standings
        sb.table("session_standings").delete().eq("session_id", session_id).execute()
        sb.table("session_standings").insert([
            {
                "session_id": session_id,
                "player_id": s["id"],
                "total_wins": s["wins"],
                "total_diff": s["diff"],
                "place": s["place"],
            }
            for s in standings
        ]).execute()

        # Re-write game_results place column
        games = sb.table("round_games").select("*") \
            .eq("session_id", session_id).execute().data
        completed_games = [g for g in games if g["score_a"] is not None and g["score_b"] is not None]

        assignments = sb.table("round_assignments") \
            .select("round_number, team, player_id") \
            .eq("session_id", session_id).execute().data

        team_players: dict = {}
        for a in assignments:
            key = (a["round_number"], a["team"])
            team_players.setdefault(key, []).append(a["player_id"])

        records = []
        for g in completed_games:
            rn = g["round_number"]
            diff = g["score_a"] - g["score_b"]
            winner_team = g["team_a"] if g["score_a"] > g["score_b"] else g["team_b"]

            for team in (g["team_a"], g["team_b"]):
                player_diff = diff if team == g["team_a"] else -diff
                for player_id in team_players.get((rn, team), []):
                    s = final_stats.get(player_id, {"wins": 0, "diff": 0, "place": 99})
                    records.append({
                        "session_id": session_id,
                        "player_id": player_id,
                        "round_number": rn,
                        "game_number": g["game_number"],
                        "team": team,
                        "point_diff": player_diff,
                        "total_wins": s["wins"],
                        "total_diff": s["diff"],
                        "place": s["place"],
                    })

        if records:
            sb.table("game_results").delete().eq("session_id", session_id).execute()
            sb.table("game_results").insert(records).execute()

        ties = sum(1 for s in standings if standings.count(s) == 0)  # just for logging
        places = [s["place"] for s in standings]
        tied_count = len(places) - len(set(places))
        print(f"  {date}: {len(standings)} players, {tied_count} ties fixed, places: {places}")

    print("Done.")


if __name__ == "__main__":
    backfill()
