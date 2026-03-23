"""
auth_middleware.py – Firebase ID token verification helper.
"""

from firebase_admin import auth

from backend.firebase_admin_init import get_firebase_app


def verify_token(id_token: str) -> dict | None:
    """Verify a Firebase ID token.  Returns the decoded claims dict, or None."""
    app = get_firebase_app()
    if app is None:
        return None
    try:
        return auth.verify_id_token(id_token, app=app)
    except Exception:
        return None
