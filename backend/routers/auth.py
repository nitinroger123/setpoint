import re
from fastapi import APIRouter, HTTPException, Header
from database import get_supabase
from datetime import datetime, timezone

router = APIRouter()


def get_auth_user(authorization: str = Header(default=None)):
    """Dependency: validates the Supabase JWT from the Authorization header.

    Extracts the Bearer token and calls Supabase to verify it.
    Returns the Supabase auth user object on success.
    Raises 401 if the token is missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    sb = get_supabase()
    try:
        result = sb.auth.get_user(token)
        if not result or not result.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return result.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/claim")
def claim_profile(body: dict, authorization: str = Header(default=None)):
    """Links a Supabase auth user to an existing unclaimed player record.

    The player enters the claim code given to them by the director.
    On success, the player's auth_user_id is set and they are added to
    the org (vballnyc) as a member.

    Body: { "code": "NITI-4829" }
    Returns the claimed player record.
    """
    # Validate JWT and get the calling user
    auth_user = get_auth_user(authorization)
    auth_user_id = auth_user.id

    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Claim code is required")

    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Look up the claim code — must exist, not yet claimed, and not expired
    code_row = sb.table("claim_codes") \
        .select("*") \
        .eq("code", code) \
        .is_("claimed_at", "null") \
        .gt("expires_at", now) \
        .maybe_single() \
        .execute()

    if not code_row.data:
        raise HTTPException(status_code=400, detail="Invalid or expired claim code")

    player_id = code_row.data["player_id"]

    # Ensure this player record isn't already claimed by a different auth user
    existing = sb.table("players") \
        .select("auth_user_id") \
        .eq("id", player_id) \
        .single() \
        .execute()

    if existing.data.get("auth_user_id") and existing.data["auth_user_id"] != auth_user_id:
        raise HTTPException(status_code=409, detail="This player profile is already claimed")

    # Link the auth user to the player record
    updated = sb.table("players") \
        .update({"auth_user_id": auth_user_id}) \
        .eq("id", player_id) \
        .execute()

    # Mark the claim code as used
    sb.table("claim_codes") \
        .update({"claimed_at": now}) \
        .eq("id", code_row.data["id"]) \
        .execute()

    # Add to vballnyc org if not already a member
    org = sb.table("organizations") \
        .select("id") \
        .eq("slug", "vballnyc") \
        .maybe_single() \
        .execute()

    if org.data:
        sb.table("org_memberships") \
            .upsert({
                "org_id": org.data["id"],
                "player_id": player_id,
                "role": "player",
                "status": "active",
            }, on_conflict="org_id,player_id") \
            .execute()

    return updated.data[0]
