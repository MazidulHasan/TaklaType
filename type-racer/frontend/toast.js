/**
 * toast.js – Lightweight toast notification utility for TaklaType.
 * Usage: import { showToast } from './toast.js';
 *        showToast('Message here', 'success' | 'error' | 'info');
 */

export function showToast(message, type = 'info', durationMs = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), durationMs + 300);
}
