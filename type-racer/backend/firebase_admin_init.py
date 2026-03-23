"""
firebase_admin_init.py – Firebase Admin SDK singleton.
Returns None gracefully when not configured (local dev without Firebase).
"""

import firebase_admin
from firebase_admin import credentials

from backend.config import FIREBASE_CREDENTIALS_PATH, FIREBASE_DATABASE_URL

_app: firebase_admin.App | None = None


def get_firebase_app() -> firebase_admin.App | None:
    """Return the initialized Firebase app, or None if not configured."""
    global _app

    if _app is not None:
        return _app

    if not FIREBASE_CREDENTIALS_PATH:
        return None

    try:
        cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
        opts = {}
        if FIREBASE_DATABASE_URL:
            opts["databaseURL"] = FIREBASE_DATABASE_URL
        _app = firebase_admin.initialize_app(cred, opts)
        return _app
    except Exception as exc:
        print(f"[WARN] Firebase Admin init failed: {exc}")
        return None
