/**
 * ARENCON /lib/ — Toast Notifications (shared, all tools)
 * ════════════════════════════════════════════════════════
 * S490d RECONCILE (library audit step 1). The two forks had each grown
 * something the other lacked, so this is a true merge, not a copy:
 *
 *   FROM /lib/ (S442 extraction)  — self-creating #toast-container, so the
 *                                   module is drop-in for any tool with zero
 *                                   required markup. Diesel/Electric/Hub need
 *                                   this; FRT's version silently no-oped when
 *                                   the container was absent.
 *   FROM frt/js/shared/toast.js   — the field-tuned appearance and motion:
 *                                   13px/600 weight, slide-in from below and
 *                                   out upward, nowrap + centred, and
 *                                   pointer-events:auto on the toast itself.
 *                                   These shipped after the S442 extraction,
 *                                   which is why /lib/ never had them.
 *
 * The container keeps pointer-events:none (so it never eats taps on the page)
 * while each toast sets pointer-events:auto — that pairing is deliberate.
 *
 * Canon: toasts are for user-initiated feedback ONLY — never for background
 * operations, which use subtle indicator changes instead (project rule).
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
