"""
AetherNotes - AI Chat Router
Global AI chatbot with two modes:
  - "general": Standard AI assistant
  - "notes": RAG over user's notes (semantic search + LLM)

Chat history is persisted per user/session in Supabase.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from supabase import Client
from typing import List, Optional
import logging
import uuid
import json
import time
from datetime import datetime

from app.core.dependencies import get_current_user, AuthenticatedUser
from app.core.supabase import get_supabase, create_authed_client
from app.core.config import settings
from app.schemas.schemas import (
    ChatMessageCreate, ChatMessageResponse, ChatSessionResponse, ChatMode
)
from app.services.ai_service import chat_with_ai, chat_with_ai_stream
from app.services.embedding_service import generate_embedding
import asyncio

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_authed_client(token: str, supabase: Client) -> Client:
    """Create a fresh authenticated Supabase client for RLS enforcement."""
    return create_authed_client(token)


# ── Send Message ──────────────────────────────────────────────────────────────

@router.post("/message", response_model=ChatMessageResponse)
async def send_chat_message(
    payload: ChatMessageCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Send a message to the AI chatbot.
    
    Modes:
    - "general": Regular AI assistant (no note context)
    - "notes": RAG mode — retrieves relevant notes via semantic search,
               then passes them as context to the AI
    """
    db = _get_authed_client(current_user.raw_token, supabase)

    # Get or create session
    session_id = payload.session_id or str(uuid.uuid4())

    # 1. Fetch conversation history for this session
    history = await _get_session_history(db, current_user.user_id, session_id)

    # 2. Retrieve relevant notes (RAG) if in notes mode
    relevant_notes = []
    source_notes = []

    if payload.mode == ChatMode.notes:
        relevant_notes, source_notes = await _retrieve_relevant_notes(
            query=payload.message,
            user_id=current_user.user_id,
            db=db,
        )

    # 3. Save user message to DB
    user_msg_id = str(uuid.uuid4())
    user_msg_data = {
        "id": user_msg_id,
        "user_id": current_user.user_id,
        "session_id": session_id,
        "role": "user",
        "content": payload.message,
        "mode": payload.mode.value,
        "sources": None,
    }
    db.table("chat_messages").insert(user_msg_data).execute()

    # 4. Format conversation history for LLM
    formatted_history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in history
    ]

    # 5. Generate AI response
    try:
        ai_response = await chat_with_ai(
            user_message=payload.message,
            conversation_history=formatted_history,
            relevant_notes=relevant_notes,
            mode=payload.mode.value,
        )
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        ai_response = "I'm having trouble connecting right now. Please try again in a moment."

    # 6. Save AI response to DB
    assistant_msg_id = str(uuid.uuid4())
    assistant_msg_data = {
        "id": assistant_msg_id,
        "user_id": current_user.user_id,
        "session_id": session_id,
        "role": "assistant",
        "content": ai_response,
        "mode": payload.mode.value,
        "sources": source_notes if source_notes else None,
    }
    db.table("chat_messages").insert(assistant_msg_data).execute()

    return ChatMessageResponse(
        id=assistant_msg_id,
        session_id=session_id,
        role="assistant",
        content=ai_response,
        mode=payload.mode,
        sources=source_notes if source_notes else None,
        created_at=datetime.utcnow(),
    )


@router.post("/message/stream")
async def send_chat_message_stream(
    payload: ChatMessageCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Send a message to the AI chatbot and receive a streamed SSE response.
    """
    db = _get_authed_client(current_user.raw_token, supabase)

    session_id = payload.session_id or str(uuid.uuid4())
    logger.info(f"Chat stream request payload user={current_user.user_id} session={session_id} mode={payload.mode} message_len={len(payload.message or '')}")
    start_time = time.time()

    # 1. Fetch conversation history for this session
    history = await _get_session_history(db, current_user.user_id, session_id)

    # 2. Retrieve relevant notes (RAG) if in notes mode
    relevant_notes = []
    source_notes = []

    if payload.mode == ChatMode.notes:
        relevant_notes, source_notes = await _retrieve_relevant_notes(
            query=payload.message,
            user_id=current_user.user_id,
            db=db,
        )

    # 3. Save user message to DB
    user_msg_id = str(uuid.uuid4())
    user_msg_data = {
        "id": user_msg_id,
        "user_id": current_user.user_id,
        "session_id": session_id,
        "role": "user",
        "content": payload.message,
        "mode": payload.mode.value,
        "sources": None,
    }
    db.table("chat_messages").insert(user_msg_data).execute()

    # 4. Format conversation history for LLM
    formatted_history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in history
    ]

    async def event_generator():
        # Yield metadata event containing the session_id and source notes
        metadata = {
            "session_id": session_id,
            "sources": source_notes if source_notes else None,
        }
        logger.info(f"Starting SSE chat stream for user={current_user.user_id} session={session_id}")
        yield f"data: {json.dumps({'event': 'metadata', 'data': metadata})}\n\n"

        full_content = []
        try:
            async for chunk in chat_with_ai_stream(
                user_message=payload.message,
                conversation_history=formatted_history,
                relevant_notes=relevant_notes,
                mode=payload.mode.value,
            ):
                # Each chunk should be a string delta
                full_content.append(chunk)
                logger.debug(f"Chat stream chunk (session={session_id}): {chunk[:120]}")
                yield f"data: {json.dumps({'event': 'content', 'data': chunk})}\n\n"
        except Exception as e:
            # Log the error and yield a final 'done' event with an error message
            logger.error(f"Error during chat stream for user={current_user.user_id} session={session_id}: {e}", exc_info=True)
            err_msg = "I'm having trouble composing a response right now."
            # still try to persist partial content if possible
            ai_response = "".join(full_content) + "\n\n" + err_msg
            assistant_msg_id = str(uuid.uuid4())
            assistant_msg_data = {
                "id": assistant_msg_id,
                "user_id": current_user.user_id,
                "session_id": session_id,
                "role": "assistant",
                "content": ai_response,
                "mode": payload.mode.value,
                "sources": source_notes if source_notes else None,
            }
            try:
                db.table("chat_messages").insert(assistant_msg_data).execute()
            except Exception as ex:
                logger.warning(f"Failed to save partial assistant message after stream error: {ex}")

            done_data = {"id": assistant_msg_id, "content": ai_response}
            yield f"data: {json.dumps({'event': 'done', 'data': done_data})}\n\n"
            return

        # Finalize and save to DB
        ai_response = "".join(full_content)
        assistant_msg_id = str(uuid.uuid4())
        assistant_msg_data = {
            "id": assistant_msg_id,
            "user_id": current_user.user_id,
            "session_id": session_id,
            "role": "assistant",
            "content": ai_response,
            "mode": payload.mode.value,
            "sources": source_notes if source_notes else None,
        }
        try:
            db.table("chat_messages").insert(assistant_msg_data).execute()
        except Exception as e:
            logger.error(f"Failed to save assistant stream response to DB: {e}")

        # Send done event
        duration = time.time() - start_time
        logger.info(f"Finished SSE chat stream for user={current_user.user_id} session={session_id} assistant_id={assistant_msg_id} duration={duration:.3f}s")
        done_data = {
            "id": assistant_msg_id,
            "content": ai_response,
        }
        yield f"data: {json.dumps({'event': 'done', 'data': done_data})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ── Get Session History ───────────────────────────────────────────────────────

@router.get("/session/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get all messages in a chat session."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        result = db.table("chat_messages").select("*").eq(
            "user_id", current_user.user_id
        ).eq("session_id", session_id).order("created_at").limit(limit).execute()

        messages = [_format_message(m) for m in (result.data or [])]
        return ChatSessionResponse(
            session_id=session_id,
            messages=messages,
            total=len(messages),
        )
    except Exception as e:
        logger.error(f"Get session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── List Sessions ─────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    limit: int = Query(20, ge=1, le=50),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    List the user's recent chat sessions with the last message preview.
    """
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        # Get unique sessions with their latest message
        result = db.table("chat_messages").select(
            "session_id, content, mode, created_at"
        ).eq(
            "user_id", current_user.user_id
        ).eq("role", "user").order("created_at", desc=True).limit(100).execute()

        # Group by session_id and take the latest per session
        sessions_map = {}
        for msg in (result.data or []):
            sid = msg["session_id"]
            if sid not in sessions_map:
                sessions_map[sid] = {
                    "session_id": sid,
                    "last_message": msg["content"][:100],
                    "mode": msg["mode"],
                    "last_activity": msg["created_at"],
                }

        sessions = list(sessions_map.values())[:limit]
        return {"sessions": sessions, "total": len(sessions)}

    except Exception as e:
        logger.error(f"List sessions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete Session ────────────────────────────────────────────────────────────

@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Delete a chat session and all its messages."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        db.table("chat_messages").delete().eq(
            "session_id", session_id
        ).eq("user_id", current_user.user_id).execute()
        return {"message": "Session deleted.", "session_id": session_id}
    except Exception as e:
        logger.error(f"Delete session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Clear All Chat History ────────────────────────────────────────────────────

@router.delete("/history")
async def clear_all_history(
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Clear all chat history for the current user."""
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        db.table("chat_messages").delete().eq(
            "user_id", current_user.user_id
        ).execute()
        return {"message": "Chat history cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Internal Helpers ──────────────────────────────────────────────────────────

async def _get_session_history(
    db: Client, user_id: str, session_id: str
) -> List[dict]:
    """Fetch recent messages for a session (for LLM context)."""
    try:
        result = db.table("chat_messages").select(
            "role, content"
        ).eq("user_id", user_id).eq(
            "session_id", session_id
        ).order("created_at").limit(
            settings.MAX_CHAT_HISTORY_MESSAGES
        ).execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch session history: {e}")
        return []


async def _retrieve_relevant_notes(
    query: str,
    user_id: str,
    db: Client,
    limit: int = None,
) -> tuple[List[dict], List[dict]]:
    """
    Semantic search over user's notes for RAG context.
    Returns (full_notes_for_ai, source_metadata_for_response)
    """
    limit = limit or settings.MAX_RAG_CONTEXT_NOTES

    # Try semantic search first
    try:
        embedding = generate_embedding(query)
        if embedding:
            result = db.rpc("match_notes", {
                "query_embedding": embedding,
                "match_threshold": 0.5,  # Lower threshold for chat
                "match_count": limit,
                "filter_user_id": user_id,
            }).execute()

            if result.data:
                full_notes = result.data
                sources = [
                    {
                        "id": n["id"],
                        "title": n.get("title", "Untitled"),
                        "similarity": n.get("similarity", 0),
                    }
                    for n in result.data
                ]
                return full_notes, sources
    except Exception as e:
        logger.warning(f"Semantic search for RAG failed: {e}")

    # Fallback: keyword search
    try:
        search_term = f"%{query}%"
        result = db.table("notes").select(
            "id, title, content, tags, created_at, updated_at"
        ).eq("user_id", user_id).eq("status", "active").or_(
            f"title.ilike.{search_term},content.ilike.{search_term}"
        ).limit(limit).execute()

        if result.data:
            sources = [
                {"id": n["id"], "title": n.get("title", "Untitled")}
                for n in result.data
            ]
            return result.data, sources
    except Exception as e:
        logger.warning(f"Keyword fallback for RAG failed: {e}")

    # Last resort: return the user's latest active notes so the AI still has note context
    try:
        result = db.table("notes").select(
            "id, title, content, tags, created_at, updated_at"
        ).eq("user_id", user_id).eq("status", "active").order("updated_at", desc=True).limit(limit).execute()

        if result.data:
            sources = [
                {"id": n["id"], "title": n.get("title", "Untitled")}
                for n in result.data
            ]
            return result.data, sources
    except Exception as e:
        logger.warning(f"Final fallback note retrieval failed: {e}")

    return [], []


def _format_message(data: dict) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=data["id"],
        session_id=data["session_id"],
        role=data["role"],
        content=data["content"],
        mode=ChatMode(data.get("mode", "general")),
        sources=data.get("sources"),
        created_at=data["created_at"],
    )


# ── Dev-only: simulated SSE stream for testing UI without model backend ──
@router.post("/debug/stream-sim")
async def debug_stream_sim(payload: ChatMessageCreate, current_user: AuthenticatedUser = Depends(get_current_user)):
    """Dev-only: simulate an SSE streaming chat response. Returns incremental chunks then done.
    Only enabled when settings.DEBUG is True.
    """
    if not settings.DEBUG:
        raise HTTPException(status_code=404, detail="Not found")

    session_id = payload.session_id or str(uuid.uuid4())

    async def gen():
        # metadata
        meta = {"session_id": session_id, "sources": None}
        yield f"data: {json.dumps({'event': 'metadata', 'data': meta})}\n\n"
        # simulate typing chunks
        phrases = [
            "Sure — I can help with that.",
            "First, here's a quick summary:",
            "- Point one\n- Point two\n- Point three",
            "Would you like more details or examples?",
        ]
        for p in phrases:
            await asyncio.sleep(0.4)
            yield f"data: {json.dumps({'event': 'content', 'data': p + ' '})}\n\n"

        # done
        await asyncio.sleep(0.2)
        done = {"id": str(uuid.uuid4()), "content": ' '.join(phrases)}
        yield f"data: {json.dumps({'event': 'done', 'data': done})}\n\n"

    return StreamingResponse(gen(), media_type='text/event-stream')


# Dev-only, no-auth simulator for local testing (only when DEBUG=True)
@router.post("/debug/stream-sim-noauth")
async def debug_stream_sim_noauth(payload: ChatMessageCreate):
    """Local dev: simulate SSE streaming without requiring authentication.
    Only active when settings.DEBUG is True.
    """
    if not settings.DEBUG:
        raise HTTPException(status_code=404, detail="Not found")

    session_id = payload.session_id or str(uuid.uuid4())

    async def gen():
        meta = {"session_id": session_id, "sources": None}
        yield f"data: {json.dumps({'event': 'metadata', 'data': meta})}\n\n"
        parts = [
            "Here's a simulated answer.",
            "This demonstrates server-sent events streaming.",
            "You can use this endpoint to test the UI without auth.",
        ]
        for p in parts:
            await asyncio.sleep(0.35)
            yield f"data: {json.dumps({'event': 'content', 'data': p + ' '})}\n\n"

        await asyncio.sleep(0.15)
        done = {"id": str(uuid.uuid4()), "content": ' '.join(parts)}
        yield f"data: {json.dumps({'event': 'done', 'data': done})}\n\n"

    return StreamingResponse(gen(), media_type='text/event-stream')
