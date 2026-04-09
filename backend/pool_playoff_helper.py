"""
Pure helper functions for pool play + single-elimination bracket logic.
No DB calls — inputs are plain Python dicts loaded from Supabase queries.
"""

import math
from typing import Dict, List, Optional, Tuple


# ── Pool standings ─────────────────────────────────────────────────────────────

def compute_pool_standings(
    teams: List[Dict],
    pool_games: List[Dict],
) -> Dict[str, List[Dict]]:
    """
    Compute standings for every pool using the 'per_set' format.

    In per_set mode every individual set result (not match result) is counted:
      - Win a set  → +1 win, +1 to sets_won
      - Lose a set → +1 loss, +1 to sets_lost
    A 2-set match split 1-1 gives each team 1W-1L.

    Sort order within each pool:
      1. wins desc (= sets won)
      2. set_diff desc (sets_won - sets_lost)
      3. point_diff desc (points_scored - points_conceded)
      4. total points_scored desc

    Args:
        teams:      list of session_teams rows (must include id, name, pool, seed)
        pool_games: list of pool_games rows with set score columns

    Returns:
        dict mapping pool label (e.g. 'A') → sorted list of standing dicts
    """
    # Initialise a stats entry for every team
    stats: Dict[str, Dict] = {}
    for team in teams:
        stats[team["id"]] = {
            "team_id":        team["id"],
            "team_name":      team["name"],
            "pool":           team.get("pool"),
            "seed":           team.get("seed"),
            "wins":           0,
            "losses":         0,
            "set_diff":       0,
            "points_scored":  0,
            "points_conceded": 0,
            "point_diff":     0,
            "games_played":   0,
            "in_play_in":     False,
        }

    # Accumulate set results from each game
    for game in pool_games:
        team_a_id = game.get("team_a_id")
        team_b_id = game.get("team_b_id")
        if not team_a_id or not team_b_id:
            continue
        if team_a_id not in stats or team_b_id not in stats:
            continue

        game_had_any_set = False
        for set_num in [1, 2, 3]:
            score_a = game.get(f"set{set_num}_score_a")
            score_b = game.get(f"set{set_num}_score_b")
            if score_a is None or score_b is None:
                continue

            game_had_any_set = True
            stats[team_a_id]["points_scored"]   += score_a
            stats[team_a_id]["points_conceded"]  += score_b
            stats[team_b_id]["points_scored"]   += score_b
            stats[team_b_id]["points_conceded"]  += score_a

            if score_a > score_b:
                stats[team_a_id]["wins"]   += 1
                stats[team_b_id]["losses"] += 1
            elif score_b > score_a:
                stats[team_b_id]["wins"]   += 1
                stats[team_a_id]["losses"] += 1
            # Exact tie within a set is technically invalid but we skip it gracefully

        if game_had_any_set:
            stats[team_a_id]["games_played"] += 1
            stats[team_b_id]["games_played"] += 1

    # Compute derived fields
    for s in stats.values():
        s["set_diff"]   = s["wins"] - s["losses"]
        s["point_diff"] = s["points_scored"] - s["points_conceded"]

    # Group teams by pool label
    pools: Dict[str, List[Dict]] = {}
    for team in teams:
        pool_label = team.get("pool")
        if pool_label not in pools:
            pools[pool_label] = []
        pools[pool_label].append(stats[team["id"]])

    # Sort each pool by standings rules
    result: Dict[str, List[Dict]] = {}
    for pool_label, pool_standings in pools.items():
        result[pool_label] = sorted(
            pool_standings,
            key=lambda s: (
                -s["wins"],
                -s["set_diff"],
                -s["point_diff"],
                -s["points_scored"],
            ),
        )

    return result


def flag_play_in_teams(
    pool_standings: Dict[str, List[Dict]],
    teams_advancing_per_pool: int,
) -> Dict[str, List[Dict]]:
    """
    Mark teams that are tied at the last advancing cutoff as 'in_play_in=True'.

    A play-in is required when two or more teams share the exact same stats at
    the boundary position (teams_advancing_per_pool), so it is impossible to
    determine which advances without an additional game.

    Modifies standings in-place and returns the same dict for convenience.
    """
    for pool_label, standings in pool_standings.items():
        if len(standings) <= teams_advancing_per_pool:
            continue
        # The last advancing team and the first non-advancing team
        cutoff = teams_advancing_per_pool - 1
        boundary_team = standings[cutoff]
        next_team     = standings[cutoff + 1]

        def key(s: Dict) -> tuple:
            """Sort key used for tie-breaking comparison."""
            return (s["wins"], s["set_diff"], s["point_diff"], s["points_scored"])

        if key(boundary_team) == key(next_team):
            # All teams sharing the boundary stats need a play-in
            boundary_key = key(boundary_team)
            for s in standings:
                if key(s) == boundary_key:
                    s["in_play_in"] = True

    return pool_standings


# ── Pool game generation ───────────────────────────────────────────────────────

def generate_pool_games(teams_by_pool: Dict[str, List[Dict]]) -> List[Dict]:
    """
    Generate round-robin matchups for every pool.

    For N teams in a pool: N*(N-1)/2 games.
    Each game dict contains pool, team_a_id, and team_b_id.

    Args:
        teams_by_pool: dict mapping pool label → list of session_teams rows

    Returns:
        list of game dicts ready for insertion into pool_games
    """
    games: List[Dict] = []
    for pool_label, teams in teams_by_pool.items():
        for i in range(len(teams)):
            for j in range(i + 1, len(teams)):
                games.append({
                    "pool":      pool_label,
                    "team_a_id": teams[i]["id"],
                    "team_b_id": teams[j]["id"],
                })
    return games


# ── Bracket seeding ────────────────────────────────────────────────────────────

def seed_bracket(
    pool_standings: Dict[str, List[Dict]],
    teams_advancing_per_pool: int,
) -> List[Dict]:
    """
    Produce an ordered list of advancing teams using cross-pool snake seeding.

    Standard pattern for 2 pools, 2 advancing (4 seeds):
      Spot 0 (even) → forward:  1A, 1B        (seed 1, seed 2)
      Spot 1 (odd)  → reverse:  2B, 2A        (seed 3, seed 4)

    This separates pool-mates in opposite halves of the bracket.

    Args:
        pool_standings:           output of compute_pool_standings (or flag_play_in_teams)
        teams_advancing_per_pool: how many teams advance from each pool

    Returns:
        list of team dicts with added 'bracket_seed', 'source_pool', 'source_position' keys
    """
    pool_names = sorted(pool_standings.keys())
    seeds: List[Dict] = []

    for spot in range(teams_advancing_per_pool):
        # Alternate direction so pool-mates end up on opposite sides
        ordered_pools = pool_names if spot % 2 == 0 else list(reversed(pool_names))
        for pool_name in ordered_pools:
            standing = pool_standings.get(pool_name, [])
            # Skip teams flagged for play-in unless play-ins are resolved
            # (caller is responsible for resolving play-ins before seeding)
            if spot < len(standing):
                seeds.append({
                    **standing[spot],
                    "bracket_seed":     len(seeds) + 1,
                    "source_pool":      pool_name,
                    "source_position":  spot + 1,
                })

    return seeds


# ── Bracket structure ──────────────────────────────────────────────────────────

def _next_power_of_two(n: int) -> int:
    """Return the smallest power of 2 that is >= n."""
    if n <= 1:
        return 1
    p = 1
    while p < n:
        p *= 2
    return p


def _standard_round1_pairings(bracket_size: int) -> List[Tuple[int, int]]:
    """
    Return the standard single-elimination seed pairings for round 1,
    ordered by bracket position (1-indexed).

    Example for bracket_size=8:
      position 1 → (seed 1, seed 8)
      position 2 → (seed 4, seed 5)
      position 3 → (seed 3, seed 6)
      position 4 → (seed 2, seed 7)

    Winners of positions 1 and 2 meet in the upper semifinal;
    winners of positions 3 and 4 meet in the lower semifinal.
    """
    if bracket_size == 2:
        return [(1, 2)]
    sub = _standard_round1_pairings(bracket_size // 2)
    result: List[Tuple[int, int]] = []
    for (a, b) in sub:
        result.append((a, bracket_size + 1 - a))
        result.append((b, bracket_size + 1 - b))
    return result


def create_bracket_structure(
    num_teams: int,
    session_id: str,
) -> Tuple[List[Dict], int, int]:
    """
    Build the full bracket game row list for a single-elimination tournament.

    Byes are assigned to the top seeds: if bracket_size - num_teams byes exist,
    the top 'num_byes' seeds auto-advance from round 1.

    winner_advances_to is left as None here; the caller must fill it in after
    inserting all games (since the UUIDs are generated by the DB).

    Args:
        num_teams:  total advancing teams that will be seeded
        session_id: UUID string of the session

    Returns:
        (games, bracket_size, num_rounds) where games is a list of row dicts
    """
    bracket_size = _next_power_of_two(num_teams)
    num_rounds   = int(math.log2(bracket_size)) if bracket_size > 1 else 1
    num_byes     = bracket_size - num_teams

    # Round 1 pairings (seed_a, seed_b) by position
    round1_pairings = _standard_round1_pairings(bracket_size)

    games: List[Dict] = []

    # Round 1: bracket_size // 2 positions
    for position, (seed_a, seed_b) in enumerate(round1_pairings, start=1):
        # A position is a bye if either seed exceeds num_teams
        is_bye = seed_b > num_teams
        games.append({
            "session_id":         session_id,
            "round_number":       1,
            "position":           position,
            "_seed_a":            seed_a,   # temp key: replaced with team UUIDs later
            "_seed_b":            seed_b if not is_bye else None,
            "is_bye":             is_bye,
            "set1_score_a": None, "set1_score_b": None,
            "set2_score_a": None, "set2_score_b": None,
            "set3_score_a": None, "set3_score_b": None,
            "winner_id":          None,
            "winner_advances_to": None,
        })

    # Rounds 2..num_rounds: games_in_round = bracket_size // 2^round
    for rn in range(2, num_rounds + 1):
        games_in_round = bracket_size // (2 ** rn)
        for position in range(1, games_in_round + 1):
            games.append({
                "session_id":         session_id,
                "round_number":       rn,
                "position":           position,
                "_seed_a":            None,
                "_seed_b":            None,
                "is_bye":             False,
                "set1_score_a": None, "set1_score_b": None,
                "set2_score_a": None, "set2_score_b": None,
                "set3_score_a": None, "set3_score_b": None,
                "winner_id":          None,
                "winner_advances_to": None,
            })

    return games, bracket_size, num_rounds


def resolve_winner_advances_to(
    games: List[Dict],
) -> List[Dict]:
    """
    Set the winner_advances_to field on each game (except the final).

    Position p in round r advances to position ceil(p/2) in round r+1.
    Operates on in-memory game dicts; the caller is responsible for updating
    the DB after IDs are known.

    Args:
        games: list of bracket game dicts with 'id', 'round_number', 'position'

    Returns:
        the same list with winner_advances_to populated
    """
    # Index games by (round_number, position) for quick lookup
    index: Dict[Tuple[int, int], Dict] = {}
    for game in games:
        index[(game["round_number"], game["position"])] = game

    for game in games:
        next_position = math.ceil(game["position"] / 2)
        next_game = index.get((game["round_number"] + 1, next_position))
        if next_game:
            game["winner_advances_to"] = next_game["id"]

    return games


# ── Score validation ───────────────────────────────────────────────────────────

def is_valid_set_score(
    score_winner: int,
    score_loser: int,
    points_to_win: int,
    win_by: int,
    cap: Optional[int],
) -> bool:
    """
    Return True if the winning score is a legal set score under the given rules.

    A set is legal when:
      - winner >= points_to_win
      - winner - loser >= win_by
      - if cap is set: winner <= cap (cap overrides win_by at the cap)
    """
    if score_winner < points_to_win:
        # Must reach at least the target to win
        if cap is not None and score_winner == cap:
            return True  # Capped — win by 1 at cap is acceptable
        return False
    if cap is not None and score_winner == cap:
        return True  # Capped; margin doesn't matter at cap
    return (score_winner - score_loser) >= win_by


def validate_set_score(
    score_a: int,
    score_b: int,
    points_to_win: int,
    win_by: int,
    cap: Optional[int],
) -> Optional[str]:
    """
    Validate a set score pair.

    Returns an error message string if invalid, or None if valid.
    """
    if score_a == score_b:
        return "Set cannot end in a tie."
    winner_score = max(score_a, score_b)
    loser_score  = min(score_a, score_b)
    if not is_valid_set_score(winner_score, loser_score, points_to_win, win_by, cap):
        cap_note = f" (cap {cap})" if cap else ""
        return (
            f"Invalid set score {score_a}-{score_b}. "
            f"Winner must reach {points_to_win}, win by {win_by}{cap_note}."
        )
    return None


def determine_set_winner(score_a: int, score_b: int) -> str:
    """Return 'a' if team A won the set, 'b' if team B won."""
    if score_a > score_b:
        return "a"
    return "b"


# ── Final session standings ────────────────────────────────────────────────────

def compute_session_standings(
    bracket_games: List[Dict],
    all_teams: List[Dict],
) -> List[Dict]:
    """
    Determine final team placements after the bracket is complete.

    Champion  = winner of the final (highest round_number).
    Runner-up = loser of the final.
    3rd/4th   = losers of the semifinals.
    Remaining teams are ordered by the round they were eliminated in,
    then by their bracket seed.

    Args:
        bracket_games: all bracket_games rows for the session (with winner_id populated)
        all_teams:     all session_teams rows (used for teams not in the bracket)

    Returns:
        list of dicts with team_id, team_name, place — sorted ascending by place
    """
    if not bracket_games:
        return []

    max_round = max(g["round_number"] for g in bracket_games)
    placements: Dict[str, int] = {}

    # Work from final backwards, assigning elimination round placements
    for rn in range(max_round, 0, -1):
        games_in_round = [g for g in bracket_games if g["round_number"] == rn]
        num_games      = len(games_in_round)

        if rn == max_round:
            # Final: winner is 1st, loser is 2nd
            place_winner = 1
            place_loser  = 2
        else:
            # Semifinal losers → 3rd/4th; quarter losers → 5th–8th; etc.
            place_winner = 2 ** (max_round - rn)        # these already advanced
            place_loser  = 2 ** (max_round - rn) + 1    # first loser at this level

        for i, game in enumerate(sorted(games_in_round, key=lambda g: g["position"])):
            if game.get("is_bye"):
                continue
            winner_id = game.get("winner_id")
            if winner_id:
                loser_id = (
                    game["team_b_id"]
                    if winner_id == game["team_a_id"]
                    else game["team_a_id"]
                )
                if rn == max_round:
                    placements[winner_id] = place_winner
                    if loser_id:
                        placements[loser_id] = place_loser
                else:
                    if loser_id and loser_id not in placements:
                        placements[loser_id] = place_loser + i

    # Build result list for all teams (bracket participants + any who didn't advance)
    team_map = {t["id"]: t for t in all_teams}
    results: List[Dict] = []
    for team_id, place in placements.items():
        team = team_map.get(team_id, {})
        results.append({
            "team_id":   team_id,
            "team_name": team.get("name", "Unknown"),
            "place":     place,
        })

    # Teams not in the bracket (didn't advance from pools)
    bracket_team_ids = set(placements.keys())
    non_bracket_place = len(placements) + 1
    for team in all_teams:
        if team["id"] not in bracket_team_ids:
            results.append({
                "team_id":   team["id"],
                "team_name": team["name"],
                "place":     non_bracket_place,
            })

    results.sort(key=lambda r: r["place"])
    return results
