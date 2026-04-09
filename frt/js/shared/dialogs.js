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
      { label: 'OK', color: '#9C2742', action: function() { _removeOverlay(overlay); resolve(); } }
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
      { label: 'Cancel', color: '#607D8B', outline: true, action: function() { _removeOverlay(overlay); resolve(false); } }
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
    okBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;cursor:pointer;background:#1A7A4A;color:white;border:none;';
    okBtn.addEventListener('click', function() {
      var val = inp.value.trim();
      _removeOverlay(overlay);
      resolve(val); // empty string = OK with no text, null = cancel only
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;cursor:pointer;background:transparent;color:#607D8B;border:1.5px solid #607D8B;';
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
      var baseStyle = 'flex:1;padding:10px;border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;cursor:pointer;';
      if (b.outline) {
        btn.style.cssText = baseStyle + 'background:transparent;color:' + b.color + ';border:1.5px solid ' + b.color + ';';
      } else {
        btn.style.cssText = baseStyle + 'background:' + b.color + ';color:white;border:none;';
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
