"""
AetherNotes - Notes Router
Full CRUD for notes with AI features integration.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from supabase import Client
from typing import Optional, List
import logging
import uuid

from app.core.dependencies import get_current_user, AuthenticatedUser
from app.core.supabase import get_supabase, create_authed_client
from app.schemas.schemas import (
    NoteCreate, NoteUpdate, NoteResponse, NoteListResponse, NoteStatus
)
from app.services.ai_service import generate_tags, suggest_title
from app.services.embedding_service import (
    generate_embedding, prepare_note_text_for_embedding
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_authed_client(token: str, supabase: Client) -> Client:
    """Create a fresh authenticated Supabase client for RLS enforcement."""
    return create_authed_client(token)


def _count_words(text: str) -> int:
    return len(text.split()) if text else 0


# ── Create Note ───────────────────────────────────────────────────────────────

@router.post("/", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Create a new note with optional AI tag generation."""
    db = _get_authed_client(current_user.raw_token, supabase)

    tags = payload.tags
    title = payload.title

    # AI: Auto-generate tags
    if payload.generate_ai_tags and payload.content:
        try:
            ai_tags = await generate_tags(payload.title, payload.content)
            # Merge AI tags with user-provided tags
            tags = list(set(tags + ai_tags))
        except Exception as e:
            logger.warning(f"AI tag generation failed on create: {e}")

    # AI: Suggest title if empty/default
    if payload.suggest_ai_title and payload.content and (
        not payload.title or payload.title == "Untitled Note"
    ):
        try:
            title = await suggest_title(payload.content, payload.title)
        except Exception as e:
            logger.warning(f"AI title suggestion failed on create: {e}")

    # Generate embedding for semantic search
    embedding = None
    try:
        embed_text = prepare_note_text_for_embedding(title, payload.content, tags)
        embedding = generate_embedding(embed_text)
    except Exception as e:
        logger.warning(f"Embedding generation failed: {e}")

    note_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.user_id,
        "title": title,
        "content": payload.content,
        "folder_id": payload.folder_id,
        "tags": tags,
        "is_favorite": payload.is_favorite,
        "is_pinned": payload.is_pinned,
        "color": payload.color,
        "status": payload.status.value,
        "word_count": _count_words(payload.content),
        "embedding": embedding,
    }

    try:
        result = db.table("notes").insert(note_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create note.")
        return _format_note(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create note error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ── List Notes ────────────────────────────────────────────────────────────────

@router.get("/", response_model=NoteListResponse)
async def list_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    folder_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    is_favorite: Optional[bool] = Query(None),
    is_pinned: Optional[bool] = Query(None),
    tag: Optional[str] = Query(None),
    sort_by: str = Query("updated_at", description="updated_at | created_at | title"),
    sort_order: str = Query("desc", description="asc | desc"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """List user's notes with filtering and pagination."""
    db = _get_authed_client(current_user.raw_token, supabase)

    offset = (page - 1) * page_size

    # Build query
    query = db.table("notes").select("*", count="exact").eq("user_id", current_user.user_id)

    if folder_id:
        query = query.eq("folder_id", folder_id)
    if status:
        query = query.eq("status", status)
    else:
        query = query.eq("status", "active")  # Default: active notes only
    if is_favorite is not None:
        query = query.eq("is_favorite", is_favorite)
    if is_pinned is not None:
        query = query.eq("is_pinned", is_pinned)
    if tag:
        query = query.contains("tags", [tag])

    # Sort
    allowed_sort = {"updated_at", "created_at", "title", "word_count"}
    sort_col = sort_by if sort_by in allowed_sort else "updated_at"
    query = query.order(sort_col, desc=(sort_order == "desc"))

    # Pagination
    query = query.range(offset, offset + page_size - 1)

    try:
        result = query.execute()
        total = result.count or 0
        notes = [_format_note(n) for n in (result.data or [])]
        return NoteListResponse(
            notes=notes,
            total=total,
            page=page,
            page_size=page_size,
            has_more=(offset + page_size) < total,
        )
    except Exception as e:
        logger.error(f"List notes error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ── Get Single Note ───────────────────────────────────────────────────────────

@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get a specific note by ID."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        result = db.table("notes").select("*").eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).single().execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Note not found.")
        return _format_note(result.data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get note error: {e}")
        raise HTTPException(status_code=404, detail="Note not found.")


# ── Update Note ───────────────────────────────────────────────────────────────

@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Update a note. Optionally regenerate AI tags."""
    db = _get_authed_client(current_user.raw_token, supabase)

    # Fetch existing note
    try:
        existing = db.table("notes").select("*").eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Note not found.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail="Note not found.")

    current_note = existing.data
    update_data = {}

    # Build update dict from non-None fields
    if payload.title is not None:
        update_data["title"] = payload.title
    if payload.content is not None:
        update_data["content"] = payload.content
        update_data["word_count"] = _count_words(payload.content)
    if payload.folder_id is not None:
        update_data["folder_id"] = payload.folder_id
    if payload.tags is not None:
        update_data["tags"] = payload.tags
    if payload.is_favorite is not None:
        update_data["is_favorite"] = payload.is_favorite
    if payload.is_pinned is not None:
        update_data["is_pinned"] = payload.is_pinned
    if payload.color is not None:
        update_data["color"] = payload.color
    if payload.status is not None:
        update_data["status"] = payload.status.value

    # AI: Regenerate tags on save
    if payload.generate_ai_tags:
        title = update_data.get("title", current_note.get("title", ""))
        content = update_data.get("content", current_note.get("content", ""))
        try:
            ai_tags = await generate_tags(title, content)
            existing_tags = update_data.get("tags", current_note.get("tags", []))
            update_data["tags"] = list(set(existing_tags + ai_tags))
        except Exception as e:
            logger.warning(f"AI tag regeneration failed: {e}")

    # Regenerate embedding if content or title changed
    if "content" in update_data or "title" in update_data:
        try:
            title = update_data.get("title", current_note.get("title", ""))
            content = update_data.get("content", current_note.get("content", ""))
            tags = update_data.get("tags", current_note.get("tags", []))
            embed_text = prepare_note_text_for_embedding(title, content, tags)
            embedding = generate_embedding(embed_text)
            if embedding:
                update_data["embedding"] = embedding
        except Exception as e:
            logger.warning(f"Embedding update failed: {e}")

    if not update_data:
        return _format_note(current_note)

    try:
        result = db.table("notes").update(update_data).eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Update failed.")
        return _format_note(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update note error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ── Delete Note ───────────────────────────────────────────────────────────────

@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Permanently delete a note."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        result = db.table("notes").delete().eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).execute()

        if result.data is not None and len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Note not found.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete note error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# ── Archive / Unarchive ───────────────────────────────────────────────────────

@router.post("/{note_id}/archive", response_model=NoteResponse)
async def archive_note(
    note_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Archive a note."""
    db = _get_authed_client(current_user.raw_token, supabase)
    try:
        result = db.table("notes").update({"status": "archived"}).eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Note not found.")
        return _format_note(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{note_id}/unarchive", response_model=NoteResponse)
async def unarchive_note(
    note_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Restore an archived note."""
    db = _get_authed_client(current_user.raw_token, supabase)
    try:
        result = db.table("notes").update({"status": "active"}).eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Note not found.")
        return _format_note(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Toggle Favorite ───────────────────────────────────────────────────────────

@router.post("/{note_id}/favorite", response_model=NoteResponse)
async def toggle_favorite(
    note_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Toggle favorite status on a note."""
    db = _get_authed_client(current_user.raw_token, supabase)
    try:
        existing = db.table("notes").select("is_favorite").eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Note not found.")

        new_val = not existing.data["is_favorite"]
        result = db.table("notes").update({"is_favorite": new_val}).eq("id", note_id).eq(
            "user_id", current_user.user_id
        ).execute()
        return _format_note(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Bulk Operations ───────────────────────────────────────────────────────────

@router.post("/bulk/delete")
async def bulk_delete_notes(
    note_ids: List[str],
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Delete multiple notes at once."""
    db = _get_authed_client(current_user.raw_token, supabase)
    try:
        result = db.table("notes").delete().in_("id", note_ids).eq(
            "user_id", current_user.user_id
        ).execute()
        return {"deleted": len(result.data or []), "note_ids": note_ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk/move")
async def bulk_move_notes(
    payload: dict,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Move multiple notes to a folder."""
    db = _get_authed_client(current_user.raw_token, supabase)
    note_ids = payload.get("note_ids", [])
    folder_id = payload.get("folder_id")  # None = move to root

    try:
        result = db.table("notes").update({"folder_id": folder_id}).in_("id", note_ids).eq(
            "user_id", current_user.user_id
        ).execute()
        return {"moved": len(result.data or []), "folder_id": folder_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Helper ────────────────────────────────────────────────────────────────────

def _format_note(data: dict) -> NoteResponse:
    """Convert raw Supabase row to NoteResponse."""
    return NoteResponse(
        id=data["id"],
        title=data.get("title", "Untitled"),
        content=data.get("content", ""),
        folder_id=data.get("folder_id"),
        tags=data.get("tags") or [],
        is_favorite=data.get("is_favorite", False),
        is_pinned=data.get("is_pinned", False),
        color=data.get("color"),
        status=NoteStatus(data.get("status", "active")),
        word_count=data.get("word_count", 0),
        user_id=data["user_id"],
        created_at=data["created_at"],
        updated_at=data["updated_at"],
    )
