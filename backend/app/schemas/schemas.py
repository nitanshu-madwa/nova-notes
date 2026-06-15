"""
AetherNotes - Pydantic Schemas
Request/Response models for all API endpoints.
"""

from pydantic import BaseModel, Field, field_validator, validator
from typing import List, Optional, Any, Dict
from datetime import datetime
from enum import Enum


# ── Enums ────────────────────────────────────────────────────────────────────

class NoteStatus(str, Enum):
    active = "active"
    archived = "archived"


class ChatMode(str, Enum):
    general = "general"
    notes = "notes"


# ── Shared ───────────────────────────────────────────────────────────────────

class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    has_more: bool


# ── Auth ─────────────────────────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    email: str = Field(..., description="User email")
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")
    full_name: Optional[str] = Field(None, description="Display name")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        return stripped or None


class SignInRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    email: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# ── Folders ──────────────────────────────────────────────────────────────────

class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = Field(None, description="Hex color code e.g. #6366f1")
    icon: Optional[str] = Field(None, description="Emoji icon e.g. 📁")
    parent_id: Optional[str] = Field(None, description="Parent folder ID for nesting")


class FolderUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[str] = None


class FolderResponse(BaseModel):
    id: str
    name: str
    color: Optional[str]
    icon: Optional[str]
    parent_id: Optional[str]
    user_id: str
    note_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Notes ────────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    title: str = Field("Untitled Note", max_length=500)
    content: str = Field("", description="Markdown content")
    folder_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_favorite: bool = False
    is_pinned: bool = False
    color: Optional[str] = Field(None, description="Note accent color")
    status: NoteStatus = NoteStatus.active
    generate_ai_tags: bool = Field(False, description="Auto-generate tags using AI")
    suggest_ai_title: bool = Field(False, description="Auto-suggest title using AI")


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = None
    folder_id: Optional[str] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    is_pinned: Optional[bool] = None
    color: Optional[str] = None
    status: Optional[NoteStatus] = None
    generate_ai_tags: bool = Field(False, description="Re-generate tags on save")


class NoteResponse(BaseModel):
    id: str
    title: str
    content: str
    folder_id: Optional[str]
    tags: List[str]
    is_favorite: bool
    is_pinned: bool
    color: Optional[str]
    status: NoteStatus
    word_count: int = 0
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NoteListResponse(BaseModel):
    notes: List[NoteResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# ── Whiteboards ──────────────────────────────────────────────────────────────

class WhiteboardCreate(BaseModel):
    title: str = Field("Untitled Whiteboard", max_length=500)
    canvas_data: Optional[Dict[str, Any]] = Field(None, description="Konva/canvas JSON state")
    note_id: Optional[str] = Field(None, description="Attach to a note")
    thumbnail: Optional[str] = Field(None, description="Base64 thumbnail image")


class WhiteboardUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    canvas_data: Optional[Dict[str, Any]] = None
    thumbnail: Optional[str] = None


class WhiteboardResponse(BaseModel):
    id: str
    title: str
    canvas_data: Optional[Dict[str, Any]]
    note_id: Optional[str]
    thumbnail: Optional[str]
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── AI Features ──────────────────────────────────────────────────────────────

class AITagsRequest(BaseModel):
    title: str
    content: str


class AITagsResponse(BaseModel):
    tags: List[str]


class AITitleRequest(BaseModel):
    content: str
    existing_title: Optional[str] = ""


class AITitleResponse(BaseModel):
    title: str


class AISummaryRequest(BaseModel):
    note_id: Optional[str] = None
    title: str
    content: str


class AISummaryResponse(BaseModel):
    summary: str


class AIActionItemsRequest(BaseModel):
    note_id: Optional[str] = None
    title: str
    content: str


class AIActionItemsResponse(BaseModel):
    action_items: List[str]


class AIImproveRequest(BaseModel):
    title: str
    content: str
    instruction: str = Field(..., description="e.g. 'Make it more formal', 'Fix grammar'")


class AIImproveResponse(BaseModel):
    improved_content: str


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    mode: ChatMode = Field(ChatMode.general, description="'general' or 'notes' (RAG)")
    session_id: Optional[str] = Field(None, description="Chat session UUID")


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str  # "user" | "assistant"
    content: str
    mode: ChatMode
    sources: Optional[List[Dict[str, Any]]] = None  # Notes used in RAG
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionResponse(BaseModel):
    session_id: str
    messages: List[ChatMessageResponse]
    total: int


class ChatHistoryResponse(BaseModel):
    sessions: List[Dict[str, Any]]


# ── Search ───────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    mode: str = Field("hybrid", description="'keyword' | 'semantic' | 'hybrid'")
    folder_id: Optional[str] = None
    tags: Optional[List[str]] = None
    limit: int = Field(20, ge=1, le=50)


class SearchResultItem(BaseModel):
    id: str
    title: str
    content_preview: str
    tags: List[str]
    folder_id: Optional[str]
    is_favorite: bool
    similarity_score: Optional[float] = None
    relevance_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class SearchResponse(BaseModel):
    results: List[SearchResultItem]
    total: int
    query: str
    mode: str
