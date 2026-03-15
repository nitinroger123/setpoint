from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from database import get_supabase
from schemas.session import SessionCreate, SessionOut

router = APIRouter()

@router.get("/formats")
def list_formats():
    sb = get_supabase()
    res = sb.table("tournament_formats").select("id, name, description").eq("active", True).execute()
    return res.data

@router.get("/", response_model=list[SessionOut])
def list_sessions(format_id: Optional[str] = Query(None)):
    sb = get_supabase()
    query = sb.table("sessions").select("*").order("date", desc=True)
    if format_id:
        query = query.eq("format_id", format_id)
    res = query.execute()
    return res.data

@router.get("/{session_id}")
def get_session(session_id: str):
    sb = get_supabase()
    session = sb.table("sessions").select("*").eq("id", session_id).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    results = sb.table("game_results").select("*, players(name)").eq("session_id", session_id).execute()
    return {**session.data, "results": results.data}

@router.post("/", response_model=SessionOut)
def create_session(session: SessionCreate):
    sb = get_supabase()
    res = sb.table("sessions").insert(session.model_dump()).execute()
    return res.data[0]
