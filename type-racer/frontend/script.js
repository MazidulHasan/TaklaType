/**
 * script.js – TaklaType Phase 2
 */

import { getCurrentUser, getIdToken } from './auth.js';

// Multiplayer interface — lets multiplayer.js inject a sentence and listen for events
window.__tt = {
  inMultiplayer: false,
  // Call this instead of setting inMultiplayer directly so the restart button is toggled
  setMultiplayer(val) {
    this.inMultiplayer = val;
    const btn = document.getElementById('btn-restart');
    if (btn) {
      btn.disabled = val;
      btn.title    = val ? 'Finish or leave the multiplayer race first' : '';
    }
  },
  startRound(sentence) {
    // Capitalize first letter of each sentence segment
    targetSentence = sentence.split('. ').map(
      s => (s && s.length > 0) ? s.charAt(0).toUpperCase() + s.slice(1) : s
    ).join('. ');
    sentencesArray = [targetSentence];
    sentenceBoundaries = new Set();
    initRound();
  },
};

// Resolve API base so it works both locally and when deployed
const API_BASE = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
  ? 'http://127.0.0.1:8000'
  : window.location.origin;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const sentenceDisplay   = document.getElementById('sentence-display');
const sentenceContainer = document.getElementById('sentence-container');
const typingInput       = document.getElementById('typing-input');
const timerEl           = document.getElementById('timer');
const wpmEl             = document.getElementById('wpm');
const accuracyEl        = document.getElementById('accuracy');
const errorsEl          = document.getElementById('errors');
const progressBar       = document.getElementById('progress-bar');
const btnRestart        = document.getElementById('btn-restart');
const resultOverlay     = document.getElementById('result-overlay');
const resultWpmEl       = document.getElementById('result-wpm');
const resultAccEl       = document.getElementById('result-accuracy');
const resultErrEl       = document.getElementById('result-errors');
const resultTimeEl      = document.getElementById('result-time');
const resultSaveStatus  = document.getElementById('result-save-status');
const btnModalRestart   = document.getElementById('btn-modal-restart');
const confettiCanvas    = document.getElementById('confetti-canvas');
const settingsMenu      = document.getElementById('settings-menu');
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const settingsDropdown  = document.getElementById('settings-dropdown');

// ─── State ────────────────────────────────────────────────────────────────────
let targetSentence     = '';
let sentencesArray     = [];
let sentenceBoundaries = new Set();
let typedChars         = [];
let cursorIndex        = 0;
let selectedModifiers  = new Set();
let timerInterval      = null;
let startTime          = null;
let elapsedSeconds     = 0;
let totalErrors        = 0;
let finished           = false;
let selectedLines      = 3;
let selectedCategory   = 'general';
let selectedLang       = localStorage.getItem('taklatype-lang') || 'bn';
let keyErrors          = {}; // char → error count
let confettiRafId      = null;
let lastParticleMs     = 0;

// ─── Settings State ───────────────────────────────────────────────────────────
const PARTICLE_STYLES = ['off', 'sparkle', 'fire', 'ash', 'snow', 'stars', 'bubbles'];

const settings = {
  sound:         false,
  timer:         true,
  particleStyle: 'sparkle',
  fontSize:      'medium',
  theme:         'dark',
};

function loadSettings() {
  const saved = localStorage.getItem('taklatype-settings');
  if (saved) {
    const parsed = JSON.parse(saved);
    // Migrate old boolean particles → particleStyle
    if ('particles' in parsed && !('particleStyle' in parsed)) {
      parsed.particleStyle = parsed.particles ? 'sparkle' : 'off';
      delete parsed.particles;
    }
    Object.assign(settings, parsed);
  }
}

function saveSettings() {
  localStorage.setItem('taklatype-settings', JSON.stringify(settings));
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.querySelectorAll('.theme-option').forEach(o => {
    o.classList.toggle('active', o.dataset.theme === settings.theme);
  });

  const sizeMap = { small: '1rem', medium: '1.25rem', large: '1.55rem' };
  sentenceDisplay.style.fontSize = sizeMap[settings.fontSize] || '1.25rem';
  requestAnimationFrame(setContainerHeight);
  document.querySelectorAll('.option-pill[data-font]').forEach(p => {
    p.classList.toggle('active', p.dataset.font === settings.fontSize);
  });

  const timerItem = timerEl.closest('.stat-item');
  if (timerItem) timerItem.style.display = settings.timer ? '' : 'none';
  document.getElementById('toggle-timer').classList.toggle('active', settings.timer);
  document.getElementById('toggle-sound').classList.toggle('active', settings.sound);
  const label = document.getElementById('particle-style-label');
  if (label) label.textContent = settings.particleStyle;
}

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioCtx = null;
function playErrorSound() {
  if (!settings.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(110, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } catch (_) {}
}

// ─── Settings Menu ────────────────────────────────────────────────────────────
settingsToggleBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = settingsMenu.classList.toggle('open');
  settingsDropdown.setAttribute('aria-hidden', String(!isOpen));
});

document.addEventListener('click', e => {
  if (!settingsMenu.contains(e.target)) {
    settingsMenu.classList.remove('open');
    settingsDropdown.setAttribute('aria-hidden', 'true');
  }
});

document.querySelectorAll('.theme-option').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.theme = btn.dataset.theme;
    saveSettings();
    applySettings();
  });
});

document.querySelectorAll('.option-pill[data-font]').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.fontSize = btn.dataset.font;
    saveSettings();
    applySettings();
  });
});

document.getElementById('toggle-sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  applySettings();
});

document.getElementById('toggle-timer').addEventListener('click', () => {
  settings.timer = !settings.timer;
  saveSettings();
  applySettings();
});

document.getElementById('particle-prev').addEventListener('click', () => {
  const i = PARTICLE_STYLES.indexOf(settings.particleStyle);
  settings.particleStyle = PARTICLE_STYLES[(i - 1 + PARTICLE_STYLES.length) % PARTICLE_STYLES.length];
  saveSettings(); applySettings();
});
document.getElementById('particle-next').addEventListener('click', () => {
  const i = PARTICLE_STYLES.indexOf(settings.particleStyle);
  settings.particleStyle = PARTICLE_STYLES[(i + 1) % PARTICLE_STYLES.length];
  saveSettings(); applySettings();
});

// ─── Line Count Selector ──────────────────────────────────────────────────────
document.querySelectorAll('.pill[data-count]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill[data-count]').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    selectedLines = parseInt(btn.dataset.count, 10);
    fetchSentence();
  });
});

document.querySelectorAll('.pill[data-solocat]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill[data-solocat]').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    selectedCategory = btn.dataset.solocat;
    fetchSentence();
  });
});

// ─── Difficulty Modifiers ─────────────────────────────────────────────────────
(function initModifierDropdown() {
  const trigger  = document.getElementById('modifier-trigger-btn');
  const dropdown = document.getElementById('modifier-dropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    // Scale-pop animation matching the MP dropdown trigger
    trigger.classList.remove('clicked');
    void trigger.offsetWidth; // reflow to restart animation
    trigger.classList.add('clicked');
    trigger.addEventListener('animationend', () => trigger.classList.remove('clicked'), { once: true });
    dropdown.classList.toggle('open');
  });
  // Keep dropdown open when clicking inside it
  dropdown.addEventListener('click', e => e.stopPropagation());
  // Close on outside click
  document.addEventListener('click', () => dropdown.classList.remove('open'));
})();

function _updateModifierTrigger() {
  const trigger = document.getElementById('modifier-trigger-btn');
  if (trigger) trigger.classList.toggle('has-active', selectedModifiers.size > 0);
}

document.querySelectorAll('#modifier-dropdown-wrap .pill[data-modifier]').forEach(btn => {
  btn.addEventListener('click', () => {
    const mod = btn.dataset.modifier;
    if (selectedModifiers.has(mod)) { selectedModifiers.delete(mod); btn.classList.remove('active'); }
    else                            { selectedModifiers.add(mod);    btn.classList.add('active');    }
    _updateModifierTrigger();
    fetchSentence();
  });
});

function applyModifiers(text, mods) {
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
      if (i === 0) return c; // preserve leading capital
      return (/[a-z]/.test(c) && Math.random() < 0.18) ? c.toUpperCase() : c;
    }).join('');
  }
  return result;
}

// ─── Language Toggle ──────────────────────────────────────────────────────────
// Apply saved lang on load
document.querySelectorAll('#solo-lang-pills .lang-pill').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.lang === selectedLang);
  btn.addEventListener('click', () => {
    document.querySelectorAll('#solo-lang-pills .lang-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    selectedLang = btn.dataset.lang;
    localStorage.setItem('taklatype-lang', selectedLang);
    fetchSentence();
  });
});

// ─── Focus Management ─────────────────────────────────────────────────────────
function focusInput() {
  typingInput.focus({ preventScroll: true });
}

sentenceContainer.addEventListener('click', focusInput);

typingInput.addEventListener('focus', () => {
  sentenceContainer.classList.add('is-focused', 'hide-hint');
});

typingInput.addEventListener('blur', () => {
  sentenceContainer.classList.remove('is-focused');
  if (!startTime && !finished) sentenceContainer.classList.remove('hide-hint');
});

// ─── Fetch Sentence ───────────────────────────────────────────────────────────
async function fetchSentence() {
  btnRestart.disabled    = true;
  btnRestart.textContent = '↺ Loading…';
  sentenceDisplay.innerHTML = '<span class="loading-text">Loading…</span>';
  sentenceContainer.classList.remove('hide-hint');

  try {
    const res  = await fetch(`${API_BASE}/get-sentences?count=${selectedLines}&category=${selectedCategory}&lang=${selectedLang}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Capitalize the first letter of each sentence
    sentencesArray = (data.sentences || [data.sentence]).map(
      s => (s && s.length > 0) ? s.charAt(0).toUpperCase() + s.slice(1) : s
    );
    targetSentence = applyModifiers(sentencesArray.join('. '), selectedModifiers);

    // Boundaries are only valid on the unmodified sentence; clear them when modifiers shift positions
    sentenceBoundaries = new Set();
    if (selectedModifiers.size === 0) {
      let pos = 0;
      for (let i = 0; i < sentencesArray.length - 1; i++) {
        pos += sentencesArray[i].length;
        sentenceBoundaries.add(pos);
        pos += 2;
      }
    }

    initRound();
  } catch (err) {
    sentenceDisplay.innerHTML =
      '<span class="loading-text" style="color:var(--wrong)">Backend not running? Run: uvicorn backend.main:app --reload</span>';
    console.error(err);
  } finally {
    btnRestart.disabled    = false;
    btnRestart.textContent = '↺ New Race';
  }
}

// ─── Round Init ───────────────────────────────────────────────────────────────
function initRound() {
  typedChars     = Array(targetSentence.length).fill('remaining');
  cursorIndex    = 0;
  totalErrors    = 0;
  keyErrors      = {};
  elapsedSeconds = 0;
  finished       = false;

  stopTimer();
  clearConfetti();
  hideResult();
  resetStatDisplay();
  renderSentence();

  progressBar.style.width = '0%';
  sentenceContainer.classList.remove('shake');
  document.body.classList.remove('typing-active');
  sentenceContainer.scrollTop = 0;
  sentenceDisplay.style.transform = '';
  focusInput();
}

function resetStatDisplay() {
  timerEl.textContent    = '00:00';
  wpmEl.textContent      = '0';
  accuracyEl.textContent = '100%';
  errorsEl.textContent   = '0';
  startTime              = null;
}

// ─── Render Sentence ──────────────────────────────────────────────────────────
function renderSentence() {
  // Wrap each word in an inline-block container so words don't split across lines
  let html = '';
  let inWord = false;
  for (let i = 0; i < targetSentence.length; i++) {
    const ch      = targetSentence[i];
    const cursor  = i === cursorIndex ? ' cursor' : '';
    const dotCls  = sentenceBoundaries.has(i) ? ' sentence-dot' : '';
    if (ch === ' ') {
      if (inWord) { html += '</span>'; inWord = false; }
      html += `<span class="char remaining${cursor}${dotCls}">&nbsp;</span>`;
    } else {
      if (!inWord) { html += '<span class="word">'; inWord = true; }
      html += `<span class="char remaining${cursor}${dotCls}">${ch}</span>`;
    }
  }
  if (inWord) html += '</span>';
  sentenceDisplay.innerHTML = html;
}

// ─── Targeted span updates ───────────────────────────────────────────────────
function getCharSpans() {
  return sentenceDisplay.querySelectorAll('.char');
}

function setCharState(index, state) {
  const span = getCharSpans()[index];
  if (!span) return;
  const hasCursor = span.classList.contains('cursor');
  const dotCls    = sentenceBoundaries.has(index) ? ' sentence-dot' : '';
  span.className  = `char ${state}${hasCursor ? ' cursor' : ''}${dotCls}`;
}

// ─── Monkeytype-style line scroll ─────────────────────────────────────────────
function _lineH() {
  return parseFloat(getComputedStyle(sentenceDisplay).lineHeight) || 32;
}

function setContainerHeight() {
  const lineH     = _lineH();
  const padT      = parseFloat(getComputedStyle(sentenceContainer).paddingTop)    || 0;
  const padB      = parseFloat(getComputedStyle(sentenceContainer).paddingBottom)  || 0;
  const threeLines = Math.ceil(3 * lineH + padT + padB);

  // Always enforce minimum = 3 lines (resize handle reads this from computedStyle)
  sentenceContainer.style.minHeight = threeLines + 'px';

  // Only set the height if the user has no saved custom height
  if (!localStorage.getItem('tt-sentence-height')) {
    sentenceContainer.style.height = threeLines + 'px';
  }
}

function syncLineScroll() {
  const spans = getCharSpans();
  const idx   = Math.min(cursorIndex, targetSentence.length - 1);
  const cursorSpan = spans[idx];
  if (!cursorSpan) return;

  const lineH = _lineH();
  const padT  = parseFloat(getComputedStyle(sentenceContainer).paddingTop) || 0;

  // offsetTop is layout-based (not affected by scrollTop), relative to sentence-container
  const absoluteLine = Math.floor((cursorSpan.offsetTop - padT) / lineH);

  // Keep cursor on the 2nd visible line: scrollTop = (line - 1) * lineH
  if (absoluteLine >= 2) {
    sentenceContainer.scrollTop = (absoluteLine - 1) * lineH;
  }
}

function moveCursor(from, to) {
  const spans = getCharSpans();
  spans[from]?.classList.remove('cursor');
  if (to < targetSentence.length) {
    spans[to]?.classList.add('cursor');
    syncLineScroll();
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  if (timerInterval) return;
  startTime    = Date.now();
  timerInterval = setInterval(() => {
    elapsedSeconds = (Date.now() - startTime) / 1000;
    if (settings.timer) timerEl.textContent = formatTime(elapsedSeconds);
    updateLiveWpm();
  }, 200);
}

function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(Math.floor(s % 60)).padStart(2,'0')}`;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
function calcWpm(correct, secs) {
  return secs < 0.5 ? 0 : Math.round((correct / 5) / (secs / 60));
}
function calcAccuracy(correct, total) {
  return total === 0 ? 100 : Math.round((correct / total) * 100);
}
function correctCount() {
  return typedChars.slice(0, cursorIndex).filter(s => s === 'correct').length;
}
function updateLiveWpm() {
  wpmEl.textContent = calcWpm(correctCount(), elapsedSeconds);
}
function updateLiveAccuracy() {
  accuracyEl.textContent = calcAccuracy(correctCount(), cursorIndex) + '%';
}

// ─── Stat pulse ───────────────────────────────────────────────────────────────
function pulse(el) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

// ─── Rollup animation ─────────────────────────────────────────────────────────
function rollup(el, to, suffix, ms) {
  const t0   = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  (function frame(now) {
    const p = Math.min((now - t0) / ms, 1);
    el.textContent = Math.round(to * ease(p)) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}

// ─── Key Error Heatmap ────────────────────────────────────────────────────────
const KEYBOARD_ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['z','x','c','v','b','n','m',' '],
];

function renderHeatmap() {
  const section  = document.getElementById('heatmap-section');
  const keyboard = document.getElementById('heatmap-keyboard');
  if (!keyboard || Object.keys(keyErrors).length === 0) {
    if (section) section.style.display = 'none';
    return;
  }
  const maxErr = Math.max(...Object.values(keyErrors));
  keyboard.innerHTML = KEYBOARD_ROWS.map(row =>
    `<div class="hk-row">${row.map(key => {
      const errs     = keyErrors[key] || 0;
      const heat     = errs > 0 ? Math.ceil((errs / maxErr) * 4) : 0; // 0–4
      const label    = key === ' ' ? '␣' : key.toUpperCase();
      return `<span class="hk-key heat-${heat}" title="${errs} mistake${errs !== 1 ? 's' : ''}">${label}</span>`;
    }).join('')}</div>`
  ).join('');
  if (section) section.style.display = '';
}

// ─── Keystroke particle ───────────────────────────────────────────────────────
function spawnParticle(charIndex) {
  if (settings.particleStyle === 'off') return;
  const now = Date.now();
  if (now - lastParticleMs < 40) return;
  lastParticleMs = now;
  const span = getCharSpans()[charIndex];
  if (!span) return;
  const r   = span.getBoundingClientRect();
  const p   = document.createElement('span');
  const off = settings.particleStyle === 'sparkle' ? 3.5 : 5;
  p.className  = `particle particle-${settings.particleStyle}`;
  p.style.left = `${r.left + r.width  / 2 - off}px`;
  p.style.top  = `${r.top  + r.height / 2 - off}px`;
  document.body.appendChild(p);
  p.addEventListener('animationend', () => p.remove(), { once: true });
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#e2b714','#00bcd4','#66bb6a','#ff7043','#ab47bc','#ef5350','#42a5f5','#ffca28'];

function launchConfetti() {
  clearConfetti();
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width  = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  const parts = Array.from({ length: 130 }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: Math.random() * -confettiCanvas.height * 0.4 - 20,
    vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3 + 2,
    rot: Math.random() * 360,      rs: (Math.random() - 0.5) * 8,
    w: Math.random() * 8 + 5,      h: Math.random() * 5 + 4,
    col: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)], a: 1,
  }));
  function draw() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = 0;
    for (const p of parts) {
      p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.rot += p.rs;
      if (p.y > confettiCanvas.height * 0.85) p.a -= 0.03;
      if (p.a <= 0) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive > 0) confettiRafId = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
  confettiRafId = requestAnimationFrame(draw);
}

function clearConfetti() {
  if (confettiRafId) { cancelAnimationFrame(confettiRafId); confettiRafId = null; }
  confettiCanvas.getContext('2d').clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

// ─── Input handling ───────────────────────────────────────────────────────────
typingInput.addEventListener('keydown', e => {
  if (finished) {
    // Enter to play again when result modal is visible
    if (e.key === 'Enter' && resultOverlay.classList.contains('show')) {
      e.preventDefault();
      fetchSentence();
    }
    return;
  }
  if (['Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault(); return;
  }
  if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(); return; }
  if (e.key.length !== 1) return;
  e.preventDefault();
  handleCharInput(e.key);
});
typingInput.addEventListener('paste', e => e.preventDefault());

function handleBackspace() {
  if (cursorIndex === 0) return;
  const prev = cursorIndex;
  cursorIndex--;
  typedChars[cursorIndex] = 'remaining';
  setCharState(cursorIndex, 'remaining');
  moveCursor(prev, cursorIndex);
  updateProgress();
  updateLiveAccuracy();
}

function handleCharInput(char) {
  if (cursorIndex >= targetSentence.length) return;
  if (!startTime) {
    startTimer();
    document.body.classList.add('typing-active');
  }

  const idx       = cursorIndex;
  const isCorrect = char === targetSentence[idx];
  typedChars[idx] = isCorrect ? 'correct' : 'wrong';

  setCharState(idx, typedChars[idx]);
  cursorIndex++;
  moveCursor(idx, cursorIndex);

  const charSpan = getCharSpans()[idx];
  if (charSpan) {
    const cls = isCorrect ? 'just-typed' : 'just-wrong';
    charSpan.classList.add(cls);
    charSpan.addEventListener('animationend', () => charSpan.classList.remove(cls), { once: true });
  }

  if (isCorrect) {
    spawnParticle(idx);
  } else {
    totalErrors++;
    errorsEl.textContent = totalErrors;
    // Track which character was expected (for heatmap)
    const expectedChar = targetSentence[idx] || '';
    if (expectedChar) keyErrors[expectedChar] = (keyErrors[expectedChar] || 0) + 1;
    pulse(errorsEl);
    shakeContainer();
    playErrorSound();
  }

  updateProgress();
  updateLiveAccuracy();
  updateLiveWpm();
  pulse(wpmEl);

  // Notify multiplayer module of progress
  if (targetSentence.length > 0) {
    window.dispatchEvent(new CustomEvent('tt-progress', { detail: {
      progress: Math.round((cursorIndex / targetSentence.length) * 100),
      wpm:      calcWpm(correctCount(), elapsedSeconds),
    }}));
  }

  if (cursorIndex === targetSentence.length) finishRound();
}

function shakeContainer() {
  sentenceContainer.classList.remove('shake');
  void sentenceContainer.offsetWidth;
  sentenceContainer.classList.add('shake');
}

function updateProgress() {
  progressBar.style.width = `${(cursorIndex / targetSentence.length) * 100}%`;
}

// ─── Finish ───────────────────────────────────────────────────────────────────
async function finishRound() {
  stopTimer();
  finished = true;
  document.body.classList.remove('typing-active');

  const correct = typedChars.filter(s => s === 'correct').length;
  const wpm     = calcWpm(correct, elapsedSeconds);
  const acc     = calcAccuracy(correct, targetSentence.length);
  const secs    = Math.round(elapsedSeconds);

  timerEl.textContent    = formatTime(elapsedSeconds);
  wpmEl.textContent      = wpm;
  accuracyEl.textContent = acc + '%';
  errorsEl.textContent   = totalErrors;
  progressBar.style.width = '100%';

  // Notify multiplayer module that race is done
  window.dispatchEvent(new CustomEvent('tt-finished', { detail: { wpm, accuracy: acc, errors: totalErrors, time: elapsedSeconds, keyErrors: { ...keyErrors } } }));

  // In multiplayer the MP results overlay handles everything — skip solo UI
  if (window.__tt?.inMultiplayer) return;

  launchConfetti();

  // Show loading overlay immediately after confetti
  const resultLoadingEl = document.getElementById('result-loading');
  if (resultLoadingEl) resultLoadingEl.classList.add('show');

  // Save result to backend if user is signed in
  resultSaveStatus.textContent = '';
  const user = getCurrentUser();
  if (user) {
    resultSaveStatus.textContent = 'Saving score…';
    try {
      const token = await getIdToken();
      const resp  = await fetch(`${API_BASE}/save-result`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ wpm, accuracy: acc, errors: totalErrors, time: elapsedSeconds }),
      });
      const data = await resp.json();
      resultSaveStatus.textContent = data.saved ? 'Score saved!' : 'Score not saved.';
    } catch (_) {
      resultSaveStatus.textContent = 'Could not save score.';
    }
  }

  setTimeout(() => {
    if (resultLoadingEl) resultLoadingEl.classList.remove('show');
    rollup(resultWpmEl,  wpm,         '',  700);
    rollup(resultAccEl,  acc,         '%', 700);
    rollup(resultErrEl,  totalErrors, '',  500);
    rollup(resultTimeEl, secs,        's', 600);
    renderHeatmap();
    showResult();
  }, 1100);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function showResult() {
  resultOverlay.setAttribute('aria-hidden', 'false');
  resultOverlay.classList.add('show');
}
function hideResult() {
  resultOverlay.classList.remove('show');
  resultOverlay.setAttribute('aria-hidden', 'true');
  const rl = document.getElementById('result-loading');
  if (rl) rl.classList.remove('show');
}

resultOverlay.addEventListener('click', e => { if (e.target === resultOverlay) fetchSentence(); });
btnRestart.addEventListener('click',       () => fetchSentence());
btnModalRestart.addEventListener('click',  () => fetchSentence());
document.getElementById('btn-give-up').addEventListener('click', () => fetchSentence());

// ─── Global keyboard shortcuts ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Escape closes the solo result modal
  if (e.key === 'Escape' && resultOverlay.classList.contains('show')) {
    e.preventDefault();
    fetchSentence();
    return;
  }
  // Enter plays again when result is open and typing input isn't focused
  if (e.key === 'Enter' && resultOverlay.classList.contains('show') &&
      document.activeElement !== typingInput) {
    e.preventDefault();
    fetchSentence();
  }
});

// ─── Solo Custom Text ─────────────────────────────────────────────────────────
(function () {
  const btnSoloCustom   = document.getElementById('btn-solo-custom');
  const overlay         = document.getElementById('solo-custom-overlay');
  const closeBtn        = document.getElementById('solo-custom-close');
  const textarea        = document.getElementById('solo-custom-textarea');
  const startBtn        = document.getElementById('btn-solo-custom-start');
  const errorEl         = document.getElementById('solo-custom-error');
  if (!btnSoloCustom || !overlay) return;

  function openModal() {
    overlay.style.display = 'flex';
    textarea.focus();
  }
  function closeModal() {
    overlay.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
  }

  btnSoloCustom.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  startBtn.addEventListener('click', () => {
    const raw  = textarea.value.trim();
    if (!raw) { textarea.focus(); return; }
    const words = raw.split(/\s+/).length;
    if (words < 15) {
      if (errorEl) { errorEl.textContent = 'Please enter at least 15 words.'; errorEl.style.display = ''; }
      textarea.focus();
      return;
    }
    if (raw.length > 500) {
      if (errorEl) { errorEl.textContent = 'Maximum 500 characters allowed.'; errorEl.style.display = ''; }
      textarea.focus();
      return;
    }
    if (errorEl) errorEl.style.display = 'none';
    // Auto-capitalize first letter
    const text = raw.charAt(0).toUpperCase() + raw.slice(1);
    closeModal();
    // Bypass API fetch — set sentence directly and start the round
    sentencesArray   = [text];
    targetSentence   = text;
    sentenceBoundaries = new Set();
    initRound();
  });

  // Ctrl/Cmd+Enter also starts
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') startBtn.click();
  });
})();

window.addEventListener('resize', () => {
  confettiCanvas.width  = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
});

// ─── Accessibility: focus trap for modals ─────────────────────────────────────
export function trapFocus(modalEl) {
  const focusable = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const els       = [...modalEl.querySelectorAll(focusable)].filter(el => !el.closest('[style*="display: none"]'));
  if (!els.length) return () => {};
  const first = els[0], last = els[els.length - 1];
  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  modalEl.addEventListener('keydown', handler);
  first.focus();
  return () => modalEl.removeEventListener('keydown', handler);
}

// ─── Logo typewriter ──────────────────────────────────────────────────────────
(function logoTypewriter() {
  const el = document.getElementById('logo-text');
  if (!el) return;
  const WORD     = 'TaklaType';
  const TYPE_MS = 90; // ms between each character

  let i = 0;
  const iv = setInterval(() => {
    el.textContent = WORD.slice(0, ++i);
    if (i === WORD.length) {
      clearInterval(iv);
      el.classList.add('typed'); // hide cursor — done
    }
  }, TYPE_MS);
})();

// ─── Resize Handle ────────────────────────────────────────────────────────────
(function initResizeHandle() {
  const handle = document.getElementById('sentence-resize-handle');
  if (!handle) return;

  const STORAGE_KEY = 'tt-sentence-height';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) sentenceContainer.style.height = saved + 'px';

  let dragging = false;
  let startY = 0;
  let startH = 0;

  function onStart(clientY) {
    dragging = true;
    startY   = clientY;
    startH   = sentenceContainer.getBoundingClientRect().height;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor     = 'ns-resize';
  }

  function onMove(clientY) {
    if (!dragging) return;
    const delta   = clientY - startY;
    const minH    = parseInt(getComputedStyle(sentenceContainer).minHeight) || 80;
    const maxH    = window.innerHeight * 0.7;
    const newH    = Math.min(maxH, Math.max(minH, startH + delta));
    sentenceContainer.style.height = newH + 'px';
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor     = '';
    localStorage.setItem(STORAGE_KEY, Math.round(sentenceContainer.getBoundingClientRect().height));
  }

  handle.addEventListener('mousedown',  e => { e.preventDefault(); onStart(e.clientY); });
  document.addEventListener('mousemove', e => onMove(e.clientY));
  document.addEventListener('mouseup',   onEnd);

  handle.addEventListener('touchstart',  e => { e.preventDefault(); onStart(e.touches[0].clientY); }, { passive: false });
  document.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); onMove(e.touches[0].clientY); } }, { passive: false });
  document.addEventListener('touchend',  onEnd);
})();

// ─── Logo click — return to main page ────────────────────────────────────────
(function initLogoNav() {
  const logoEl = document.querySelector('.logo');
  if (!logoEl) return;
  logoEl.style.cursor = 'pointer';
  logoEl.title = 'Go to main page';
  logoEl.addEventListener('click', () => {
    const inActiveRace  = startTime !== null && !finished;
    const inMultiplayer = window.__tt?.inMultiplayer;
    const mpOverlayOpen = document.getElementById('mp-overlay')?.classList.contains('show');
    const mpResultOpen  = document.getElementById('mp-result-panel')?.classList.contains('show');
    const resultOpen    = resultOverlay.classList.contains('show');

    const needsConfirm = inActiveRace || inMultiplayer || mpOverlayOpen || mpResultOpen;
    if (needsConfirm) {
      if (!confirm('Leave the current race and return to the main page?')) return;
    }
    // Reload without URL params to fully reset all state
    window.location.href = window.location.pathname;
  });
})();

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadSettings();
applySettings();
fetchSentence();
