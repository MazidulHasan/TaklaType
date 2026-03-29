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
  const btnCR = document.getElementById('btn-custom-race');
  if (btnCR) btnCR.style.display = 'none';
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
  const mpLinePills        = document.querySelectorAll('.mp-line-pill[data-mpcount]');
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
    mpLobbyView.style.display      = name === 'lobby'        ? '' : 'none';
    mpRoomView.style.display       = name === 'room'         ? '' : 'none';
    if (mpJoinLoadingView)
      mpJoinLoadingView.style.display = name === 'join-loading' ? '' : 'none';
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
      const token = await getIdToken();
      const resp  = await fetch(`${API_BASE}/join-room/${code}`, {
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
    if (mpRaceContent)    mpRaceContent.style.display    = '';
    if (mpProcessing)     mpProcessing.style.display     = 'none';
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

    // Hide race content, show processing spinner
    if (mpRaceContent)    mpRaceContent.style.display    = 'none';
    if (mpProcessing)     mpProcessing.style.display     = '';
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
    mpResultList.innerHTML = sortedUids.map(([uid, p]) => {
      const pos = p.finished ? `#${p.rank}` : 'DNF';
      return `<li class="mp-result-row" data-uid="${_esc(uid)}">
        <span class="mp-result-pos">${pos}</span>
        <span class="mp-result-name">${_esc(p.displayName)}</span>
        <span class="mp-result-wpm">${p.wpm || 0} WPM</span>
        <span class="mp-result-rematch-icon" style="visibility:hidden" title="Wants to play again">↺</span>
      </li>`;
    }).join('');
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

  // ── Play again — host sees rematch setup; non-host waits ────────────────────
  mpPlayAgainBtn.addEventListener('click', async () => {
    _raceStarted  = false;
    _selfFinished = false;
    _isReady      = false;
    if (window.__tt) window.__tt.setMultiplayer(false);
    racePanel.style.display = 'none';
    if (mpRaceContent)    mpRaceContent.style.display    = '';
    if (mpProcessing)     mpProcessing.style.display     = 'none';
    if (mpFinishedNotice) mpFinishedNotice.style.display = 'none';

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
      document.querySelectorAll('#mp-rematch-lines .mp-line-pill').forEach(p => {
        p.classList.toggle('active', parseInt(p.dataset.rematchCount, 10) === _rematchLines);
      });
      document.querySelectorAll('#mp-rematch-cat .mp-line-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.rematchCat === _rematchCategory);
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
        const customText = _useRematchCustom ? (mpRematchCustomInput?.value.trim() || '') : '';
        await fetch(`${API_BASE}/reset-room/${roomCode}?count=${_rematchLines}&category=${_rematchCategory}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ custom_sentence: customText }),
        });
      } catch (_) {}
      // Reset rematch custom state
      _useRematchCustom = false;
      if (mpRematchCustomToggle) mpRematchCustomToggle.classList.remove('active');
      if (mpRematchCustomInput)  { mpRematchCustomInput.style.display = 'none'; mpRematchCustomInput.value = ''; }
      if (mpRematchSelectors)    mpRematchSelectors.style.display = '';
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
    // Restore solo controls
    const lineSel  = document.querySelector('.line-selector');
    const controls = document.querySelector('.controls');
    if (lineSel)  lineSel.style.display  = '';
    if (controls) controls.style.display = '';
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
      if (!user) { showToast('Sign in to use Custom Race.', 'info'); return; }
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
    const user = getCurrentUser();

    if (user) {
      // Already signed in — show loading state in MP overlay then join
      if (mpJoinLoadingMsg) mpJoinLoadingMsg.textContent = `Joining room ${code}…`;
      _showView('join-loading');
      mpOverlay.classList.add('show');
      _joinByCode(code);
    } else {
      // Not signed in — open auth modal with a notice, then auto-join after sign-in
      const authRoomNotice     = document.getElementById('auth-room-notice');
      const authRoomNoticeText = document.getElementById('auth-room-notice-text');
      const authModal          = document.getElementById('auth-modal');
      if (authRoomNoticeText) authRoomNoticeText.textContent = `Sign in to join room ${code}`;
      if (authRoomNotice)     authRoomNotice.style.display   = '';
      if (authModal)          authModal.classList.add('show');

      let _urlJoinDone = false;
      const waitForAuth = setInterval(() => {
        const u = getCurrentUser();
        if (u && !_urlJoinDone) {
          _urlJoinDone = true;
          clearInterval(waitForAuth);
          // Hide auth notice and modal, show join loading
          if (authRoomNotice) authRoomNotice.style.display = 'none';
          if (authModal)      authModal.classList.remove('show');
          if (mpJoinLoadingMsg) mpJoinLoadingMsg.textContent = `Joining room ${code}…`;
          _showView('join-loading');
          mpOverlay.classList.add('show');
          _joinByCode(code);
        }
      }, 300);
      // Give up after 2 minutes (user closed modal or gave up)
      setTimeout(() => {
        if (!_urlJoinDone) {
          clearInterval(waitForAuth);
          if (authRoomNotice) authRoomNotice.style.display = 'none';
        }
      }, 120_000);
    }
  }
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
