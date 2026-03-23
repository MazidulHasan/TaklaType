"""
room_manager.py – Realtime Database room lifecycle for TaklaType multiplayer.
All writes use the Admin SDK (bypasses security rules).
"""

import random
from firebase_admin import db as rtdb

_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _random_code(length: int = 6) -> str:
    return "".join(random.choices(_CODE_CHARS, k=length))


def create_room(host_uid: str, host_name: str, sentence: str) -> str:
    """Create a new room and return its code."""
    for _ in range(10):
        code = _random_code()
        ref  = rtdb.reference(f"/rooms/{code}")
        if ref.get() is None:
            ref.set({
                "sentence": sentence,
                "status":   "waiting",
                "hostUid":  host_uid,
                "players":  {
                    host_uid: {
                        "displayName": host_name,
                        "progress":    0,
                        "wpm":         0,
                        "finished":    False,
                        "rank":        0,
                    }
                },
            })
            return code
    raise RuntimeError("Could not generate a unique room code — try again.")


def get_room(code: str) -> dict | None:
    return rtdb.reference(f"/rooms/{code}").get()


def join_room(code: str, uid: str, display_name: str) -> None:
    rtdb.reference(f"/rooms/{code}/players/{uid}").set({
        "displayName": display_name,
        "progress":    0,
        "wpm":         0,
        "finished":    False,
        "rank":        0,
    })


def start_race(code: str, duration: int = 120) -> None:
    rtdb.reference(f"/rooms/{code}").update({
        "status":   "racing",
        "duration": duration,
    })


def finish_player(code: str, uid: str, wpm: int) -> int:
    """Mark player finished, assign rank, return rank."""
    players = rtdb.reference(f"/rooms/{code}/players").get() or {}
    rank    = sum(1 for p in players.values() if p.get("finished")) + 1

    rtdb.reference(f"/rooms/{code}/players/{uid}").update({
        "finished": True,
        "rank":     rank,
        "wpm":      wpm,
    })

    if rank >= len(players):
        rtdb.reference(f"/rooms/{code}").update({"status": "finished"})

    return rank


def reset_room(code: str, new_sentence: str) -> None:
    """Reset a finished room back to waiting for another round."""
    players = rtdb.reference(f"/rooms/{code}/players").get() or {}
    for uid in players:
        rtdb.reference(f"/rooms/{code}/players/{uid}").update({
            "progress": 0,
            "wpm":      0,
            "finished": False,
            "rank":     0,
            "ready":    False,
        })
    rtdb.reference(f"/rooms/{code}").update({
        "status":   "waiting",
        "sentence": new_sentence,
    })


def leave_room(code: str, uid: str) -> None:
    rtdb.reference(f"/rooms/{code}/players/{uid}").delete()
    players = rtdb.reference(f"/rooms/{code}/players").get()
    if not players:
        rtdb.reference(f"/rooms/{code}").delete()
    elif rtdb.reference(f"/rooms/{code}/hostUid").get() == uid:
        new_host = next(iter(players))
        rtdb.reference(f"/rooms/{code}/hostUid").set(new_host)
