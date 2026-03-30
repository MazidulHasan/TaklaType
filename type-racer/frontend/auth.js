/**
 * auth.js – Firebase Auth UI + state for TaklaType.
 * Exports: getCurrentUser(), getIdToken()
 */

import { auth, isConfigured } from './firebase-config.js';

// ─── Stub exports when Firebase is not configured ─────────────────────────
export function getCurrentUser() { return _currentUser; }
export async function getIdToken() {
  if (!_currentUser) return null;
  try { return await _currentUser.getIdToken(); } catch (_) { return null; }
}

let _currentUser = null;

if (!isConfigured) {
  // Hide auth elements — DOM is available since modules run after HTML is parsed
  const btn = document.getElementById('auth-btn');
  if (btn) btn.style.display = 'none';
} else {
  _initAuth();
}

// ─── Full auth implementation ─────────────────────────────────────────────
const _isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function _initAuth() {
  const {
    GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged,
  } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

  // DOM refs
  const authBtn        = document.getElementById('auth-btn');
  const authModal      = document.getElementById('auth-modal');
  const authModalClose = document.getElementById('auth-modal-close');
  const userPanel      = document.getElementById('user-panel');
  const userAvatar     = document.getElementById('user-avatar');
  const userNameEl     = document.getElementById('user-name');
  const signOutBtn     = document.getElementById('sign-out-btn');
  const googleBtn      = document.getElementById('google-signin');
  const emailForm      = document.getElementById('email-form');
  const emailInput     = document.getElementById('auth-email');
  const passwordInput  = document.getElementById('auth-password');
  const emailSubmit    = document.getElementById('email-submit');
  const emailToggle    = document.getElementById('email-toggle');
  const authError      = document.getElementById('auth-error');

  // Ripple helper — removes then re-adds class to restart animation
  let _rippleTimer = null;
  function _ripple() {
    userPanel.classList.remove('ripple');
    void userPanel.offsetWidth; // force reflow so animation restarts
    userPanel.classList.add('ripple');
  }
  function _startRippleLoop() {
    _ripple();
    _rippleTimer = setInterval(_ripple, 4000); // fire every 4s
  }
  function _stopRippleLoop() {
    clearInterval(_rippleTimer);
    _rippleTimer = null;
    userPanel.classList.remove('ripple');
  }
  userPanel.addEventListener('animationend', () => userPanel.classList.remove('ripple'));
  userPanel.addEventListener('mouseenter',   _ripple); // instant re-trigger on hover

  // Auth state
  onAuthStateChanged(auth, user => {
    _currentUser = user;
    if (user) {
      authBtn.style.display   = 'none';
      userPanel.style.display = 'flex';
      // Detect guest users: Firebase Anonymous Auth OR custom-token with "anon_" UID prefix
      const isGuest = user.isAnonymous || String(user.uid || '').startsWith('anon_');
      if (isGuest) {
        // Guest session — show auto-assigned name from localStorage
        userNameEl.textContent   = localStorage.getItem('anon-display-name') || 'Guest';
        userAvatar.style.display = 'none';
        userPanel.classList.add('is-anon-user');
      } else {
        userNameEl.textContent  = user.displayName || user.email || 'User';
        if (user.photoURL) { userAvatar.src = user.photoURL; userAvatar.style.display = 'block'; }
        else { userAvatar.style.display = 'none'; }
        userPanel.classList.remove('is-anon-user');
      }
      _closeModal();
      setTimeout(_startRippleLoop, 80);
    } else {
      _stopRippleLoop();
      userPanel.classList.remove('is-anon-user');
      authBtn.style.display   = 'flex';
      userPanel.style.display = 'none';
    }
  });

  // Modal open/close
  const _openModal  = () => { authModal.classList.add('show'); authError.textContent = ''; };
  function _closeModal() { authModal.classList.remove('show'); authError.textContent = ''; }

  authBtn.addEventListener('click',        _openModal);
  authModalClose.addEventListener('click', _closeModal);
  authModal.addEventListener('click', e => { if (e.target === authModal) _closeModal(); });

  // Google sign-in — popup on desktop, redirect on mobile (avoids Safari popup blocker)
  const provider = new GoogleAuthProvider();
  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled    = true;
    googleBtn.textContent = 'Signing in…';
    try {
      if (_isMobile) await signInWithRedirect(auth, provider);
      else           await signInWithPopup(auth, provider);
    } catch (err) {
      _showError(err.message);
      googleBtn.disabled    = false;
      googleBtn.textContent = 'Continue with Google';
    }
  });

  // Handle redirect result on page load (mobile sign-in returns here)
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) _closeModal();
  } catch (err) {
    if (err.code !== 'auth/no-auth-event') _showError(err.message);
  }

  // Email sign-in / sign-up toggle
  let _isSignUp = false;
  emailToggle.addEventListener('click', () => {
    _isSignUp = !_isSignUp;
    emailSubmit.textContent = _isSignUp ? 'Sign Up' : 'Sign In';
    emailToggle.textContent = _isSignUp
      ? 'Already have an account? Sign In'
      : "Don't have an account? Sign Up";
    authError.textContent = '';
  });

  emailForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const pw    = passwordInput.value;
    emailSubmit.disabled    = true;
    emailSubmit.textContent = _isSignUp ? 'Creating account…' : 'Signing in…';
    try {
      if (_isSignUp) await createUserWithEmailAndPassword(auth, email, pw);
      else           await signInWithEmailAndPassword(auth, email, pw);
    } catch (err) {
      _showError(_friendlyError(err.code));
      emailSubmit.disabled    = false;
      emailSubmit.textContent = _isSignUp ? 'Sign Up' : 'Sign In';
    }
  });

  // Sign out
  signOutBtn.addEventListener('click', () => signOut(auth));

  function _showError(msg) { authError.textContent = msg; }

  function _friendlyError(code) {
    const map = {
      'auth/user-not-found':       'No account found with this email.',
      'auth/wrong-password':       'Incorrect password.',
      'auth/invalid-credential':   'Incorrect email or password.',
      'auth/email-already-in-use': 'This email is already registered.',
      'auth/weak-password':        'Password must be at least 6 characters.',
      'auth/invalid-email':        'Invalid email address.',
    };
    return map[code] || 'Authentication failed. Please try again.';
  }
}
