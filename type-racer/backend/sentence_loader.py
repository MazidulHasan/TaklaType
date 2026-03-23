"""
sentence_loader.py
Loads sentences from the data file once at startup and returns random ones.
"""

import random
from pathlib import Path

# Resolved path relative to the project root
SENTENCES_FILE = Path(__file__).parent.parent / "data" / "sentences.txt"

_sentences: list[str] = []


def load_sentences() -> None:
    """Read and cache all non-empty sentences from the txt file."""
    global _sentences
    if not SENTENCES_FILE.exists():
        raise FileNotFoundError(f"Sentence file not found: {SENTENCES_FILE}")

    with open(SENTENCES_FILE, encoding="utf-8") as f:
        _sentences = [line.strip() for line in f if line.strip()]


def get_random_sentence() -> str:
    """Return a randomly chosen sentence from the cached list."""
    if not _sentences:
        raise RuntimeError("Sentences not loaded yet.")
    return random.choice(_sentences)


def get_random_sentences(count: int) -> list[str]:
    """Return `count` unique random sentences (clamped to available pool size)."""
    if not _sentences:
        raise RuntimeError("Sentences not loaded yet.")
    count = max(1, min(count, len(_sentences)))
    return random.sample(_sentences, count)
