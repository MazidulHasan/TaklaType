/**
 * leaderboard.js – Real-time Firestore leaderboard for TaklaType.
 */

import { db, isConfigured } from './firebase-config.js';

const lbToggleBtn = document.getElementById('leaderboard-toggle');
const lbPanel     = document.getElementById('leaderboard-panel');
const lbList      = document.getElementById('leaderboard-list');

if (!isConfigured) {
  if (lbToggleBtn) lbToggleBtn.style.display = 'none';
} else {
  let _unsub = null;

  lbToggleBtn.addEventListener('click', () => {
    const isOpen = lbPanel.classList.toggle('open');
    lbToggleBtn.classList.toggle('active', isOpen);
    if (isOpen && !_unsub) _startListening();
    if (!isOpen && _unsub)  { _unsub(); _unsub = null; }
  });

  async function _startListening() {
    const { collection, query, orderBy, limit, onSnapshot } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const q = query(
      collection(db, 'leaderboard'),
      orderBy('wpm', 'desc'),
      limit(20),
    );

    _unsub = onSnapshot(q, snap => {
      // Filter out anonymous/guest users (UID starts with "anon_"), keep top 5
      const docs = snap.docs.filter(doc => !doc.id.startsWith('anon_')).slice(0, 5);
      if (docs.length === 0) {
        lbList.innerHTML = '<li class="lb-empty">No scores yet – be the first!</li>';
        return;
      }
      lbList.innerHTML = docs.map((doc, i) => {
        const d    = doc.data();
        const rank = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
        return `<li class="lb-row">
          <span class="lb-rank">${rank}</span>
          <span class="lb-name">${_esc(d.displayName || 'Anonymous')}</span>
          <span class="lb-wpm">${d.wpm} WPM</span>
        </li>`;
      }).join('');
    }, err => {
      lbList.innerHTML = `<li class="lb-empty" style="color:var(--wrong)">Failed to load scores.</li>`;
      console.warn('[TaklaType] Leaderboard error:', err);
    });
  }
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
