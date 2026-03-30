"""
sentence_loader.py
Loads sentences from data/sentences.json (Banglish) and data/sentences_en.json (English).
Supports categories: general, office, food, motivation, love.
User-submitted sentences go into "pending" and require admin approval.
"""

import json
import random
from pathlib import Path

_DATA_FILE    = Path(__file__).parent.parent / "data" / "sentences.json"
_DATA_FILE_EN = Path(__file__).parent.parent / "data" / "sentences_en.json"

CATEGORIES = ["general", "office", "food", "motivation", "love"]

_data:    dict[str, list] = {}   # Banglish sentences (mirrors sentences.json)
_en_data: dict[str, list] = {}   # English sentences (mirrors sentences_en.json)


def _read_json() -> dict:
    with open(_DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def _write_json(data: dict) -> None:
    with open(_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_sentences() -> None:
    """Read and cache all sentences from the JSON files (Banglish + English)."""
    global _data, _en_data
    _data = _read_json()
    if not _data.get("general"):
        raise FileNotFoundError(f"sentences.json not found or 'general' key is empty: {_DATA_FILE}")
    _data.setdefault("pending", [])
    # Load English sentences (optional — falls back to Banglish if not found)
    try:
        with open(_DATA_FILE_EN, encoding="utf-8") as f:
            _en_data = json.load(f)
        print("[OK] English sentences loaded.")
    except FileNotFoundError:
        _en_data = {}
        print("[INFO] sentences_en.json not found — English mode will fall back to Banglish.")


def _get_pool(category: str, lang: str = "bn") -> list[str]:
    cat      = category.lower() if category else "general"
    src      = _en_data if (lang == "en" and _en_data) else _data
    pool     = src.get(cat) or src.get("general", [])
    if not pool:
        # Fall back to Banglish general if nothing found
        pool = _data.get("general", [])
    if not pool:
        raise RuntimeError("Sentences not loaded yet.")
    return pool


def get_random_sentence(category: str = "general", lang: str = "bn") -> str:
    return random.choice(_get_pool(category, lang))


def get_random_sentences(count: int, category: str = "general", lang: str = "bn") -> list[str]:
    pool  = _get_pool(category, lang)
    count = max(1, min(count, len(pool)))
    return random.sample(pool, count)


def add_to_pending(sentence: str, category: str = "general", submitted_by: str = "") -> None:
    """Add a user-submitted sentence to the pending queue (awaits admin approval)."""
    entry = {"text": sentence.strip(), "category": category.lower(), "submitted_by": submitted_by}
    raw = _read_json()
    raw.setdefault("pending", [])
    raw["pending"].append(entry)
    _write_json(raw)
    _data["pending"] = raw["pending"]


def get_pending() -> list[dict]:
    return list(_data.get("pending", []))


def approve_sentence(index: int) -> dict:
    """Move a pending sentence into its category pool."""
    raw = _read_json()
    pending = raw.get("pending", [])
    if index < 0 or index >= len(pending):
        raise IndexError("Invalid pending index")
    entry = pending.pop(index)
    cat   = entry.get("category", "general")
    if cat not in CATEGORIES:
        cat = "general"
    raw.setdefault(cat, [])
    raw[cat].append(entry["text"])
    raw["pending"] = pending
    _write_json(raw)
    # Refresh in-memory pool
    _data[cat]        = raw[cat]
    _data["pending"]  = pending
    return entry


def reject_sentence(index: int) -> dict:
    """Remove a pending sentence without approving it."""
    raw = _read_json()
    pending = raw.get("pending", [])
    if index < 0 or index >= len(pending):
        raise IndexError("Invalid pending index")
    entry = pending.pop(index)
    raw["pending"] = pending
    _write_json(raw)
    _data["pending"] = pending
    return entry
