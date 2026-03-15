from fastapi import APIRouter, HTTPException
from database import get_supabase
from schemas.player import PlayerCreate, PlayerOut

router = APIRouter()

@router.get("/", response_model=list[PlayerOut])
def list_players():
    sb = get_supabase()
    res = sb.table("players").select("*").order("name").execute()
    return res.data

@router.get("/{player_id}")
def get_player(player_id: str):
    sb = get_supabase()
    res = sb.table("players").select("*").eq("id", player_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Player not found")
    return res.data

@router.get("/{player_id}/history")
def get_player_history(player_id: str):
    sb = get_supabase()
    res = sb.table("game_results").select("*, sessions(date, tournament_type)").eq("player_id", player_id).order("sessions(date)", desc=True).execute()
    return res.data

@router.post("/", response_model=PlayerOut)
def create_player(player: PlayerCreate):
    sb = get_supabase()
    res = sb.table("players").insert(player.model_dump()).execute()
    return res.data[0]
