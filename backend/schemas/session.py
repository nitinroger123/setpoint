from pydantic import BaseModel
from typing import Optional
from datetime import date


class SessionBase(BaseModel):
    date: date
    format_id: str = "revco-roundrobin-4s"
    notes: Optional[str] = None


class SessionCreate(SessionBase):
    pass


class SessionOut(SessionBase):
    """Session summary returned by list and detail endpoints."""
    id: str
    player_count: Optional[int] = 0
    # Metadata inherited from the linked tournament_series (populated at read time)
    game_format_id:      Optional[str] = None
    competition_type_id: Optional[str] = None
    level_id:            Optional[str] = None
    surface_id:          Optional[str] = None
    division_id:         Optional[str] = None

    class Config:
        from_attributes = True
