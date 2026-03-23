/**
 * firebase-config.js
 *
 * SETUP REQUIRED:
 *   1. Go to Firebase Console → Project Settings → Your Apps → Web App
 *   2. Copy the firebaseConfig object and paste it below, replacing placeholders.
 *   3. Also set FIREBASE_CREDENTIALS_PATH in .env (backend service account).
 */

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getDatabase }     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const firebaseConfig = {
  apiKey:            "AIzaSyBNSRYsgWPfvHzR8tYYJi1UX9BH26peqxg",
  authDomain:        "taklatype.firebaseapp.com",
  projectId:         "taklatype",
  storageBucket:     "taklatype.firebasestorage.app",
  messagingSenderId: "209923553049",
  appId:             "1:209923553049:web:f0f36448ceb668ebdf7788",
  databaseURL:       "https://taklatype-default-rtdb.firebaseio.com",
};

// Detect if config has been filled in
const isConfigured = firebaseConfig.apiKey !== 'YOUR_API_KEY';

let app  = null;
let auth = null;
let db   = null;
let rtdb = null;

if (isConfigured) {
  try {
    app  = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);
    rtdb = getDatabase(app);
  } catch (e) {
    console.warn('[TaklaType] Firebase init error:', e.message);
  }
} else {
  console.info('[TaklaType] Firebase not configured – auth/leaderboard/multiplayer disabled. See frontend/firebase-config.js.');
}

export { app, auth, db, rtdb, isConfigured };
