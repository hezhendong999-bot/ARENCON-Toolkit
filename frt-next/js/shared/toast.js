/**
 * ARENCON FRT v2 — Toast Notifications
 * ═════════════════════════════════════
 * 
 * Lightweight toast notifications.
 * This module is fully functional in Phase 0.
 */

/**
 * Show a toast message.
 * @param {string} msg - Message text
 * @param {number} [duration=2500] - Duration in ms before fade
 */
export function toast(msg, duration) {
  if (!msg) return;
  duration = duration || 2500;

  var container = document.getElementById('toast-container');
  if (!container) return;

  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = [
    'background: rgba(30,37,51,.92)',
    'color: white',
    'padding: 8px 18px',
    'border-radius: 8px',
    'font-family: Calibri, sans-serif',
    'font-size: 13px',
    'font-weight: 600',
    'pointer-events: auto',
    'opacity: 0',
    'transform: translateY(8px)',
    'transition: opacity .25s, transform .25s',
    'box-shadow: 0 4px 16px rgba(0,0,0,.25)',
    'max-width: 90vw',
    'text-align: center',
    'white-space: nowrap'
  ].join(';');

  container.appendChild(el);

  // Animate in
  requestAnimationFrame(function() {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });

  // Animate out after duration
  setTimeout(function() {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }, duration);
}
