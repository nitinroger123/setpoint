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
    id: str
    player_count: Optional[int] = 0

    class Config:
        from_attributes = True
