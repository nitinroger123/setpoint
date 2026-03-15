from pydantic import BaseModel
from typing import Optional

class GameBase(BaseModel):
    session_id: str
    round_number: int
    game_number: int
    player_id: str
    team: str
    point_diff: int

class GameCreate(GameBase):
    pass

class GameOut(GameBase):
    id: str

    class Config:
        from_attributes = True
