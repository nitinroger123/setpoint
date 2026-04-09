"""
Director-only endpoints for pool play + single-elimination bracket sessions.

All routes require the X-Director-Pin header (via require_director dependency).
Prefix: /api/director/pool
"""

import math
from fastapi import APIRouter, HTTPException, Depends, Header
import os
from database import get_supabase
from pool_playoff_helper import (
    generate_pool_games,
    compute_pool_standings,
    flag_play_in_teams,
    seed_bracket,
    create_bracket_structure,
    resolve_winner_advances_to,
    compute_session_standings,
    validate_set_score,
)
from schemas.pool_playoff import (
    SessionTeamCreate,
    PoolConfigUpdate,
    StageScoringUpdate,
)

router = APIRouter()


# ── Auth ───────────────────────────────────────────────────────────────────────

def require_director(x_director_pin: str = Header(default=None)):
    """PIN-based auth for director endpoints. PIN set via DIRECTOR_PIN env var."""
    expected = os.environ.get("DIRECTOR_PIN", "1234")
    if x_director_pin != expected:
        raise HTTPException(status_code=401, detail="Invalid director PIN")


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _get_session(session_id: str, sb) -> dict:
    """Fetch a session row or raise 404."""
    res = sb.table("sessions").select("*").eq("id", session_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data


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
        team["players"] = [
            row["players"]
            for row in (team.pop("session_team_players", None) or [])
            if row.get("players")
        ]
    return teams


# ── Pool + scoring config ──────────────────────────────────────────────────────

@router.put("/{session_id}/config")
def update_pool_config(session_id: str, body: PoolConfigUpdate, _: None = Depends(require_director)):
    """Update teams_per_pool and/or teams_advancing_per_pool for the session."""
    sb = get_supabase()
    _get_session(session_id, sb)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")
    # Upsert so the row is created if it doesn't exist yet
    existing = sb.table("session_pool_config").select("session_id").eq("session_id", session_id).execute()
    if existing.data:
        sb.table("session_pool_config").update(updates).eq("session_id", session_id).execute()
    else:
        sb.table("session_pool_config").insert({"session_id": session_id, **updates}).execute()
    return {"ok": True}


@router.put("/{session_id}/scoring/{stage}")
def update_stage_scoring(
    session_id: str,
    stage: str,
    body: StageScoringUpdate,
    _: None = Depends(require_director),
):
    """
    Update the scoring rules for one stage ('pool', 'playoff', 'playoff_final').
    Only provided fields are overwritten.
    """
    valid_stages = {"pool", "playoff", "playoff_final"}
    if stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"stage must be one of {valid_stages}")
    sb = get_supabase()
    _get_session(session_id, sb)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")
    res = (
        sb.table("session_stage_scoring")
        .update(updates)
        .eq("session_id", session_id)
        .eq("stage", stage)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=f"No scoring config found for stage '{stage}'.")
    return res.data[0]


# ── Team management ────────────────────────────────────────────────────────────

@router.post("/{session_id}/teams")
def add_team(session_id: str, body: SessionTeamCreate, _: None = Depends(require_director)):
    """Register a new team in the session."""
    sb = get_supabase()
    _get_session(session_id, sb)
    res = sb.table("session_teams").insert({
        "session_id": session_id,
        "name":       body.name,
        "seed":       body.seed,
    }).execute()
    return res.data[0]


@router.put("/{session_id}/teams/{team_id}")
def update_team(session_id: str, team_id: str, body: dict, _: None = Depends(require_director)):
    """Edit a team's name and/or seed."""
    sb = get_supabase()
    updates = {k: body[k] for k in ("name", "seed") if k in body}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided.")
    res = (
        sb.table("session_teams")
        .update(updates)
        .eq("id", team_id)
        .eq("session_id", session_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Team not found.")
    return res.data[0]


@router.delete("/{session_id}/teams/{team_id}")
def delete_team(session_id: str, team_id: str, _: None = Depends(require_director)):
    """Remove a team from the session (cascades to session_team_players)."""
    sb = get_supabase()
    sb.table("session_teams").delete().eq("id", team_id).eq("session_id", session_id).execute()
    return {"ok": True}


@router.post("/{session_id}/teams/{team_id}/players")
def add_player_to_team(session_id: str, team_id: str, body: dict, _: None = Depends(require_director)):
    """Add a player to a team by player_id."""
    player_id = body.get("player_id")
    if not player_id:
        raise HTTPException(status_code=400, detail="player_id is required.")
    sb = get_supabase()
    try:
        sb.table("session_team_players").insert({"team_id": team_id, "player_id": player_id}).execute()
    except Exception:
        raise HTTPException(status_code=409, detail="Player is already on this team.")
    return {"ok": True}


@router.delete("/{session_id}/teams/{team_id}/players/{player_id}")
def remove_player_from_team(
    session_id: str, team_id: str, player_id: str, _: None = Depends(require_director)
):
    """Remove a player from a team."""
    sb = get_supabase()
    sb.table("session_team_players").delete().eq("team_id", team_id).eq("player_id", player_id).execute()
    return {"ok": True}


# ── Pool assignment ────────────────────────────────────────────────────────────

@router.post("/{session_id}/assign-pools")
def assign_pools(session_id: str, _: None = Depends(require_director)):
    """
    Auto-assign teams to pools using their seed numbers (or registration order).
    Teams are distributed using a snake-draft pattern across pools.

    Example for 8 teams, 2 pools, 4 per pool:
      Pool A: seeds 1, 4, 5, 8
      Pool B: seeds 2, 3, 6, 7
    """
    sb = get_supabase()

    pool_config = (
        sb.table("session_pool_config")
        .select("teams_per_pool")
        .eq("session_id", session_id)
        .execute()
        .data
    )
    teams_per_pool = pool_config[0]["teams_per_pool"] if pool_config else 4

    teams = (
        sb.table("session_teams")
        .select("id, seed")
        .eq("session_id", session_id)
        .execute()
        .data
    )
    if not teams:
        raise HTTPException(status_code=400, detail="No teams registered in this session.")

    # Sort by seed (None seeds go to the end)
    teams.sort(key=lambda t: (t["seed"] is None, t["seed"] or 0))

    num_pools = math.ceil(len(teams) / teams_per_pool)
    pool_labels = [chr(ord("A") + i) for i in range(num_pools)]

    # Snake draft: row 0 → A B C …, row 1 → … C B A, etc.
    pool_assignments: dict[str, list] = {label: [] for label in pool_labels}
    for i, team in enumerate(teams):
        row      = i // num_pools
        col      = i %  num_pools
        if row % 2 == 1:
            col = num_pools - 1 - col
        pool_label = pool_labels[col]
        pool_assignments[pool_label].append(team)

    # Persist assignments
    for pool_label, pool_teams in pool_assignments.items():
        for team in pool_teams:
            sb.table("session_teams").update({"pool": pool_label}).eq("id", team["id"]).execute()

    return {"ok": True, "pools": {label: [t["id"] for t in ts] for label, ts in pool_assignments.items()}}


@router.put("/{session_id}/teams/{team_id}/pool")
def set_team_pool(session_id: str, team_id: str, body: dict, _: None = Depends(require_director)):
    """Manually set a team's pool label (e.g. 'A', 'B')."""
    pool = body.get("pool")
    if not pool:
        raise HTTPException(status_code=400, detail="pool is required.")
    sb = get_supabase()
    sb.table("session_teams").update({"pool": pool}).eq("id", team_id).eq("session_id", session_id).execute()
    return {"ok": True}


# ── Session activation (generates pool games) ─────────────────────────────────

@router.post("/{session_id}/activate")
def activate_pool_session(session_id: str, _: None = Depends(require_director)):
    """
    Activate a pool+playoff session.
    Requires all teams to have pool assignments.
    Generates all round-robin pool_games entries for each pool.
    Marks session status as 'active'.
    """
    sb = get_supabase()
    session = _get_session(session_id, sb)
    if session["status"] == "completed":
        raise HTTPException(status_code=400, detail="Session is already completed.")

    teams = sb.table("session_teams").select("id, pool").eq("session_id", session_id).execute().data
    if not teams:
        raise HTTPException(status_code=400, detail="No teams registered.")

    unassigned = [t for t in teams if not t.get("pool")]
    if unassigned:
        raise HTTPException(
            status_code=400,
            detail=f"{len(unassigned)} team(s) have no pool assignment. Assign all teams to pools first.",
        )

    # Group teams by pool
    teams_by_pool: dict = {}
    for team in teams:
        pool_label = team["pool"]
        if pool_label not in teams_by_pool:
            teams_by_pool[pool_label] = []
        teams_by_pool[pool_label].append(team)

    # Delete existing pool_games (safe to re-activate)
    sb.table("pool_games").delete().eq("session_id", session_id).execute()

    # Generate and insert round-robin matchups per pool
    game_rows = generate_pool_games(teams_by_pool)
    for row in game_rows:
        sb.table("pool_games").insert({**row, "session_id": session_id}).execute()

    sb.table("sessions").update({"status": "active"}).eq("id", session_id).execute()
    return {"ok": True, "games_generated": len(game_rows)}


# ── Score management (director-only delete/reset) ──────────────────────────────

@router.delete("/{session_id}/pool-games/{game_id}/score")
def reset_pool_game_score(session_id: str, game_id: str, _: None = Depends(require_director)):
    """Clear all set scores and the winner from a pool game, allowing re-submission."""
    sb = get_supabase()
    sb.table("pool_games").update({
        "set1_score_a": None, "set1_score_b": None,
        "set2_score_a": None, "set2_score_b": None,
        "set3_score_a": None, "set3_score_b": None,
        "winner_id":    None,
    }).eq("id", game_id).eq("session_id", session_id).execute()
    return {"ok": True}


@router.delete("/{session_id}/bracket/{game_id}/score")
def reset_bracket_score(session_id: str, game_id: str, _: None = Depends(require_director)):
    """Clear a bracket game's scores and winner, and un-advance the winner from the next round."""
    sb = get_supabase()

    game = sb.table("bracket_games").select("winner_id, winner_advances_to").eq("id", game_id).single().execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Bracket game not found.")

    old_winner = game.data.get("winner_id")
    next_game_id = game.data.get("winner_advances_to")

    # Clear scores and winner
    sb.table("bracket_games").update({
        "set1_score_a": None, "set1_score_b": None,
        "set2_score_a": None, "set2_score_b": None,
        "set3_score_a": None, "set3_score_b": None,
        "winner_id":    None,
    }).eq("id", game_id).execute()

    # Remove winner from the next bracket game slot
    if old_winner and next_game_id:
        next_game = (
            sb.table("bracket_games").select("team_a_id, team_b_id").eq("id", next_game_id).single().execute()
        )
        if next_game.data:
            if next_game.data.get("team_a_id") == old_winner:
                sb.table("bracket_games").update({"team_a_id": None}).eq("id", next_game_id).execute()
            elif next_game.data.get("team_b_id") == old_winner:
                sb.table("bracket_games").update({"team_b_id": None}).eq("id", next_game_id).execute()

    return {"ok": True}


# ── Bracket generation ─────────────────────────────────────────────────────────

@router.post("/{session_id}/generate-bracket")
def generate_bracket(session_id: str, _: None = Depends(require_director)):
    """
    Compute pool standings, handle play-ins, seed the bracket, and create bracket_games rows.

    If any pool has tied teams at the advancing cutoff, play-in games are created
    (if they don't already exist). Bracket generation proceeds only when all
    play-ins are resolved.

    Bracket seeding uses cross-pool snake seeding to separate pool-mates.
    Top seeds get byes when the advancing team count is not a power of 2.
    """
    sb = get_supabase()

    pool_config = (
        sb.table("session_pool_config")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
    )
    teams_advancing = pool_config[0]["teams_advancing_per_pool"] if pool_config else 2

    teams = sb.table("session_teams").select("*").eq("session_id", session_id).execute().data
    pool_games = sb.table("pool_games").select("*").eq("session_id", session_id).execute().data

    standings = compute_pool_standings(teams, pool_games)
    standings = flag_play_in_teams(standings, teams_advancing)

    # Check if any play-ins are still unresolved
    teams_needing_play_in = [
        team for pool_standings in standings.values()
        for team in pool_standings
        if team.get("in_play_in")
    ]
    if teams_needing_play_in:
        # Create play-in games for pools that need them (skip if already exist)
        for pool_label, pool_standings in standings.items():
            tied_teams = [t for t in pool_standings if t.get("in_play_in")]
            if not tied_teams:
                continue
            existing_play_ins = (
                sb.table("play_in_games")
                .select("id")
                .eq("session_id", session_id)
                .eq("pool", pool_label)
                .execute()
                .data
            )
            if not existing_play_ins and len(tied_teams) >= 2:
                sb.table("play_in_games").insert({
                    "session_id":   session_id,
                    "pool":         pool_label,
                    "playoff_spot": teams_advancing,
                    "team_a_id":    tied_teams[0]["team_id"],
                    "team_b_id":    tied_teams[1]["team_id"],
                }).execute()
        return {
            "ok":    False,
            "status": "play_in_required",
            "message": "Play-in games created for tied pools. Score those first, then re-run generate-bracket.",
        }

    # Resolve play-in results into standings
    play_in_games = (
        sb.table("play_in_games")
        .select("*")
        .eq("session_id", session_id)
        .execute()
        .data
    )
    for game in play_in_games:
        if game.get("winner_id"):
            pool_label = game["pool"]
            if pool_label in standings:
                pool_st = standings[pool_label]
                loser_id = (
                    game["team_b_id"] if game["winner_id"] == game["team_a_id"] else game["team_a_id"]
                )
                # Re-order: move loser below cutoff
                winner_idx = next(
                    (i for i, t in enumerate(pool_st) if t["team_id"] == game["winner_id"]), None
                )
                loser_idx  = next(
                    (i for i, t in enumerate(pool_st) if t["team_id"] == loser_id), None
                )
                if winner_idx is not None and loser_idx is not None and loser_idx < winner_idx:
                    pool_st[winner_idx], pool_st[loser_idx] = pool_st[loser_idx], pool_st[winner_idx]

    # Seed the bracket
    seeds = seed_bracket(standings, teams_advancing)
    num_teams = len(seeds)
    if num_teams < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 advancing teams to generate a bracket.")

    # Build bracket game structures (in-memory, with temp _seed_a/_seed_b fields)
    game_rows, bracket_size, num_rounds = create_bracket_structure(num_teams, session_id)

    # Build seed_number → team_id mapping
    seed_map: dict[int, str] = {s["bracket_seed"]: s["team_id"] for s in seeds}

    # Delete any existing bracket games and rebuild
    sb.table("bracket_games").delete().eq("session_id", session_id).execute()

    # Insert games round by round (final first so winner_advances_to can be resolved)
    # Strategy: insert all games, collect IDs, then update winner_advances_to
    inserted_games: list[dict] = []
    for row in game_rows:
        insert_data = {
            "session_id":         row["session_id"],
            "round_number":       row["round_number"],
            "position":           row["position"],
            "team_a_id":          seed_map.get(row["_seed_a"]) if row["_seed_a"] else None,
            "team_b_id":          seed_map.get(row["_seed_b"]) if row["_seed_b"] else None,
            "is_bye":             row["is_bye"],
        }
        result = sb.table("bracket_games").insert(insert_data).execute()
        db_row = result.data[0]
        db_row["_seed_a"]  = row["_seed_a"]
        db_row["_seed_b"]  = row["_seed_b"]
        inserted_games.append(db_row)

    # Build index by (round_number, position) → id for winner_advances_to wiring
    game_index: dict[tuple, str] = {}
    for g in inserted_games:
        game_index[(g["round_number"], g["position"])] = g["id"]

    # Update winner_advances_to and handle byes (auto-advance top seeds)
    for g in inserted_games:
        next_position = math.ceil(g["position"] / 2)
        next_id = game_index.get((g["round_number"] + 1, next_position))
        updates: dict = {}
        if next_id:
            updates["winner_advances_to"] = next_id

        # Auto-advance bye teams
        if g.get("is_bye") and g.get("team_a_id"):
            winner_id = g["team_a_id"]
            updates["winner_id"] = winner_id
            # Place in next game
            if next_id:
                next_game = (
                    sb.table("bracket_games").select("team_a_id").eq("id", next_id).single().execute()
                )
                if next_game.data and next_game.data["team_a_id"] is None:
                    sb.table("bracket_games").update({"team_a_id": winner_id}).eq("id", next_id).execute()
                else:
                    sb.table("bracket_games").update({"team_b_id": winner_id}).eq("id", next_id).execute()

        if updates:
            sb.table("bracket_games").update(updates).eq("id", g["id"]).execute()

    return {
        "ok":            True,
        "bracket_size":  bracket_size,
        "num_rounds":    num_rounds,
        "num_teams":     num_teams,
        "num_byes":      bracket_size - num_teams,
        "seeds":         [{"seed": s["bracket_seed"], "team_id": s["team_id"], "team_name": s["team_name"]} for s in seeds],
    }


# ── Play-in override ───────────────────────────────────────────────────────────

@router.post("/{session_id}/play-in/{game_id}/override")
def override_play_in(session_id: str, game_id: str, body: dict, _: None = Depends(require_director)):
    """
    Director manually picks the winner of a play-in game (skips score entry).
    Provide { "winner_id": "<team_uuid>" }.
    """
    winner_id = body.get("winner_id")
    if not winner_id:
        raise HTTPException(status_code=400, detail="winner_id is required.")
    sb = get_supabase()
    res = sb.table("play_in_games").update({
        "winner_id":         winner_id,
        "director_override": True,
    }).eq("id", game_id).eq("session_id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Play-in game not found.")
    return {"ok": True}


# ── Session completion ─────────────────────────────────────────────────────────

@router.post("/{session_id}/complete")
def complete_pool_session(session_id: str, _: None = Depends(require_director)):
    """
    Finalize a pool+playoff session.
    Computes final team placements from bracket results and marks the session completed.
    Can be called again to re-finalize if bracket scores were corrected.
    """
    sb = get_supabase()
    _get_session(session_id, sb)

    bracket_games = (
        sb.table("bracket_games").select("*").eq("session_id", session_id).execute().data
    )
    if not bracket_games:
        raise HTTPException(status_code=400, detail="No bracket games found — run generate-bracket first.")

    all_teams = sb.table("session_teams").select("*").eq("session_id", session_id).execute().data
    standings = compute_session_standings(bracket_games, all_teams)

    sb.table("sessions").update({"status": "completed"}).eq("id", session_id).execute()
    return {"ok": True, "standings": standings}
