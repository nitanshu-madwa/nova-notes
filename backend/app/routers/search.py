"""
AetherNotes - Search Router
Hybrid search: keyword (PostgreSQL full-text) + semantic (pgvector).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from typing import Optional, List
import logging

from app.core.dependencies import get_current_user, AuthenticatedUser
from app.core.supabase import get_supabase, create_authed_client
from app.core.config import settings
from app.schemas.schemas import SearchRequest, SearchResponse, SearchResultItem
from app.services.embedding_service import generate_embedding

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_authed_client(token: str, supabase: Client) -> Client:
    """Create a fresh authenticated Supabase client for RLS enforcement."""
    return create_authed_client(token)


@router.post("/", response_model=SearchResponse)
async def search_notes(
    payload: SearchRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Hybrid search across user's notes.
    - keyword: PostgreSQL full-text search (tsvector)
    - semantic: pgvector cosine similarity
    - hybrid: combines both (default)
    """
    db = _get_authed_client(current_user.raw_token, supabase)
    query = payload.query.strip()
    mode = payload.mode

    if not query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")

    results = []

    if mode in ("semantic", "hybrid"):
        results = await _semantic_search(
            query=query,
            user_id=current_user.user_id,
            db=db,
            limit=payload.limit,
            folder_id=payload.folder_id,
        )

    if mode == "keyword" or (mode == "hybrid" and not results):
        keyword_results = await _keyword_search(
            query=query,
            user_id=current_user.user_id,
            db=db,
            limit=payload.limit,
            folder_id=payload.folder_id,
        )
        if mode == "keyword":
            results = keyword_results
        else:
            # Merge: add keyword results not already in semantic results
            existing_ids = {r.id for r in results}
            for kr in keyword_results:
                if kr.id not in existing_ids:
                    results.append(kr)

    # Apply tag filter if requested
    if payload.tags:
        results = [
            r for r in results
            if any(tag in r.tags for tag in payload.tags)
        ]

    return SearchResponse(
        results=results[:payload.limit],
        total=len(results),
        query=query,
        mode=mode,
    )


async def _semantic_search(
    query: str,
    user_id: str,
    db: Client,
    limit: int = 10,
    folder_id: Optional[str] = None,
) -> List[SearchResultItem]:
    """
    Vector similarity search using pgvector.
    Calls the match_notes RPC function in Supabase.
    """
    try:
        embedding = generate_embedding(query)
        if not embedding:
            logger.warning("Embedding generation returned None — skipping semantic search.")
            return []

        # Call the match_notes stored function (see supabase_setup.sql)
        params = {
            "query_embedding": embedding,
            "match_threshold": settings.VECTOR_MATCH_THRESHOLD,
            "match_count": limit,
            "filter_user_id": user_id,
        }
        if folder_id:
            params["filter_folder_id"] = folder_id

        result = db.rpc("match_notes", params).execute()

        items = []
        for row in (result.data or []):
            items.append(SearchResultItem(
                id=row["id"],
                title=row.get("title", ""),
                content_preview=_preview(row.get("content", "")),
                tags=row.get("tags") or [],
                folder_id=row.get("folder_id"),
                is_favorite=row.get("is_favorite", False),
                similarity_score=row.get("similarity"),
                relevance_score=row.get("similarity"),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            ))
        return items

    except Exception as e:
        logger.error(f"Semantic search error: {e}")
        return []


async def _keyword_search(
    query: str,
    user_id: str,
    db: Client,
    limit: int = 20,
    folder_id: Optional[str] = None,
) -> List[SearchResultItem]:
    """
    Full-text keyword search using PostgreSQL ilike / ts_vector.
    Falls back to ilike if full-text search isn't set up.
    """
    try:
        search_query = db.table("notes").select(
            "id, title, content, tags, folder_id, is_favorite, created_at, updated_at"
        ).eq("user_id", user_id).eq("status", "active")

        if folder_id:
            search_query = search_query.eq("folder_id", folder_id)

        # Use ilike for simple keyword search (works without tsvector setup)
        search_term = f"%{query}%"
        search_query = search_query.or_(
            f"title.ilike.{search_term},content.ilike.{search_term}"
        )

        search_query = search_query.limit(limit)
        result = search_query.execute()

        items = []
        for row in (result.data or []):
            items.append(SearchResultItem(
                id=row["id"],
                title=row.get("title", ""),
                content_preview=_smart_preview(row.get("content", ""), query),
                tags=row.get("tags") or [],
                folder_id=row.get("folder_id"),
                is_favorite=row.get("is_favorite", False),
                similarity_score=None,
                relevance_score=_keyword_relevance(row, query),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            ))

        # Sort by relevance
        items.sort(key=lambda x: x.relevance_score or 0, reverse=True)
        return items

    except Exception as e:
        logger.error(f"Keyword search error: {e}")
        return []


def _preview(content: str, length: int = 200) -> str:
    """Generate a clean content preview."""
    if not content:
        return ""
    # Strip markdown
    import re
    clean = re.sub(r'#{1,6}\s', '', content)
    clean = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', clean)
    clean = re.sub(r'`[^`]+`', '', clean)
    clean = re.sub(r'\n+', ' ', clean).strip()
    return clean[:length] + ("..." if len(clean) > length else "")


def _smart_preview(content: str, query: str, context_chars: int = 150) -> str:
    """
    Generate a preview that shows the context around the query match.
    """
    if not content:
        return ""
    clean = _preview(content, 5000)  # Get clean content first
    query_lower = query.lower()
    content_lower = clean.lower()
    idx = content_lower.find(query_lower)
    if idx == -1:
        return clean[:200] + ("..." if len(clean) > 200 else "")

    start = max(0, idx - context_chars // 2)
    end = min(len(clean), idx + len(query) + context_chars // 2)
    snippet = ("..." if start > 0 else "") + clean[start:end] + ("..." if end < len(clean) else "")
    return snippet


def _keyword_relevance(row: dict, query: str) -> float:
    """Simple relevance scoring for keyword results."""
    score = 0.0
    query_lower = query.lower()
    title = (row.get("title") or "").lower()
    content = (row.get("content") or "").lower()
    tags = [t.lower() for t in (row.get("tags") or [])]

    # Title match is most valuable
    if query_lower in title:
        score += 1.0
        if title.startswith(query_lower):
            score += 0.5

    # Tag match
    if any(query_lower in tag for tag in tags):
        score += 0.6

    # Content match (count occurrences)
    count = content.count(query_lower)
    score += min(count * 0.1, 0.5)

    return score


@router.get("/suggest")
async def search_suggestions(
    q: str = Query(..., min_length=1, max_length=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Get search suggestions (autocomplete) based on note titles and tags.
    """
    db = _get_authed_client(current_user.raw_token, supabase)

    try:
        result = db.table("notes").select(
            "title, tags"
        ).eq("user_id", current_user.user_id).eq(
            "status", "active"
        ).ilike("title", f"%{q}%").limit(5).execute()

        suggestions = []
        seen = set()

        for row in (result.data or []):
            title = row.get("title", "")
            if title and title not in seen:
                suggestions.append({"type": "note", "text": title})
                seen.add(title)

            for tag in (row.get("tags") or []):
                if q.lower() in tag.lower() and tag not in seen:
                    suggestions.append({"type": "tag", "text": tag})
                    seen.add(tag)

        return {"suggestions": suggestions[:10]}

    except Exception as e:
        logger.error(f"Search suggestions error: {e}")
        return {"suggestions": []}
