from pydantic import BaseModel
from typing import Optional

class Game(BaseModel):
    id: Optional[str] = None
    session_id: str
    round_number: int  # 1-4
    game_number: int   # 1-2
    player_id: str
    team: str          # Aces, Kings, Queens
    point_diff: int    # positive = win, negative = loss
