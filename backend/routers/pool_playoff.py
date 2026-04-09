"""
Public endpoints for pool play + single-elimination bracket sessions.

Auth tiers:
  - GET endpoints: fully public (no auth required)
  - Score submission: public — anyone can submit scores for an active session
    (if a score already exists → 409; only the director can overwrite via delete + re-submit)
"""

from fastapi import APIRouter, HTTPException
from database import get_supabase
from pool_playoff_helper import (
    compute_pool_standings,
    flag_play_in_teams,
    validate_set_score,
    determine_set_winner,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_active(session_id: str, sb) -> dict:
    """Fetch the session and raise 403 if it is not active."""
    session = sb.table("sessions").select("id, status").eq("id", session_id).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.data["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="Score submission is only allowed for active sessions.",
        )
    return session.data


def _get_pool_scoring(session_id: str, stage: str, sb) -> dict:
    """Fetch the scoring rules for a session stage, or fall back to defaults."""
    res = (
        sb.table("session_stage_scoring")
        .select("*")
        .eq("session_id", session_id)
        .eq("stage", stage)
        .execute()
    )
    if res.data:
        return res.data[0]
    # Sensible hard-coded defaults if no config row exists
    return {"sets_per_match": 2, "pool_play_format": "per_set", "points_to_win": 21, "win_by": 2, "cap": 25}


def _load_teams(session_id: str, sb) -> list:
    """Load all session teams with their player lists."""
    teams = (
        sb.table("session_teams")
        .select("*, session_team_players(players(id, name))")
        .eq("session_id", session_id)
        .execute()
        .data
    )
    for team in teams:
        # Flatten nested join structure → players list on the team dict
        team["players"] = [
            row["players"]
            for row in (team.pop("session_team_players", None) or [])
            if row.get("players")
        ]
    return teams


# ── Read endpoints ─────────────────────────────────────────────────────────────

@router.get("/{session_id}")
def get_pool_session(session_id: str):
    """
    Return the full state of a pool+playoff session.
    Includes session metadata, teams, pool config, scoring rules,
    pool games, play-in games, and bracket games.
    """
    sb = get_supabase()

    session = (
        sb.table("sessions")
        .select("*, tournament_series(name, game_format_id, competition_type_id, level_id, surface_id, division_id)")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    teams = _load_teams(session_id, sb)

    pool_config = (
        sb.table("session_pool_config")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
    )

    scoring_rules = (
        sb.table("session_stage_scoring")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
    )

    pool_games = (
        sb.table("pool_games")
        .select("*")
        .eq("session_id", session_id)
        .order("pool")
        .order("created_at")
        .execute()
        .data
    )

    play_in_games = (
        sb.table("play_in_games")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
    )

    bracket_games = (
        sb.table("bracket_games")
        .select("*")
        .eq("session_id", session_id)
        .order("round_number")
        .order("position")
        .execute()
        .data
    )

    return {
        **session.data,
        "teams":        teams,
        "pool_config":  pool_config[0] if pool_config else None,
        "scoring_rules": scoring_rules,
        "pool_games":   pool_games,
        "play_in_games": play_in_games,
        "bracket_games": bracket_games,
    }


@router.get("/{session_id}/standings")
def get_pool_standings(session_id: str):
    """
    Compute and return live pool standings for all pools in the session.
    Each pool's teams are sorted by wins → set_diff → point_diff → points_scored.
    Teams tied at the advancing cutoff are flagged with in_play_in=True.
    """
    sb = get_supabase()

    teams = _load_teams(session_id, sb)
    pool_games = (
        sb.table("pool_games")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
    )

    pool_config = (
        sb.table("session_pool_config")
        .select("teams_advancing_per_pool")
        .eq("session_id", session_id)
        .execute()
        .data
    )
    teams_advancing = pool_config[0]["teams_advancing_per_pool"] if pool_config else 2

    standings = compute_pool_standings(teams, pool_games)
    standings = flag_play_in_teams(standings, teams_advancing)
    return standings


# ── Score submission (public — active sessions only) ───────────────────────────

def _submit_game_score(game_table: str, session_id: str, game_id: str, body: dict, stage: str) -> dict:
    """
    Shared score-submission logic for pool games, play-in games, and bracket games.

    Validates set scores, determines the winner, and writes to DB.
    Returns 409 if a score already exists (director must delete to overwrite).
    """
    sb = get_supabase()
    _require_active(session_id, sb)

    # Fetch the game row
    game = sb.table(game_table).select("*").eq("id", game_id).eq("session_id", session_id).single().execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Game not found")

    game_data = game.data
    if game_data.get("winner_id"):
        raise HTTPException(
            status_code=409,
            detail="This game already has a score. Only the director can overwrite via score reset.",
        )

    scoring = _get_pool_scoring(session_id, stage, sb)
    sets_per_match = scoring["sets_per_match"]
    points_to_win  = scoring["points_to_win"]
    win_by         = scoring["win_by"]
    cap            = scoring.get("cap")

    # Build update payload from submitted sets
    update: dict = {}
    wins_a = 0
    wins_b = 0

    for set_num in range(1, sets_per_match + 1):
        score_a = body.get(f"set{set_num}_score_a")
        score_b = body.get(f"set{set_num}_score_b")
        if score_a is None or score_b is None:
            raise HTTPException(
                status_code=400,
                detail=f"set{set_num}_score_a and set{set_num}_score_b are required.",
            )
        error = validate_set_score(score_a, score_b, points_to_win, win_by, cap)
        if error:
            raise HTTPException(status_code=400, detail=f"Set {set_num}: {error}")
        update[f"set{set_num}_score_a"] = score_a
        update[f"set{set_num}_score_b"] = score_b
        if score_a > score_b:
            wins_a += 1
        else:
            wins_b += 1

    # Determine match winner (best of sets_per_match)
    if wins_a > wins_b:
        winner_id = game_data["team_a_id"]
    elif wins_b > wins_a:
        winner_id = game_data["team_b_id"]
    else:
        # Split — no overall match winner (valid for per_set pool play)
        winner_id = None

    update["winner_id"] = winner_id
    sb.table(game_table).update(update).eq("id", game_id).execute()

    return {"ok": True, "winner_id": winner_id}


@router.post("/{session_id}/pool-games/{game_id}/score")
def submit_pool_game_score(session_id: str, game_id: str, body: dict):
    """
    Submit scores for a pool play game.
    Requires all sets_per_match sets to be provided.
    Session must be active; 409 if the game already has a score.
    """
    return _submit_game_score("pool_games", session_id, game_id, body, "pool")


@router.post("/{session_id}/play-in/{game_id}/score")
def submit_play_in_score(session_id: str, game_id: str, body: dict):
    """
    Submit scores for a play-in (tiebreaker) game.
    Session must be active; 409 if the game already has a score.
    """
    return _submit_game_score("play_in_games", session_id, game_id, body, "playoff")


@router.post("/{session_id}/bracket/{game_id}/score")
def submit_bracket_score(session_id: str, game_id: str, body: dict):
    """
    Submit scores for a bracket (single-elimination) game.
    On success, the winner is automatically advanced to the next bracket game.
    Session must be active; 409 if the game already has a score.
    """
    sb = get_supabase()
    result = _submit_game_score("bracket_games", session_id, game_id, body, "playoff")

    # Advance the winner to the next bracket game
    winner_id = result.get("winner_id")
    if winner_id:
        bracket_game = (
            sb.table("bracket_games")
            .select("winner_advances_to, team_a_id, team_b_id")
            .eq("id", game_id)
            .single()
            .execute()
        )
        if bracket_game.data:
            next_game_id = bracket_game.data.get("winner_advances_to")
            if next_game_id:
                # Place the winner in the next game — into team_a or team_b slot
                next_game = (
                    sb.table("bracket_games")
                    .select("team_a_id, team_b_id")
                    .eq("id", next_game_id)
                    .single()
                    .execute()
                )
                if next_game.data:
                    if next_game.data["team_a_id"] is None:
                        sb.table("bracket_games").update({"team_a_id": winner_id}).eq("id", next_game_id).execute()
                    else:
                        sb.table("bracket_games").update({"team_b_id": winner_id}).eq("id", next_game_id).execute()

    return result
