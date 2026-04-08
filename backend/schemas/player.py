from pydantic import BaseModel
from typing import Optional, List

class PlayerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None

class PlayerCreate(PlayerBase):
    pass

class PlayerOut(PlayerBase):
    id: str
    auth_user_id: Optional[str] = None
    total_sessions: Optional[int] = 0
    total_wins: Optional[int] = 0
    total_point_diff: Optional[int] = 0

    class Config:
        from_attributes = True
