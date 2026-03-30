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

from backend.sentence_loader import (
    load_sentences, get_random_sentence, get_random_sentences,
    add_to_pending, get_pending, approve_sentence, reject_sentence, CATEGORIES,
)

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


@app.get("/admin")
def serve_admin():
    """Serve the admin dashboard page."""
    return FileResponse(FRONTEND_DIR / "admin.html")


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


ADMIN_EMAILS: set[str] = {"md.mazidulhasan1@gmail.com", "mhrclashofclans300@gmail.com"}


@app.get("/admin-data")
def admin_data(authorization: str = Header(default="")):
    """Return admin dashboard data — active rooms, leaderboard, race count."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if user.get("email") not in ADMIN_EMAILS:
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    result: dict = {"rooms": [], "leaderboard": [], "total_races": 0, "pending": []}

    try:
        result["pending"] = get_pending()
    except Exception as exc:
        print(f"[WARN] get_pending failed: {exc}")

    # Active RTDB rooms
    try:
        if _rtdb_ready():
            from firebase_admin import db as rtdb
            rooms = rtdb.reference("/rooms").get() or {}
            result["rooms"] = [
                {
                    "code":      code,
                    "status":    r.get("status"),
                    "players":   [
                        {"name": p.get("displayName", "?"), "finished": p.get("finished", False)}
                        for p in (r.get("players") or {}).values()
                    ],
                    "createdAt": r.get("createdAt", 0),
                }
                for code, r in rooms.items() if isinstance(r, dict)
            ]
    except Exception as exc:
        print(f"[WARN] RTDB rooms fetch failed: {exc}")

    # Firestore leaderboard + race count
    try:
        app_fb = _get_firebase_app_safe()
        if app_fb:
            from firebase_admin import firestore
            db_fs = firestore.client(app=app_fb)
            lb = db_fs.collection("leaderboard").order_by("wpm", direction="DESCENDING").limit(10).get()
            result["leaderboard"] = [
                {"name": d.get("displayName"), "wpm": d.get("wpm"), "uid": d.id}
                for d in [x.to_dict() for x in lb]
            ]
            try:
                result["total_races"] = db_fs.collection("stats").count().get()[0][0].value
            except Exception:
                result["total_races"] = len(db_fs.collection("races").get())
    except Exception as exc:
        print(f"[WARN] Firestore fetch failed: {exc}")

    return result


def _rtdb_ready() -> bool:
    from backend.firebase_admin_init import get_firebase_app
    return get_firebase_app() is not None


def _get_firebase_app_safe():
    try:
        from backend.firebase_admin_init import get_firebase_app
        return get_firebase_app()
    except Exception:
        return None


@app.get("/health")
def health_check():
    """Simple health-check endpoint."""
    return {"status": "running"}


@app.get("/get-sentence")
def get_sentence(category: str = Query(default="general"), lang: str = Query(default="bn")):
    """Return a single random sentence (Banglish or English based on lang)."""
    try:
        return {"sentence": get_random_sentence(category, lang)}
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Sentence file not found"})


@app.get("/get-sentences")
def get_sentences(
    count: int = Query(default=1, ge=1, le=5),
    category: str = Query(default="general"),
    lang: str = Query(default="bn"),
):
    """Return `count` unique random sentences joined as one race target."""
    try:
        sentences = get_random_sentences(count, category, lang)
        return {"sentence": " ".join(sentences), "sentences": sentences, "count": count, "category": category, "lang": lang}
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Sentence file not found"})


@app.get("/categories")
def list_categories():
    """Return the list of available sentence categories."""
    return {"categories": list(CATEGORIES.keys())}


class AddSentenceBody(BaseModel):
    sentence: str
    category: str = "general"


@app.post("/add-sentence")
def add_sentence_endpoint(body: AddSentenceBody, authorization: str = Header(default="")):
    """Submit a sentence for admin review (goes into pending queue)."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    sentence = body.sentence.strip()
    if not sentence or len(sentence) < 5:
        return JSONResponse(status_code=400, content={"error": "Sentence too short"})
    if len(sentence) > 300:
        return JSONResponse(status_code=400, content={"error": "Sentence too long (max 300 chars)"})
    try:
        add_to_pending(sentence, body.category, submitted_by=user.get("uid", ""))
        return {"ok": True, "pending": True, "sentence": sentence, "category": body.category}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.post("/approve-sentence/{index}")
def approve_sentence_endpoint(index: int, authorization: str = Header(default="")):
    """Admin: approve a pending sentence and add it to the pool."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if user.get("email") not in ADMIN_EMAILS:
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    try:
        entry = approve_sentence(index)
        return {"ok": True, "approved": entry}
    except IndexError:
        return JSONResponse(status_code=404, content={"error": "Invalid index"})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.delete("/reject-sentence/{index}")
def reject_sentence_endpoint(index: int, authorization: str = Header(default="")):
    """Admin: reject and remove a pending sentence."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if user.get("email") not in ADMIN_EMAILS:
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    try:
        entry = reject_sentence(index)
        return {"ok": True, "rejected": entry}
    except IndexError:
        return JSONResponse(status_code=404, content={"error": "Invalid index"})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


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

class CreateRoomBody(BaseModel):
    custom_sentence: str = ""


@app.post("/create-room")
def create_room_endpoint(
    body: CreateRoomBody = CreateRoomBody(),
    authorization: str = Header(default=""),
    count: int = Query(default=1, ge=1, le=5),
    category: str = Query(default="general"),
    lang: str = Query(default="bn"),
    display_name: str = Query(default=""),
):
    """Create a multiplayer room and return its code + sentence."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})

    from backend.room_manager import create_room
    sentence = body.custom_sentence.strip() if body.custom_sentence.strip() else \
               " ".join(get_random_sentences(count, category, lang))
    player_name = display_name.strip() or user.get("name") or "Anonymous"
    try:
        code = create_room(user["uid"], player_name, sentence,
                           photo_url=user.get("picture", ""))
        return {"code": code, "sentence": sentence}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.post("/join-room/{code}")
def join_room_endpoint(
    code: str,
    authorization: str = Header(default=""),
    display_name: str = Query(default=""),
):
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

    player_name = display_name.strip() or user.get("name") or "Anonymous"
    join_room(code.upper(), user["uid"], player_name, photo_url=user.get("picture", ""))
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


class ResetRoomBody(BaseModel):
    custom_sentence: str = ""


@app.post("/reset-room/{code}")
def reset_room_endpoint(
    code: str,
    body: ResetRoomBody = ResetRoomBody(),
    count: int = 1,
    category: str = "general",
    lang: str = Query(default="bn"),
    authorization: str = Header(default=""),
):
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

    sentence = body.custom_sentence.strip() if body.custom_sentence.strip() else \
               " ".join(get_random_sentences(max(1, count), category, lang))
    reset_room(code.upper(), sentence)
    return {"ok": True, "sentence": sentence}


@app.delete("/admin/delete-room/{code}")
def admin_delete_room(code: str, authorization: str = Header(default="")):
    """Admin: force-delete a room from RTDB."""
    user = _verify_auth(authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if user.get("email") not in ADMIN_EMAILS:
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    if not _rtdb_ready():
        return JSONResponse(status_code=503, content={"error": "Firebase not configured"})
    try:
        from firebase_admin import db as rtdb
        rtdb.reference(f"/rooms/{code.upper()}").delete()
        return {"ok": True}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


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


# ---------------------------------------------------------------------------
# Anonymous / Guest play — custom token auth (no Anonymous Auth required)
# ---------------------------------------------------------------------------

@app.post("/anon/token")
def get_anon_token(x_anon_id: str = Header(default="")):
    """
    Mint a Firebase custom auth token for an anonymous/guest player.
    The client uses this with signInWithCustomToken() so all Firebase
    operations (RTDB reads/writes, etc.) work without enabling Anonymous Auth.
    """
    if not x_anon_id or len(x_anon_id) < 8:
        return JSONResponse(status_code=400, content={"error": "Invalid anon ID"})
    try:
        from backend.firebase_admin_init import get_firebase_app
        from firebase_admin import auth as fb_auth
        app = get_firebase_app()
        if app is None:
            return JSONResponse(status_code=503, content={"error": "Firebase not configured"})
        # Prefix with "anon_" so guest UIDs are clearly distinguishable from real ones.
        # Truncate to 128 chars (Firebase UID limit).
        uid = f"anon_{x_anon_id[:36]}"
        token_bytes = fb_auth.create_custom_token(uid, app=app)
        return {"token": token_bytes.decode("utf-8")}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"error": str(exc)})
