"""
AetherNotes - Authentication Router
Handles sign up, sign in, sign out, token refresh via Supabase Auth.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from gotrue.errors import AuthApiError
from supabase import Client
from app.core.config import settings, should_auto_confirm_email
from app.core.supabase import get_supabase, get_supabase_admin
from app.core.dependencies import get_current_user, AuthenticatedUser
from app.core.auth_errors import auth_error_detail
from app.schemas.schemas import SignUpRequest, SignInRequest, RefreshTokenRequest
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


def _is_rate_limit_error(exc: Exception) -> bool:
    if isinstance(exc, AuthApiError):
        if getattr(exc, "code", None) in (
            "over_request_rate_limit",
            "over_email_send_rate_limit",
        ):
            return True
    return "rate limit" in str(exc).lower()


def _can_use_admin_signup() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)


def _signup_result_from_auth(response, *, via_admin: bool = False) -> dict:
    if not response.user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create account. Email may already be in use.",
        )

    identities = getattr(response.user, "identities", None)
    if identities is not None and len(identities) == 0 and not response.session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists. Try signing in instead.",
        )

    session = _session_payload(response)
    result = {
        "message": "Account created successfully.",
        "user_id": response.user.id,
        "email": response.user.email,
        "email_confirmed": response.user.email_confirmed_at is not None,
    }
    if session:
        result.update(session)
        result["message"] = "Account created. You are signed in."
    elif not response.user.email_confirmed_at:
        result["message"] = (
            "Account created. Please check your email to confirm your account, then sign in."
        )
    if via_admin and session:
        result["message"] = "Account created. You are signed in (no confirmation email sent)."
    return result


def _signup_with_admin(payload: SignUpRequest, supabase: Client) -> dict:
    """Create user via service role — no confirmation email, avoids rate limits."""
    admin = get_supabase_admin()
    user_metadata = {}
    if payload.full_name:
        user_metadata["full_name"] = payload.full_name

    try:
        admin.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": user_metadata,
        })
    except AuthApiError as e:
        if getattr(e, "code", None) in ("email_exists", "user_already_exists"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists. Try signing in instead.",
            ) from e
        raise

    sign_in = supabase.auth.sign_in_with_password({
        "email": payload.email,
        "password": payload.password,
    })
    session = _session_payload(sign_in)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account was created but sign-in failed. Try signing in manually.",
        )
    return {
        **session,
        "message": "Account created. You are signed in (no confirmation email sent).",
        "user_id": sign_in.user.id,
        "email": sign_in.user.email,
        "email_confirmed": True,
    }


def _session_payload(response) -> dict | None:
    """Build sign-in response from a Supabase auth response."""
    if not response.user or not response.session:
        return None
    return {
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
        "token_type": "bearer",
        "expires_in": response.session.expires_in,
        "user": {
            "id": response.user.id,
            "email": response.user.email,
            "full_name": response.user.user_metadata.get("full_name", ""),
            "avatar_url": response.user.user_metadata.get("avatar_url", ""),
        },
    }


@router.post("/signup", response_model=dict, status_code=status.HTTP_201_CREATED)
async def sign_up(payload: SignUpRequest, supabase: Client = Depends(get_supabase)):
    """Register a new user with email and password."""
    try:
        # Dev / local: confirm email via admin API — no confirmation emails sent
        if should_auto_confirm_email() and _can_use_admin_signup():
            logger.info("Signup via admin API (auto-confirm, no email)")
            return _signup_with_admin(payload, supabase)

        user_metadata = {}
        if payload.full_name:
            user_metadata["full_name"] = payload.full_name

        response = supabase.auth.sign_up({
            "email": payload.email,
            "password": payload.password,
            "options": {"data": user_metadata},
        })
        return _signup_result_from_auth(response)

    except HTTPException:
        raise
    except AuthApiError as e:
        logger.error(f"Sign up error: {e}")

        # Rate limited: retry with admin API if service role is configured
        if _is_rate_limit_error(e) and _can_use_admin_signup():
            try:
                logger.info("Signup rate limited — retrying via admin API")
                return _signup_with_admin(payload, supabase)
            except HTTPException:
                raise
            except Exception as admin_err:
                logger.error(f"Admin signup fallback failed: {admin_err}")

        status_code = status.HTTP_400_BAD_REQUEST
        if _is_rate_limit_error(e):
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
            detail = (
                "Supabase email rate limit reached. Wait about an hour, try Sign In if you "
                "already registered, or set DEBUG=true and SUPABASE_SERVICE_ROLE_KEY in backend "
                ".env to enable signup without confirmation emails."
            )
        else:
            detail = auth_error_detail(e, "Could not create account.")
        raise HTTPException(status_code=status_code, detail=detail)
    except Exception as e:
        logger.error(f"Sign up error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=auth_error_detail(e, "Could not create account."),
        )


@router.post("/signin")
async def sign_in(payload: SignInRequest, supabase: Client = Depends(get_supabase)):
    """Sign in with email and password."""
    try:
        response = supabase.auth.sign_in_with_password({
            "email": payload.email,
            "password": payload.password,
        })

        payload = _session_payload(response)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )
        return payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sign in error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=auth_error_detail(e, "Could not sign in."),
        ) from e
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(e, "Invalid email or password."),
        )


@router.post("/signout")
async def sign_out(
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Sign out the current user."""
    try:
        supabase.auth.sign_out()
        return {"message": "Signed out successfully."}
    except Exception as e:
        logger.error(f"Sign out error: {e}")
        return {"message": "Signed out."}


@router.post("/refresh")
async def refresh_token(payload: RefreshTokenRequest, supabase: Client = Depends(get_supabase)):
    """Refresh an expired access token."""
    try:
        response = supabase.auth.refresh_session(payload.refresh_token)
        if not response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token."
            )
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "token_type": "bearer",
            "expires_in": response.session.expires_in,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_error_detail(e, "Could not refresh token."),
        )


@router.get("/me")
async def get_me(
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get the current authenticated user's profile."""
    try:
        response = supabase.auth.get_user(current_user.raw_token)
        if not response.user:
            raise HTTPException(status_code=404, detail="User not found.")
        user = response.user
        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.user_metadata.get("full_name", ""),
            "avatar_url": user.user_metadata.get("avatar_url", ""),
            "created_at": user.created_at,
            "email_confirmed": user.email_confirmed_at is not None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {e}")
        raise HTTPException(status_code=500, detail="Could not retrieve user profile.")


@router.put("/me")
async def update_profile(
    payload: dict,
    current_user: AuthenticatedUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Update the current user's profile metadata."""
    try:
        allowed_fields = {"full_name", "avatar_url"}
        update_data = {k: v for k, v in payload.items() if k in allowed_fields}

        response = supabase.auth.update_user({"data": update_data})
        if not response.user:
            raise HTTPException(status_code=400, detail="Update failed.")
        return {"message": "Profile updated.", "user_id": response.user.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update profile error: {e}")
        raise HTTPException(status_code=500, detail="Could not update profile.")
