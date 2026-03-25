"""
sentence_loader.py
Loads sentences from data files at startup and returns random ones.
Supports categories: general, office, food, motivation, love.
"""

import random
from pathlib import Path

_DATA_DIR = Path(__file__).parent.parent / "data"

# Category → filename mapping ("all" merges every category)
CATEGORIES: dict[str, str] = {
    "general":    "sentences.txt",
    "office":     "sentences_office.txt",
    "food":       "sentences_food.txt",
    "motivation": "sentences_motivation.txt",
    "love":       "sentences_love.txt",
}

_pool: dict[str, list[str]] = {}   # category → sentences


def _load_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def load_sentences() -> None:
    """Read and cache all sentence files."""
    global _pool
    for cat, fname in CATEGORIES.items():
        _pool[cat] = _load_file(_DATA_DIR / fname)
    # "all" merges everything
    _pool["all"] = []
    for lines in _pool.values():
        _pool["all"].extend(lines)
    if not _pool["general"]:
        raise FileNotFoundError(f"Sentence file not found: {_DATA_DIR / CATEGORIES['general']}")


def _get_pool(category: str) -> list[str]:
    cat = category.lower() if category else "general"
    pool = _pool.get(cat) or _pool.get("general", [])
    if not pool:
        raise RuntimeError("Sentences not loaded yet.")
    return pool


def get_random_sentence(category: str = "general") -> str:
    return random.choice(_get_pool(category))


def get_random_sentences(count: int, category: str = "general") -> list[str]:
    pool  = _get_pool(category)
    count = max(1, min(count, len(pool)))
    return random.sample(pool, count)


def append_sentence(sentence: str, category: str = "general") -> None:
    """Append a new sentence to a category file and refresh the in-memory pool."""
    fname = CATEGORIES.get(category.lower(), CATEGORIES["general"])
    path  = _DATA_DIR / fname
    with open(path, "a", encoding="utf-8") as f:
        f.write(sentence.strip() + "\n")
    # Refresh pool
    _pool[category.lower()] = _load_file(path)
    _pool["all"] = []
    for lines in _pool.values():
        _pool["all"].extend(lines)
