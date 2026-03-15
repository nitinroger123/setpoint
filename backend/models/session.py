from pydantic import BaseModel
from typing import Optional
from datetime import date

class Session(BaseModel):
    id: Optional[str] = None
    date: date
    tournament_type: str = "reverse_coed_4s"
    num_rounds: int = 4
    notes: Optional[str] = None
