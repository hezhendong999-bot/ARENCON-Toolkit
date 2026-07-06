/**
 * ARENCON /lib/ — Toast Notifications (shared, all tools)
 * ════════════════════════════════════════════════════════
 * Extracted from FRT frt/js/shared/toast.js (the audit winner) at S442.
 * One improvement over the FRT original: the container is self-created if
 * the host page doesn't provide #toast-container, so the module is drop-in
 * for every tool with zero required markup.
 *
 * Canon: toasts are for user-initiated feedback only — never for background
 * operations (those use subtle indicator changes; see project rules).
 */

function _container() {
  var c = document.getElementById('toast-container');
  if (c) return c;
  c = document.createElement('div');
  c.id = 'toast-container';
  c.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'left: 50%',
    'transform: translateX(-50%)',
    'z-index: 10000',
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'gap: 8px',
    'pointer-events: none'
  ].join(';');
  document.body.appendChild(c);
  return c;
}

/**
 * Show a toast message.
 * @param {string} msg - Message text
 * @param {number} [duration=2500] - Duration in ms before fade
 */
export function toast(msg, duration) {
  if (!msg) return;
  duration = duration || 2500;

  var container = _container();

  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = [
    'background: rgba(30,37,51,.92)',
    'color: white',
    'padding: 10px 18px',
    'border-radius: 8px',
    'font-family: Calibri, sans-serif',
    'font-size: 14px',
    'max-width: 86vw',
    'box-shadow: 0 4px 16px rgba(0,0,0,.25)',
    'opacity: 0',
    'transition: opacity .25s ease',
    'pointer-events: none'
  ].join(';');

  container.appendChild(el);
  requestAnimationFrame(function() { el.style.opacity = '1'; });

  setTimeout(function() {
    el.style.opacity = '0';
    setTimeout(function() { el.remove(); }, 300);
  }, duration);
}
