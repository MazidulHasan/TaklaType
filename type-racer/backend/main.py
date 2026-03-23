"""
main.py
FastAPI backend for TaklaType – Phase 2 (Firebase auth + stats).
"""

from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.sentence_loader import load_sentences, get_random_sentence, get_random_sentences

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="TaklaType API", version="1.0.0")

# Allow the frontend to call the API when opened directly in a browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# Serve frontend static files
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/", include_in_schema=False)
def serve_index():
    """Serve the frontend index page at the root URL."""
    return FileResponse(FRONTEND_DIR / "index.html")


@app.on_event("startup")
def startup_event() -> None:
    """Load sentences once when the server starts."""
    try:
        load_sentences()
        print("[OK] Sentences loaded successfully.")
    except FileNotFoundError as exc:
        print(f"[WARN] {exc}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Return a minimal SVG favicon so browsers stop logging 404s."""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<rect width="32" height="32" rx="7" fill="#0f0f13"/>'
        '<text x="16" y="23" text-anchor="middle" font-size="20" '
        'font-weight="bold" fill="#e2b714" font-family="monospace">T</text>'
        '</svg>'
    )
    return Response(content=svg, media_type="image/svg+xml")


@app.get("/health")
def health_check():
    """Simple health-check endpoint."""
    return {"status": "running"}


@app.get("/get-sentence")
def get_sentence():
    """Return a single random Banglish sentence (legacy endpoint)."""
    try:
        return {"sentence": get_random_sentence()}
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Sentence file not found"})


@app.get("/get-sentences")
def get_sentences(count: int = Query(default=1, ge=1, le=5)):
    """Return `count` unique random sentences joined as one race target."""
    try:
        sentences = get_random_sentences(count)
        return {"sentence": " ".join(sentences), "sentences": sentences, "count": count}
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Sentence file not found"})


# ---------------------------------------------------------------------------
# Phase 2 – Auth & Stats
# ---------------------------------------------------------------------------

class RaceResult(BaseModel):
    wpm: int = 0
    accuracy: int = 100
    errors: int = 0
    time: float = 0.0


# ---------------------------------------------------------------------------
# Shared auth helper
# ---------------------------------------------------------------------------

def _verify_auth(authorization: str) -> dict | None:
    try:
        from backend.auth_middleware import verify_token
    except ImportError:
        return None
    token = authorization.removeprefix("Bearer ").strip()
    return verify_token(token) if token else None


@app.post("/save-result")
def save_result(
    result: RaceResult,
    authorization: str = Header(default=""),
):
    """Save a race result to Firestore and update the leaderboard."""
    # Lazy-import so the app still starts when Firebase is not configured.
    try:
        from backend.auth_middleware import verify_token
        from backend.firebase_admin_init import get_firebase_app
        from firebase_admin import firestore as fs
    except ImportError:
        return JSONResponse(status_code=503, content={"error": "Firebase not installed"})

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return JSONResponse(status_code=401, content={"error": "No token provided"})

    user = verify_token(token)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Invalid or expired token"})

    app = get_firebase_app()
    if app is None:
        return JSONResponse(status_code=503, content={"error": "Firebase not configured on server"})

    db  = fs.client()
    uid = user["uid"]
    now = datetime.now(timezone.utc)

    # Save individual race stat
    db.collection("stats").add({
        "uid":       uid,
        "wpm":       result.wpm,
        "accuracy":  result.accuracy,
        "errors":    result.errors,
        "time":      result.time,
        "timestamp": now,
    })

    # Update leaderboard (personal best only)
    lb_ref = db.collection("leaderboard").document(uid)
    lb_doc = lb_ref.get()
    if not lb_doc.exists or (lb_doc.to_dict() or {}).get("wpm", 0) < result.wpm:
        lb_ref.set({
            "uid":         uid,
            "wpm":         result.wpm,
            "accuracy":    result.accuracy,
            "displayName": user.get("name", "Anonymous"),
            "photoURL":    user.get("picture", ""),
            "timestamp":   now,
        })

    return {"saved": True}


# ---------------------------------------------------------------------------
# Phase 2B – Multiplayer rooms
# ---------------------------------------------------------------------------

def _rtdb_ready() -> bool:
    from backend.firebase_admin_init import get_firebase_app
    return get_firebase_app() is not None


@app.post("/create-room")
def create_room_endpoint(
    authorization: str = Header(default=""),
    count: int = Query(default=1, ge=1, le=5),
):
    """Create a multiplayer room and return its code + sentence."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})

    from backend.room_manager import create_room
    sentence = " ".join(get_random_sentences(count))
    try:
        code = create_room(user["uid"], user.get("name", "Anonymous"), sentence)
        return {"code": code, "sentence": sentence}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.post("/join-room/{code}")
def join_room_endpoint(code: str, authorization: str = Header(default="")):
    """Join an existing room that is still waiting."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})

    from backend.room_manager import get_room, join_room
    room = get_room(code.upper())
    if not room:
        return JSONResponse(status_code=404, content={"error": "Room not found"})
    if room.get("status") not in ("waiting",):
        return JSONResponse(status_code=409, content={"error": "Race already started"})

    join_room(code.upper(), user["uid"], user.get("name", "Anonymous"))
    return {"sentence": room["sentence"], "hostUid": room["hostUid"]}


@app.post("/start-race/{code}")
def start_race_endpoint(code: str, authorization: str = Header(default="")):
    """Host starts the race — changes room status to 'racing'."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})

    from backend.room_manager import get_room, start_race
    room = get_room(code.upper())
    if not room:
        return JSONResponse(status_code=404, content={"error": "Room not found"})
    if room.get("hostUid") != user["uid"]:
        return JSONResponse(status_code=403, content={"error": "Only the host can start the race"})

    start_race(code.upper(), duration=120)
    return {"ok": True}


@app.post("/finish-player/{code}")
def finish_player_endpoint(code: str, result: RaceResult, authorization: str = Header(default="")):
    """Mark the current user as finished and return their rank."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})

    from backend.room_manager import finish_player
    rank = finish_player(code.upper(), user["uid"], result.wpm)
    return {"rank": rank}


@app.post("/reset-room/{code}")
def reset_room_endpoint(code: str, authorization: str = Header(default="")):
    """Host resets a finished room back to waiting for another round."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})

    from backend.room_manager import get_room, reset_room
    room = get_room(code.upper())
    if not room:
        return JSONResponse(status_code=404, content={"error": "Room not found"})
    if room.get("hostUid") != user["uid"]:
        return JSONResponse(status_code=403, content={"error": "Only the host can reset the room"})

    sentence = " ".join(get_random_sentences(1))
    reset_room(code.upper(), sentence)
    return {"ok": True, "sentence": sentence}


@app.delete("/leave-room/{code}")
def leave_room_endpoint(code: str, authorization: str = Header(default="")):
    """Remove the current user from the room."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})

    from backend.room_manager import leave_room
    leave_room(code.upper(), user["uid"])
    return {"ok": True}
