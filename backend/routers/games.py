from fastapi import APIRouter
from database import get_supabase
from schemas.game import GameCreate, GameOut

router = APIRouter()

@router.post("/", response_model=list[GameOut])
def record_games(games: list[GameCreate]):
    sb = get_supabase()
    res = sb.table("game_results").insert([g.model_dump() for g in games]).execute()
    return res.data
