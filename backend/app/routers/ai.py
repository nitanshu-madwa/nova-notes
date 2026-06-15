"""
AetherNotes - AI Features Router
Endpoints for auto-tagging, title suggestion, summarization,
action item extraction, and note improvement.
"""

from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_current_user, AuthenticatedUser
from app.schemas.schemas import (
    AITagsRequest, AITagsResponse,
    AITitleRequest, AITitleResponse,
    AISummaryRequest, AISummaryResponse,
    AIActionItemsRequest, AIActionItemsResponse,
    AIImproveRequest, AIImproveResponse,
)
from app.services import ai_service
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/tags", response_model=AITagsResponse)
async def get_ai_tags(
    payload: AITagsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Auto-generate relevant tags for a note using AI.
    Call this when saving a note to get smart tag suggestions.
    """
    try:
        tags = await ai_service.generate_tags(payload.title, payload.content)
        return AITagsResponse(tags=tags)
    except Exception as e:
        logger.error(f"AI tags error: {e}")
        raise HTTPException(status_code=500, detail="AI tag generation failed.")


@router.post("/title", response_model=AITitleResponse)
async def get_ai_title(
    payload: AITitleRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Suggest a better title for a note based on its content.
    """
    try:
        title = await ai_service.suggest_title(payload.content, payload.existing_title or "")
        return AITitleResponse(title=title)
    except Exception as e:
        logger.error(f"AI title error: {e}")
        raise HTTPException(status_code=500, detail="AI title suggestion failed.")


@router.post("/summarize", response_model=AISummaryResponse)
async def summarize_note(
    payload: AISummaryRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Generate a concise summary of a note.
    """
    if not payload.content or len(payload.content.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Note content is too short to summarize (minimum 50 characters)."
        )
    try:
        summary = await ai_service.summarize_note(payload.title, payload.content)
        return AISummaryResponse(summary=summary)
    except Exception as e:
        logger.error(f"Summarize error: {e}")
        raise HTTPException(status_code=500, detail="AI summarization failed.")


@router.post("/action-items", response_model=AIActionItemsResponse)
async def extract_action_items(
    payload: AIActionItemsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Extract action items and tasks from a note.
    """
    try:
        items = await ai_service.extract_action_items(payload.title, payload.content)
        return AIActionItemsResponse(action_items=items)
    except Exception as e:
        logger.error(f"Action items error: {e}")
        raise HTTPException(status_code=500, detail="AI action item extraction failed.")


@router.post("/improve", response_model=AIImproveResponse)
async def improve_note(
    payload: AIImproveRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Improve or rewrite note content based on an instruction.
    Examples: 'Make it more formal', 'Fix grammar', 'Add more detail'
    """
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Note content cannot be empty.")
    if not payload.instruction.strip():
        raise HTTPException(status_code=400, detail="Instruction cannot be empty.")

    try:
        improved = await ai_service.improve_note(
            payload.title, payload.content, payload.instruction
        )
        return AIImproveResponse(improved_content=improved)
    except Exception as e:
        logger.error(f"Improve note error: {e}")
        raise HTTPException(status_code=500, detail="AI note improvement failed.")


@router.post("/analyze")
async def analyze_note(
    payload: dict,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Run all AI analyses on a note in one call:
    tags, summary, and action items.
    Useful for the 'AI Insights' panel.
    """
    title = payload.get("title", "")
    content = payload.get("content", "")

    if not content or len(content.strip()) < 20:
        raise HTTPException(status_code=400, detail="Content too short for analysis.")

    results = {}
    errors = {}

    try:
        results["tags"] = await ai_service.generate_tags(title, content)
    except Exception as e:
        errors["tags"] = str(e)
        results["tags"] = []

    try:
        results["summary"] = await ai_service.summarize_note(title, content)
    except Exception as e:
        errors["summary"] = str(e)
        results["summary"] = ""

    try:
        results["action_items"] = await ai_service.extract_action_items(title, content)
    except Exception as e:
        errors["action_items"] = str(e)
        results["action_items"] = []

    return {
        "note_id": payload.get("note_id"),
        "results": results,
        "errors": errors if errors else None,
    }
