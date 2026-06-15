"""
Nova Notes - Authentication Dependencies
Verifies Supabase JWT tokens on protected routes.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client
import jwt
import logging
from app.core.config import settings
from app.core.supabase import get_supabase, create_authed_client

logger = logging.getLogger(__name__)
security = HTTPBearer()


class AuthenticatedUser:
    def __init__(self, user_id: str, email: str, raw_token: str):
        self.user_id = user_id
        self.email = email
        self.raw_token = raw_token  # Pass to Supabase client for RLS


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(get_supabase),
) -> AuthenticatedUser:
    """
    Validate Supabase JWT and return the authenticated user.
    This token is used to make all Supabase queries on behalf of the user
    so Row Level Security policies are enforced.
    """
    token = credentials.credentials

    try:
        # Verify using Supabase's get_user (validates against Supabase Auth)
        response = supabase.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = response.user
        return AuthenticatedUser(
            user_id=user.id,
            email=user.email or "",
            raw_token=token,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Auth failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_authed_supabase(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Client:
    """
    Returns a Supabase client with the user's token set,
    so all queries automatically enforce RLS for that user.
    """
    return create_authed_client(current_user.raw_token)
