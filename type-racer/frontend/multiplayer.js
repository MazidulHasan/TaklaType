/**
 * multiplayer.js – Phase 2B real-time multiplayer for TaklaType.
 * Uses Firebase Realtime Database for live room state + player progress.
 * Supports anonymous (guest) play via Firebase Anonymous Auth.
 */

import { rtdb, isConfigured } from './firebase-config.js';
import { getCurrentUser, getIdToken, waitForAuthReady } from './auth.js';
import { showToast } from './toast.js';

// ─── Anonymous player name pool (50 names) ───────────────────────────────────
const ANON_NAMES = [
  'SwiftFalcon',  'BraveEagle',   'QuickFox',       'BoldLion',       'FleetHorse',
  'SharpHawk',    'FastPanther',  'NimbleCat',       'SwiftOtter',     'BoldWolf',
  'QuickCrane',   'BraveOwl',     'FleetDeer',       'SharpMarten',    'FastFerret',
  'NimbleMonkey', 'SwiftDolphin', 'BoldSeal',        'QuickParrot',    'BraveRaven',
  'FleetLeopard', 'SharpTiger',   'FastCheetah',     'SwiftKite',      'BoldBull',
  'QuickBear',    'BraveBoar',    'FleetZebra',      'SharpLynx',      'FastJaguar',
  'NimbleApe',    'SwiftBadger',  'BoldCrow',        'QuickBat',       'BraveFlamingo',
  'FleetGazelle', 'SharpMagpie', 'FastRabbit',      'NimbleSquirrel', 'SwiftSparrow',
  'BoldMoose',    'QuickMink',    'BraveHeron',      'FleetCondor',    'SharpFalcon',
  'FastWildcat',  'SwiftViper',   'BoldRhino',       'QuickPuma',      'BraveLynx',
];

// 12 distinct colors for player avatars (derived from UID hash)
const ANON_COLORS = [
  '#e2b714', '#00bcd4', '#66bb6a', '#ff7043', '#ab47bc',
  '#ef5350', '#42a5f5', '#26a69a', '#ec407a', '#7e57c2',
  '#ff9800', '#26c6da',
];

const API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
  ? 'http://127.0.0.1:8000' : location.origin;

// ─── Hide UI when Firebase not configured ────────────────────────────────────
if (!isConfigured) {
  const wrap = document.getElementById('mp-dropdown-wrap');
  if (wrap) wrap.style.display = 'none';
  const btnCR = document.getElementById('btn-custom-race');
  if (btnCR) btnCR.style.display = 'none';
} else {
  _initMultiplayer();
}

// ─── Multiplayer dropdown toggle ─────────────────────────────────────────────
(function () {
  const trigger = document.getElementById('mp-dropdown-trigger');
  const menu    = document.getElementById('mp-dropdown-menu');
  if (!trigger || !menu) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    // Scale-pop animation on the trigger
    trigger.classList.remove('clicked');
    void trigger.offsetWidth; // reflow to restart animation
    trigger.classList.add('clicked');
    trigger.addEventListener('animationend', () => trigger.classList.remove('clicked'), { once: true });
    menu.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', () => menu.classList.remove('open'));

  // Close when any option is picked
  menu.addEventListener('click', () => menu.classList.remove('open'));
})();

// ─── Main init ───────────────────────────────────────────────────────────────
async function _initMultiplayer() {
  const { ref, onValue, off } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const mpBtn            = document.getElementById('mp-btn');
  const mpOverlay        = document.getElementById('mp-overlay');
  const mpLobbyView      = document.getElementById('mp-lobby-view');
  const mpRoomView       = document.getElementById('mp-room-view');
  const mpCodeInput      = document.getElementById('mp-code-input');
  const mpCreateBtn      = document.getElementById('mp-create-btn');
  const mpJoinBtn        = document.getElementById('mp-join-btn');
  const mpError          = document.getElementById('mp-error');
  const mpRoomCode       = document.getElementById('mp-room-code');
  const mpCopyLinkBtn    = document.getElementById('mp-copy-link');
  const mpPlayersList    = document.getElementById('mp-players-list');
  const mpStartBtn       = document.getElementById('mp-start-btn');
  const mpWaitingMsg     = document.getElementById('mp-waiting-msg');
  const mpReadyBtn       = document.getElementById('mp-ready-btn');
  const mpLeaveBtn       = document.getElementById('mp-leave-btn');
  const mpCloseBtn       = document.getElementById('mp-close-btn');
  const cdOverlay        = document.getElementById('mp-countdown-overlay');
  const cdNum            = document.getElementById('mp-countdown-num');
  const racePanel        = document.getElementById('mp-race-panel');
  const playerBars       = document.getElementById('mp-player-bars');
  const mpRaceTimer      = document.getElementById('mp-race-timer');
  const mpFinishedNotice = document.getElementById('mp-finished-notice');
  const mpRaceContent    = document.getElementById('mp-race-content');
  const mpProcessing     = document.getElementById('mp-processing');
  const mpQuitRaceBtn    = document.getElementById('mp-quit-race-btn');
  const mpResultPanel    = document.getElementById('mp-result-panel');
  const mpResultList     = document.getElementById('mp-result-list');
  const mpPlayAgainBtn     = document.getElementById('mp-play-again-btn');
  const mpResultActions    = document.getElementById('mp-result-actions');
  const mpRematchSetup     = document.getElementById('mp-rematch-setup');
  const mpStartNewRaceBtn  = document.getElementById('mp-start-new-race-btn');
  const mpResetWaiting     = document.getElementById('mp-reset-waiting');
  const mpResultLeaveBtn   = document.getElementById('mp-result-leave-btn');
  const mpResultLeaveBtn2  = document.getElementById('mp-result-leave-btn2');
  const mpResultLeaveBtn3  = document.getElementById('mp-result-leave-btn3');
  const mpJoinLoadingView  = document.getElementById('mp-join-loading-view');
  const mpJoinLoadingMsg   = document.getElementById('mp-join-loading-msg');

  // Rematch settings (host picks before starting new race)
  let _rematchLines    = 1;
  let _rematchCategory = 'general';

  document.querySelectorAll('#mp-rematch-lines .mp-line-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mp-rematch-lines .mp-line-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _rematchLines = parseInt(pill.dataset.rematchCount, 10);
    });
  });
  document.querySelectorAll('#mp-rematch-cat .mp-line-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mp-rematch-cat .mp-line-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _rematchCategory = pill.dataset.rematchCat;
    });
  });
  document.querySelectorAll('#mp-rematch-lang .mp-line-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mp-rematch-lang .mp-line-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _rematchLang = pill.dataset.rematchLang;
      localStorage.setItem('taklatype-lang', _rematchLang);
    });
  });

  const mpLinePills        = document.querySelectorAll('.mp-line-pill[data-mpcount]');
  const mpAnonJoinView     = document.getElementById('mp-anon-join-view');
  const mpCustomToggle     = document.getElementById('mp-custom-toggle');
  const mpCustomInput      = document.getElementById('mp-custom-input');
  const mpCustomSaveRow    = document.getElementById('mp-custom-save-row');
  const mpCustomSaveCb     = document.getElementById('mp-custom-save-cb');

  // Rematch custom sentence elements
  const mpRematchCustomToggle = document.getElementById('mp-rematch-custom-toggle');
  const mpRematchCustomInput  = document.getElementById('mp-rematch-custom-input');
  const mpRematchSelectors    = document.getElementById('mp-rematch-selectors');
  let _useRematchCustom       = false;

  if (mpRematchCustomToggle) {
    mpRematchCustomToggle.addEventListener('click', () => {
      _useRematchCustom = !_useRematchCustom;
      mpRematchCustomToggle.classList.toggle('active', _useRematchCustom);
      if (mpRematchCustomInput)  mpRematchCustomInput.style.display  = _useRematchCustom ? '' : 'none';
      if (mpRematchSelectors)    mpRematchSelectors.style.display    = _useRematchCustom ? 'none' : '';
    });
  }

  const btnCustomRace = document.getElementById('btn-custom-race');

  // ── State ───────────────────────────────────────────────────────────────────
  let _waitingForReset     = false;
  let _currentWantsRematch = {};
  let roomCode             = null;
  let roomSentence      = null;
  let isHost            = false;
  let roomRef           = null;
  let unsubRoom         = null;
  let progressTimer     = null;
  let _isReady          = false;
  let _raceStarted      = false;
  let _selfFinished     = false;
  let _raceTimerHandle  = null;
  let _raceStartMs      = 0;
  let _selectedLines    = 1;
  let _selectedCategory = 'general';
  // Anon / guest mode
  let _isAnonMode       = false;
  let _anonDisplayName  = '';
  // Language selection (synced with solo mode via localStorage)
  let _selectedLang  = localStorage.getItem('taklatype-lang') || 'bn';
  let _rematchLang   = _selectedLang;
  // Difficulty modifiers
  let _mpModifiers      = new Set();
  let _rematchModifiers = new Set();

  // ── Custom sentence toggle ───────────────────────────────────────────────────
  const mpLobbySelectors = document.getElementById('mp-lobby-selectors');
  let _useCustomSentence = false;
  if (mpCustomToggle) {
    mpCustomToggle.addEventListener('click', () => {
      _useCustomSentence = !_useCustomSentence;
      mpCustomToggle.classList.toggle('active', _useCustomSentence);
      if (mpCustomInput)     mpCustomInput.style.display     = _useCustomSentence ? '' : 'none';
      if (mpCustomSaveRow)   mpCustomSaveRow.style.display   = _useCustomSentence ? '' : 'none';
      if (mpLobbySelectors)  mpLobbySelectors.style.display  = _useCustomSentence ? 'none' : '';
    });
  }

  // ── Lines + Category selectors (lobby) ──────────────────────────────────────
  mpLinePills.forEach(pill => {
    pill.addEventListener('click', () => {
      mpLinePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _selectedLines = parseInt(pill.dataset.mpcount, 10);
    });
  });

  document.querySelectorAll('#mp-cat-pills .mp-line-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mp-cat-pills .mp-line-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _selectedCategory = pill.dataset.mpcat;
    });
  });

  // ── Language toggle (lobby) ──────────────────────────────────────────────────
  // Sync pill active state with localStorage on init
  document.querySelectorAll('#mp-lang-pills .mp-line-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.mplang === _selectedLang);
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mp-lang-pills .mp-line-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _selectedLang = pill.dataset.mplang;
      _rematchLang  = _selectedLang;
      localStorage.setItem('taklatype-lang', _selectedLang);
    });
  });

  // Sync the mp-lang-pills active state with _selectedLang
  function _syncMpLangPills() {
    _selectedLang = localStorage.getItem('taklatype-lang') || 'bn';
    _rematchLang  = _selectedLang;
    document.querySelectorAll('#mp-lang-pills .mp-line-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.mplang === _selectedLang);
    });
  }

  // ── Difficulty modifier helpers ──────────────────────────────────────────────
  function _applyMpModifiers(text, mods) {
    if (!mods || mods.size === 0) return text;
    const NUMS = ['0','1','2','3','4','5','6','7','8','9'];
    const SYMS = ['@','#','$','%','&','!','?','*','+','='];
    const pool = [
      ...(mods.has('numbers') ? NUMS : []),
      ...(mods.has('symbols') ? SYMS : []),
    ];
    let words = text.split(' ');
    if (pool.length > 0) {
      const out = [];
      for (let i = 0; i < words.length; i++) {
        out.push(words[i]);
        if (i < words.length - 1 && Math.random() < 0.22) {
          out.push(pool[Math.floor(Math.random() * pool.length)]);
        }
      }
      words = out;
    }
    let result = words.join(' ');
    if (mods.has('mixed')) {
      result = result.split('').map((c, i) => {
        if (i === 0) return c;
        return (/[a-z]/.test(c) && Math.random() < 0.18) ? c.toUpperCase() : c;
      }).join('');
    }
    return result;
  }

  // Modifier pill handlers — multi-select toggles
  document.querySelectorAll('#mp-modifier-pills .mp-line-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const mod = pill.dataset.mpmodifier;
      if (_mpModifiers.has(mod)) { _mpModifiers.delete(mod); pill.classList.remove('active'); }
      else                       { _mpModifiers.add(mod);    pill.classList.add('active');    }
    });
  });
  document.querySelectorAll('#mp-rematch-modifier-pills .mp-line-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const mod = pill.dataset.rematchModifier;
      if (_rematchModifiers.has(mod)) { _rematchModifiers.delete(mod); pill.classList.remove('active'); }
      else                            { _rematchModifiers.add(mod);    pill.classList.add('active');    }
    });
  });

  // ── Open/close lobby modal ──────────────────────────────────────────────────
  mpBtn.addEventListener('click', () => {
    const user = getCurrentUser();
    if (!user) { showToast('Please sign in to use Multiplayer, or choose "Play as Guest" instead.', 'info', 3500); return; }
    if (_isGuestUid(user.uid) || user.isAnonymous) {
      showToast('You\'re signed in as a guest. Use "Play as Guest" to create or join rooms.', 'info', 3500);
      return;
    }
    _isAnonMode      = false;
    _anonDisplayName = '';
    _syncMpLangPills();
    _showView('lobby');
    mpOverlay.classList.add('show');
    mpError.textContent = '';
  });

  mpCloseBtn.addEventListener('click', () => {
    if (roomCode) _leaveRoom();
    else _closeModal();
  });
  mpOverlay.addEventListener('click', e => {
    if (e.target === mpOverlay && !roomCode) _closeModal();
  });

  function _closeModal() {
    mpOverlay.classList.remove('show');
    // Reset custom sentence toggle so it doesn't persist across modal opens
    _useCustomSentence = false;
    if (mpCustomToggle)   mpCustomToggle.classList.remove('active');
    if (mpCustomInput)    { mpCustomInput.style.display = 'none'; mpCustomInput.value = ''; }
    if (mpCustomSaveRow)  mpCustomSaveRow.style.display = 'none';
    if (mpLobbySelectors) mpLobbySelectors.style.display = '';
    if (mpError)          mpError.textContent = '';
    // Reset modifier pills
    _mpModifiers.clear();
    document.querySelectorAll('#mp-modifier-pills .mp-line-pill').forEach(p => p.classList.remove('active'));
  }

  // ── View switcher ───────────────────────────────────────────────────────────
  function _showView(name) {
    mpLobbyView.style.display        = name === 'lobby'       ? '' : 'none';
    mpRoomView.style.display         = name === 'room'        ? '' : 'none';
    if (mpJoinLoadingView)
      mpJoinLoadingView.style.display  = name === 'join-loading' ? '' : 'none';
    if (mpAnonJoinView)
      mpAnonJoinView.style.display     = name === 'anon-join'  ? '' : 'none';
  }

  // ── Guest / Anonymous play button ───────────────────────────────────────────
  const anonPlayBtn  = document.getElementById('anon-play-btn');
  const _anonBtnHTML = anonPlayBtn ? anonPlayBtn.innerHTML : '';

  if (anonPlayBtn) {
    anonPlayBtn.addEventListener('click', async () => {
      _isAnonMode = true;
      const user  = getCurrentUser();
      if (!user) {
        // Sign in via backend custom token (works without enabling Anonymous Auth)
        anonPlayBtn.disabled   = true;
        anonPlayBtn.innerHTML  = 'Connecting…';
        try {
          const result = await _signInAsGuest();
          _anonDisplayName = result.displayName;
        } catch (err) {
          showToast(`Guest sign-in failed: ${err.message}`, 'error', 4000);
          anonPlayBtn.disabled  = false;
          anonPlayBtn.innerHTML = _anonBtnHTML;
          _isAnonMode = false;
          return;
        }
        anonPlayBtn.disabled  = false;
        anonPlayBtn.innerHTML = _anonBtnHTML;
      } else if (_isGuestUid(user.uid) || user.isAnonymous) {
        _anonDisplayName = _getAnonDisplayName(user.uid);
      } else {
        // Already signed-in with real account — open normal MP modal
        _isAnonMode      = false;
        _anonDisplayName = '';
      }
      _syncMpLangPills();
      _showView('lobby');
      mpOverlay.classList.add('show');
      mpError.textContent = '';
    });
  }

  // ── Create room ─────────────────────────────────────────────────────────────
  mpCreateBtn.addEventListener('click', async () => {
    mpError.textContent     = '';
    mpCreateBtn.disabled    = true;
    mpCreateBtn.textContent = 'Creating…';
    try {
      const token      = await getIdToken();
      const rawCustom  = _useCustomSentence ? (mpCustomInput?.value.trim() || '') : '';
      if (rawCustom) {
        const words = rawCustom.split(/\s+/).length;
        if (words < 15) {
          mpError.textContent = 'Custom sentence must have at least 15 words.';
          return;
        }
        if (rawCustom.length > 500) {
          mpError.textContent = 'Custom sentence must be under 500 characters.';
          return;
        }
      }
      // Auto-capitalize first letter
      let customText = rawCustom ? rawCustom.charAt(0).toUpperCase() + rawCustom.slice(1) : '';
      // If no custom text but modifiers active: fetch sentence, apply modifiers, use as custom
      if (!customText && _mpModifiers.size > 0) {
        const sRes = await fetch(
          `${API_BASE}/get-sentences?count=${_selectedLines}&category=${_selectedCategory}&lang=${_selectedLang}`
        );
        const sData = await sRes.json();
        const joined = (sData.sentences || [sData.sentence])
          .map(s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s).join('. ');
        customText = _applyMpModifiers(joined, _mpModifiers);
      }
      const nameParam  = _anonDisplayName ? `&display_name=${encodeURIComponent(_anonDisplayName)}` : '';
      const resp  = await fetch(
        `${API_BASE}/create-room?count=${_selectedLines}&category=${_selectedCategory}&lang=${_selectedLang}${nameParam}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ custom_sentence: customText }),
        },
      );
      // Submit custom sentence for admin review
      if (customText && mpCustomSaveCb?.checked) {
        fetch(`${API_BASE}/add-sentence`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ sentence: customText, category: _selectedCategory }),
        }).then(() => {
          showToast('Sentence submitted for review — an admin will approve it.', 'info', 4000);
        }).catch(() => {});
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to create room');
      await _enterRoom(data.code, data.sentence, true);
    } catch (err) {
      mpError.textContent = err.message;
    } finally {
      mpCreateBtn.disabled    = false;
      mpCreateBtn.textContent = '+ Create Room';
    }
  });

  // ── Join room ───────────────────────────────────────────────────────────────
  mpJoinBtn.addEventListener('click', () => _joinByCode(mpCodeInput.value.trim().toUpperCase()));

  mpCodeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') _joinByCode(mpCodeInput.value.trim().toUpperCase());
  });

  async function _joinByCode(code) {
    if (!code) { mpError.textContent = 'Enter a room code.'; return; }
    mpError.textContent   = '';
    mpJoinBtn.disabled    = true;
    mpJoinBtn.textContent = 'Joining…';
    try {
      const token     = await getIdToken();
      const nameParam = _anonDisplayName ? `?display_name=${encodeURIComponent(_anonDisplayName)}` : '';
      const resp  = await fetch(`${API_BASE}/join-room/${code}${nameParam}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to join room');
      await _enterRoom(code, data.sentence, false);
    } catch (err) {
      // If we were in join-loading mode (URL auto-join), switch back to lobby so error is visible
      if (mpJoinLoadingView && mpJoinLoadingView.style.display !== 'none') {
        _showView('lobby');
      }
      mpError.textContent = err.message;
    } finally {
      mpJoinBtn.disabled    = false;
      mpJoinBtn.textContent = 'Join';
    }
  }

  // ── Helper: reset result panel views to default state ───────────────────────
  function _resetResultPanel() {
    if (mpResultActions) mpResultActions.style.display = '';
    if (mpRematchSetup)  mpRematchSetup.style.display  = 'none';
    if (mpResetWaiting)  mpResetWaiting.style.display  = 'none';
    if (mpPlayAgainBtn)  { mpPlayAgainBtn.disabled = false; mpPlayAgainBtn.textContent = '↺ Play Again'; }
    if (mpStartNewRaceBtn) { mpStartNewRaceBtn.disabled = false; mpStartNewRaceBtn.textContent = '▶ Start New Race'; }
    const mpHeatmapSection = document.getElementById('mp-heatmap-section');
    if (mpHeatmapSection) mpHeatmapSection.style.display = 'none';
    _renderWantsRematch({});
  }

  // ── Render "wants to play again" icons + row highlight on result rows ────────
  function _renderWantsRematch(wantsRematch) {
    _currentWantsRematch = wantsRematch || {};
    mpResultList.querySelectorAll('[data-uid]').forEach(row => {
      const wants = !!_currentWantsRematch[row.dataset.uid];
      const icon  = row.querySelector('.mp-result-rematch-icon');
      if (icon) icon.style.visibility = wants ? 'visible' : 'hidden';
      row.classList.toggle('wants-rematch', wants);
    });
  }

  // ── Helper: show room lobby after host resets (non-host path) ───────────────
  function _showRoomAfterReset() {
    _waitingForReset = false;
    _resetResultPanel();
    mpResultPanel.classList.remove('show');
    _showView('room');
    mpStartBtn.disabled        = true;
    mpStartBtn.textContent     = 'Start Race';
    mpReadyBtn.style.display   = '';
    mpWaitingMsg.style.display = '';
    _isReady = false;
    _updateReadyBtn();
    mpOverlay.classList.add('show');
  }

  // ── Enter room (subscribe to RTDB) ──────────────────────────────────────────
  async function _enterRoom(code, sentence, host) {
    roomCode     = code;
    roomSentence = sentence;
    isHost       = host;
    _isReady     = false;

    mpRoomCode.textContent = code;
    mpStartBtn.style.display   = host ? '' : 'none';
    mpStartBtn.disabled        = true;
    mpWaitingMsg.style.display = host ? 'none' : '';
    mpReadyBtn.style.display   = host ? 'none' : '';
    _updateReadyBtn();
    // Label + style the room leave button based on role
    mpLeaveBtn.textContent = host ? 'Close Room' : 'Leave Room';
    mpLeaveBtn.classList.toggle('is-host-close', host);

    _showView('room');
    mpOverlay.classList.add('show');

    roomRef   = ref(rtdb, `/rooms/${code}`);
    unsubRoom = onValue(roomRef, snap => {
      const room = snap.val();
      if (!room) { _handleRoomDeleted(); return; }

      // Non-host waiting for host to reset → show room lobby when status returns to waiting
      if (_waitingForReset && room.status === 'waiting') {
        _showRoomAfterReset();
        return;
      }

      _renderRoomPlayers(room.players || {}, room.hostUid);
      if (room.status === 'racing' && !_raceStarted) _startCountdown(room);
      if (room.status === 'finished' && _raceStarted) _showMpResults(room.players || {});
      // Update "wants to play again" chips whenever the room snapshot changes
      if (mpResultPanel && mpResultPanel.classList.contains('show')) {
        _renderWantsRematch(room.wantsRematch || {});
      }
    });

    _updateUrl(code);
  }

  // ── Ready toggle (non-host) ──────────────────────────────────────────────────
  mpReadyBtn.addEventListener('click', async () => {
    _isReady = !_isReady;
    _updateReadyBtn();
    const user = getCurrentUser();
    if (!user || !roomCode) return;
    const { update: rtdbUpdate } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    const playerRef = ref(rtdb, `/rooms/${roomCode}/players/${user.uid}`);
    rtdbUpdate(playerRef, { ready: _isReady });
  });

  function _updateReadyBtn() {
    if (_isReady) {
      mpReadyBtn.textContent = '✓ Ready';
      mpReadyBtn.classList.add('is-ready');
    } else {
      mpReadyBtn.textContent = "I'm Ready";
      mpReadyBtn.classList.remove('is-ready');
    }
  }

  // ── Render waiting player list ───────────────────────────────────────────────
  function _renderRoomPlayers(players, hostUid) {
    const user    = getCurrentUser();
    const entries = Object.entries(players);

    mpPlayersList.innerHTML = entries.map(([uid, p]) => {
      const hostTag  = uid === hostUid ? ' <span class="mp-host-tag">HOST</span>' : '';
      const youTag   = uid === user?.uid ? ' (you)' : '';
      const readyTag = uid !== hostUid
        ? (p.ready
          ? ' <span class="mp-ready-tag">READY</span>'
          : ' <span class="mp-not-ready-tag">not ready</span>')
        : '';
      const avatarColor = _uidToColor(uid);
      const avatar = p.photoURL
        ? `<img class="mp-list-avatar-img" src="${_esc(p.photoURL)}" alt="" onerror="this.style.display='none'">`
        : `<span class="mp-list-avatar" style="background:${avatarColor}">${_esc((p.displayName || '?')[0].toUpperCase())}</span>`;
      return `<li class="mp-player-item">${avatar}${_esc(p.displayName)}${youTag}${hostTag}${readyTag}</li>`;
    }).join('') || `<li class="mp-player-item" style="color:var(--muted)">Waiting for players…</li>`;

    if (isHost) {
      const nonHosts = entries.filter(([uid]) => uid !== hostUid);
      const allReady = nonHosts.length > 0 && nonHosts.every(([, p]) => p.ready);
      const canStart = entries.length >= 2 && allReady;
      mpStartBtn.disabled = !canStart;
      mpStartBtn.title    = canStart ? '' :
        (entries.length < 2 ? 'Need at least 2 players' : 'Waiting for all players to ready up');
    }
  }

  // ── Copy share link ─────────────────────────────────────────────────────────
  mpCopyLinkBtn.addEventListener('click', () => {
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      mpCopyLinkBtn.textContent = 'Copied!';
      setTimeout(() => { mpCopyLinkBtn.textContent = 'Copy Link'; }, 1800);
    });
  });

  // ── Start race (host only) ───────────────────────────────────────────────────
  mpStartBtn.addEventListener('click', async () => {
    mpStartBtn.disabled    = true;
    mpStartBtn.textContent = 'Starting…';
    try {
      const token = await getIdToken();
      await fetch(`${API_BASE}/start-race/${roomCode}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
    } catch (_) {
      mpStartBtn.disabled    = false;
      mpStartBtn.textContent = 'Start Race';
    }
  });

  // ── Countdown then race ─────────────────────────────────────────────────────
  function _startCountdown(room) {
    if (_raceStarted) return;
    _raceStarted = true;

    // Compute deadline from server timestamp so all clients agree
    // startedAt is Firebase server ms; add 3700ms for the countdown display
    const serverNow = room.startedAt || Date.now();
    const deadline  = serverNow + 3700 + (room.duration || 120) * 1000;

    mpOverlay.classList.remove('show');
    cdOverlay.classList.add('show');

    let count = 3;
    cdNum.textContent = count;
    const tick = setInterval(() => {
      count--;
      if (count > 0) { cdNum.textContent = count; return; }
      clearInterval(tick);
      cdNum.textContent = 'GO!';
      setTimeout(() => {
        cdOverlay.classList.remove('show');
        _beginRace(room.sentence || roomSentence, deadline);
      }, 700);
    }, 1000);
  }

  function _beginRace(sentence, deadline) {
    racePanel.style.display = '';
    if (mpRaceContent)    mpRaceContent.style.display    = '';
    if (mpProcessing)     mpProcessing.style.display     = 'none';
    if (mpFinishedNotice) mpFinishedNotice.style.display = 'none';
    if (mpQuitRaceBtn)    mpQuitRaceBtn.style.display    = '';
    _selfFinished = false;
    _raceStartMs  = Date.now();
    // Hide solo controls + top progress bar during multiplayer race
    const langBar    = document.querySelector('.lang-toggle-bar');
    const lineSel    = document.querySelector('.line-selector');
    const controls   = document.querySelector('.controls');
    const progressCt = document.querySelector('.progress-container');
    if (langBar)    langBar.style.display    = 'none';
    if (lineSel)    lineSel.style.display    = 'none';
    if (controls)   controls.style.display   = 'none';
    if (progressCt) progressCt.style.display = 'none';
    if (window.__tt) {
      window.__tt.setMultiplayer(true);
      window.__tt.startRound(sentence);
    }
    _listenProgress();
    _startRaceTimer(deadline);
  }

  // ── Race countdown timer (deadline = absolute ms timestamp) ──────────────────
  function _startRaceTimer(deadline) {
    const endTime = deadline;
    if (_raceTimerHandle) clearInterval(_raceTimerHandle);

    _raceTimerHandle = setInterval(async () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      if (mpRaceTimer) {
        mpRaceTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        mpRaceTimer.classList.toggle('mp-race-timer-low',    remaining <= 20);
        mpRaceTimer.classList.toggle('mp-race-timer-urgent', remaining <= 10);
      }

      if (remaining === 0) {
        clearInterval(_raceTimerHandle);
        _raceTimerHandle = null;
        // Auto-finish this player if they haven't finished yet
        if (!_selfFinished && roomCode) {
          _selfFinished = true;
          const user = getCurrentUser();
          if (user) {
            try {
              const token = await getIdToken();
              const wpm   = parseInt(document.getElementById('wpm')?.textContent || '0', 10);
              const acc   = parseInt(document.getElementById('accuracy')?.textContent || '0', 10);
              const errs  = parseInt(document.getElementById('errors')?.textContent  || '0', 10);
              const elapsed = Math.round((Date.now() - _raceStartMs) / 1000);
              await fetch(`${API_BASE}/finish-player/${roomCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ wpm, accuracy: acc, errors: errs, time: elapsed }),
              });
            } catch (_) {}
          }
        }
      }
    }, 1000);
  }

  // ── Quit / leave during active race ─────────────────────────────────────────
  if (mpQuitRaceBtn) {
    mpQuitRaceBtn.addEventListener('click', () => {
      if (confirm('Leave the ongoing race? Your result won\'t count for this match.')) {
        _leaveRoom();
      }
    });
  }

  // ── Listen to all players' progress ─────────────────────────────────────────
  function _listenProgress() {
    const playersRef = ref(rtdb, `/rooms/${roomCode}/players`);
    onValue(playersRef, snap => {
      const players = snap.val() || {};
      _renderPlayerBars(players);
    });
  }

  function _renderPlayerBars(players) {
    const user = getCurrentUser();
    playerBars.innerHTML = Object.entries(players).map(([uid, p]) => {
      const isMe   = uid === user?.uid;
      const youBadge = isMe ? ' <span class="mp-you-badge">me</span>' : '';
      const pct    = p.finished ? 100 : Math.min(p.progress || 0, 100);
      const finTag = p.finished ? ` <span class="mp-bar-rank">#${p.rank}</span>` : '';
      const color  = _uidToColor(uid);
      const avatar = p.photoURL
        ? `<img class="mp-bar-avatar" src="${_esc(p.photoURL)}" alt="" onerror="this.style.display='none'">`
        : `<span class="mp-bar-avatar-fb" style="background:${color}">${_esc((p.displayName || '?')[0].toUpperCase())}</span>`;
      return `<div class="mp-bar-row${isMe ? ' mp-bar-row--me' : ''}">
        ${avatar}
        <span class="mp-bar-name">${_esc(p.displayName)}${youBadge}</span>
        <div class="mp-bar-track">
          <div class="mp-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="mp-bar-wpm">${p.wpm || 0} WPM${finTag}</span>
      </div>`;
    }).join('');
  }

  // ── Write own progress to RTDB (throttled) ──────────────────────────────────
  window.addEventListener('tt-progress', async ({ detail }) => {
    if (!roomCode || !_raceStarted) return;
    if (progressTimer) return;
    progressTimer = setTimeout(async () => {
      progressTimer = null;
      const user = getCurrentUser();
      if (!user) return;
      const { update: rtdbUpdate } =
        await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const playerRef = ref(rtdb, `/rooms/${roomCode}/players/${user.uid}`);
      rtdbUpdate(playerRef, { progress: detail.progress, wpm: detail.wpm });
    }, 300);
  });

  // ── Handle own race finish ───────────────────────────────────────────────────
  let _myKeyErrors = {};
  window.addEventListener('tt-finished', async ({ detail }) => {
    if (!roomCode || !_raceStarted || _selfFinished) return;
    _selfFinished = true;
    _myKeyErrors = detail.keyErrors || {};

    // Keep race content (progress bars) visible; just hide the leave button and show finished notice
    if (mpQuitRaceBtn)    mpQuitRaceBtn.style.display    = 'none';
    if (mpProcessing)     mpProcessing.style.display     = 'none';
    if (mpFinishedNotice) mpFinishedNotice.style.display = '';

    try {
      const token = await getIdToken();
      await fetch(`${API_BASE}/finish-player/${roomCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wpm: detail.wpm, accuracy: detail.accuracy,
                               errors: detail.errors, time: detail.time }),
      });
    } catch (_) {}
  });

  // ── Show multiplayer results ─────────────────────────────────────────────────
  function _showMpResults(players) {
    if (_raceTimerHandle) { clearInterval(_raceTimerHandle); _raceTimerHandle = null; }
    racePanel.style.display = 'none';
    const sorted     = Object.values(players).filter(p => p.finished).sort((a, b) => a.rank - b.rank);
    const unfinished = Object.values(players).filter(p => !p.finished);
    const sortedUids = [...Object.entries(players).filter(([,p]) => p.finished).sort((a,b) => a[1].rank - b[1].rank),
                         ...Object.entries(players).filter(([,p]) => !p.finished)];
    const currentUser = getCurrentUser();
    mpResultList.innerHTML = sortedUids.map(([uid, p]) => {
      const isMe    = uid === currentUser?.uid;
      const pos     = p.finished ? `#${p.rank}` : 'DNF';
      const dot     = `<span class="mp-result-dot" style="background:${_uidToColor(uid)}"></span>`;
      const youBadge = isMe ? ' <span class="mp-you-badge">me</span>' : '';
      return `<li class="mp-result-row${isMe ? ' mp-result-row--me' : ''}" data-uid="${_esc(uid)}">
        <span class="mp-result-pos">${pos}</span>
        ${dot}<span class="mp-result-name">${_esc(p.displayName)}${youBadge}</span>
        <span class="mp-result-wpm">${p.wpm || 0} WPM</span>
        <span class="mp-result-rematch-icon" style="visibility:hidden" title="Wants to play again">↺</span>
      </li>`;
    }).join('');
    _renderMpHeatmap(_myKeyErrors);
    // Label the result-actions leave button based on role
    if (mpResultLeaveBtn) {
      mpResultLeaveBtn.textContent = isHost ? 'Close Room' : 'Leave Room';
      mpResultLeaveBtn.classList.toggle('is-host-close', isHost);
    }
    // Label the rematch-setup leave button (host-only view)
    if (mpResultLeaveBtn3) {
      mpResultLeaveBtn3.textContent = 'Close Room';
      mpResultLeaveBtn3.classList.add('is-host-close');
    }
    mpResultPanel.classList.add('show');
  }

  // ── Render key-error heatmap in MP result modal ──────────────────────────────
  const MP_KEYBOARD_ROWS = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m',' '],
  ];
  function _renderMpHeatmap(keyErrors) {
    const section  = document.getElementById('mp-heatmap-section');
    const keyboard = document.getElementById('mp-heatmap-keyboard');
    if (!section || !keyboard) return;
    if (!keyErrors || Object.keys(keyErrors).length === 0) {
      section.style.display = 'none';
      return;
    }
    const maxErr = Math.max(...Object.values(keyErrors));
    keyboard.innerHTML = MP_KEYBOARD_ROWS.map(row =>
      `<div class="hk-row">${row.map(key => {
        const errs  = keyErrors[key] || 0;
        const heat  = errs > 0 ? Math.ceil((errs / maxErr) * 4) : 0;
        const label = key === ' ' ? '␣' : key.toUpperCase();
        return `<span class="hk-key heat-${heat}" title="${errs} mistake${errs !== 1 ? 's' : ''}">${label}</span>`;
      }).join('')}</div>`
    ).join('');
    section.style.display = '';
  }

  // ── Play again — host sees rematch setup; non-host waits ────────────────────
  mpPlayAgainBtn.addEventListener('click', async () => {
    _raceStarted  = false;
    _selfFinished = false;
    _isReady      = false;
    _myKeyErrors  = {};
    if (window.__tt) window.__tt.setMultiplayer(false);
    racePanel.style.display = 'none';
    if (mpRaceContent)    mpRaceContent.style.display    = '';
    if (mpProcessing)     mpProcessing.style.display     = 'none';
    if (mpFinishedNotice) mpFinishedNotice.style.display = 'none';
    if (mpQuitRaceBtn)    mpQuitRaceBtn.style.display    = '';

    // Write this player's "wants rematch" intent to RTDB so others can see it
    const _wantUser = getCurrentUser();
    if (_wantUser && roomCode) {
      try {
        const { ref: dbRef, set: dbSet } =
          await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
        dbSet(dbRef(rtdb, `/rooms/${roomCode}/wantsRematch/${_wantUser.uid}`), {
          displayName: _wantUser.displayName || _wantUser.email || 'Player',
          photoURL:    _wantUser.photoURL || '',
        });
      } catch (_) {}
    }

    // Keep result panel open — switch to role-specific view
    mpResultActions.style.display = 'none';
    if (isHost) {
      // Sync rematch pills to current selection
      _rematchLines    = _selectedLines;
      _rematchCategory = _selectedCategory;
      _rematchLang     = _selectedLang;
      document.querySelectorAll('#mp-rematch-lines .mp-line-pill').forEach(p => {
        p.classList.toggle('active', parseInt(p.dataset.rematchCount, 10) === _rematchLines);
      });
      document.querySelectorAll('#mp-rematch-cat .mp-line-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.rematchCat === _rematchCategory);
      });
      document.querySelectorAll('#mp-rematch-lang .mp-line-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.rematchLang === _rematchLang);
      });
      mpRematchSetup.style.display = '';
    } else {
      // Non-host: show waiting, check if host already reset
      _waitingForReset = true;
      mpResetWaiting.style.display = '';
      try {
        const { get } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
        const snap = await get(roomRef);
        const room = snap.val();
        if (room && room.status === 'waiting' && _waitingForReset) _showRoomAfterReset();
      } catch (_) {}
    }
    history.replaceState(null, '', location.pathname);
  });

  // ── Start New Race (host, from rematch setup) ────────────────────────────────
  if (mpStartNewRaceBtn) {
    mpStartNewRaceBtn.addEventListener('click', async () => {
      mpStartNewRaceBtn.disabled    = true;
      mpStartNewRaceBtn.textContent = 'Starting…';
      try {
        const token = await getIdToken();
        let customText = _useRematchCustom ? (mpRematchCustomInput?.value.trim() || '') : '';
        if (customText) customText = customText.charAt(0).toUpperCase() + customText.slice(1);
        // Apply modifiers if set and no custom text
        if (!customText && _rematchModifiers.size > 0) {
          const sRes = await fetch(
            `${API_BASE}/get-sentences?count=${_rematchLines}&category=${_rematchCategory}&lang=${_rematchLang}`
          );
          const sData = await sRes.json();
          const joined = (sData.sentences || [sData.sentence])
            .map(s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s).join('. ');
          customText = _applyMpModifiers(joined, _rematchModifiers);
        }
        await fetch(
          `${API_BASE}/reset-room/${roomCode}?count=${_rematchLines}&category=${_rematchCategory}&lang=${_rematchLang}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ custom_sentence: customText }),
          },
        );
      } catch (_) {}
      // Reset rematch custom + modifier state
      _useRematchCustom = false;
      if (mpRematchCustomToggle) mpRematchCustomToggle.classList.remove('active');
      if (mpRematchCustomInput)  { mpRematchCustomInput.style.display = 'none'; mpRematchCustomInput.value = ''; }
      if (mpRematchSelectors)    mpRematchSelectors.style.display = '';
      _rematchModifiers.clear();
      document.querySelectorAll('#mp-rematch-modifier-pills .mp-line-pill').forEach(p => p.classList.remove('active'));
      _resetResultPanel();
      mpResultPanel.classList.remove('show');
      _showView('room');
      mpStartBtn.disabled    = true;
      mpStartBtn.textContent = 'Start Race';
      mpOverlay.classList.add('show');
    });
  }

  // ── Leave from results screen (all three leave buttons) ─────────────────
  [mpResultLeaveBtn, mpResultLeaveBtn2, mpResultLeaveBtn3].forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      // Warn host if other players have requested a rematch or setup is visible
      const inRematchSetup = mpRematchSetup && mpRematchSetup.style.display !== 'none';
      const othersWantPlay = Object.keys(_currentWantsRematch).length > 0;
      if (isHost && (inRematchSetup || othersWantPlay)) {
        if (!confirm('Closing the room will kick all other players. Close anyway?')) return;
      }
      _resetResultPanel();
      mpResultPanel.classList.remove('show');
      _leaveRoom();
    });
  });

  // ── Leave room ───────────────────────────────────────────────────────────────
  mpLeaveBtn.addEventListener('click', () => {
    if (_raceStarted && !confirm('Leave the ongoing race? Your result won\'t count for this match.')) return;
    _leaveRoom();
  });

  async function _leaveRoom() {
    if (_raceTimerHandle) { clearInterval(_raceTimerHandle); _raceTimerHandle = null; }
    const code = roomCode;
    if (unsubRoom) { off(roomRef); unsubRoom = null; }
    _resetState();
    mpOverlay.classList.remove('show');
    history.replaceState(null, '', location.pathname);
    if (!code) return;
    try {
      const token = await getIdToken();
      await fetch(`${API_BASE}/leave-room/${code}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
    } catch (_) {}
  }

  function _handleRoomDeleted() {
    if (unsubRoom) { off(roomRef); unsubRoom = null; }
    _resetState();
    mpOverlay.classList.remove('show');
    showToast('The room was closed by the host.', 'info');
    history.replaceState(null, '', location.pathname);
  }

  function _resetState() {
    roomCode = null; roomSentence = null; isHost = false;
    _raceStarted = false; _selfFinished = false; _isReady = false;
    _waitingForReset = false; _currentWantsRematch = {};
    // Reset leave button to default "Leave Room" label
    mpLeaveBtn.textContent = 'Leave Room';
    mpLeaveBtn.classList.remove('is-host-close');
    if (mpResultLeaveBtn) { mpResultLeaveBtn.textContent = 'Leave Room'; mpResultLeaveBtn.classList.remove('is-host-close'); }
    if (mpResultLeaveBtn3) { mpResultLeaveBtn3.textContent = 'Leave Room'; mpResultLeaveBtn3.classList.remove('is-host-close'); }
    _resetResultPanel();
    if (_raceTimerHandle) { clearInterval(_raceTimerHandle); _raceTimerHandle = null; }
    if (window.__tt) window.__tt.setMultiplayer(false);
    if (mpFinishedNotice) mpFinishedNotice.style.display = 'none';
    if (mpRaceTimer) {
      mpRaceTimer.textContent = '—';
      mpRaceTimer.classList.remove('mp-race-timer-low', 'mp-race-timer-urgent');
    }
    racePanel.style.display = 'none';
    mpResultPanel.classList.remove('show');
    // Restore solo controls + top progress bar
    const langBar    = document.querySelector('.lang-toggle-bar');
    const lineSel    = document.querySelector('.line-selector');
    const controls   = document.querySelector('.controls');
    const progressCt = document.querySelector('.progress-container');
    if (langBar)    langBar.style.display    = '';
    if (lineSel)    lineSel.style.display    = '';
    if (controls)   controls.style.display   = '';
    if (progressCt) progressCt.style.display = '';
    _showView('lobby');
  }

  // ── URL-based auto-join ──────────────────────────────────────────────────────
  function _updateUrl(code) {
    history.replaceState(null, '', `${location.pathname}?room=${code}`);
  }

  // ── RTDB connection status indicator ────────────────────────────────────────
  const userPanel = document.getElementById('user-panel');
  const connRef   = ref(rtdb, '.info/connected');
  onValue(connRef, snap => {
    const online = snap.val() === true;
    if (userPanel) {
      userPanel.classList.toggle('connected',    online);
      userPanel.classList.toggle('disconnected', !online);
      userPanel.title = online ? 'Connected' : 'Disconnected – reconnecting…';
    }
  });

  // ── Custom Race button (homepage) ───────────────────────────────────────────
  if (btnCustomRace) {
    btnCustomRace.addEventListener('click', () => {
      const user = getCurrentUser();
      if (!user) { showToast('Sign in or play as Guest to use Custom Text multiplayer.', 'info'); return; }
      const guestUser2 = _isGuestUid(user.uid) || user.isAnonymous;
      _isAnonMode      = guestUser2;
      _anonDisplayName = guestUser2 ? _getAnonDisplayName(user.uid) : '';
      _syncMpLangPills();
      _showView('lobby');
      mpOverlay.classList.add('show');
      mpError.textContent = '';
      // Activate custom sentence if not already on
      if (!_useCustomSentence) {
        _useCustomSentence = true;
        mpCustomToggle.classList.add('active');
        if (mpCustomInput)    mpCustomInput.style.display    = '';
        if (mpCustomSaveRow)  mpCustomSaveRow.style.display  = '';
        if (mpLobbySelectors) mpLobbySelectors.style.display = 'none';
      }
      if (mpCustomInput) mpCustomInput.focus();
    });
  }

  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) {
    const code = urlRoom.toUpperCase();

    // Wait for Firebase to restore any persisted session before deciding what to show.
    // Without this, getCurrentUser() is always null on page load for signed-in users.
    waitForAuthReady.then(() => {
      const user = getCurrentUser();

      if (user) {
        // Already signed in (real or guest) — join directly
        if (_isGuestUid(user.uid) || user.isAnonymous) {
          _isAnonMode      = true;
          _anonDisplayName = _getAnonDisplayName(user.uid);
        }
        if (mpJoinLoadingMsg) mpJoinLoadingMsg.textContent = `Joining room ${code}…`;
        _showView('join-loading');
        mpOverlay.classList.add('show');
        _joinByCode(code);
      } else {
      // Not signed in — show the guest join prompt inside the MP overlay
      const anonCodeEl = document.getElementById('mp-anon-join-code');
      if (anonCodeEl) anonCodeEl.textContent = code;
      _showView('anon-join');
      mpOverlay.classList.add('show');

      const guestJoinBtn  = document.getElementById('mp-anon-join-guest-btn');
      const signInJoinBtn = document.getElementById('mp-anon-sign-in-btn');
      const anonJoinError = document.getElementById('mp-anon-join-error');

      if (guestJoinBtn) {
        guestJoinBtn.addEventListener('click', async () => {
          _isAnonMode = true;
          guestJoinBtn.disabled    = true;
          guestJoinBtn.textContent = 'Connecting…';
          try {
            const result = await _signInAsGuest();
            _anonDisplayName = result.displayName;
          } catch (err) {
            if (anonJoinError) anonJoinError.textContent = `Could not connect: ${err.message}`;
            guestJoinBtn.disabled    = false;
            guestJoinBtn.textContent = '👤 Join as Guest';
            return;
          }
          if (mpJoinLoadingMsg) mpJoinLoadingMsg.textContent = `Joining room ${code}…`;
          _showView('join-loading');
          _joinByCode(code);
        }, { once: true });
      }

      if (signInJoinBtn) {
        signInJoinBtn.addEventListener('click', () => {
          mpOverlay.classList.remove('show');
          const authModal          = document.getElementById('auth-modal');
          const authRoomNotice     = document.getElementById('auth-room-notice');
          const authRoomNoticeText = document.getElementById('auth-room-notice-text');
          if (authRoomNoticeText) authRoomNoticeText.textContent = `Sign in to join room ${code}`;
          if (authRoomNotice)     authRoomNotice.style.display   = '';
          if (authModal)          authModal.classList.add('show');

          let _urlJoinDone = false;
          const waitForAuth = setInterval(() => {
            const u = getCurrentUser();
            if (u && !_urlJoinDone) {
              _urlJoinDone = true;
              clearInterval(waitForAuth);
              if (authRoomNotice) authRoomNotice.style.display = 'none';
              if (authModal)      authModal.classList.remove('show');
              if (mpJoinLoadingMsg) mpJoinLoadingMsg.textContent = `Joining room ${code}…`;
              _showView('join-loading');
              mpOverlay.classList.add('show');
              _joinByCode(code);
            }
          }, 300);
          setTimeout(() => {
            if (!_urlJoinDone) {
              clearInterval(waitForAuth);
              if (authRoomNotice) authRoomNotice.style.display = 'none';
            }
          }, 120_000);
        }, { once: true });
      }

      } // end else (not signed in)
    }); // end waitForAuthReady.then
  } // end if (urlRoom)

  // ── Keyboard shortcuts for MP result panel ───────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!mpResultPanel || !mpResultPanel.classList.contains('show')) return;
    // Enter to play again (only when the default action row is visible)
    if (e.key === 'Enter' && mpResultActions && mpResultActions.style.display !== 'none') {
      e.preventDefault();
      mpPlayAgainBtn?.click();
    }
    // Escape to leave room from results
    if (e.key === 'Escape') {
      e.preventDefault();
      (mpResultLeaveBtn || mpResultLeaveBtn2)?.click();
    }
  });
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** True when the player is a guest (custom-token UID starts with "anon_"). */
function _isGuestUid(uid) {
  return String(uid || '').startsWith('anon_');
}

/** Get or create a stable anonymous session UUID stored in localStorage. */
function _getOrCreateAnonId() {
  let id = localStorage.getItem('anon-session-id');
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    localStorage.setItem('anon-session-id', id);
  }
  return id;
}

/**
 * Sign the user in as a guest using a Firebase custom token minted by the backend.
 * This does NOT require "Anonymous" sign-in to be enabled in the Firebase console.
 */
async function _signInAsGuest() {
  const uuid = _getOrCreateAnonId();

  // Pre-compute the name from the UID the backend will assign (anon_<uuid[:36]>).
  // This must happen BEFORE signInWithCustomToken so that onAuthStateChanged in
  // auth.js reads the same name from localStorage that we pass to join-room.
  const predictedUid = `anon_${uuid.slice(0, 36)}`;
  const predictedName = _getAnonDisplayName(predictedUid);
  localStorage.setItem('anon-display-name', predictedName);

  const API = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
    ? 'http://127.0.0.1:8000' : location.origin;

  // Ask the backend to mint a custom auth token for this UUID
  const resp = await fetch(`${API}/anon/token`, {
    headers: { 'X-Anon-Id': uuid },
    method: 'POST',
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Could not create guest session');
  }
  const { token } = await resp.json();

  // Sign in with the custom token — works with any Firebase project, no console settings needed
  const { getAuth, signInWithCustomToken } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const cred = await signInWithCustomToken(getAuth(), token);

  // predictedName/predictedUid are already in localStorage before onAuthStateChanged fires
  return { user: cred.user, displayName: predictedName };
}

/** Map a player UID to a consistent avatar color from the 12-color palette. */
function _uidToColor(uid) {
  const hash = String(uid).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return ANON_COLORS[hash % ANON_COLORS.length];
}

/**
 * Get (or assign) the anonymous display name for a given UID.
 * Stored in localStorage so it persists across page reloads.
 */
function _getAnonDisplayName(uid) {
  const savedUid  = localStorage.getItem('anon-uid');
  const savedName = localStorage.getItem('anon-display-name');
  if (savedUid === uid && savedName) return savedName;
  const hash = String(uid).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const name = ANON_NAMES[hash % ANON_NAMES.length];
  localStorage.setItem('anon-uid',          uid);
  localStorage.setItem('anon-display-name', name);
  return name;
}
