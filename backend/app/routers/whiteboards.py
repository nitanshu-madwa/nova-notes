"""
AetherNotes - Whiteboards Router
Canvas drawing boards - can be standalone or attached to a note.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client
from typing import List, Optional
import logging
import uuid

from app.core.dependencies import get_current_user, AuthenticatedUser
from app.core.supabase import get_supabase, create_authed_client
from app.schemas.schemas import WhiteboardCreate, WhiteboardUpdate, WhiteboardResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_authed_client(token: str, supabase: Client) -> Client:
    """Create a fresh authenticated Supabase client for RLS enforcement."""
    return create_authed_client(token)


@router.post("/", response_model=WhiteboardResponse, status_code=status.HTTP_201_CREATED)
async def create_whiteboard(
    payload: WhiteboardCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Create a new whiteboard (standalone or attached to a note)."""
    db = _get_authed_client(current_user.raw_token, supabase)

    wb_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.user_id,
        "title": payload.title,
        "canvas_data": payload.canvas_data or {"version": "1.0", "objects": []},
        "note_id": payload.note_id,
        "thumbnail": payload.thumbnail,
    }

    try:
        result = db.table("whiteboards").insert(wb_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create whiteboard.")
        return WhiteboardResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create whiteboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[WhiteboardResponse])
async def list_whiteboards(
    note_id: Optional[str] = Query(None, description="Filter by attached note"),
    standalone_only: bool = Query(False, description="Only show unattached whiteboards"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """List all whiteboards for the current user."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        query = db.table("whiteboards").select("*").eq("user_id", current_user.user_id)

        if note_id:
            query = query.eq("note_id", note_id)
        elif standalone_only:
            query = query.is_("note_id", "null")

        query = query.order("updated_at", desc=True)
        result = query.execute()

        return [WhiteboardResponse(**wb) for wb in (result.data or [])]
    except Exception as e:
        logger.error(f"List whiteboards error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{whiteboard_id}", response_model=WhiteboardResponse)
async def get_whiteboard(
    whiteboard_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get a whiteboard by ID."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        result = db.table("whiteboards").select("*").eq("id", whiteboard_id).eq(
            "user_id", current_user.user_id
        ).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Whiteboard not found.")
        return WhiteboardResponse(**result.data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail="Whiteboard not found.")


@router.patch("/{whiteboard_id}", response_model=WhiteboardResponse)
async def update_whiteboard(
    whiteboard_id: str,
    payload: WhiteboardUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Update whiteboard canvas data and/or metadata."""
    db = _get_authed_client(current_user.raw_token, supabase)

    update_data = {}
    if payload.title is not None:
        update_data["title"] = payload.title
    if payload.canvas_data is not None:
        update_data["canvas_data"] = payload.canvas_data
    if payload.thumbnail is not None:
        update_data["thumbnail"] = payload.thumbnail

    if not update_data:
        result = db.table("whiteboards").select("*").eq("id", whiteboard_id).eq(
            "user_id", current_user.user_id
        ).single().execute()
        return WhiteboardResponse(**result.data)

    try:
        result = db.table("whiteboards").update(update_data).eq(
            "id", whiteboard_id
        ).eq("user_id", current_user.user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Whiteboard not found.")
        return WhiteboardResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update whiteboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{whiteboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_whiteboard(
    whiteboard_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Delete a whiteboard."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        db.table("whiteboards").delete().eq("id", whiteboard_id).eq(
            "user_id", current_user.user_id
        ).execute()
    except Exception as e:
        logger.error(f"Delete whiteboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
