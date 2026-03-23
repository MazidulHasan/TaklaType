"""
config.py – Load environment variables for TaklaType backend.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(_env_path)

FIREBASE_CREDENTIALS_PATH: str = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
FIREBASE_DATABASE_URL: str      = os.getenv("FIREBASE_DATABASE_URL", "")
