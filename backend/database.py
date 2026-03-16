import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

_PAGE_SIZE = 1000

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_all(query) -> list:
    """Execute a Supabase query and paginate through all pages automatically.

    Usage:
        rows = fetch_all(
            sb.table("game_results").select("*").eq("session_id", sid)
        )
    """
    results = []
    offset = 0
    while True:
        page = query.range(offset, offset + _PAGE_SIZE - 1).execute().data
        results.extend(page)
        if len(page) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return results
