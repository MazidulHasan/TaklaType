# TaklaType — Technical Reference

> For the project overview and showcase, see the [root README](../README.md).

---

## Table of Contents

1. [Local Setup](#1-local-setup)
2. [Environment Variables](#2-environment-variables)
3. [Firebase Setup](#3-firebase-setup)
4. [Deployment (Render)](#4-deployment-render)
5. [API Reference](#5-api-reference)
6. [File Structure](#6-file-structure)
7. [Architecture Notes](#7-architecture-notes)

---

## 1. Local Setup

### Prerequisites

- Python 3.11+
- A Firebase project (optional — see note below)

### Steps

```bash
# From repo root:
cd type-racer

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Firebase credentials (see Section 2)

# Start the dev server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# Open in browser: http://127.0.0.1:8000
```

> **Firebase is optional for local development.** Without it, the core typing game works fully. Auth, leaderboard, score saving, and multiplayer will be hidden/disabled automatically.

### Kill stale backend processes (Windows)

```powershell
Get-Process python* | Stop-Process -Force
```

---

## 2. Environment Variables

The `.env` file is **required** for auth, multiplayer, leaderboard, and score saving to work. Without it the backend cannot connect to Firebase and all authenticated endpoints will return `401 Unauthorized`.

```bash
# From type-racer/
cp .env.example .env
```

Then edit `.env` with your actual values:

```env
FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json
FIREBASE_DATABASE_URL=https://taklatype-default-rtdb.firebaseio.com
```

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_CREDENTIALS_PATH` | Yes (local dev) | Path to `firebase-service-account.json` — typically `./firebase-service-account.json` |
| `FIREBASE_CREDENTIALS_JSON` | Yes (cloud deploy) | Full JSON content of the service account as a string (used on Render) |
| `FIREBASE_DATABASE_URL` | Yes | Realtime Database URL — `https://taklatype-default-rtdb.firebaseio.com` |

> **Note:** `FIREBASE_CREDENTIALS_JSON` takes priority over `FIREBASE_CREDENTIALS_PATH` if both are set. Use the JSON env var for cloud deployments where file paths are unreliable.
>
> **Important:** If the `.env` file is missing or has placeholder values, the backend will start but Firebase Admin SDK won't initialize — auth, multiplayer, leaderboard, and score saving will all fail with `401 Unauthorized`. The solo typing game will still work.

---

## 3. Firebase Setup

### Services to enable in Firebase Console

- **Authentication** → Sign-in methods: Google, Email/Password
- **Authentication → Settings → Authorized domains**: add `localhost`, `127.0.0.1`, and your production domain
- **Firestore Database** → Create in production mode
- **Realtime Database** → Create, note the URL

### Service Account (`firebase-service-account.json`)

This file authenticates the backend (FastAPI) with Firebase Admin SDK. It is **gitignored** and must never be committed.

**How to get it:**
1. Go to **Firebase Console** → **Project Settings** → **Service Accounts**
2. Click **Generate New Private Key** → downloads a JSON file
3. Rename it to `firebase-service-account.json` and place it in `type-racer/`

**What it contains:**

| Field | Value (for project `taklatype`) |
|---|---|
| `type` | `service_account` |
| `project_id` | `taklatype` |
| `client_email` | `firebase-adminsdk-fbsvc@taklatype.iam.gserviceaccount.com` |
| `client_id` | `101666753397617564112` |
| `auth_uri` | `https://accounts.google.com/o/oauth2/auth` |
| `token_uri` | `https://oauth2.googleapis.com/token` |
| `private_key_id` | *(unique per key — regenerate if compromised)* |
| `private_key` | *(RSA private key — NEVER share or commit this)* |

**How it's used:**
- The backend loads it via `FIREBASE_CREDENTIALS_PATH` env var (local) or `FIREBASE_CREDENTIALS_JSON` env var (Render deployment)
- It grants the backend Admin SDK access to Firestore (save stats, leaderboard), Realtime Database (room management), and Auth (token verification)
- RTDB security rules are bypassed by Admin SDK — this is how the backend creates rooms and assigns ranks without client-writable paths

### Firebase CLI Setup

The Firebase CLI is used to deploy security rules (Firestore + Realtime Database). The project includes `firebase.json` and `.firebaserc` pre-configured for the `taklatype` project.

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Authenticate with your Google account (opens browser)
firebase login

# Verify the project is linked
cd type-racer
firebase projects:list
```

### Deploy Security Rules

After authenticating, deploy the security rules with:

```bash
cd type-racer

# Deploy both Firestore and RTDB rules
firebase deploy --only firestore:rules,database

# Or deploy them individually
firebase deploy --only firestore:rules
firebase deploy --only database
```

The rule files are:
- `firestore.rules` — Firestore security rules
- `database.rules.json` — Realtime Database security rules

**Firestore** (`firestore.rules`):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stats/{docId} {
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
      allow write: if false;
    }
    match /leaderboard/{uid} {
      allow read: if true;
      allow write: if false;
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

---

## 4. Deployment (Render)

The app is deployed as a single Python web service on [Render.com](https://render.com) — the FastAPI backend serves both the API and the frontend static files.

### Environment setup on Render

Add these in the Render dashboard → Environment tab:

| Key | Value |
|---|---|
| `FIREBASE_CREDENTIALS_JSON` | Paste the entire contents of `firebase-service-account.json` |
| `FIREBASE_DATABASE_URL` | `https://your-project-default-rtdb.firebaseio.com` |

> **Why `FIREBASE_CREDENTIALS_JSON` instead of a secret file?** Render's Secret File names cannot contain `/`, making `/etc/secrets/filename.json` invalid. Passing the full JSON as an env var sidesteps this.

### Deploy steps

1. Push code to GitHub (`.env` and `firebase-service-account.json` are gitignored)
2. Render → New → Web Service → Connect GitHub repo
3. Set Root Directory to `type-racer`
4. Build command: `pip install -r requirements.txt`
5. Start command: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Add the environment variables above
7. Deploy

> **Free tier cold starts:** Render free services sleep after 15 min of inactivity. First request after sleep takes ~30 seconds.

---

## 5. API Reference

All endpoints requiring auth expect a Firebase ID token in the `Authorization: Bearer <token>` header.

### Public

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — `{"status": "running"}` |
| `GET` | `/get-sentence?category=general&lang=bn` | Single random sentence |
| `GET` | `/get-sentences?count=N&category=general&lang=bn` | N joined sentences (`lang=bn` or `lang=en`) |
| `GET` | `/categories` | List available categories |
| `POST` | `/anon/token` | Mint a Firebase custom token for guest play — send `X-Anon-Id: <uuid>` header, returns `{"token": "..."}`. No Anonymous Auth needed. |

### Auth required

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/save-result` | Save solo race result to Firestore |
| `POST` | `/add-sentence` | Submit a sentence for admin review |
| `POST` | `/create-room?count=N&category=X&lang=bn&display_name=Name` | Create multiplayer room |
| `POST` | `/join-room/{code}?display_name=Name` | Join a waiting room |
| `POST` | `/start-race/{code}` | Host starts the race |
| `POST` | `/finish-player/{code}` | Mark self as finished |
| `POST` | `/reset-room/{code}?count=N&category=X&lang=bn` | Host resets for Play Again |
| `DELETE` | `/leave-room/{code}` | Leave and clean up room |

### Admin only

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin-data` | Active rooms, leaderboard, race count |
| `POST` | `/approve-sentence/{index}` | Approve a pending sentence |
| `DELETE` | `/reject-sentence/{index}` | Reject a pending sentence |
| `DELETE` | `/admin/delete-room/{code}` | Force-delete a room |

---

## 6. File Structure

```
type-racer/
├── .env                          # Local secrets (NOT in git)
├── .env.example                  # Template
├── .firebaserc                   # Firebase project alias (default: taklatype)
├── .gitignore
├── firebase.json                 # Firebase CLI config (rules + hosting)
├── requirements.txt
├── render.yaml                   # Render deployment config
├── firestore.rules               # Firestore security rules
├── database.rules.json           # RTDB security rules
│
├── backend/
│   ├── __init__.py
│   ├── main.py                   # FastAPI app — all HTTP routes
│   ├── config.py                 # Loads .env variables
│   ├── firebase_admin_init.py    # Firebase Admin SDK singleton
│   ├── auth_middleware.py        # Verifies Firebase ID tokens
│   ├── room_manager.py           # Multiplayer room lifecycle (RTDB)
│   ├── sentence_loader.py        # Loads + randomly picks sentences
│   └── typing_utils.py           # WPM / accuracy helpers
│
├── data/
│   ├── sentences.json            # Banglish sentences by category + pending queue
│   └── sentences_en.json         # English sentences — same 5 categories, 25 each
│
└── frontend/
    ├── index.html                # Single-page app shell
    ├── style.css                 # All styles + 5 themes
    ├── script.js                 # Core typing game logic (ES module)
    ├── multiplayer.js            # Real-time multiplayer (Firebase RTDB)
    ├── auth.js                   # Firebase Auth (Google + email/password)
    ├── leaderboard.js            # Leaderboard panel (Firestore listener)
    ├── firebase-config.js        # Firebase JS SDK init + exports
    └── toast.js                  # Toast notification helper
```

---

## 7. Architecture Notes

### Why FastAPI + Firebase instead of Firebase-only?

Firebase alone can't safely enforce room creation, rank assignment, or sentence selection without a trusted server — any client could manipulate RTDB directly. FastAPI acts as the authority for room lifecycle; RTDB is only used for real-time progress sync (which clients write directly, throttled to 300ms).

### Why no bundler / npm?

No build step means no `node_modules`, no webpack, no CI pipeline needed. The Firebase JS SDK is loaded from CDN (same global distribution). The app deploys by just serving static files.

### How `script.js` and `multiplayer.js` communicate

ES modules can't have circular imports. The bridge is:
- `window.__tt` object — `script.js` exposes functions the multiplayer module calls (e.g. `setSentence`, `setMultiplayer`)
- Custom events — `script.js` dispatches `tt-progress` and `tt-finished`; `multiplayer.js` listens
- This keeps them fully decoupled with no circular dependency

### RTDB Room Schema

```json
{
  "sentence":      "ami tomake bhalobashi...",
  "status":        "waiting | racing | finished",
  "hostUid":       "firebase_uid",
  "duration":      120,
  "wantsRematch":  { "{uid}": { "displayName": "...", "photoURL": "..." } },
  "players": {
    "{uid}": {
      "displayName": "Rumman",
      "photoURL":    "https://...",
      "progress":    75,
      "wpm":         62,
      "finished":    false,
      "rank":        0,
      "ready":       true
    }
  }
}
```
