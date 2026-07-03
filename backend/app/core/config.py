"""
AetherNotes - Application Configuration
"""

from pydantic_settings import BaseSettings
from typing import List, Optional
import os


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────────
    APP_NAME: str = "AetherNotes"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    # Skip Supabase confirmation emails on signup (uses service role). Defaults on when DEBUG=true.
    AUTH_AUTO_CONFIRM_EMAIL: Optional[bool] = None

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "https://nova-notes-omega.vercel.app",
        "https://www.nova-notes-omega.vercel.app",
    ]
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Allow CORS_ORIGINS to be overridden via environment variable
        cors_env = os.getenv("CORS_ORIGINS")
        if cors_env:
            # Split comma-separated origins
            self.CORS_ORIGINS = [origin.strip() for origin in cors_env.split(",")]

    # ── Supabase ─────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # ── Database (optional — Supabase client handles connections) ────────────
    DATABASE_URL: Optional[str] = None

    # ── Groq AI ──────────────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    GROQ_CHAT_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FAST_MODEL: str = "llama-3.1-8b-instant"
    GROQ_EMBED_MODEL: str = "nomic-embed-text"

    # ── Embeddings ───────────────────────────────────────────────────────────
    EMBEDDING_PROVIDER: str = "sentence_transformers"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    # ── Vector Search ────────────────────────────────────────────────────────
    VECTOR_MATCH_THRESHOLD: float = 0.7
    VECTOR_MATCH_COUNT: int = 10

    # ── Pagination ───────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # ── AI Limits ────────────────────────────────────────────────────────────
    MAX_NOTE_LENGTH_FOR_AI: int = 8000
    MAX_CHAT_HISTORY_MESSAGES: int = 20
    MAX_RAG_CONTEXT_NOTES: int = 5

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",   # ← ignore any unknown env vars like DATABASE_URL variants
    }


settings = Settings()


def should_auto_confirm_email() -> bool:
    """Use admin API for signup to avoid confirmation emails (dev / rate-limit relief)."""
    if settings.AUTH_AUTO_CONFIRM_EMAIL is not None:
        return settings.AUTH_AUTO_CONFIRM_EMAIL
    return settings.DEBUG
