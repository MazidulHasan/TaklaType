# TaklaType - Project Memory

Banglish typing game with real-time multiplayer. ~5,500 LOC total.

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (ES Modules, no bundler). Firebase SDK v10.12.0 from CDN.
- **Backend**: Python 3.11 + FastAPI + Uvicorn (~785 lines)
- **Auth**: Firebase Authentication (Google Sign-In + Email/Password)
- **Realtime**: Firebase Realtime Database (RTDB) for live multiplayer sync
- **Persistent DB**: Firestore for race stats & leaderboard
- **Deployment**: Render.com (backend serves frontend as static files)
- **Styling**: Custom CSS variables, 5 themes (Dark, Ocean, Forest, Sunset, Light)

## Project Structure
All source lives under `type-racer/`:
- `backend/main.py` (460L) - FastAPI app, all endpoints, static serving
- `backend/room_manager.py` (120L) - RTDB room lifecycle
- `backend/sentence_loader.py` (101L) - Sentence loading & pending queue
- `backend/firebase_admin_init.py` (44L) - Firebase Admin SDK singleton
- `backend/auth_middleware.py` (18L) - Token verification
- `backend/config.py` (13L) - Env vars
- `backend/typing_utils.py` (29L) - WPM/accuracy helpers
- `frontend/script.js` (701L) - Core typing game engine
- `frontend/multiplayer.js` (807L) - Full multiplayer logic
- `frontend/auth.js` (162L) - Firebase Auth UI
- `frontend/style.css` (1801L) - All styles + themes
- `frontend/index.html` (600+L) - Single-page app
- `frontend/firebase-config.js` (46L) - Firebase SDK init
- `frontend/leaderboard.js` (59L) - Top 10 leaderboard
- `frontend/toast.js` (17L) - Toast notifications
- `frontend/admin.html` (500+L) - Admin dashboard
- `data/sentences.json` (128L) - Banglish sentences (5 categories + pending)

## Architecture
- Frontend-backend via REST. RTDB for real-time multiplayer sync.
- `window.__tt` global bridges `script.js` <-> `multiplayer.js` (no circular imports).
- Custom events: `tt-progress` and `tt-finished` dispatched by script.js, listened by multiplayer.js.
- FastAPI is the "trusted authority" - clients can only write their own RTDB progress (throttled 300ms).
- Ranks, room status, race results handled server-side only.
- Graceful degradation: if Firebase not configured, solo mode still works.

## Key Patterns
- Settings persisted in localStorage (sound, timer, particles, fontSize, theme, `taklatype-lang`)
- 7 particle styles: off, sparkle, fire, ash, snow, stars, bubbles
- Sentence categories: general, office, food, motivation, love
- 1-5 sentence lines per race
- Room codes: 6-char alphanumeric, rooms auto-cleaned after 2hrs
- Admin emails hardcoded in `main.py`
- **Language toggle**: BN (Banglish) / EN (English) — `lang` param on `/get-sentences`, `/create-room`, `/reset-room`. English sentences in `data/sentences_en.json`
- **Guest play**: Uses Firebase Custom Tokens minted by `POST /anon/token` (Admin SDK `create_custom_token`). Guest UID = `anon_<uuid>`. Does NOT require Anonymous Auth enabled in Firebase console. Name/color derived from UID hash. localStorage keys: `anon-session-id`, `anon-display-name`, `anon-uid`
- **Auth ready signal**: `waitForAuthReady` promise exported from `auth.js` — resolves on first `onAuthStateChanged` fire. Used in URL auto-join to avoid showing guest prompt to already-signed-in users
- Player avatars: colored circles, color from `_uidToColor(uid)` → 12-color ANON_COLORS palette in `multiplayer.js`
- **Multiplayer dropdown**: Single trigger button `#mp-dropdown-trigger` opens menu with 3 options: `#mp-btn` (signed-in), `#anon-play-btn` (guest), `#btn-custom-race` (Custom Text)
- **Solo Custom Text**: `#btn-solo-custom` opens a modal overlay. On submit, sets `sentencesArray`/`targetSentence` directly and calls `initRound()` — bypasses API fetch entirely
- Guest users blocked from `#mp-btn` (regular Multiplayer) — shown toast to use "Play as Guest" instead

## Multiplayer Flow
1. **Host creates room** -> POST /create-room -> RTDB room in "waiting" status
2. **Guests join** -> POST /join-room/{code} -> added to RTDB players
3. **Host starts** -> POST /start-race/{code} -> status="racing", 3-2-1 countdown
4. **During race** -> clients write progress to RTDB every 300ms, listeners update UI
5. **Player finishes** -> POST /finish-player/{code} -> server assigns rank
6. **Results** -> host can "Play Again" via POST /reset-room/{code}

## RTDB Room Schema
```json
{
  "rooms/{CODE}": {
    "sentence": "...", "status": "waiting|racing|finished",
    "hostUid": "uid", "duration": 120, "createdAt": ts, "startedAt": ts,
    "wantsRematch": { "{uid}": { "displayName", "photoURL" } },
    "players/{uid}": {
      "displayName", "photoURL", "progress": 0-100,
      "wpm": 0, "finished": false, "rank": 0, "ready": true
    }
  }
}
```

## API Endpoints
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/get-sentence?lang=bn` | No | Random sentence |
| GET | `/get-sentences?count=N&category=X&lang=bn` | No | N sentences joined |
| GET | `/categories` | No | List categories |
| POST | `/anon/token` | No (X-Anon-Id header) | Mint custom Firebase token for guest |
| POST | `/add-sentence` | Yes | Submit for review |
| POST | `/save-result` | Yes | Save race stats to Firestore |
| POST | `/create-room?lang=bn&display_name=X` | Yes | Create multiplayer room |
| POST | `/join-room/{code}?display_name=X` | Yes | Join room |
| POST | `/start-race/{code}` | Yes | Start race (host only) |
| POST | `/finish-player/{code}` | Yes | Finish + get rank |
| POST | `/reset-room/{code}?lang=bn` | Yes | Rematch (host only) |
| DELETE | `/leave-room/{code}` | Yes | Leave room |
| GET | `/admin-data` | Admin | Dashboard |
| POST | `/approve-sentence/{idx}` | Admin | Approve pending |
| DELETE | `/reject-sentence/{idx}` | Admin | Reject pending |
| DELETE | `/admin/delete-room/{code}` | Admin | Force-delete room |

## Security Model
- Firebase Auth tokens in `Authorization: Bearer <token>` header
- Backend verifies with `firebase_admin.auth.verify_id_token()`
- RTDB rules: players can only write to `/rooms/{code}/players/{own_uid}`
- Firestore: stats read-only by owner, backend-only writes
- Admin: hardcoded email list in main.py

## Frontend Module Communication
- `script.js` dispatches `tt-progress` (progress %) and `tt-finished` (results) events
- `multiplayer.js` listens to these and writes to RTDB / calls finish endpoint
- Bridge object `window.__tt` has: `setMultiplayer(bool)`, `startRound(sentence)`
- No circular imports between modules

## CSS Theme System
5 themes via CSS variables: `--bg`, `--surface`, `--text`, `--accent`, `--correct`, `--wrong`, `--cursor-clr`
Smooth 0.3s transition on theme change. Theme stored in localStorage.

## Deployment
- Render.com: `render.yaml` in type-racer/
- Env vars: `FIREBASE_DATABASE_URL`, `FIREBASE_CREDENTIALS_JSON` (or `_PATH`)
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Docker available (python:3.12-slim)
- Backend serves frontend from `frontend/` as static files via FastAPI `StaticFiles`
