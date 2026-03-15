from fastapi import APIRouter, HTTPException
from database import get_supabase

router = APIRouter()

@router.get("/")
def list_series(format_id: str | None = None):
    sb = get_supabase()
    query = sb.table("tournament_series").select("*").eq("active", True).order("name")
    if format_id:
        query = query.eq("format_id", format_id)
    return query.execute().data

@router.get("/{series_id}")
def get_series(series_id: str):
    sb = get_supabase()
    series = sb.table("tournament_series").select("*").eq("id", series_id).single().execute()
    if not series.data:
        raise HTTPException(status_code=404, detail="Series not found")
    sessions = sb.table("sessions").select("*").eq("series_id", series_id).order("date", desc=True).execute()
    return {**series.data, "sessions": sessions.data}
