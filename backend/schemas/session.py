from pydantic import BaseModel
from typing import Optional, List
from datetime import date

class SessionBase(BaseModel):
    date: date
    tournament_type: str = "reverse_coed_4s"
    num_rounds: int = 4
    notes: Optional[str] = None

class SessionCreate(SessionBase):
    pass

class SessionOut(SessionBase):
    id: str
    player_count: Optional[int] = 0

    class Config:
        from_attributes = True
