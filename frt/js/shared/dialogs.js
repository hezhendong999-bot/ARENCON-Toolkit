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

import { lockScroll, unlockScroll } from './scrollLock.js';

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
      { label: 'Cancel', color: '#C0392B', action: function() { _removeOverlay(overlay); resolve(false); } },
      { label: 'Yes', color: '#1A7A4A', action: function() { _removeOverlay(overlay); resolve(true); } }
    ]);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

/**
 * S120 Push 6: confirm closing an IAR pin and auto-deactivating IAR.
 * Three close paths in the codebase used to silently set iar=false (or, worse,
 * leave it true producing inconsistent state). This helper centralizes the
 * prompt so they all behave the same way.
 *
 * Resolution semantics:
 *   - null → pin is NOT IAR (caller should proceed without showing a prompt)
 *   - true → pin is IAR, user confirmed close + deactivate IAR
 *   - false → pin is IAR, user cancelled
 *
 * The caller is responsible for setting iar=false after a true result.
 *
 * @param {object} defic — the deficiency record (must have .iar and .num)
 * @returns {Promise<boolean|null>}
 */
export function confirmIARDeactivate(defic) {
  if (!defic || !defic.iar) return Promise.resolve(null);
  return new Promise(function(resolve) {
    var overlay = _createOverlay();
    var num = defic.num != null ? defic.num : '?';
    var modal = _createModal(
      'Close pin and deactivate IAR?',
      'Pin #' + num + ' is currently marked as IAR (Immediate Action Required). Closing this pin will automatically deactivate the IAR flag — closed deficiencies cannot remain IAR. Continue?',
      [
        { label: 'Close & deactivate IAR', color: '#1A7A4A', action: function() { _removeOverlay(overlay); resolve(true); } },
        { label: 'Cancel', color: '#C0392B', action: function() { _removeOverlay(overlay); resolve(false); } }
      ]
    );
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
  var modal = _createModal(config.title || '', config.message || '', buttons, !!config.vertical);
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
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  lockScroll();
  return overlay;
}

function _createModal(title, message, buttons, vertical) {
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
    // S328 (Mark): opt-in vertical stack — full-width, one-line buttons that read
    // cleanly when labels differ in length (e.g. the obs-delete photo-fate
    // choices). Default stays the horizontal wrap-row for every existing caller.
    btnRow.style.cssText = vertical
      ? 'display:flex;flex-direction:column;gap:8px;'
      : 'display:flex;gap:8px;flex-wrap:wrap;';
    buttons.forEach(function(b) {
      var btn = document.createElement('button');
      btn.textContent = b.label;
      // In a vertical stack, buttons fill the width (flex:none) and size to one
      // text line; horizontally they share the row equally (flex:1).
      var _grow = vertical ? 'width:100%;' : 'flex:1;';
      if (b.color === '#1A7A4A') {
        btn.className = 'btn-muted-ok';
        btn.style.cssText = _grow;
      } else if (b.color === '#C0392B') {
        btn.className = 'btn-muted-cancel';
        btn.style.cssText = _grow;
      } else {
        var baseStyle = _grow + 'padding:10px;border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;cursor:pointer;';
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
    unlockScroll();
  }
}

// ────────────────────────────────────────────────────────────────────────
// S123 Push 6B — Conflict resolution modal
// ────────────────────────────────────────────────────────────────────────
// Used by SyncEngine when 412 Precondition Failed + 3-way merge produces
// genuine field-level conflicts the user has to resolve.
//
// Signature:
//   showConflictModal(conflicts, mergeResult)
//     → Promise<{resolutions: [...], merged: object} | null>
//
// Conflicts is the array from merge3() — each has {path, base, mine,
// theirs, kind}. The modal walks the user through each one with three
// quick-action buttons (Use mine / Use theirs / Skip) and bulk options
// (Apply all mine / Apply all theirs).
//
// Resolves to a fully-resolved merged object. Caller passes that to
// Model.applyMerged() then retries the push.
//
// Resolves to null if the user cancels (push abandoned, local stays dirty).
// ────────────────────────────────────────────────────────────────────────

/**
 * Show the sync-conflict resolution modal.
 *
 * @param {Array<Object>} conflicts - array from merge3() result.conflicts
 * @param {Object} mergeResult - the full merge3 result (for applyResolutions)
 * @returns {Promise<{resolutions: Array, merged: Object}|null>}
 */
export function showConflictModal(conflicts, mergeResult) {
  return new Promise(function(resolve) {
    if (!conflicts || !conflicts.length) {
      // Defensive: nothing to do
      resolve({ resolutions: [], merged: mergeResult.merged });
      return;
    }

    var isDark = document.body.classList.contains('dark-mode');
    var overlay = _createOverlay();
    overlay.style.alignItems = 'flex-start';      // pin to top so long lists stay scrollable
    overlay.style.paddingTop = '40px';
    overlay.style.paddingBottom = '40px';
    overlay.style.overflowY = 'auto';

    var modal = document.createElement('div');
    modal.className = 'sync-conflict-modal';
    modal.style.cssText = [
      'background:' + (isDark ? '#1e2533' : '#FCFBF8'),
      'border-radius:12px',
      'max-width:680px',
      'width:92%',
      'box-shadow:0 8px 32px rgba(0,0,0,.30)',
      'font-family:Calibri,sans-serif',
      'color:' + (isDark ? '#d0d8f0' : '#1F2937'),
      'border:1.5px solid ' + (isDark ? '#3a4250' : '#D9D2C5')
    ].join(';');

    // ── Header ───
    var hdr = document.createElement('div');
    hdr.style.cssText = 'padding:18px 22px 14px;border-bottom:1.5px solid ' +
      (isDark ? '#2a3040' : '#E5DFD2') + ';';
    var h = document.createElement('h3');
    h.textContent = '⚠ Sync conflict — ' + conflicts.length + ' item' + (conflicts.length === 1 ? '' : 's') + ' need your decision';
    h.style.cssText = 'margin:0 0 6px;font-size:16px;color:' + (isDark ? '#FFB07A' : '#B07F5A') + ';font-weight:700;';
    hdr.appendChild(h);
    var sub = document.createElement('p');
    sub.textContent = 'Another inspector saved changes to this project while you were editing. The same fields were changed in both places. Pick which version to keep for each.';
    sub.style.cssText = 'margin:0;font-size:12.5px;line-height:1.45;color:' + (isDark ? '#8a94b0' : '#6B7280') + ';';
    hdr.appendChild(sub);
    modal.appendChild(hdr);

    // ── Bulk action row ───
    var bulkRow = document.createElement('div');
    bulkRow.style.cssText = 'display:flex;gap:8px;padding:10px 22px;background:' +
      (isDark ? '#161b25' : '#F0EDE6') + ';border-bottom:1.5px solid ' +
      (isDark ? '#2a3040' : '#E5DFD2') + ';';
    var bulkLbl = document.createElement('span');
    bulkLbl.textContent = 'Bulk:';
    bulkLbl.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:' +
      (isDark ? '#8a94b0' : '#6B7280') + ';align-self:center;margin-right:4px;';
    bulkRow.appendChild(bulkLbl);
    var bulkMine = _makeBtn('Use all mine', isDark ? 'tonal-blue-dark' : 'tonal-blue');
    var bulkTheirs = _makeBtn("Use all theirs", isDark ? 'tonal-amber-dark' : 'tonal-amber');
    bulkRow.appendChild(bulkMine);
    bulkRow.appendChild(bulkTheirs);
    modal.appendChild(bulkRow);

    // ── Conflict list (scrollable) ───
    var listWrap = document.createElement('div');
    listWrap.style.cssText = 'max-height:50vh;overflow-y:auto;padding:6px 0;';
    var rows = [];   // [{conflict, btnMine, btnTheirs, chosen}]

    conflicts.forEach(function(c, i) {
      var row = _makeConflictRow(c, i, isDark);
      rows.push(row);
      listWrap.appendChild(row.element);
    });
    modal.appendChild(listWrap);

    // ── Footer ───
    var ftr = document.createElement('div');
    ftr.style.cssText = 'padding:14px 22px;border-top:1.5px solid ' +
      (isDark ? '#2a3040' : '#E5DFD2') + ';display:flex;gap:8px;align-items:center;';

    var counter = document.createElement('span');
    counter.style.cssText = 'flex:1;font-size:12px;color:' + (isDark ? '#8a94b0' : '#6B7280') + ';';
    ftr.appendChild(counter);

    var cancelBtn = _makeBtn('Cancel — keep editing', 'ghost');
    var applyBtn = _makeBtn('Apply & sync', 'fill-burg');
    applyBtn.disabled = true;
    applyBtn.style.opacity = '0.5';
    applyBtn.style.cursor = 'not-allowed';
    ftr.appendChild(cancelBtn);
    ftr.appendChild(applyBtn);
    modal.appendChild(ftr);

    // ── Wire interactions ───
    function refreshCounter() {
      var done = 0;
      rows.forEach(function(r) { if (r.chosen) done++; });
      counter.textContent = done + ' of ' + rows.length + ' decided';
      var canApply = done === rows.length;
      applyBtn.disabled = !canApply;
      applyBtn.style.opacity = canApply ? '1' : '0.5';
      applyBtn.style.cursor = canApply ? 'pointer' : 'not-allowed';
    }
    refreshCounter();

    rows.forEach(function(r) {
      r.btnMine.addEventListener('click', function() { _selectChoice(r, 'mine'); refreshCounter(); });
      r.btnTheirs.addEventListener('click', function() { _selectChoice(r, 'theirs'); refreshCounter(); });
    });

    bulkMine.addEventListener('click', function() {
      rows.forEach(function(r) { _selectChoice(r, 'mine'); });
      refreshCounter();
    });
    bulkTheirs.addEventListener('click', function() {
      rows.forEach(function(r) { _selectChoice(r, 'theirs'); });
      refreshCounter();
    });

    cancelBtn.addEventListener('click', function() {
      _removeOverlay(overlay);
      resolve(null);
    });
    applyBtn.addEventListener('click', function() {
      if (applyBtn.disabled) return;
      // Build resolutions array + apply via merge.js applyResolutions
      var resolutions = rows.map(function(r) {
        return { path: r.conflict.path, chosen: r.chosen };
      });
      // Inline applyResolutions logic (since dialogs.js shouldn't import from data/)
      // — we walk merged result and swap based on chosen.
      // Actually, let SyncEngine import merge.js and apply — we just hand
      // back the resolutions array + the merged-as-default object.
      // Better: caller does the apply. We return resolutions + the base merged.
      _removeOverlay(overlay);
      resolve({ resolutions: resolutions, merged: mergeResult.merged });
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ── ESC to cancel ───
    function escHandler(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        cancelBtn.click();
      }
    }
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * Build a single conflict row (one per conflict in the merge result).
 * Returns { element, btnMine, btnTheirs, conflict, chosen }.
 */
function _makeConflictRow(conflict, idx, isDark) {
  var row = {
    conflict: conflict,
    chosen: null,
    element: null,
    btnMine: null,
    btnTheirs: null
  };

  var el = document.createElement('div');
  el.className = 'sync-conflict-row';
  el.style.cssText = 'padding:12px 22px;border-bottom:1px solid ' +
    (isDark ? '#252a35' : '#F0EDE6') + ';';

  // Path display
  var pathEl = document.createElement('div');
  pathEl.textContent = _prettifyPath(conflict.path);
  pathEl.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:' +
    (isDark ? '#7a808c' : '#6B7280') + ';margin-bottom:6px;';
  el.appendChild(pathEl);

  // Side-by-side previews
  var compare = document.createElement('div');
  compare.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;';

  var mineBox = _makePreviewBox('Mine', conflict.mine, conflict.kind, '#4A6580', isDark);
  var theirsBox = _makePreviewBox('Theirs', conflict.theirs, conflict.kind, '#B07F5A', isDark);
  compare.appendChild(mineBox);
  compare.appendChild(theirsBox);
  el.appendChild(compare);

  // Choice buttons
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;';
  row.btnMine = _makeBtn('Use mine', isDark ? 'tonal-blue-dark' : 'tonal-blue');
  row.btnMine.style.flex = '1';
  row.btnTheirs = _makeBtn('Use theirs', isDark ? 'tonal-amber-dark' : 'tonal-amber');
  row.btnTheirs.style.flex = '1';
  btnRow.appendChild(row.btnMine);
  btnRow.appendChild(row.btnTheirs);
  el.appendChild(btnRow);

  row.element = el;
  return row;
}

function _makePreviewBox(label, value, kind, accentColor, isDark) {
  var box = document.createElement('div');
  box.style.cssText = 'padding:8px 10px;border-radius:6px;border:1.5px solid ' + accentColor + '40;' +
    'background:' + accentColor + (isDark ? '20' : '10') + ';overflow:hidden;';

  var lbl = document.createElement('div');
  lbl.textContent = label + (kind === 'delete-vs-modify' && value === undefined ? ' (deleted)' :
                              kind === 'modify-vs-delete' && value === undefined ? ' (deleted)' : '');
  lbl.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:' +
    accentColor + ';margin-bottom:4px;';
  box.appendChild(lbl);

  var val = document.createElement('div');
  val.textContent = _previewValue(value);
  val.style.cssText = 'font-size:12px;color:' + (isDark ? '#d0d8f0' : '#1F2937') +
    ';line-height:1.4;word-break:break-word;max-height:60px;overflow-y:auto;';
  if (value === undefined) {
    val.style.fontStyle = 'italic';
    val.style.opacity = '0.6';
  }
  box.appendChild(val);

  return box;
}

function _selectChoice(row, choice) {
  row.chosen = choice;
  // Visual: highlight chosen button
  var winBtn = choice === 'mine' ? row.btnMine : row.btnTheirs;
  var lossBtn = choice === 'mine' ? row.btnTheirs : row.btnMine;
  winBtn.style.outline = '2px solid currentColor';
  winBtn.style.outlineOffset = '-2px';
  lossBtn.style.outline = 'none';
  lossBtn.style.opacity = '0.55';
  winBtn.style.opacity = '1';
}

function _prettifyPath(path) {
  // "contractors[ctr1].deficiencies[d_abc].observations[o_xyz].text"
  //   → "Contractors › … › Observations › Text"
  // Strip raw IDs (long uid strings) but keep the field-name structure.
  var parts = path.split(/[.\[\]]/g).filter(function(p) {
    if (!p) return false;
    // Drop tokens that look like generated uids (alphanumeric, >5 chars, contains _ or digit)
    if (/^[a-z]+_/i.test(p) || /^[a-f0-9]{8,}$/i.test(p)) return false;
    return true;
  });
  // Capitalize first letter of each segment
  return parts.map(function(p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' › ');
}

function _previewValue(v) {
  if (v === undefined) return '(deleted)';
  if (v === null) return '(empty)';
  if (typeof v === 'string') {
    if (!v) return '(empty)';
    return v.length > 200 ? v.slice(0, 197) + '…' : v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '(' + v.length + ' item' + (v.length === 1 ? '' : 's') + ')';
  if (typeof v === 'object') {
    try {
      var json = JSON.stringify(v);
      return json.length > 200 ? json.slice(0, 197) + '…' : json;
    } catch (e) {
      return '(object)';
    }
  }
  return String(v);
}

/**
 * Lightweight semantic-button helper, mirrors S123 button framework.
 * Kinds: fill-burg, ghost, tonal-blue, tonal-blue-dark, tonal-amber,
 *        tonal-amber-dark
 */
function _makeBtn(label, kind) {
  var btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = [
    'height:32px',
    'padding:0 14px',
    'border-radius:6px',
    'font-weight:600',
    'font-size:12.5px',
    'font-family:Calibri,sans-serif',
    'cursor:pointer',
    'border:1.5px solid transparent',
    'display:inline-flex',
    'align-items:center',
    'gap:6px',
    'white-space:nowrap'
  ].join(';') + ';';
  switch (kind) {
    case 'fill-burg':
      btn.style.background = '#9C2742';
      btn.style.color = '#fff';
      btn.style.borderColor = '#9C2742';
      break;
    case 'tonal-blue':
      btn.style.background = 'rgba(74,101,128,.10)';
      btn.style.color = '#4A6580';
      btn.style.borderColor = 'rgba(74,101,128,.35)';
      break;
    case 'tonal-blue-dark':
      btn.style.background = 'rgba(74,101,128,.20)';
      btn.style.color = '#90b8e0';
      btn.style.borderColor = 'rgba(74,101,128,.45)';
      break;
    case 'tonal-amber':
      btn.style.background = 'rgba(176,127,90,.10)';
      btn.style.color = '#B07F5A';
      btn.style.borderColor = 'rgba(176,127,90,.35)';
      break;
    case 'tonal-amber-dark':
      btn.style.background = 'rgba(176,127,90,.20)';
      btn.style.color = '#e8c498';
      btn.style.borderColor = 'rgba(176,127,90,.45)';
      break;
    case 'ghost':
    default:
      var isDark = document.body.classList.contains('dark-mode');
      btn.style.background = 'transparent';
      btn.style.color = isDark ? '#a8b0c0' : '#6B7280';
      btn.style.borderColor = isDark ? 'rgba(255,255,255,.20)' : '#D9D2C5';
      break;
  }
  return btn;
}
