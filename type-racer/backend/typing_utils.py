"""
typing_utils.py
Utility functions for typing metrics (used server-side if ever needed).
Frontend handles these calculations live; kept here for future API use.
"""


def calculate_wpm(characters_typed: int, elapsed_seconds: float) -> float:
    """WPM = (characters_typed / 5) / minutes_elapsed"""
    if elapsed_seconds <= 0:
        return 0.0
    minutes = elapsed_seconds / 60
    return round((characters_typed / 5) / minutes, 2)


def calculate_accuracy(correct_chars: int, total_chars: int) -> float:
    """Accuracy = (correct_characters / total_characters) * 100"""
    if total_chars <= 0:
        return 100.0
    return round((correct_chars / total_chars) * 100, 2)


def count_errors(typed: str, target: str) -> int:
    """Count mismatched characters between typed and target strings."""
    errors = 0
    for i, char in enumerate(typed):
        if i >= len(target) or char != target[i]:
            errors += 1
    return errors
