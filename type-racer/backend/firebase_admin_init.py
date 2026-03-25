"""
firebase_admin_init.py – Firebase Admin SDK singleton.
Returns None gracefully when not configured (local dev without Firebase).

Credentials are loaded from (in priority order):
  1. FIREBASE_CREDENTIALS_JSON env var — full JSON content as a string (Render/cloud)
  2. FIREBASE_CREDENTIALS_PATH env var — path to a service account JSON file (local dev)
"""

import json
import os

import firebase_admin
from firebase_admin import credentials

from backend.config import FIREBASE_CREDENTIALS_PATH, FIREBASE_DATABASE_URL

_app: firebase_admin.App | None = None


def get_firebase_app() -> firebase_admin.App | None:
    """Return the initialized Firebase app, or None if not configured."""
    global _app

    if _app is not None:
        return _app

    try:
        creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()
        if creds_json:
            cred = credentials.Certificate(json.loads(creds_json))
        elif FIREBASE_CREDENTIALS_PATH:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
        else:
            return None

        opts = {}
        if FIREBASE_DATABASE_URL:
            opts["databaseURL"] = FIREBASE_DATABASE_URL
        _app = firebase_admin.initialize_app(cred, opts)
        return _app
    except Exception as exc:
        print(f"[WARN] Firebase Admin init failed: {exc}")
        return None
