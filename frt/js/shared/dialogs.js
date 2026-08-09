/**
 * ARENCON FRT v2 — Dialog System (SHIM over the shared engine)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * S503 — Modal Unification, FRT wave.
 *
 * This file no longer BUILDS dialogs. It is a thin adapter: every function
 * below keeps its exact original signature so all ~100 FRT call sites work
 * unchanged, but the actual dialog is rendered by the ONE shared engine at
 * lib/ui/dialogEngine.js — the same engine the Project Hub already uses live.
 *
 * Why a shim and not a call-site rewrite: the engine's API is options-based
 * (Dlg.confirm({title,message})) while FRT's is positional
 * (showConfirm(title,message)). Adapting here converts every call site at once
 * with zero risk of a missed one, and keeps the diff reviewable.
 *
 * SHARED ENGINE RULE: FRT deletes its own dialog chrome and CALLS the engine.
 * It does not reimplement or "match" it. The old _createModal() builder — the
 * hand-rolled overlay/card/button DOM — is deleted by this change. Anything
 * that still needs bespoke chrome must justify itself; today that is exactly
 * one thing, the sync-conflict resolver (see bottom), which has no engine
 * family and a single call site.
 *
 * Engine-enforced behaviours FRT now inherits for free: Cancel is always
 * leftmost, one confirm tap, ≥46px touch targets on coarse pointers, Esc
 * cancels / Enter submits, scroll-lock, and the Bold light/dark skins.
 *
 *   showAlert(title, message)                    → Dlg.alert
 *   showConfirm(title, message)                  → Dlg.confirm
 *   showDialog({title,message,buttons,vertical}) → Dlg.panel
 *   showPrompt(title, label, defaultVal)         → Dlg.prompt
 *   showTypeToConfirm(title, message, required)  → Dlg.typeToConfirm
 *   showConflictModal(conflicts, mergeResult)    → unchanged (bespoke)
 */

import { lockScroll, unlockScroll } from '../../../lib/shared/scrollLock.js';
import { Dlg } from '../../../lib/ui/dialogEngine.js';

/**
 * Show a simple alert dialog.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<void>}
 */
export function showAlert(title, message) {
  // Two-arg tolerance: pdf.js calls showAlert('message') with no title.
  if (message === undefined) { message = title; title = 'Notice'; }
  return Dlg.alert({ title: title || 'Notice', message: message });
}

/**
 * Show a confirmation dialog.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirm(title, message) {
  return Dlg.confirm({
    title: title || 'Confirm',
    message: message,
    confirmText: 'Yes'
  });
}

/**
 * Show a flexible dialog with custom buttons.
 * @param {object} config - { title, message, buttons: [{ label, color, outline, action }], vertical }
 * @returns {Promise} resolves after the dialog closes AND the chosen action has run
 *
 * Ordering note (load-bearing): the original dismissed the overlay and THEN ran
 * the button's action. Several call sites open ANOTHER dialog from that action
 * (e.g. the contractor menu → Delete/Rename), so running the action before the
 * close would briefly stack two dialogs. The action is therefore deferred until
 * the panel's close promise settles, preserving the original sequence exactly.
 *
 * No call site captures the return value (audited across all 9 importing files),
 * so returning a promise here instead of the old overlay element is safe.
 */
export function showDialog(config) {
  config = config || {};
  var list = config.buttons || [];
  var chosen = null;

  // Map FRT's colour/outline vocabulary onto the engine's semantic kinds.
  // Cancel-kind is sorted leftmost by the engine regardless of declared order.
  var lastIdx = list.length - 1;
  var buttons = list.map(function(b, i) {
    var isCancel = /^cancel$/i.test(b.label || '') || (b.outline === true && /cancel/i.test(b.label || ''));
    var kind = isCancel ? 'cancel' : (i === lastIdx ? 'primary' : 'normal');
    return {
      label: b.label,
      kind: kind,
      onClick: function() { chosen = b.action || null; }   // undefined return → engine closes
    };
  });

  // A destructive choice in the set tints the dialog amber; otherwise neutral.
  var destructive = list.some(function(b) { return b.color === '#C0392B'; });

  return Dlg.panel({
    title: config.title || '',
    accent: config.accent || (destructive ? 'warn' : 'slate'),
    icon: config.icon || (destructive ? '\u26A0' : 'i'),
    width: config.width,
    buttons: buttons,
    build: function(body) {
      // panel() does not render opts.message — the body is the caller's to fill.
      if (!config.message) return;
      var p = document.createElement('p');
      p.textContent = config.message;
      p.style.cssText = 'margin:0 0 6px;font-size:14px;line-height:1.5;';
      body.prepend(p);
    }
  }).then(function() {
    if (chosen) chosen();
  });
}

/**
 * Show a prompt dialog with text input.
 * @param {string} title
 * @param {string} label
 * @param {string} [defaultVal]
 * @returns {Promise<string|null>} — entered text or null if cancelled
 */
export function showPrompt(title, label, defaultVal) {
  return Dlg.prompt({
    title: title || 'Enter a value',
    label: label,
    value: defaultVal == null ? '' : defaultVal
  });
}

/**
 * Type-to-confirm gate for irreversible actions.
 * @param {string} title
 * @param {string} message
 * @param {string} [requiredText] — defaults to 'DELETE'
 * @returns {Promise<boolean>}
 */
export function showTypeToConfirm(title, message, requiredText) {
  return Dlg.typeToConfirm({
    title: title || 'This cannot be undone',
    message: message,
    phrase: requiredText || 'DELETE'
  });
}

// ── Internal Helpers ─────────────────────────────────────
// Retained ONLY for the bespoke conflict modal below. The general-purpose
// _createModal() card builder that used to live here is deleted — the shared
// engine owns dialog chrome now.

function _createOverlay() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  lockScroll();
  return overlay;
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
/* ═══ S628d — THE CONFLICT MODAL WAS ASKING ABOUT ITS OWN PLUMBING ═══════════
   Mark, 08 Aug: got a "3 items need your decision" modal whose three items were
   _TAB, _WROTEAT and MODIFIED, and correctly refused to answer it.

   He was right. Those are not his work. _tab is which browser tab wrote last.
   _wroteAt and modified are timestamps the app stamps on itself. Asking an
   inspector to choose between "2qwxw" and "uoke9", or between two times three
   seconds apart, is asking a question with no meaningful answer — and the
   answer changes nothing he can see. Worse, it teaches people that the conflict
   modal is noise, so the day it asks about a real deficiency they click through
   it.

   A conflict is worth interrupting someone for only when the two sides differ
   in something the inspector actually wrote. Everything else is housekeeping
   and the merge engine already has a rule for it — dropping these from the
   modal does NOT skip them, because mergeApplyResolutions only overrides the
   paths it is given and the merge's own resolution stands for the rest.

   If EVERY conflict is housekeeping, no modal appears at all. That was exactly
   this case: three internal fields, zero real disagreements, and Mark should
   never have been stopped. */
var _HOUSEKEEPING_LEAVES = {
  modified: 1, datemodified: 1, updatedat: 1, updated_at: 1,
  lastmodified: 1, lastsaved: 1, savedat: 1, syncedat: 1, rev: 1, version: 1
};

function _isHousekeepingPath(path) {
  try {
    var parts = String(path || '').split('.');
    var leaf = parts[parts.length - 1] || '';
    /* Anything underscore-prefixed is internal by this codebase's own
       convention (_ts, _fts, _dev, _tab, _via, _wroteAt, _build, _cloudSyncedAt). */
    if (leaf.charAt(0) === '_') return true;
    return !!_HOUSEKEEPING_LEAVES[leaf.toLowerCase()];
  } catch (_) { return false; }
}

export function showConflictModal(conflicts, mergeResult) {
  return new Promise(function(resolve) {
    /* S628d: filter BEFORE the empty check, so an all-housekeeping clash
       resolves silently instead of raising a modal about nothing. */
    var _all = conflicts || [];
    var _hidden = [];
    conflicts = _all.filter(function(c) {
      if (_isHousekeepingPath(c && c.path)) { _hidden.push(c); return false; }
      return true;
    });
    if (_hidden.length) {
      try {
        console.log('[Sync] ' + _hidden.length + ' housekeeping field(s) resolved by the merge, not shown: '
          + _hidden.map(function(c){ return c.path; }).join(', '));
      } catch (_) {}
    }

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
