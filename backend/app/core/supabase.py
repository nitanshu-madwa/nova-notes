"""
AetherNotes - Supabase Client
"""

from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Public client (respects RLS — use for user operations)
_supabase_client: Client | None = None

# Admin/service-role client (bypasses RLS — use carefully for admin ops)
_supabase_admin: Client | None = None


def get_supabase() -> Client:
    """Get Supabase public client (respects RLS)."""
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env"
            )
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY
        )
        logger.info("Supabase public client initialized")
    return _supabase_client


def get_supabase_admin() -> Client:
    """Get Supabase admin client (bypasses RLS — use carefully)."""
    global _supabase_admin
    if _supabase_admin is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _supabase_admin = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
        logger.info("Supabase admin client initialized")
    return _supabase_admin


def create_authed_client(token: str) -> Client:
    """Create a new Supabase client instance authorized with a specific user JWT token."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env"
        )
    client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY
    )
    client.postgrest.auth(token)
    try:
        client.auth.set_session(token, "")
    except Exception as e:
        logger.warning(f"Failed to set auth session: {e}")
    return client

