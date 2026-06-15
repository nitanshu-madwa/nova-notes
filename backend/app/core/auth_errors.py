"""Map Supabase Auth errors to user-facing API messages."""

from gotrue.errors import AuthApiError


def auth_error_detail(exc: Exception, fallback: str) -> str:
    if isinstance(exc, AuthApiError):
        code = getattr(exc, "code", None) or ""
        message = str(exc).strip() or getattr(exc, "message", None) or fallback

        if code == "email_not_confirmed":
            return "Please confirm your email before signing in. Check your inbox for the confirmation link."
        if code == "invalid_credentials":
            return "Invalid email or password."
        if code == "email_exists" or code == "user_already_exists":
            return "An account with this email already exists. Try signing in instead."
        if code == "weak_password":
            return "Password is too weak. Use at least 8 characters with mixed characters."
        if code in ("over_request_rate_limit", "over_email_send_rate_limit"):
            return "Too many sign-up attempts. Please wait a few minutes and try again."

        return message

    text = str(exc).strip()
    lower = text.lower()
    if "rate limit" in lower or "too many" in lower:
        return "Too many sign-up attempts. Please wait a few minutes and try again."
    if "invalid" in lower and "email" in lower:
        return "That email address is not valid. Use a real address (e.g. name@gmail.com)."
    if "email_not_confirmed" in lower:
        return "Please confirm your email before signing in. Check your inbox for the confirmation link."
    if text:
        return text
    return fallback
