# TaklaType – Banglish Office Type Racer

A lightweight typing race app for Banglish sentences (Bangla pronunciation written in English letters).

**Phase 1** – fully local, no cloud services required.

---

## Features

- Random Banglish sentence loading
- Character-by-character colour feedback (green / red / grey)
- Live WPM, accuracy, error count, timer
- Progress bar with smooth animation
- Blinking cursor
- Error sound effect
- Session summary popup
- Restart / new sentence button

---

## Project Structure

```
type-racer/
├── backend/
│   ├── __init__.py
│   ├── main.py            # FastAPI app + routes
│   ├── sentence_loader.py # File reading & caching
│   └── typing_utils.py    # Metric helpers
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── data/
│   └── sentences.txt      # One sentence per line
├── requirements.txt
└── README.md
```

---

## Setup & Run

### 1. Install dependencies

```bash
cd type-racer
pip install -r requirements.txt
```

### 2. Start the backend

Run from the **project root** (`type-racer/`):

```bash
uvicorn backend.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

Verify it's running:

```
http://127.0.0.1:8000/health   →  {"status": "running"}
http://127.0.0.1:8000/get-sentence  →  {"sentence": "..."}
```

### 3. Open the frontend

Simply open `frontend/index.html` in your browser (double-click or drag into browser).

> The frontend calls the backend at `http://127.0.0.1:8000` by default. Both must be running at the same time.

---

## Adding / Editing Sentences

Open `data/sentences.txt` and add one sentence per line. Empty lines are ignored. The backend loads sentences once at startup — restart the server after editing the file.

---

## Keyboard Rules

| Key       | Behaviour              |
|-----------|------------------------|
| Any char  | Advance cursor         |
| Backspace | Delete last character  |
| Enter     | Disabled               |
| Arrow keys| Ignored                |
| Paste     | Disabled               |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Could not load sentence" error | Make sure `uvicorn` is running on port 8000 |
| Backend can't find sentences.txt | Run `uvicorn` from the `type-racer/` directory, not from inside `backend/` |
| Port 8000 already in use | `uvicorn backend.main:app --reload --port 8001` and update `API_BASE` in `script.js` |
| Audio doesn't play | Browser may require a user gesture first; click anything on the page |

---

## Tech Stack

- **Backend:** Python 3.10+, FastAPI, Uvicorn
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (no frameworks)
