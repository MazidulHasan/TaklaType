# TaklaType ⌨️

**A real-time multiplayer Banglish typing race game.**

Race your friends by typing Banglish sentences (Bangla words written in English phonetic letters) as fast as you can. Built for office fun — create a room, share a link, and let the race begin.

🔗 **[Live Demo](https://taklatype.onrender.com)** &nbsp;·&nbsp; 📂 **[Project Files](./type-racer)**

---

## Features

### Typing Game
- Character-by-character colour feedback — green for correct, red for wrong
- Live WPM, accuracy, error count and timer
- Progress bar and keystroke particles
- 5 sentence categories: General, Office, Food, Motivation, Love
- 1–5 sentence lines per race (longer = harder)
- Confetti on finish with animated result modal
- Error heatmap showing which characters you missed

### Multiplayer
- Create a private room → share the link → race live
- Real-time progress bars for all players via Firebase RTDB
- 3-2-1 countdown for synchronized race starts
- 2-minute race timer with auto-finish
- Live rank assignment as players finish
- Play Again with host-controlled rematch settings (lines + category)
- "Wants to play again" icon on the result screen per player
- URL-based join with sign-in prompt for unauthenticated users
- Host closes room → all players are automatically kicked with a message
- Custom Race button on homepage — jump straight to a custom-sentence multiplayer room

### Auth & Stats
- Google Sign-In and Email/Password via Firebase Auth
- Race results saved to Firestore (WPM, accuracy, errors, time)
- Personal best leaderboard — top 10 racers shown live
- User panel with avatar, connection status indicator, and ripple effect

### Polish
- 5 colour themes: Dark, Ocean, Forest, Sunset, Light
- 3 font sizes, sound toggle, timer toggle, particles toggle
- Typewriter logo animation on page load
- Mobile-friendly layout
- Resizable typing area — drag the handle below the text box to adjust height
- All settings persisted in `localStorage`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML · CSS · JavaScript (ES Modules, no bundler) |
| Backend | Python 3.11 · FastAPI · Uvicorn |
| Auth | Firebase Authentication (Google + Email/Password) |
| Realtime | Firebase Realtime Database — live room state |
| Database | Firebase Firestore — scores + leaderboard |
| Deployment | Render.com (backend + frontend served together) |
| Firebase JS SDK | v10.12.0 from CDN — no npm required |

---

## How Multiplayer Works

```
Host creates room  ──POST /create-room──▶  FastAPI  ──▶  Firebase RTDB
Guest joins        ──POST /join-room───▶  FastAPI  ──▶  Firebase RTDB
All clients        ◀──onValue listener──────────────────  Firebase RTDB
Progress updates   ──RTDB write (throttled 300ms)──▶  Firebase RTDB
Race finish        ──POST /finish-player──▶  FastAPI assigns rank
```

The FastAPI backend acts as a trusted authority — clients can't cheat by writing directly to RTDB for race results or room control. Player progress is the only thing written from the client.

---

## Quick Start (Local)

```bash
# 1. Clone and enter project
git clone https://github.com/MazidulHasan/TaklaType.git
cd MuradTakla/type-racer

# 2. Install Python dependencies
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env — add your Firebase credentials path and RTDB URL

# 4. Start the server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 5. Open in browser
#    http://127.0.0.1:8000
```

> Firebase is optional for local use. Without it, the typing game works fully — only auth, leaderboard, score saving and multiplayer require Firebase.

See **[type-racer/README.md](./type-racer/README.md)** for full setup, Firebase configuration, deployment guide and API reference.

---

## Project Structure

```
type-racer/
├── backend/
│   ├── main.py                 # FastAPI app — all HTTP endpoints
│   ├── room_manager.py         # Multiplayer room lifecycle (RTDB)
│   ├── sentence_loader.py      # Sentence loading and random selection
│   ├── firebase_admin_init.py  # Firebase Admin SDK singleton
│   └── auth_middleware.py      # Firebase ID token verification
├── frontend/
│   ├── index.html              # Single-page app shell
│   ├── style.css               # All styles + 5 themes
│   ├── script.js               # Core typing game logic
│   ├── multiplayer.js          # Full multiplayer logic (RTDB)
│   ├── auth.js                 # Firebase Auth (Google + email/password)
│   ├── leaderboard.js          # Leaderboard panel (Firestore listener)
│   └── firebase-config.js      # Firebase JS SDK init
├── data/
│   └── sentences.json          # All Banglish sentences by category
├── requirements.txt
└── render.yaml                 # Render.com deployment config
```

---

## Sentence Categories

All sentences are **Banglish** — Bangla language written in English phonetic spelling. Categories are inspired by:

| Category | Vibe |
|---|---|
| General | Everyday Bangladeshi life — traffic, internet, rickshaw logic |
| Office | Dev team problems, stand-ups, deployment disasters |
| Food | Biryani debates, fuchka loyalty, cha dependence |
| Motivation | Relatable procrastination wisdom and gentle roasts |
| Love | Romantic chaos with a Dhaka-realism twist |

---

Built by **Rumman** · Commissioned for **Murad Takla** 😄
