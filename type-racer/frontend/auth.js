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
async function _initAuth() {
  const {
    GoogleAuthProvider, signInWithPopup,
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

  // Auth state
  onAuthStateChanged(auth, user => {
    _currentUser = user;
    if (user) {
      authBtn.style.display   = 'none';
      userPanel.style.display = 'flex';
      userNameEl.textContent  = user.displayName || user.email || 'User';
      if (user.photoURL) { userAvatar.src = user.photoURL; userAvatar.style.display = 'block'; }
      else { userAvatar.style.display = 'none'; }
      _closeModal();
    } else {
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

  // Google sign-in
  const provider = new GoogleAuthProvider();
  googleBtn.addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); }
    catch (err) { _showError(err.message); }
  });

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
    try {
      if (_isSignUp) await createUserWithEmailAndPassword(auth, email, pw);
      else           await signInWithEmailAndPassword(auth, email, pw);
    } catch (err) {
      _showError(_friendlyError(err.code));
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
