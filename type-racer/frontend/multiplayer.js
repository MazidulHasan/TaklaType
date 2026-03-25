/**
 * multiplayer.js – Phase 2B real-time multiplayer for TaklaType.
 * Uses Firebase Realtime Database for live room state + player progress.
 */

import { rtdb, isConfigured } from './firebase-config.js';
import { getCurrentUser, getIdToken } from './auth.js';
import { showToast } from './toast.js';

const API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
  ? 'http://127.0.0.1:8000' : location.origin;

// ─── Hide UI when Firebase not configured ────────────────────────────────────
if (!isConfigured) {
  const btn = document.getElementById('mp-btn');
  if (btn) btn.style.display = 'none';
} else {
  _initMultiplayer();
}

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
  const mpQuitRaceBtn    = document.getElementById('mp-quit-race-btn');
  const mpResultPanel    = document.getElementById('mp-result-panel');
  const mpResultList     = document.getElementById('mp-result-list');
  const mpPlayAgainBtn   = document.getElementById('mp-play-again-btn');
  const mpResultLeaveBtn  = document.getElementById('mp-result-leave-btn');
  const mpResetWaiting    = document.getElementById('mp-reset-waiting');
  const mpLinePills        = document.querySelectorAll('.mp-line-pill[data-mpcount]');
  const mpCustomToggle     = document.getElementById('mp-custom-toggle');
  const mpCustomInput      = document.getElementById('mp-custom-input');
  const mpCustomSaveRow    = document.getElementById('mp-custom-save-row');
  const mpCustomSaveCb     = document.getElementById('mp-custom-save-cb');

  // ── State ───────────────────────────────────────────────────────────────────
  let _waitingForReset  = false;
  let roomCode          = null;
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

  // ── Custom sentence toggle ───────────────────────────────────────────────────
  let _useCustomSentence = false;
  if (mpCustomToggle) {
    mpCustomToggle.addEventListener('click', () => {
      _useCustomSentence = !_useCustomSentence;
      mpCustomToggle.classList.toggle('active', _useCustomSentence);
      if (mpCustomInput)   mpCustomInput.style.display   = _useCustomSentence ? '' : 'none';
      if (mpCustomSaveRow) mpCustomSaveRow.style.display = _useCustomSentence ? '' : 'none';
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

  // ── Open/close lobby modal ──────────────────────────────────────────────────
  mpBtn.addEventListener('click', () => {
    const user = getCurrentUser();
    if (!user) { showToast('Please sign in to play multiplayer.', 'info'); return; }
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
  }

  // ── View switcher ───────────────────────────────────────────────────────────
  function _showView(name) {
    mpLobbyView.style.display = name === 'lobby' ? '' : 'none';
    mpRoomView.style.display  = name === 'room'  ? '' : 'none';
  }

  // ── Create room ─────────────────────────────────────────────────────────────
  mpCreateBtn.addEventListener('click', async () => {
    mpError.textContent     = '';
    mpCreateBtn.disabled    = true;
    mpCreateBtn.textContent = 'Creating…';
    try {
      const token = await getIdToken();
      const customText = _useCustomSentence ? (mpCustomInput?.value.trim() || '') : '';
      const resp  = await fetch(`${API_BASE}/create-room?count=${_selectedLines}&category=${_selectedCategory}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ custom_sentence: customText }),
      });
      // Optionally save custom sentence to the pool
      if (customText && mpCustomSaveCb?.checked) {
        fetch(`${API_BASE}/add-sentence`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ sentence: customText, category: _selectedCategory }),
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
      const token = await getIdToken();
      const resp  = await fetch(`${API_BASE}/join-room/${code}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to join room');
      await _enterRoom(code, data.sentence, false);
    } catch (err) {
      mpError.textContent = err.message;
    } finally {
      mpJoinBtn.disabled    = false;
      mpJoinBtn.textContent = 'Join';
    }
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

    _showView('room');
    mpOverlay.classList.add('show');

    roomRef   = ref(rtdb, `/rooms/${code}`);
    unsubRoom = onValue(roomRef, snap => {
      const room = snap.val();
      if (!room) { _handleRoomDeleted(); return; }

      // Non-host waiting for host to reset → show room lobby when status returns to waiting
      if (_waitingForReset && room.status === 'waiting') {
        _waitingForReset = false;
        if (mpResetWaiting) mpResetWaiting.style.display = 'none';
        if (mpPlayAgainBtn) mpPlayAgainBtn.style.display = '';
        mpResultPanel.classList.remove('show');
        _showView('room');
        mpStartBtn.disabled        = true;
        mpStartBtn.textContent     = 'Start Race';
        mpReadyBtn.style.display   = '';
        mpWaitingMsg.style.display = '';
        _isReady = false;
        _updateReadyBtn();
        mpOverlay.classList.add('show');
        return;
      }

      _renderRoomPlayers(room.players || {}, room.hostUid);
      if (room.status === 'racing' && !_raceStarted) _startCountdown(room);
      if (room.status === 'finished' && _raceStarted) _showMpResults(room.players || {});
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
      return `<li class="mp-player-item">${_esc(p.displayName)}${youTag}${hostTag}${readyTag}</li>`;
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
    if (mpFinishedNotice) mpFinishedNotice.style.display = 'none';
    _selfFinished = false;
    _raceStartMs  = Date.now();
    // Hide solo controls during multiplayer race
    const lineSel  = document.querySelector('.line-selector');
    const controls = document.querySelector('.controls');
    if (lineSel)  lineSel.style.display  = 'none';
    if (controls) controls.style.display = 'none';
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
        mpRaceTimer.classList.toggle('mp-race-timer-low', remaining <= 20);
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
      const you    = uid === user?.uid ? ' (you)' : '';
      const pct    = Math.min(p.progress || 0, 100);
      const finTag = p.finished ? ` <span class="mp-bar-rank">#${p.rank}</span>` : '';
      const avatar = p.photoURL
        ? `<img class="mp-bar-avatar" src="${_esc(p.photoURL)}" alt="" onerror="this.style.display='none'">`
        : `<span class="mp-bar-avatar-fb">${_esc((p.displayName || '?')[0].toUpperCase())}</span>`;
      return `<div class="mp-bar-row">
        ${avatar}
        <span class="mp-bar-name">${_esc(p.displayName)}${you}</span>
        <div class="mp-bar-track">
          <div class="mp-bar-fill" style="width:${pct}%"></div>
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
  window.addEventListener('tt-finished', async ({ detail }) => {
    if (!roomCode || !_raceStarted || _selfFinished) return;
    _selfFinished = true;

    // Show "waiting for others" notice in race panel
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
    mpResultList.innerHTML = [...sorted, ...unfinished].map(p => {
      const pos = p.finished ? `#${p.rank}` : 'DNF';
      return `<li class="mp-result-row">
        <span class="mp-result-pos">${pos}</span>
        <span class="mp-result-name">${_esc(p.displayName)}</span>
        <span class="mp-result-wpm">${p.wpm || 0} WPM</span>
      </li>`;
    }).join('');
    mpResultPanel.classList.add('show');
  }

  // ── Play again ───────────────────────────────────────────────────────────────
  mpPlayAgainBtn.addEventListener('click', async () => {
    mpResultPanel.classList.remove('show');
    _raceStarted  = false;
    _selfFinished = false;
    _isReady      = false;
    if (window.__tt) window.__tt.setMultiplayer(false);
    racePanel.style.display = 'none';
    if (mpFinishedNotice) mpFinishedNotice.style.display = 'none';

    if (isHost) {
      try {
        const token = await getIdToken();
        await fetch(`${API_BASE}/reset-room/${roomCode}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) {}
      _showView('room');
      mpStartBtn.disabled    = true;
      mpStartBtn.textContent = 'Start Race';
      mpOverlay.classList.add('show');
    } else {
      // Non-host: show waiting spinner until host resets room
      _waitingForReset = true;
      if (mpPlayAgainBtn) mpPlayAgainBtn.style.display = 'none';
      if (mpResetWaiting) mpResetWaiting.style.display = '';
    }
    history.replaceState(null, '', location.pathname);
  });

  // ── Leave from results screen ─────────────────────────────────────────────
  if (mpResultLeaveBtn) {
    mpResultLeaveBtn.addEventListener('click', () => {
      mpResultPanel.classList.remove('show');
      _leaveRoom();
    });
  }

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
    _raceStarted = false; _selfFinished = false; _isReady = false; _waitingForReset = false;
    if (mpResetWaiting) mpResetWaiting.style.display = 'none';
    if (mpPlayAgainBtn) mpPlayAgainBtn.style.display = '';
    if (_raceTimerHandle) { clearInterval(_raceTimerHandle); _raceTimerHandle = null; }
    if (window.__tt) window.__tt.setMultiplayer(false);
    if (mpFinishedNotice) mpFinishedNotice.style.display = 'none';
    if (mpRaceTimer) mpRaceTimer.textContent = '—';
    racePanel.style.display = 'none';
    mpResultPanel.classList.remove('show');
    _showView('lobby');
  }

  // ── URL-based auto-join ──────────────────────────────────────────────────────
  function _updateUrl(code) {
    history.replaceState(null, '', `${location.pathname}?room=${code}`);
  }

  // ── RTDB connection status indicator ────────────────────────────────────────
  const connDot  = document.getElementById('conn-dot');
  const connRef  = ref(rtdb, '.info/connected');
  onValue(connRef, snap => {
    const online = snap.val() === true;
    if (connDot) {
      connDot.classList.toggle('connected',    online);
      connDot.classList.toggle('disconnected', !online);
      connDot.title = online ? 'Connected' : 'Disconnected – reconnecting…';
    }
  });

  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) {
    const user = getCurrentUser();
    if (user) {
      _joinByCode(urlRoom.toUpperCase());
    } else {
      const waitForAuth = setInterval(() => {
        const u = getCurrentUser();
        if (u) { clearInterval(waitForAuth); _joinByCode(urlRoom.toUpperCase()); }
      }, 500);
      setTimeout(() => clearInterval(waitForAuth), 10000);
    }
  }
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
