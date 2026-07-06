/**
 * ARENCON /lib/ — Dialog System (S445, Library Step 1)
 * ═════════════════════════════════════════════════════
 * Ported from FRT frt/js/shared/dialogs.js (post-S444, IAR-free) onto the
 * /lib/ chrome (.ab-modal family in chrome.css). Same promise APIs as FRT
 * so tool conversion is drop-in:
 *
 *   showAlert(title, message)                       → Promise<void>
 *   showConfirm(title, message)                     → Promise<boolean>
 *   showDialog({title, message, vertical, buttons}) → overlay element
 *   showPrompt(title, label, defaultVal)            → Promise<string|null>
 *   showTypeToConfirm(title, message, requiredText) → Promise<boolean>
 *   showLeaveDialog({onSave, onLeave})              → Promise<'save'|'leave'|'cancel'>
 *
 * S443 BUTTON-ORDER CONVENTION — STRUCTURALLY ENFORCED HERE:
 * every builder routes through _orderButtons(), which places cancel-role
 * buttons LEFTMOST in horizontal footers and LAST (bottom) in vertical
 * stacks, regardless of the order a caller passes. The convention cannot
 * be violated by a call site.
 *
 * Button roles: pass { role: 'confirm'|'cancel'|'danger'|'utility'|'na'|'warn'|'cta' }.
 * FRT legacy sentinels are honoured for drop-in compat:
 *   color '#1A7A4A' → confirm · color '#C0392B' → cancel (label 'Cancel' also → cancel).
 *
 * showConflictModal is deliberately NOT here — it ships with Step 3
 * (merge + sync pair), where its consumers live.
 */

import { lockScroll, unlockScroll } from './scrollLock.js';

var ROLE_CLASS = {
  confirm: 'ab-btn-confirm',
  cancel:  'ab-btn-cancel',
  danger:  'ab-btn-danger',
  utility: 'ab-btn-utility',
  na:      'ab-btn-na',
  warn:    'ab-btn-warn',
  cta:     'ab-btn-cta'
};

function _roleOf(b) {
  if (b.role && ROLE_CLASS[b.role]) return b.role;
  if (b.color === '#1A7A4A') return 'confirm';                 // FRT legacy sentinel
  if (b.color === '#C0392B') return 'cancel';                  // FRT legacy sentinel
  if (/^cancel\b/i.test(String(b.label || ''))) return 'cancel';
  return 'utility';
}

/** S443 order: cancel leftmost (horizontal) / last (vertical). Stable otherwise. */
function _orderButtons(buttons, vertical) {
  var cancels = [], rest = [];
  (buttons || []).forEach(function(b) {
    (_roleOf(b) === 'cancel' ? cancels : rest).push(b);
  });
  return vertical ? rest.concat(cancels) : cancels.concat(rest);
}

function _createOverlay() {
  var ov = document.createElement('div');
  ov.className = 'ab-modal-ov';
  lockScroll();
  return ov;
}

function _removeOverlay(overlay) {
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
    unlockScroll();
  }
}

function _createModal(title, message, buttons, vertical) {
  var modal = document.createElement('div');
  modal.className = 'ab-modal';

  if (title) {
    var h = document.createElement('h3');
    h.className = 'ab-modal-title';
    h.textContent = title;
    modal.appendChild(h);
  }
  if (message) {
    var p = document.createElement('p');
    p.className = 'ab-modal-body';
    p.textContent = message;
    modal.appendChild(p);
  }

  if (buttons && buttons.length) {
    var foot = document.createElement('div');
    foot.className = 'ab-modal-foot';
    if (vertical) foot.style.flexDirection = 'column';
    _orderButtons(buttons, vertical).forEach(function(b) {
      var btn = document.createElement('button');
      btn.className = 'ab-btn ' + ROLE_CLASS[_roleOf(b)];
      btn.textContent = b.label;
      if (vertical) { btn.style.width = '100%'; btn.style.marginRight = '0'; }
      btn.addEventListener('click', b.action);
      foot.appendChild(btn);
    });
    modal.appendChild(foot);
  }
  return modal;
}

export function showAlert(title, message) {
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var modal = _createModal(title, message, [
      { label: 'OK', role: 'confirm', action: function() { _removeOverlay(overlay); resolve(); } }
    ]);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

export function showConfirm(title, message) {
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var modal = _createModal(title, message, [
      { label: 'Cancel', role: 'cancel', action: function() { _removeOverlay(overlay); resolve(false); } },
      { label: 'Yes', role: 'confirm', action: function() { _removeOverlay(overlay); resolve(true); } }
    ]);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

/**
 * Flexible dialog with custom buttons.
 * config: { title, message, vertical, buttons: [{label, role|color, action}] }
 * Returns the overlay element (FRT contract).
 */
export function showDialog(config) {
  var overlay = _createOverlay();
  var buttons = (config.buttons || []).map(function(b) {
    return {
      label: b.label,
      role: b.role,
      color: b.color,
      action: function() {
        _removeOverlay(overlay);
        if (b.action) b.action();
      }
    };
  });
  var modal = _createModal(config.title || '', config.message || '', buttons, !!config.vertical);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

export function showPrompt(title, label, defaultVal) {
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var modal = document.createElement('div');
    modal.className = 'ab-modal';

    var h = document.createElement('h3');
    h.className = 'ab-modal-title';
    h.textContent = title;
    modal.appendChild(h);

    var lbl = document.createElement('label');
    lbl.className = 'ab-modal-body';
    lbl.style.display = 'block';
    lbl.textContent = label || '';
    modal.appendChild(lbl);

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = defaultVal || '';
    inp.style.cssText = 'width:100%;box-sizing:border-box;margin:0 0 18px;padding:10px 12px;'
      + 'font:400 14px Calibri,sans-serif;color:var(--ab-ink);background:transparent;'
      + 'border:1px solid var(--ab-btn-rule);border-radius:8px;outline:none;';
    modal.appendChild(inp);

    var okBtn, cancelBtn;
    var foot = document.createElement('div');
    foot.className = 'ab-modal-foot';
    cancelBtn = document.createElement('button');
    cancelBtn.className = 'ab-btn ab-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { _removeOverlay(overlay); resolve(null); });
    okBtn = document.createElement('button');
    okBtn.className = 'ab-btn ab-btn-confirm';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', function() {
      var val = inp.value.trim();
      _removeOverlay(overlay);
      resolve(val);
    });
    // S443: Cancel leftmost — structural, not stylistic.
    foot.appendChild(cancelBtn);
    foot.appendChild(okBtn);
    modal.appendChild(foot);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(function() { inp.focus(); inp.select(); }, 50);
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') okBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    });
  });
}

export function showTypeToConfirm(title, message, requiredText) {
  return new Promise(function(resolve) {
    var req = String(requiredText || '');
    var overlay = _createOverlay();
    var modal = document.createElement('div');
    modal.className = 'ab-modal';

    var h = document.createElement('h3');
    h.className = 'ab-modal-title';
    h.textContent = title;
    modal.appendChild(h);

    var p = document.createElement('p');
    p.className = 'ab-modal-body';
    p.textContent = message + ' Type "' + req + '" to confirm.';
    modal.appendChild(p);

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.autocomplete = 'off';
    inp.style.cssText = 'width:100%;box-sizing:border-box;margin:0 0 18px;padding:10px 12px;'
      + 'font:400 14px Calibri,sans-serif;color:var(--ab-ink);background:transparent;'
      + 'border:1px solid var(--ab-btn-rule);border-radius:8px;outline:none;';
    modal.appendChild(inp);

    var foot = document.createElement('div');
    foot.className = 'ab-modal-foot';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'ab-btn ab-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function() { _removeOverlay(overlay); resolve(false); });
    var okBtn = document.createElement('button');
    okBtn.className = 'ab-btn ab-btn-danger';
    okBtn.textContent = 'Confirm';
    okBtn.disabled = true;
    okBtn.style.opacity = '0.45';
    okBtn.style.cursor = 'not-allowed';
    inp.addEventListener('input', function() {
      var ok = inp.value === req;   // case-sensitive — matches Hub project-delete behavior
      okBtn.disabled = !ok;
      okBtn.style.opacity = ok ? '1' : '0.45';
      okBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    });
    okBtn.addEventListener('click', function() {
      if (okBtn.disabled) return;
      _removeOverlay(overlay);
      resolve(true);
    });
    // S443: Cancel leftmost.
    foot.appendChild(cancelBtn);
    foot.appendChild(okBtn);
    modal.appendChild(foot);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function() { inp.focus(); }, 50);
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') okBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    });
  });
}

/**
 * The canonical 3-button leave dialog (locked order — stacked vertical:
 * primary on TOP, Cancel at the BOTTOM).
 * Resolves 'save' | 'leave' | 'cancel'. The CALLER owns what save/leave do
 * (e.g. FRT's rule: local IDB persists on BOTH paths; only the cloud push
 * is skipped on 'leave').
 */
export function showLeaveDialog(opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var modal = _createModal(
      opts.title || 'Unsaved changes',
      opts.message || 'You have unsaved changes.',
      [
        { label: opts.saveLabel || 'Save & Leave', role: 'confirm',
          action: function() { _removeOverlay(overlay); resolve('save'); } },
        { label: opts.leaveLabel || 'Leave without saving', role: 'warn',
          action: function() { _removeOverlay(overlay); resolve('leave'); } },
        { label: 'Cancel — go back', role: 'cancel',
          action: function() { _removeOverlay(overlay); resolve('cancel'); } }
      ],
      true /* vertical — _orderButtons pins Cancel to the bottom */
    );
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}
