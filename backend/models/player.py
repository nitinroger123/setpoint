from pydantic import BaseModel
from typing import Optional

class Player(BaseModel):
    id: Optional[str] = None
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
