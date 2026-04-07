import uuid
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Depends
from database import get_supabase
from routers.auth import get_auth_user

router = APIRouter()

AVATAR_BUCKET = "avatars"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def get_current_player(authorization: str = Header(default=None)):
    """Dependency: validates JWT and returns the linked player record.

    Verifies the Supabase auth token, then looks up the player row whose
    auth_user_id matches the token's subject. Raises 401 if the token is
    invalid or 404 if no player profile is linked to this account yet
    (i.e. the user authenticated but hasn't claimed a profile).
    """
    auth_user = get_auth_user(authorization)
    sb = get_supabase()
    result = sb.table("players") \
        .select("*") \
        .eq("auth_user_id", auth_user.id) \
        .maybe_single() \
        .execute()

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="No player profile linked to this account. Please claim your profile first."
        )
    return result.data


@router.get("/")
def get_my_profile(player: dict = Depends(get_current_player)):
    """Returns the logged-in player's full profile including org memberships.

    Response includes all player fields plus a list of orgs they belong to.
    """
    sb = get_supabase()
    memberships = sb.table("org_memberships") \
        .select("role, status, joined_at, organizations(id, name, slug)") \
        .eq("player_id", player["id"]) \
        .eq("status", "active") \
        .execute()

    return {
        **player,
        "orgs": [
            {
                "id": m["organizations"]["id"],
                "name": m["organizations"]["name"],
                "slug": m["organizations"]["slug"],
                "role": m["role"],
            }
            for m in (memberships.data or [])
            if m.get("organizations")
        ]
    }


@router.get("/upcoming")
def get_upcoming_sessions(player: dict = Depends(get_current_player)):
    """Returns sessions the player is rostered in over the next 7 days.

    Looks up session_roster for the player, then filters joined sessions to
    those with a date between today and today + 7 days (inclusive).
    Returns each session's id, date, status, and tournament series name.
    """
    sb = get_supabase()
    today = date.today()
    week_end = today + timedelta(days=7)

    # Fetch all roster entries for this player with joined session data
    roster = sb.table("session_roster") \
        .select("session_id, sessions(id, date, status, tournament_series(name))") \
        .eq("player_id", player["id"]) \
        .execute().data

    upcoming = []
    for row in roster:
        session = row.get("sessions")
        if not session or not session.get("date"):
            continue
        session_date = date.fromisoformat(session["date"])
        if today <= session_date <= week_end:
            series = session.get("tournament_series")
            upcoming.append({
                "id": session["id"],
                "date": session["date"],
                "status": session["status"],
                "series_name": series["name"] if series else None,
                "is_today": session_date == today,
            })

    # Sort chronologically so the nearest session appears first
    upcoming.sort(key=lambda s: s["date"])
    return upcoming


@router.put("/")
def update_my_profile(body: dict, player: dict = Depends(get_current_player)):
    """Updates the logged-in player's editable profile fields.

    Allowed fields: name, last_name, email, phone, instagram_handle.
    Returns the updated player record.
    """
    allowed_fields = {"name", "email", "instagram_handle", "last_name", "phone"}
    updates = {k: v for k, v in body.items() if k in allowed_fields}

    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    sb = get_supabase()
    result = sb.table("players") \
        .update(updates) \
        .eq("id", player["id"]) \
        .execute()

    return result.data[0]


@router.put("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    player: dict = Depends(get_current_player)
):
    """Uploads a new avatar image for the logged-in player.

    Accepts JPEG, PNG, or WebP. Stores the file in Supabase Storage under
    the 'avatars' bucket at path '{player_id}/{uuid}.{ext}'. Updates the
    player's avatar_url field. Returns the updated player record.
    """
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )

    ext = file.content_type.split("/")[1]  # e.g. "jpeg", "png", "webp"
    file_name = f"{player['id']}/{uuid.uuid4()}.{ext}"
    file_bytes = await file.read()

    sb = get_supabase()

    # Upload to Supabase Storage — overwrites any previous file at the same path
    sb.storage.from_(AVATAR_BUCKET).upload(
        path=file_name,
        file=file_bytes,
        file_options={"content-type": file.content_type, "upsert": "true"}
    )

    # Build the public URL for the uploaded file
    public_url = sb.storage.from_(AVATAR_BUCKET).get_public_url(file_name)

    # Persist the URL on the player record
    result = sb.table("players") \
        .update({"avatar_url": public_url}) \
        .eq("id", player["id"]) \
        .execute()

    return result.data[0]
