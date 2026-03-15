"""
Import all historical session data from Google Sheets into Supabase.
Run once: python scripts/import_sheets.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from database import get_supabase
from datetime import datetime

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
SPREADSHEET_ID = os.environ.get("SHEETS_SPREADSHEET_ID")
TOKEN_PATH = os.environ.get("GOOGLE_TOKEN_PATH", "/Users/nitinn/token.json")

SHEET_TABS = [
    "10/04/2025", "10/11/2025", "10/18/2025", "11/1/2025", "11/8/2025",
    "11/15/2025", "11/22/2025", "11/29/2025", "12/6/2025", "12/13/2025",
    "12/20/2025", "1/3/2026", "1/10/2026", "1/17/2026", "1/24/26",
    "1/31/26", "2/14/26", "2/21/26", "2/28/26", "3/7/26", "3/14/26"
]

def parse_date(tab_name: str) -> str:
    parts = tab_name.strip().split("/")
    month, day = int(parts[0]), int(parts[1])
    year_str = parts[2]
    year = int(year_str) if len(year_str) == 4 else 2000 + int(year_str)
    return datetime(year, month, day).date().isoformat()

def get_sheets_service():
    creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    return build("sheets", "v4", credentials=creds)

def parse_sheet(rows: list) -> list[dict]:
    results = []
    for row in rows[2:]:
        if not row or not row[0]:
            continue
        name = row[0].strip()
        games = []
        for i in range(8):
            col = i + 1
            val = int(row[col]) if col < len(row) and row[col] not in ("", None) else 0
            round_num = (i // 2) + 1
            game_num = (i % 2) + 1
            games.append({"round_number": round_num, "game_number": game_num, "point_diff": val})
        total_wins = int(row[9]) if len(row) > 9 and row[9] not in ("", None) else 0
        total_diff = int(row[10]) if len(row) > 10 and row[10] not in ("", None) else 0
        place = int(row[11]) if len(row) > 11 and row[11] not in ("", None) else 0
        results.append({"name": name, "games": games, "total_wins": total_wins, "total_diff": total_diff, "place": place})
    return results

def get_or_create_player(sb, name: str) -> str:
    res = sb.table("players").select("id").eq("name", name).execute()
    if res.data:
        return res.data[0]["id"]
    created = sb.table("players").insert({"name": name}).execute()
    print(f"  Created player: {name}")
    return created.data[0]["id"]

def main():
    service = get_sheets_service()
    sb = get_supabase()
    for tab in SHEET_TABS:
        date_str = parse_date(tab)
        print(f"\nProcessing {tab} -> {date_str}")
        existing = sb.table("sessions").select("id").eq("date", date_str).execute()
        if existing.data:
            print(f"  Already imported, skipping.")
            continue
        result = service.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=tab).execute()
        rows = result.get("values", [])
        if not rows:
            print(f"  Empty sheet, skipping.")
            continue
        session_res = sb.table("sessions").insert({"date": date_str, "tournament_type": "reverse_coed_4s", "num_rounds": 4}).execute()
        session_id = session_res.data[0]["id"]
        print(f"  Created session: {session_id}")
        player_results = parse_sheet(rows)
        records = []
        for pr in player_results:
            player_id = get_or_create_player(sb, pr["name"])
            for g in pr["games"]:
                records.append({"session_id": session_id, "player_id": player_id, "round_number": g["round_number"], "game_number": g["game_number"], "point_diff": g["point_diff"], "total_wins": pr["total_wins"], "total_diff": pr["total_diff"], "place": pr["place"]})
        sb.table("game_results").insert(records).execute()
        print(f"  Inserted {len(records)} game records for {len(player_results)} players.")
    print("\nImport complete!")

if __name__ == "__main__":
    main()
