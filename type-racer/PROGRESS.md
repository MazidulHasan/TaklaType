# TaklaType – Project Progress & Handoff Document

> **Last updated:** March 2026
> **Project:** Banglish Office Type Racer
> **Firebase Project ID:** `taklatype`
> **Firebase RTDB URL:** `https://taklatype-default-rtdb.firebaseio.com`
claude --resume 2a8b931b-93ef-4473-92e8-1645a02db831
---

## Table of Contents

1. [What Is This Project](#1-what-is-this-project)
2. [Tech Stack](#2-tech-stack)
3. [File Structure](#3-file-structure)
4. [What Has Been Built](#4-what-has-been-built)
5. [How to Run Locally](#5-how-to-run-locally)
6. [Firebase Setup (Already Done)](#6-firebase-setup-already-done)
7. [Deploying to Firebase Hosting + Render](#7-deploying-to-firebase-hosting--render)
8. [Testing Checklist](#8-testing-checklist)
9. [Known Bugs & Edge Cases to Watch](#9-known-bugs--edge-cases-to-watch)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. What Is This Project

**TaklaType** is a real-time multiplayer typing race game built around **Banglish** sentences — Bangla words written in English phonetic letters (e.g., "Ami tomake bhalobashi"). It was designed for office fun, allowing colleagues to race each other live with room codes and share links.

The name "Takla" is a joke reference to the game's creator/commissioner.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML + CSS + JavaScript (ES Modules, no bundler) |
| **Backend** | Python 3.11+, FastAPI, Uvicorn |
| **Auth** | Firebase Authentication (Google + Email/Password) |
| **Database** | Firebase Firestore (stats + leaderboard) |
| **Realtime** | Firebase Realtime Database (RTDB) — multiplayer room state |
| **Admin SDK** | `firebase-admin` Python package |
| **Config** | `python-dotenv` for `.env` loading |
| **Firebase JS SDK** | v10.12.0 loaded from CDN (`gstatic.com`) — no npm |

---

## 3. File Structure

```
type-racer/
├── .env                          # Secret config (NOT in git)
├── .env.example                  # Template for .env
├── .gitignore                    # Ignores .env, service account, __pycache__, .venv
├── firebase-service-account.json # Firebase Admin credentials (NOT in git)
├── firestore.rules               # Firestore security rules (deploy to Firebase)
├── database.rules.json           # RTDB security rules (deploy to Firebase)
├── requirements.txt              # Python dependencies
├── README.md                     # Basic readme
├── PROGRESS.md                   # This file
│
├── backend/
│   ├── __init__.py
│   ├── main.py                   # FastAPI app — all HTTP endpoints
│   ├── config.py                 # Loads .env variables
│   ├── firebase_admin_init.py    # Firebase Admin SDK singleton
│   ├── auth_middleware.py        # Verifies Firebase ID tokens
│   ├── room_manager.py           # Multiplayer room lifecycle (RTDB)
│   ├── sentence_loader.py        # Loads + randomly picks sentences
│   └── typing_utils.py           # Typing utility helpers
│
├── data/
│   └── sentences.txt             # All Banglish sentences (one per line)
│
└── frontend/
    ├── index.html                # Single-page app shell
    ├── style.css                 # All styles + themes
    ├── script.js                 # Core typing game logic (ES module)
    ├── auth.js                   # Firebase Auth (Google + email/password)
    ├── firebase-config.js        # Firebase JS SDK init + exports
    ├── leaderboard.js            # Leaderboard panel (Firestore listener)
    └── multiplayer.js            # Full multiplayer logic (RTDB)
```

---

## 4. What Has Been Built

### Phase 1 — Core Typing Game (Complete)

- Sentence display with character-by-character highlighting (correct = green, wrong = red)
- Cursor tracking and live WPM + accuracy + error count stats
- Timer (MM:SS format) that starts on first keypress
- Progress bar tracking completion percentage
- **Line selector** (1–5 lines): fetches that many unique sentences joined into one race target
- Sentence boundaries tracked so backspace cannot erase across sentence joins
- Result modal shown on completion with WPM, accuracy, errors, time
- Confetti animation on finish
- Keystroke particle effects (toggleable)
- Sound effects (toggleable)
- New Race button restarts with a fresh sentence
- Keyboard capture via hidden `<input>` — works on any click anywhere in the sentence container
- Focus hint overlay ("Click here to start typing") dismissed on first click
- Rollup number animation in result modal

### Phase 1 — Settings & Themes (Complete)

- **5 themes:** Dark (default), Ocean, Forest, Sunset, Light — stored in `localStorage`
- **3 font sizes:** Small / Medium / Large — stored in `localStorage`
- **Toggles:** Sound effects, Show timer, Keystroke particles — stored in `localStorage`
- Settings dropdown in header (gear icon)
- Settings persist across page reloads

### Phase 2A — Firebase Auth + Leaderboard (Complete)

- **Auth modal** with:
  - Google Sign-In (OAuth popup)
  - Email + Password (sign in / sign up toggle)
  - Error messages shown inline
- **User panel** in header when signed in: avatar, display name, sign-out button
- **Score saving:** on race finish, if signed in, calls `POST /save-result` → saves to Firestore `stats` collection and updates personal best in `leaderboard` collection
- **Leaderboard panel** (collapsible, header icon):
  - Top 10 racers by WPM
  - Shows rank, name, WPM, accuracy
  - Live Firestore listener (updates in real time)
  - Hidden if Firebase not configured
- Auth state persisted across page reloads (Firebase handles this)

### Phase 2B — Real-time Multiplayer (Complete)

#### Room Lifecycle

1. Host selects **Lines** (1–5) in the multiplayer lobby, clicks **+ Create Room**
2. Backend generates a 6-character room code (`POST /create-room?count=N`), creates room in RTDB
3. Host shares the code or copy-link; others join via code or `?room=CODE` URL
4. Players joining see `POST /join-room/{code}` → added to RTDB room
5. All players appear in the room lobby with READY/not-ready tags
6. **Non-hosts** click "I'm Ready" toggle → writes `ready: true` to their RTDB slot
7. **Host's "Start Race"** only activates when: ≥2 players AND all non-hosts are ready
8. Host clicks Start Race → `POST /start-race/{code}` → RTDB status = "racing", `duration: 120` stored
9. All clients see status change → 3-2-1 countdown overlay → race begins
10. During race: progress + WPM written to RTDB every 300ms (throttled)
11. Opponent progress bars shown live in race panel
12. **Race timer** counts down from 2:00 in the race panel header, turns red at <20s
13. When player finishes typing: `POST /finish-player/{code}` → assigns rank
14. If timer hits 0:00: any unfinished player auto-submits current stats to `/finish-player`
15. When all players finish (or timeout): RTDB status = "finished" → results overlay shown
16. Play Again: host calls `POST /reset-room/{code}` → resets all player states, new sentence, status = "waiting"
17. Leave Room: `DELETE /leave-room/{code}` → removes player, transfers host if needed, deletes room if empty

#### Guards & UX Protections

- **New Race button disabled** during a multiplayer race (re-enabled on leave/reset)
- **"You finished! Waiting for others…"** notice shown in race panel after player completes
- **Confirm dialog** before leaving an active race: "Leave the ongoing race? Your result won't count."
- **X button** in multiplayer modal leaves room (with confirm if race active), not just closes
- **Backdrop click** closes modal only if NOT in a room
- **Minimum 2 players** enforced before host can start
- **All non-hosts must be ready** before host can start
- **Solo result modal suppressed** during multiplayer (no duplicate result popup)
- **Race timer auto-ends** the race for idle/disconnected players

#### Backend Endpoints Summary

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Health check |
| GET | `/get-sentence` | None | Single random sentence |
| GET | `/get-sentences?count=N` | None | N joined sentences |
| POST | `/save-result` | Firebase token | Save solo race to Firestore |
| POST | `/create-room?count=N` | Firebase token | Create MP room |
| POST | `/join-room/{code}` | Firebase token | Join a waiting room |
| POST | `/start-race/{code}` | Firebase token (host) | Start the race |
| POST | `/finish-player/{code}` | Firebase token | Mark self as finished |
| POST | `/reset-room/{code}` | Firebase token (host) | Reset room for Play Again |
| DELETE | `/leave-room/{code}` | Firebase token | Leave and clean up |

#### Firestore Collections

| Collection | Document | Fields |
|---|---|---|
| `stats` | Auto-ID | `uid, wpm, accuracy, errors, time, timestamp` |
| `leaderboard` | `{uid}` | `uid, wpm, accuracy, displayName, photoURL, timestamp` |
| `users` | `{uid}` | (owner read/write, reserved for future profile data) |

#### RTDB Room Schema

```json
/rooms/{CODE} = {
  "sentence":  "ami tomake bhalobashi...",
  "status":    "waiting | racing | finished",
  "hostUid":   "firebase_uid_of_host",
  "duration":  120,
  "players": {
    "{uid}": {
      "displayName": "Rumman",
      "progress":    75,
      "wpm":         62,
      "finished":    false,
      "rank":        0,
      "ready":       true
    }
  }
}
```

---

## 5. How to Run Locally

### Prerequisites

- Python 3.11+
- A Firebase project with Auth, Firestore, and RTDB enabled (see Section 6)

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd type-racer

# 2. Create virtual environment and install dependencies
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# 3. Set up .env (copy from example and fill in)
cp .env.example .env
# Edit .env:
#   FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json
#   FIREBASE_DATABASE_URL=https://YOUR-PROJECT-default-rtdb.firebaseio.com

# 4. Place your Firebase service account JSON at:
#    ./firebase-service-account.json
#    (Download from Firebase Console → Project Settings → Service Accounts → Generate new key)

# 5. Start the backend
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 6. Open in browser
#    http://127.0.0.1:8000
```

> **Important:** Every time you change `.env`, you MUST kill and restart the backend process. Python loads `.env` once at startup — there is no hot reload for env vars.

### Killing Stale Backend Processes (Windows)

```powershell
# In PowerShell:
Get-Process python* | Stop-Process -Force
```

---

## 6. Firebase Setup (Already Done)

This section documents what was configured in the Firebase Console for the `taklatype` project. If starting from scratch on a new project, repeat these steps.

### 6.1 Firebase Console — Services Enabled

- **Authentication** → Sign-in methods enabled:
  - Google ✓
  - Email/Password ✓
- **Authentication → Settings → Authorized domains:**
  - `localhost` ✓
  - `127.0.0.1` ✓ (manually added — required for local dev)
  - `taklatype.web.app` (add when deploying)
  - `taklatype.firebaseapp.com` (add when deploying)
  - Your custom domain if any
- **Firestore Database** → Created in **production mode**
- **Realtime Database** → Created, URL: `https://taklatype-default-rtdb.firebaseio.com`

### 6.2 Security Rules

**Firestore** (`firestore.rules`):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /stats/{docId} {
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
      allow write: if false; // Admin SDK only
    }
    match /leaderboard/{uid} {
      allow read: if true;   // Public
      allow write: if false; // Admin SDK only
    }
  }
}
```

**Realtime Database** (`database.rules.json`):
```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$roomCode": {
        ".read": "auth != null",
        "players": {
          "$uid": {
            ".read":  "auth != null",
            ".write": "auth != null && auth.uid == $uid"
          }
        }
      }
    }
  }
}
```

> **Remember:** These rules must be published in the Firebase Console (or via Firebase CLI) whenever they change. The backend uses the Admin SDK which bypasses security rules entirely.

### 6.3 Firebase Project Config (Frontend)

Located in `frontend/firebase-config.js`. The config values are:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSyBNSRYsgWPfvHzR8tYYJi1UX9BH26peqxg",
  authDomain:        "taklatype.firebaseapp.com",
  projectId:         "taklatype",
  storageBucket:     "taklatype.firebasestorage.app",
  messagingSenderId: "209923553049",
  appId:             "1:209923553049:web:f0f36448ceb668ebdf7788",
  databaseURL:       "https://taklatype-default-rtdb.firebaseio.com",
};
```

> These are **not secret** — they are safe to commit and expose publicly. Firebase security is enforced by Auth + Security Rules, not by keeping these values hidden.

### 6.4 Backend Service Account

- File: `firebase-service-account.json` (in project root, **NOT committed to git**)
- Download from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
- This gives the backend Admin SDK access to Firestore + RTDB, bypassing security rules

---

## 7. Deploying to Firebase Hosting + Render

The architecture for deployment:

```
Browser  ──HTTPS──▶  Firebase Hosting  (serves index.html + static JS/CSS)
Browser  ──HTTPS──▶  Render.com        (Python FastAPI backend)
Browser  ──WSS──▶   Firebase RTDB      (real-time multiplayer, direct from browser)
```

### 7.1 Deploy Backend to Render.com

Render is a free-tier cloud platform that runs Python web services.

#### Step 1 — Create a `render.yaml` in project root

```yaml
services:
  - type: web
    name: taklatype-api
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: FIREBASE_CREDENTIALS_PATH
        value: /etc/secrets/firebase-service-account.json
      - key: FIREBASE_DATABASE_URL
        value: https://taklatype-default-rtdb.firebaseio.com
```

#### Step 2 — Add the service account as a Render Secret File

1. In Render dashboard → your service → **Environment** tab
2. Under **Secret Files**, add file path: `/etc/secrets/firebase-service-account.json`
3. Paste the entire JSON content of `firebase-service-account.json`

#### Step 3 — Deploy

1. Push your code to GitHub (make sure `.env` and `firebase-service-account.json` are in `.gitignore`)
2. Go to [render.com](https://render.com) → New → Web Service → Connect GitHub repo
3. Set:
   - **Root Directory:** (leave blank)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Add the environment variables listed above
5. Deploy

Render will give you a URL like: `https://taklatype-api.onrender.com`

> **Free tier note:** Render free web services spin down after 15 minutes of inactivity. The first request after spin-down takes ~30 seconds. Consider upgrading to the $7/month plan to avoid cold starts.

#### Step 4 — Update `API_BASE` in frontend

Once deployed, update the `API_BASE` logic in both `frontend/script.js` and `frontend/multiplayer.js`:

```javascript
const API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
  ? 'http://127.0.0.1:8000'
  : 'https://taklatype-api.onrender.com';  // ← your Render URL
```

---

### 7.2 Deploy Frontend to Firebase Hosting

Firebase Hosting serves static files (HTML, CSS, JS) globally via CDN for free.

#### Step 1 — Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

#### Step 2 — Initialize Firebase Hosting in the project

```bash
cd type-racer
firebase init hosting
```

Answer the prompts:
- **Which Firebase project?** → select `taklatype`
- **Public directory?** → `frontend`
- **Single-page app (rewrite all to index.html)?** → `No`
- **Set up automatic builds with GitHub?** → `No` (for now)

This creates `firebase.json` and `.firebaserc` in the project root.

#### Step 3 — Configure `firebase.json`

Replace the generated file with this:

```json
{
  "hosting": {
    "public": "frontend",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.js",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      }
    ]
  }
}
```

#### Step 4 — Deploy

```bash
firebase deploy --only hosting
```

Your app will be live at:
- `https://taklatype.web.app`
- `https://taklatype.firebaseapp.com`

#### Step 5 — Add deployed domains to Firebase Auth

In Firebase Console → Authentication → Settings → Authorized domains, add:
- `taklatype.web.app`
- `taklatype.firebaseapp.com`
- Any custom domain you use

#### Step 6 — Deploy Security Rules

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy RTDB rules
firebase deploy --only database
```

> **Important:** The backend FastAPI app currently also serves the frontend via `StaticFiles`. On Render, this still works fine for testing, but for production the frontend should be on Firebase Hosting and the backend on Render (they are different origins). CORS is already configured (`allow_origins=["*"]`) so this will work.

---

### 7.3 Custom Domain (Optional)

1. In Firebase Console → Hosting → Add custom domain
2. Follow the DNS verification steps
3. Add the custom domain to Firebase Auth authorized domains
4. Update `API_BASE` in frontend JS to point to the Render backend URL

---

### 7.4 Full Deployment Checklist

Before going live, do all of these:

- [ ] Backend deployed to Render with secret file set
- [ ] `API_BASE` in `script.js` and `multiplayer.js` updated to Render URL
- [ ] Frontend deployed to Firebase Hosting: `firebase deploy --only hosting`
- [ ] Firestore rules deployed: `firebase deploy --only firestore:rules`
- [ ] RTDB rules deployed: `firebase deploy --only database`
- [ ] Auth authorized domains updated (add `.web.app` and `.firebaseapp.com`)
- [ ] Test Google Sign-In on the live domain
- [ ] Test leaderboard loads on the live domain
- [ ] Test creating a multiplayer room on the live domain
- [ ] Test joining via share link on a different device/browser
- [ ] Verify CORS works (open DevTools network tab, check for CORS errors)

---

## 8. Testing Checklist

Use this checklist every time you resume work or after making changes.

### Solo Mode

- [ ] Page loads, sentence displays correctly
- [ ] Clicking the sentence area focuses the hidden input
- [ ] "Click here to start typing" hint disappears on click
- [ ] Timer starts on first keypress, does NOT start before
- [ ] Correct keystrokes shown in green, wrong in red
- [ ] Cursor advances correctly
- [ ] Backspace: corrects current word but does NOT cross sentence boundary
- [ ] WPM, Accuracy, Errors update live while typing
- [ ] Progress bar fills correctly
- [ ] Race completes when all characters are typed
- [ ] Confetti fires on completion
- [ ] Result modal shows correct WPM / accuracy / errors / time
- [ ] "New Race" starts a fresh race with a new sentence
- [ ] Line selector (1–5) fetches correct number of sentences
- [ ] Settings persist after page refresh (theme, font size, sound, timer, particles)
- [ ] All 5 themes apply correctly
- [ ] All 3 font sizes apply correctly

### Auth

- [ ] "Sign In" button opens auth modal
- [ ] Google Sign-In works (popup opens, signs in, closes modal)
- [ ] Email/Password sign in works
- [ ] "Don't have an account? Sign Up" toggle works
- [ ] After sign-in: user avatar/name shown, Sign In button hidden
- [ ] Sign-out button works
- [ ] After race finish while signed in: "Score saved!" appears in result modal
- [ ] After race finish while signed out: no save attempt, no error shown

### Leaderboard

- [ ] Leaderboard icon opens/closes the panel
- [ ] Panel shows top racers with name, WPM, accuracy
- [ ] After saving a score, it appears in the leaderboard (may need refresh)
- [ ] Leaderboard shows "No scores yet" when empty
- [ ] Leaderboard hidden if Firebase not configured

### Multiplayer

- [ ] Multiplayer button is visible (hidden if Firebase not configured)
- [ ] Clicking it while signed out shows "Please sign in" alert
- [ ] Lines selector (1–5) visible in lobby
- [ ] "+ Create Room" creates a room and shows room code
- [ ] Room code is 6 characters, uppercase
- [ ] "Copy Link" copies URL with `?room=CODE` to clipboard
- [ ] "Copied!" feedback appears, then reverts
- [ ] Second user can join via room code
- [ ] Second user can join via copied link in a new tab
- [ ] Host sees "Start Race" button (disabled initially)
- [ ] Non-host sees "I'm Ready" button and "Waiting for host to start…"
- [ ] Non-host clicking "I'm Ready" shows READY tag in player list for all players
- [ ] "Start Race" only enables after ≥2 players AND all non-hosts are READY
- [ ] 3-2-1 countdown appears for all players simultaneously (within ~1 second)
- [ ] Race begins with the correct sentence for all players
- [ ] Progress bars update in real time for all players
- [ ] Race timer counts down from 2:00
- [ ] Timer turns red below 20 seconds
- [ ] "New Race" button is disabled during multiplayer race
- [ ] After finishing: "You finished! Waiting for others…" notice appears
- [ ] After timer hits 0:00: race ends for all (results show)
- [ ] Player who finishes first gets rank #1
- [ ] DNF shown for players who timed out
- [ ] Leave Race button shows confirm dialog
- [ ] X button shows confirm dialog during active race
- [ ] Leaving room during race works (player removed from RTDB)
- [ ] Play Again resets the room for all players
- [ ] Leave Room button on results screen works
- [ ] Host leaving transfers host to another player
- [ ] Host leaving while alone deletes the room

---

## 9. Known Bugs & Edge Cases to Watch

### Multiplayer Race Timer Drift

The race timer is computed client-side using `Date.now()`. Different clients may compute slightly different deadlines if they receive the RTDB "racing" status event at different times (±1-2 seconds). For a casual game this is acceptable. To fix properly: store a server timestamp in RTDB (`firebase.database.ServerValue.TIMESTAMP`) and compute deadline from that.

### Race Timer vs Manual Finish Conflict

If a player finishes naturally at, say, 1:55, and the timer hits 0:00 5 seconds later, `finish-player` is called twice for the same user. The backend's `finish_player()` in `room_manager.py` re-counts finished players each time, which could cause rank miscalculation. The `_selfFinished` flag in `multiplayer.js` prevents the second call client-side, but this should be verified under bad network conditions.

### RTDB Security: Room Status Write

The RTDB rules only allow players to write to their own `players/{uid}` slot. Room-level fields (`status`, `sentence`, `duration`) can only be written by the Admin SDK (backend). This is correct — but it means room cleanup after a crash relies entirely on the backend. If the Render instance restarts mid-race, the room will be stuck in "racing" status until the host leaves.

### "Play Again" for Non-Host Players

When non-host players click "Play Again", they see the waiting room immediately, but the host hasn't reset the room yet. Their RTDB listener sees `status = "finished"` but `_raceStarted = false`, so the result screen doesn't re-appear (the guard works). They just wait for the host to call reset-room. This UX is slightly confusing — consider adding a "waiting for host to reset..." message.

### Google Sign-In on Mobile

Firebase Google popup auth can fail on some mobile browsers (especially Safari/iOS) due to popup blockers. The fix is to use `signInWithRedirect` instead of `signInWithPopup` for mobile. This is not yet implemented.

### Backend CORS

`allow_origins=["*"]` is set for development convenience. Before going to production, tighten this to:
```python
allow_origins=["https://taklatype.web.app", "https://taklatype.firebaseapp.com"]
```

### Render Free Tier Cold Starts

On Render's free tier, the backend sleeps after 15 minutes of inactivity. The first user to load the page after a sleep will experience a ~30 second delay. Consider showing a "warming up server…" loading indicator, or upgrading to the paid plan.

---

## 10. Future Enhancements

These are features that would make the game significantly better but haven't been built yet.

### High Priority (Core UX)

#### 10.1 Persistent Race Timer via RTDB Server Timestamp
Instead of computing the deadline client-side, store `startedAt: ServerValue.TIMESTAMP` in RTDB when the race starts, and compute the deadline as `startedAt + duration * 1000`. This makes all clients agree on exactly when the race ends, regardless of when they receive the status update.

#### 10.2 Rematch / New Sentence for Play Again
Currently "Play Again" resets the room but non-host players don't see a visual confirmation. Add a "Host is resetting the room…" spinner for non-hosts between the results screen and the room lobby re-appearing.

#### 10.3 Mobile Google Sign-In Fix
Switch from `signInWithPopup` to `signInWithRedirect` when detecting a mobile browser. Firebase handles the redirect flow automatically.

#### 10.4 Better Error Handling
- Show a toast notification instead of `alert()` for room-deleted events
- Show connection status indicator (Firebase RTDB connected / disconnected)
- Handle the case where the Render backend is cold-starting (show loading state)

#### 10.5 Room Auto-Cleanup
Add a Firebase Cloud Function (or Render scheduled task) that deletes RTDB rooms older than 2 hours. Currently, rooms stuck in "racing" (e.g., after a server restart) stay in the database forever.

---

### Medium Priority (Game Features)

#### 10.6 Spectator Mode
Allow users to join a room as a spectator (view-only, see all progress bars). Currently anyone joining becomes a player.

#### 10.7 Chat / Emojis During Race
A simple emoji reaction panel (🔥 ⌨️ 💀 😱) that players can send during the race, shown as floating bubbles above progress bars.

#### 10.8 Race History for Signed-In Users
A "My Stats" panel showing personal race history, average WPM over time, improvement graph. Data already saved in Firestore `stats` collection — just needs a frontend page.

#### 10.9 Difficulty Modes
- **Easy:** Common short Banglish phrases (fewer characters)
- **Medium:** Office sentences (current behavior)
- **Hard:** Long complex Banglish sentences with rare words

#### 10.10 Sentence Categories
Let the host pick a category: General, Office/Work, Food, Love/Poetry, IT/Tech. Each category maps to a different subset of `sentences.txt`.

#### 10.11 Room Password Protection
Optional password for private rooms so strangers can't join via brute-force room codes.

#### 10.12 Persistent Room (Tournament Mode)
Rooms that run multiple rounds automatically, tracking cumulative scores across 3/5/7 races.

---

### Low Priority (Polish)

#### 10.13 Sound Pack Selection
Different keystroke sounds (mechanical, typewriter, soft) selectable in settings.

#### 10.14 Typing Stats Breakdown
After race: show a full heatmap of which keys were hit wrong most often. (Requires tracking per-key error counts.)

#### 10.15 Custom Sentence Input
Let the host type a custom sentence for the room instead of using random sentences from the data file. Useful for specific office jokes / quotes.

#### 10.16 Player Avatars in Race Panel
Show Firebase user photo next to each player's progress bar instead of just their name.

#### 10.17 Accessibility
- Full keyboard navigation of all modals (trap focus inside open modals)
- ARIA live regions for WPM / timer updates
- High-contrast theme option

#### 10.18 Firebase Hosting + Cloud Functions for Backend
Replace the Render Python backend entirely with Firebase Cloud Functions (Node.js or Python). This would:
- Eliminate the cold start problem
- Keep everything on one platform (Firebase)
- Simplify deployment to a single `firebase deploy`

The main complexity is rewriting the FastAPI endpoints as Cloud Functions HTTP handlers.

#### 10.19 Progressive Web App (PWA)
Add a `manifest.json` and service worker so the app can be installed on mobile home screens. No native app required.

#### 10.20 Admin Dashboard
A protected `/admin` page (visible only to certain Firebase UIDs) showing:
- All active rooms
- Total races played
- Total users
- Most popular sentences

---

## Appendix A — Environment Variables Reference

| Variable | Required | Example | Description |
|---|---|---|---|
| `FIREBASE_CREDENTIALS_PATH` | Yes | `./firebase-service-account.json` | Path to Firebase Admin service account JSON |
| `FIREBASE_DATABASE_URL` | Yes | `https://taklatype-default-rtdb.firebaseio.com` | Firebase RTDB URL |

---

## Appendix B — Key Architectural Decisions

### Why FastAPI + Firebase instead of a single Firebase-only solution?
Firebase alone (client SDK) cannot safely enforce room creation rules, rank assignment, or sentence selection without a trusted server. Any client could cheat by manipulating RTDB directly. The FastAPI backend acts as a trusted authority that clients cannot spoof.

### Why ES Modules without a bundler?
No build step = no npm = no webpack/vite = no `node_modules`. The app loads Firebase directly from CDN. This keeps the project simple and deployable from any static host without a build process.

### Why is the Firebase JS SDK on CDN instead of npm?
Same reason as above — no bundler. The CDN approach works identically and is just as fast (Firebase CDN is globally distributed).

### Why does the backend also serve the frontend via StaticFiles?
For local development convenience — one command (`uvicorn`) serves everything. In production, Firebase Hosting takes over serving the frontend, and the backend only serves API endpoints.

### Why is `window.__tt` used between `script.js` and `multiplayer.js`?
ES modules cannot have circular imports. `multiplayer.js` needs to call into `script.js` (to inject a sentence) and `script.js` needs to call into `multiplayer.js` (to report progress/finish). The `window.__tt` object + custom events (`tt-progress`, `tt-finished`) solves this without circular dependency: `script.js` defines the interface, `multiplayer.js` calls it and listens for events.
