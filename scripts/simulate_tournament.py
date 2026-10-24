#!/usr/bin/env python3
"""
simulate_tournament.py

Simulates a full pool play + single-elimination reverse coed doubles tournament.

Flow:
  1. Find the target series
  2. Create a session for today
  3. Configure 3 pools of 4 (top 2 per pool advance)
  4. Fetch real players, randomly pair M+F into 12 teams
  5. Register teams with seeds, assign to pools via snake draft
  6. Activate session (generates pool games)
  7. Score all pool games with random valid scores
  8. Score any play-in tiebreaker games
  9. Generate bracket
  10. Score bracket games round-by-round (winner auto-advances)
  11. Complete session

Usage:
    cd backend && python ../scripts/simulate_tournament.py

Requires backend running at BASE_URL with the configured PIN.
"""

import random
import sys
import time
import requests
from datetime import date

# ── Config ─────────────────────────────────────────────────────────────────────

BASE_URL     = "http://localhost:8000"
PIN          = "1234"
SERIES_NAME  = "VBNYC Grass Series 2026"
NUM_POOLS    = 3
TEAMS_PER_POOL = 4
TEAMS_ADVANCING_PER_POOL = 2
NUM_TEAMS    = NUM_POOLS * TEAMS_PER_POOL   # 12 teams total

HEADERS = {"X-Director-Pin": PIN, "Content-Type": "application/json"}


# ── Helpers ────────────────────────────────────────────────────────────────────

def api(method: str, path: str, **kwargs) -> dict:
    """Make an API request and return JSON, exiting on HTTP error."""
    url = f"{BASE_URL}{path}"
    resp = getattr(requests, method)(url, headers=HEADERS, **kwargs)
    if not resp.ok:
        print(f"\n  ✗ {method.upper()} {path}")
        print(f"    {resp.status_code}: {resp.text}")
        sys.exit(1)
    return resp.json()


def random_set_score(pts_to_win: int, win_by: int, cap: int | None) -> tuple[int, int]:
    """
    Generate a random valid set score (score_a, score_b).
    Randomly assigns winner to team A or B.
    The score satisfies: winner >= pts_to_win, winner >= loser + win_by, winner <= cap.
    """
    cap = cap if cap is not None else pts_to_win + 10

    # Losing score: somewhere in the realistic range below pts_to_win
    loser = random.randint(max(0, pts_to_win - 9), pts_to_win - 1)

    # Winner: at least pts_to_win and at least loser + win_by
    winner = max(pts_to_win, loser + win_by)

    # Clamp to cap
    if winner > cap:
        winner = cap
        loser = cap - win_by

    # Randomly decide which team wins
    return (winner, loser) if random.random() < 0.5 else (loser, winner)


def score_game(session_id: str, table: str, game_id: str,
               sets_per_match: int, pts: int, win_by: int, cap: int | None) -> None:
    """Submit a randomly-scored result for a single game."""
    body = {}
    for s in range(1, sets_per_match + 1):
        sa, sb = random_set_score(pts, win_by, cap)
        body[f"set{s}_score_a"] = sa
        body[f"set{s}_score_b"] = sb

    endpoint_map = {
        "pool_games":    f"/api/pool/{session_id}/pool-games/{game_id}/score",
        "play_in_games": f"/api/pool/{session_id}/play-in/{game_id}/score",
        "bracket_games": f"/api/pool/{session_id}/bracket/{game_id}/score",
    }
    path = endpoint_map[table]

    resp = requests.post(f"{BASE_URL}{path}", headers=HEADERS, json=body)
    if not resp.ok:
        print(f"    ✗ scoring {game_id}: {resp.status_code} {resp.text}")
    else:
        data = resp.json()
        print(f"    scored game → winner_id: {str(data.get('winner_id', '?'))[:8]}…")


def get_scoring_rule(rules: list, stage: str) -> dict:
    """Return the scoring rule for a given stage, with safe defaults."""
    rule = next((r for r in rules if r["stage"] == stage), None)
    if rule:
        return rule
    return {"sets_per_match": 2, "points_to_win": 21, "win_by": 2, "cap": 25}


# ── Step 1: Find series ────────────────────────────────────────────────────────

print(f"\n── Step 1: Finding series '{SERIES_NAME}'")
series_list = api("get", "/api/director/series")
series = next((s for s in series_list if s["name"] == SERIES_NAME), None)
if not series:
    print(f"  ✗ Series not found. Create it via the Director UI first.")
    sys.exit(1)
series_id = series["id"]
print(f"  ✓ {series_id}")


# ── Step 2: Create session ─────────────────────────────────────────────────────

today = date.today().isoformat()
print(f"\n── Step 2: Creating session for {today}")
session = api("post", "/api/director/sessions", json={"date": today, "series_id": series_id})
session_id = session["id"]
print(f"  ✓ session_id: {session_id}")


# ── Step 3: Configure pool settings ───────────────────────────────────────────

print(f"\n── Step 3: Configuring {NUM_POOLS} pools × {TEAMS_PER_POOL} teams, top {TEAMS_ADVANCING_PER_POOL} advance")
api("put", f"/api/director/pool/{session_id}/config", json={
    "teams_per_pool":           TEAMS_PER_POOL,
    "teams_advancing_per_pool": TEAMS_ADVANCING_PER_POOL,
})
print(f"  ✓ pool config saved")


# ── Step 4: Fetch and pair players ────────────────────────────────────────────

print(f"\n── Step 4: Fetching players and pairing M+F")
all_players = api("get", "/api/players")
males   = [p for p in all_players if p.get("gender") == "m"]
females = [p for p in all_players if p.get("gender") == "f"]

if len(males) < NUM_TEAMS:
    print(f"  ✗ Need {NUM_TEAMS} male players, only {len(males)} available.")
    sys.exit(1)
if len(females) < NUM_TEAMS:
    print(f"  ✗ Need {NUM_TEAMS} female players, only {len(females)} available.")
    sys.exit(1)

random.shuffle(males)
random.shuffle(females)
pairs = list(zip(females[:NUM_TEAMS], males[:NUM_TEAMS]))

print(f"  ✓ {len(pairs)} pairs selected from {len(males)}M / {len(females)}F available")


# ── Step 5: Register teams ────────────────────────────────────────────────────

print(f"\n── Step 5: Registering {NUM_TEAMS} teams (seed order = random)")

# Shuffle pairs so seeding is random, not alphabetical
random.shuffle(pairs)

registered_teams = []
for seed, (female, male) in enumerate(pairs, start=1):
    # Team name: first names only for readability
    fname = female["name"].split()[0]
    mname = male["name"].split()[0]
    team_name = f"{fname} / {mname}"

    team = api("post", f"/api/director/pool/{session_id}/teams", json={
        "name": team_name,
        "seed": seed,
    })

    # Register both players
    for player in (female, male):
        api("post", f"/api/director/pool/{session_id}/teams/{team['id']}/players",
            json={"player_id": player["id"]})

    registered_teams.append(team)
    print(f"  #{seed:2d}  {team_name}")


# ── Step 6: Auto-assign to pools (snake draft by seed) ────────────────────────

print(f"\n── Step 6: Assigning teams to {NUM_POOLS} pools")
result = api("post", f"/api/director/pool/{session_id}/assign-pools")
# Print which teams landed in each pool
team_by_id = {t["id"]: t["name"] for t in registered_teams}
for label in sorted(result["pools"].keys()):
    names = [team_by_id.get(tid, tid[:8]) for tid in result["pools"][label]]
    print(f"  Pool {label}: {', '.join(names)}")


# ── Step 7: Activate ──────────────────────────────────────────────────────────

print(f"\n── Step 7: Activating session (generates pool games)")
api("post", f"/api/director/pool/{session_id}/activate")
print(f"  ✓ Session is now active")


# ── Step 8: Score pool games ──────────────────────────────────────────────────

print(f"\n── Step 8: Scoring pool games")
session_data = api("get", f"/api/pool/{session_id}")
pool_games   = session_data["pool_games"]
pool_rule    = get_scoring_rule(session_data["scoring_rules"], "pool")

print(f"  Rules: to {pool_rule['points_to_win']}, win by {pool_rule['win_by']}, "
      f"cap {pool_rule['cap']}, {pool_rule['sets_per_match']} sets/match")
print(f"  {len(pool_games)} games to score")

for game in pool_games:
    score_game(
        session_id, "pool_games", game["id"],
        pool_rule["sets_per_match"],
        pool_rule["points_to_win"],
        pool_rule["win_by"],
        pool_rule["cap"],
    )

# ── Step 9: Score any play-in games ───────────────────────────────────────────

# Refresh session data after scoring
time.sleep(0.5)
session_data  = api("get", f"/api/pool/{session_id}")
play_in_games = session_data["play_in_games"]

if play_in_games:
    unscored_playins = [g for g in play_in_games if not g.get("winner_id")]
    if unscored_playins:
        print(f"\n── Step 9: Scoring {len(unscored_playins)} play-in tiebreaker game(s)")
        playoff_rule = get_scoring_rule(session_data["scoring_rules"], "playoff")
        for game in unscored_playins:
            score_game(
                session_id, "play_in_games", game["id"],
                playoff_rule["sets_per_match"],
                playoff_rule["points_to_win"],
                playoff_rule["win_by"],
                playoff_rule["cap"],
            )
        time.sleep(0.5)
    else:
        print(f"\n── Step 9: No play-in games needed")
else:
    print(f"\n── Step 9: No play-in games")


# ── Step 10: Generate bracket ─────────────────────────────────────────────────

print(f"\n── Step 10: Generating bracket")
bracket_result = api("post", f"/api/director/pool/{session_id}/generate-bracket")
if not bracket_result.get("ok"):
    print(f"  ✗ Bracket generation failed: {bracket_result.get('message')}")
    sys.exit(1)
print(f"  ✓ {bracket_result['num_teams']} teams, {bracket_result['num_rounds']} rounds")


# ── Step 11: Score bracket games round by round ───────────────────────────────

print(f"\n── Step 11: Scoring bracket games")

session_data  = api("get", f"/api/pool/{session_id}")
scoring_rules = session_data["scoring_rules"]
bracket_games = session_data["bracket_games"]
max_round     = max((g["round_number"] for g in bracket_games), default=1)

for rnd in range(1, max_round + 1):
    stage = "playoff_final" if rnd == max_round else "playoff"
    rule  = get_scoring_rule(scoring_rules, stage)
    print(f"\n  Round {rnd}  ({stage}): to {rule['points_to_win']}, "
          f"win by {rule['win_by']}, cap {rule['cap']}, {rule['sets_per_match']} sets")

    # Refresh to pick up team slots filled by prior round's winners
    if rnd > 1:
        time.sleep(0.5)
        session_data  = api("get", f"/api/pool/{session_id}")
        bracket_games = session_data["bracket_games"]

    round_games = [
        g for g in bracket_games
        if g["round_number"] == rnd
        and not g.get("is_bye")
        and not g.get("winner_id")
        and g.get("team_a_id")
        and g.get("team_b_id")
    ]

    if not round_games:
        print(f"    (no scorable games this round)")
        continue

    for game in round_games:
        score_game(
            session_id, "bracket_games", game["id"],
            rule["sets_per_match"],
            rule["points_to_win"],
            rule["win_by"],
            rule["cap"],
        )


# ── Step 12: Complete session ──────────────────────────────────────────────────

print(f"\n── Step 12: Completing session")
api("post", f"/api/director/pool/{session_id}/complete")
print(f"  ✓ Session completed")

print(f"\n✓ Tournament simulation done.")
print(f"  View at: http://localhost:5173/pool/{session_id}")
print(f"  Director: http://localhost:5173/director/pool/{session_id}")
