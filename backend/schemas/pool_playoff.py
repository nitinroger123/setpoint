"""
Pydantic schemas for pool play + single-elimination bracket sessions.
All schemas mirror the DB tables in 011_pool_playoff_tables.sql.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Teams ─────────────────────────────────────────────────────────────────────

class SessionTeamCreate(BaseModel):
    """Payload for creating a new team in a pool+playoff session."""
    name: str
    seed: Optional[int] = None


class SessionTeamOut(BaseModel):
    """A team registered in a pool+playoff session, with its player list."""
    id: str
    session_id: str
    name: str
    seed: Optional[int] = None
    pool: Optional[str] = None
    players: List[dict] = []  # List of player dicts from session_team_players join

    class Config:
        from_attributes = True


# ── Scoring config ─────────────────────────────────────────────────────────────

class SessionStageScoringOut(BaseModel):
    """Scoring rules for one stage (pool / playoff / playoff_final) within a session."""
    id: str
    session_id: str
    stage: str
    sets_per_match: int
    pool_play_format: str   # 'per_set' | 'winner_take_all'
    points_to_win: int
    win_by: int
    cap: Optional[int] = None

    class Config:
        from_attributes = True


class StageScoringUpdate(BaseModel):
    """Fields the director can update on a session's stage scoring rule."""
    sets_per_match: Optional[int] = None
    pool_play_format: Optional[str] = None
    points_to_win: Optional[int] = None
    win_by: Optional[int] = None
    cap: Optional[int] = None


# ── Pool config ────────────────────────────────────────────────────────────────

class SessionPoolConfigOut(BaseModel):
    """Pool configuration for a session (teams per pool, how many advance)."""
    session_id: str
    teams_per_pool: int
    teams_advancing_per_pool: int

    class Config:
        from_attributes = True


class PoolConfigUpdate(BaseModel):
    """Fields the director can update on pool config."""
    teams_per_pool: Optional[int] = None
    teams_advancing_per_pool: Optional[int] = None


# ── Pool games ────────────────────────────────────────────────────────────────

class SetScores(BaseModel):
    """Score data for a single set within a game."""
    set1_score_a: Optional[int] = None
    set1_score_b: Optional[int] = None
    set2_score_a: Optional[int] = None
    set2_score_b: Optional[int] = None
    set3_score_a: Optional[int] = None
    set3_score_b: Optional[int] = None


class PoolGameOut(BaseModel):
    """A single round-robin game within a pool, with set scores and winner."""
    id: str
    session_id: str
    pool: str
    team_a_id: Optional[str] = None
    team_b_id: Optional[str] = None
    set1_score_a: Optional[int] = None
    set1_score_b: Optional[int] = None
    set2_score_a: Optional[int] = None
    set2_score_b: Optional[int] = None
    set3_score_a: Optional[int] = None
    set3_score_b: Optional[int] = None
    winner_id: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ── Play-in games ──────────────────────────────────────────────────────────────

class PlayInGameOut(BaseModel):
    """A tiebreaker game for the last advancing spot from a pool."""
    id: str
    session_id: str
    pool: str
    playoff_spot: int
    team_a_id: Optional[str] = None
    team_b_id: Optional[str] = None
    set1_score_a: Optional[int] = None
    set1_score_b: Optional[int] = None
    set2_score_a: Optional[int] = None
    set2_score_b: Optional[int] = None
    set3_score_a: Optional[int] = None
    set3_score_b: Optional[int] = None
    winner_id: Optional[str] = None
    director_override: bool = False
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ── Bracket games ─────────────────────────────────────────────────────────────

class BracketGameOut(BaseModel):
    """A single-elimination bracket game; winner_advances_to is the next game's id."""
    id: str
    session_id: str
    round_number: int
    position: int
    team_a_id: Optional[str] = None
    team_b_id: Optional[str] = None
    is_bye: bool = False
    set1_score_a: Optional[int] = None
    set1_score_b: Optional[int] = None
    set2_score_a: Optional[int] = None
    set2_score_b: Optional[int] = None
    set3_score_a: Optional[int] = None
    set3_score_b: Optional[int] = None
    winner_id: Optional[str] = None
    winner_advances_to: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ── Standings ─────────────────────────────────────────────────────────────────

class PoolStandingsRow(BaseModel):
    """One team's pool standings record — wins are set wins in per_set mode."""
    team_id: str
    team_name: str
    pool: Optional[str] = None
    seed: Optional[int] = None
    wins: int          # sets won
    losses: int        # sets lost
    set_diff: int      # wins - losses
    points_scored: int
    points_conceded: int
    point_diff: int    # points_scored - points_conceded
    games_played: int
    in_play_in: bool = False  # True if this team is tied and needs a play-in
