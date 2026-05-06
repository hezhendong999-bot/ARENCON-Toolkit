/**
 * ARENCON FRT v2 — Dialog System
 * ═══════════════════════════════
 * 
 * Shared modal builder — replaces browser confirm()/alert().
 * Uses the 3-button leave dialog pattern from Style Guide.
 * 
 * Phase 1 will implement full dialog types:
 *   - showAlert(title, message)
 *   - showConfirm(title, message, onYes, onNo)
 *   - showDialog(config) — flexible modal with custom buttons
 *   - showLeaveDialog(onSave, onLeave, onCancel)
 *   - showPrompt(title, label, defaultVal) → Promise<string|null>
 */

/**
 * Show a simple alert dialog.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<void>}
 */
export function showAlert(title, message) {
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var modal = _createModal(title, message, [
      { label: 'OK', color: '#1A7A4A', action: function() { _removeOverlay(overlay); resolve(); } }
    ]);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

/**
 * Show a confirmation dialog.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirm(title, message) {
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var modal = _createModal(title, message, [
      { label: 'Yes', color: '#1A7A4A', action: function() { _removeOverlay(overlay); resolve(true); } },
      { label: 'Cancel', color: '#C0392B', action: function() { _removeOverlay(overlay); resolve(false); } }
    ]);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

/**
 * Show a flexible dialog with custom buttons.
 * @param {object} config - { title, message, buttons: [{ label, color, outline, action }] }
 */
export function showDialog(config) {
  var overlay = _createOverlay();
  var buttons = (config.buttons || []).map(function(b) {
    return {
      label: b.label,
      color: b.color || '#9C2742',
      outline: b.outline || false,
      action: function() {
        _removeOverlay(overlay);
        if (b.action) b.action();
      }
    };
  });
  var modal = _createModal(config.title || '', config.message || '', buttons);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Show a prompt dialog with text input.
 * @param {string} title
 * @param {string} label
 * @param {string} [defaultVal]
 * @returns {Promise<string|null>} — entered text or null if cancelled
 */
export function showPrompt(title, label, defaultVal) {
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var isDark = document.body.classList.contains('dark-mode');
    var modal = document.createElement('div');
    modal.style.cssText = [
      'background:' + (isDark ? '#1e2533' : 'white'),
      'border-radius:12px', 'max-width:420px', 'width:90%',
      'padding:24px', 'box-shadow:0 8px 32px rgba(0,0,0,.25)',
      'font-family:Calibri,sans-serif',
      'color:' + (isDark ? '#d0d8f0' : '#1C2333')
    ].join(';');

    if (title) {
      var h = document.createElement('h3');
      h.textContent = title;
      h.style.cssText = 'margin:0 0 12px;font-size:17px;';
      modal.appendChild(h);
    }

    if (label) {
      var lbl = document.createElement('label');
      lbl.textContent = label;
      lbl.style.cssText = 'display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:' + (isDark ? '#8a94b0' : '#4A5568') + ';margin-bottom:4px;';
      modal.appendChild(lbl);
    }

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = defaultVal || '';
    inp.style.cssText = 'width:100%;padding:10px 12px;border:1.5px solid ' + (isDark ? '#2a3040' : '#DDE1E7') + ';border-radius:7px;font-family:Calibri,sans-serif;font-size:15px;margin-bottom:16px;box-sizing:border-box;background:' + (isDark ? '#151a24' : '#F7F8FA') + ';color:' + (isDark ? '#d0d8f0' : '#1C2333') + ';';
    modal.appendChild(inp);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    var okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.className = 'btn-muted-ok';
    okBtn.style.cssText = 'flex:1;';
    okBtn.addEventListener('click', function() {
      var val = inp.value.trim();
      _removeOverlay(overlay);
      resolve(val); // empty string = OK with no text, null = cancel only
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn-muted-cancel';
    cancelBtn.style.cssText = 'flex:1;';
    cancelBtn.addEventListener('click', function() {
      _removeOverlay(overlay);
      resolve(null);
    });

    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    modal.appendChild(btnRow);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus input and select text
    setTimeout(function() { inp.focus(); inp.select(); }, 50);

    // Enter key submits
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { okBtn.click(); }
      if (e.key === 'Escape') { cancelBtn.click(); }
    });
  });
}

// S119 Push H: type-to-confirm for high-risk destructive actions.
// Used for project resets, tab resets, and Hub project purges where a
// single mis-tap could nuke significant data. The user must type the
// required word (default "DELETE") exactly before the OK button enables.
// Returns Promise<bool>: true on confirmed delete, false on cancel.
export function showTypeToConfirm(title, message, requiredText) {
  var req = requiredText || 'DELETE';
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var isDark = document.body.classList.contains('dark-mode');
    var modal = document.createElement('div');
    modal.style.cssText = [
      'background:' + (isDark ? '#1e2533' : 'white'),
      'border-radius:12px', 'max-width:440px', 'width:90%',
      'padding:24px', 'box-shadow:0 8px 32px rgba(0,0,0,.25)',
      'font-family:Calibri,sans-serif',
      'color:' + (isDark ? '#d0d8f0' : '#1C2333')
    ].join(';');

    if (title) {
      var h = document.createElement('h3');
      h.textContent = title;
      h.style.cssText = 'margin:0 0 12px;font-size:17px;color:#C0392B;';
      modal.appendChild(h);
    }

    if (message) {
      var p = document.createElement('p');
      p.textContent = message;
      p.style.cssText = 'margin:0 0 12px;font-size:14px;line-height:1.45;';
      modal.appendChild(p);
    }

    var instr = document.createElement('p');
    instr.innerHTML = 'Type <strong style="color:#C0392B;letter-spacing:0.5px;">' + req + '</strong> to confirm:';
    instr.style.cssText = 'margin:8px 0 6px;font-size:13px;';
    modal.appendChild(instr);

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.style.cssText = 'width:100%;padding:10px 12px;border:1.5px solid ' + (isDark ? '#2a3040' : '#DDE1E7') + ';border-radius:7px;font-family:Calibri,sans-serif;font-size:15px;margin-bottom:16px;box-sizing:border-box;background:' + (isDark ? '#151a24' : '#F7F8FA') + ';color:' + (isDark ? '#d0d8f0' : '#1C2333') + ';';
    modal.appendChild(inp);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    var okBtn = document.createElement('button');
    okBtn.textContent = 'Delete';
    okBtn.style.cssText = 'flex:1;padding:9px 16px;border:none;background:#C0392B;color:white;border-radius:7px;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;cursor:not-allowed;opacity:0.45;';
    okBtn.disabled = true;

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn-muted-cancel';
    cancelBtn.style.cssText = 'flex:1;';

    // Enable OK only when the typed value matches required text exactly.
    // Case-sensitive — matches Hub's existing project-delete behavior.
    inp.addEventListener('input', function() {
      var ok = inp.value === req;
      okBtn.disabled = !ok;
      okBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
      okBtn.style.opacity = ok ? '1' : '0.45';
    });

    okBtn.addEventListener('click', function() {
      if (okBtn.disabled) return;
      _removeOverlay(overlay);
      resolve(true);
    });
    cancelBtn.addEventListener('click', function() {
      _removeOverlay(overlay);
      resolve(false);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    modal.appendChild(btnRow);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(function() { inp.focus(); }, 50);
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !okBtn.disabled) okBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    });
  });
}

// ── Internal Helpers ─────────────────────────────────────

function _createOverlay() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;display:flex;align-items:center;justify-content:center;';
  return overlay;
}

function _createModal(title, message, buttons) {
  var isDark = document.body.classList.contains('dark-mode');
  var modal = document.createElement('div');
  modal.style.cssText = [
    'background:' + (isDark ? '#1e2533' : 'white'),
    'border-radius:12px',
    'max-width:420px',
    'width:90%',
    'padding:24px',
    'box-shadow:0 8px 32px rgba(0,0,0,.25)',
    'font-family:Calibri,sans-serif',
    'color:' + (isDark ? '#d0d8f0' : '#1C2333')
  ].join(';');

  if (title) {
    var h = document.createElement('h3');
    h.textContent = title;
    h.style.cssText = 'margin:0 0 12px;font-size:17px;';
    modal.appendChild(h);
  }

  if (message) {
    var p = document.createElement('p');
    p.textContent = message;
    p.style.cssText = 'margin:0 0 20px;font-size:14px;line-height:1.5;color:' + (isDark ? '#8a94b0' : '#4A5568');
    modal.appendChild(p);
  }

  if (buttons && buttons.length) {
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    buttons.forEach(function(b) {
      var btn = document.createElement('button');
      btn.textContent = b.label;
      // S113 Push 17: detect Yes/OK/Confirm by green color, Cancel/No by
      // red color, and apply the .btn-muted-ok / .btn-muted-cancel CSS
      // classes from frt.css. Both dark and light modes are handled
      // entirely by the CSS class — no inline color logic needed here.
      // Buttons with other colors (e.g., burgundy for showAlert OK) fall
      // through to the prior dark/light branches below.
      if (b.color === '#1A7A4A') {
        btn.className = 'btn-muted-ok';
        btn.style.cssText = 'flex:1;';
      } else if (b.color === '#C0392B') {
        btn.className = 'btn-muted-cancel';
        btn.style.cssText = 'flex:1;';
      } else {
        var baseStyle = 'flex:1;padding:10px;border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;cursor:pointer;';
        if (b.outline) {
          btn.style.cssText = baseStyle + 'background:transparent;color:' + b.color + ';border:1.5px solid ' + b.color + ';';
        } else if (isDark) {
          var tint = b.color === '#1A7A4A' ? '#15302a' : (b.color === '#C0392B' ? '#3a1a1a' : '#1f2530');
          var textCol = b.color === '#1A7A4A' ? '#5fbf8f' : (b.color === '#C0392B' ? '#e88a7a' : '#a8b4d0');
          btn.style.cssText = baseStyle + 'background:' + tint + ';color:' + textCol + ';border:1.5px solid ' + textCol + '40;';
        } else {
          btn.style.cssText = baseStyle + 'background:' + b.color + ';color:white;border:none;';
        }
      }
      btn.addEventListener('click', b.action);
      btnRow.appendChild(btn);
    });
    modal.appendChild(btnRow);
  }

  return modal;
}

function _removeOverlay(overlay) {
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
}
