"""
AetherNotes - Folders Router
Manage folders/collections for organizing notes.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from typing import List
import logging
import uuid

from app.core.dependencies import get_current_user, AuthenticatedUser
from app.core.supabase import get_supabase, create_authed_client
from app.schemas.schemas import FolderCreate, FolderUpdate, FolderResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_authed_client(token: str, supabase: Client) -> Client:
    """Create a fresh authenticated Supabase client for RLS enforcement."""
    return create_authed_client(token)


@router.post("/", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    payload: FolderCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Create a new folder."""
    db = _get_authed_client(current_user.raw_token, supabase)

    folder_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.user_id,
        "name": payload.name,
        "color": payload.color,
        "icon": payload.icon or "📁",
        "parent_id": payload.parent_id,
    }

    try:
        result = db.table("folders").insert(folder_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create folder.")
        return _format_folder(result.data[0], db, current_user.user_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create folder error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[FolderResponse])
async def list_folders(
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """List all folders for the current user."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        result = db.table("folders").select("*").eq(
            "user_id", current_user.user_id
        ).order("name").execute()

        folders = []
        for folder_data in (result.data or []):
            folder = _format_folder(folder_data, db, current_user.user_id)
            folders.append(folder)
        return folders
    except Exception as e:
        logger.error(f"List folders error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(
    folder_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get a specific folder."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        result = db.table("folders").select("*").eq("id", folder_id).eq(
            "user_id", current_user.user_id
        ).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Folder not found.")
        return _format_folder(result.data, db, current_user.user_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail="Folder not found.")


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    payload: FolderUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Update a folder."""
    db = _get_authed_client(current_user.raw_token, supabase)

    update_data = {}
    if payload.name is not None:
        update_data["name"] = payload.name
    if payload.color is not None:
        update_data["color"] = payload.color
    if payload.icon is not None:
        update_data["icon"] = payload.icon
    if payload.parent_id is not None:
        update_data["parent_id"] = payload.parent_id

    if not update_data:
        result = db.table("folders").select("*").eq("id", folder_id).eq(
            "user_id", current_user.user_id
        ).single().execute()
        return _format_folder(result.data, db, current_user.user_id)

    try:
        result = db.table("folders").update(update_data).eq("id", folder_id).eq(
            "user_id", current_user.user_id
        ).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Folder not found.")
        return _format_folder(result.data[0], db, current_user.user_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update folder error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: str,
    move_notes_to: str = None,  # Optional: move notes to another folder
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Delete a folder.
    Notes in the folder will be moved to root (or specified folder).
    """
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        # Move notes out of this folder first
        db.table("notes").update({"folder_id": move_notes_to}).eq(
            "folder_id", folder_id
        ).eq("user_id", current_user.user_id).execute()

        # Move sub-folders to root
        db.table("folders").update({"parent_id": None}).eq(
            "parent_id", folder_id
        ).eq("user_id", current_user.user_id).execute()

        # Delete the folder
        db.table("folders").delete().eq("id", folder_id).eq(
            "user_id", current_user.user_id
        ).execute()

    except Exception as e:
        logger.error(f"Delete folder error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _format_folder(data: dict, db: Client, user_id: str) -> FolderResponse:
    """Format folder data and fetch note count."""
    # Get note count for this folder
    note_count = 0
    try:
        count_result = db.table("notes").select("id", count="exact").eq(
            "folder_id", data["id"]
        ).eq("user_id", user_id).eq("status", "active").execute()
        note_count = count_result.count or 0
    except Exception:
        pass

    return FolderResponse(
        id=data["id"],
        name=data["name"],
        color=data.get("color"),
        icon=data.get("icon", "📁"),
        parent_id=data.get("parent_id"),
        user_id=data["user_id"],
        note_count=note_count,
        created_at=data["created_at"],
        updated_at=data["updated_at"],
    )
