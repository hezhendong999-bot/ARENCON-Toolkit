// frt/js/ui/photoPicker.js
// ─────────────────────────────────────────────────────────────────────────
// Shared, parameterized photo-selection picker ("⊞ Choose / Manage photos").
//
// S215: Lifted out of viewer.js (B's pin-editor selection-mode cluster, which
// dates to S120) into a single context-driven helper so BOTH the on-drawing
// pin editor (B, viewer/viewer.js) and the focused-pin modal (C,
// ui/deficiencies.js) call identical code.
//
// DESIGN (full parameterization — S215 Mark decision):
//  - No module-private "current defic / current obs" globals. Every render and
//    every action reads from a context object the caller supplies and the
//    picker stores per-instance.
//  - No hardcoded DOM ids. The caller passes the mount element; the picker
//    scopes ALL of its injected nodes (header/footer/orphan-note/deleted/grid)
//    INSIDE that mount, querying within the mount only. This is what lets B
//    (mount #pe-obs-content) and C (mount #pf-obs-content) coexist without id
//    collisions.
//  - One "active picker" registry (window.__frtActivePicker) so the global Esc
//    handler can exit whichever picker is open without closing its editor.
//
// CONTRACT — caller passes:
//   ctx = {
//     mount:      HTMLElement   // the editor content host (B: #pe-obs-content,
//                               //   C: #pf-obs-content). Picker owns its
//                               //   innerHTML while active; restores via onExit.
//     deficId:    string        // pin/deficiency id
//     obsIdx:     number        // active observation index
//     onExit:     function()    // called to rebuild the editor when the picker
//                               //   closes (save/cancel/Esc). Caller re-renders
//                               //   its own editor here.
//     toast?:     function(msg, kind)
//   }
//
// Model dependency: the global `Model` (same as viewer.js). Methods used:
//   findDeficiency, getEffectivePhotos, isObsPhotoSelectionCustom,
//   getObsIndicesUsingPoolPhoto, setObsPhotoSelection, removePoolPhoto,
//   restorePoolPhoto, saveNow.
// ─────────────────────────────────────────────────────────────────────────

// ES module — imports Model the same way viewer.js and deficiencies.js do.
// Both callers `import { FrtPhotoPicker } from './photoPicker.js'`.
import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm, showTypeToConfirm } from '../shared/dialogs.js';

// 7 distinct jewel-tone colors cycle (>=8 obs is virtually never seen).
  // Kept identical to viewer.js _PE_OBS_COLORS so the per-obs letter-dots
  // match between B and C and the rest of the app.
  var OBS_COLORS = ['#7B5A8F', '#5C7A65', '#B07F5A', '#5A6E80', '#4A6580', '#7D3F4F', '#A85959'];
  function obsColor(i) { return OBS_COLORS[(i || 0) % OBS_COLORS.length]; }
  function obsLetter(i) { return String.fromCharCode(65 + ((i || 0) % 26)); }

  function doToast(ctx, msg, kind) {
    if (ctx && typeof ctx.toast === 'function') { ctx.toast(msg, kind); return; }
    if (typeof toast === 'function') toast(msg, kind);
  }


  // Per-instance picker state. There is at most one active picker at a time
  // (a picker takes over its editor's mount), so a single live instance is
  // sufficient and matches the old single-_peSelectionMode behavior — but it
  // now carries its full context rather than reading module globals.
  var active = null; // { mount, deficId, obsIdx, onExit, toast, pending(Set), showDeleted(bool) }

  // Scoped lookups — everything is queried INSIDE the mount so B and C can
  // both be in the DOM without id collisions. We still use class hooks (not
  // ids) for the injected scaffold.
  function q(mount, sel) { return mount ? mount.querySelector(sel) : null; }

  function clearInjected(mount) {
    if (!mount) return;
    ['.pp-header', '.pp-footer', '.pp-orphan-note', '.pp-deleted'].forEach(function (sel) {
      var nodes = mount.querySelectorAll(sel);
      Array.prototype.forEach.call(nodes, function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    });
  }

  // ── Enter: take over the mount with the picker scaffold + render grid ──
  function enter(ctx) {
    var M = Model;
    if (!M || !ctx || !ctx.mount || !ctx.deficId) return;
    var f = M.findDeficiency(ctx.deficId);
    if (!f) return;

    active = {
      mount: ctx.mount,
      deficId: ctx.deficId,
      obsIdx: (ctx.obsIdx || 0),
      onExit: ctx.onExit,
      toast: ctx.toast,
      pending: null,        // Set of pool photo IDs currently checked
      showDeleted: false
    };

    // Minimal scaffold: a single strip the selection renderer keys off.
    // (Mirrors B's old _peEnterSelectionMode scaffold, but the strip uses a
    // class hook scoped to the mount instead of the global #pe-obs-photos id.)
    ctx.mount.innerHTML =
      '<div class="pp-wrap" style="display:flex;flex-direction:column;gap:4px;">'
      + '<div class="pp-strip pe-photo-strip" style="display:flex;flex-wrap:wrap;gap:6px;"></div>'
      + '</div>';

    if (typeof window !== 'undefined') window.__frtActivePicker = api;
    renderSelection();
  }

  function exit() {
    var a = active;
    active = null;
    if (typeof window !== 'undefined' && window.__frtActivePicker === api) {
      window.__frtActivePicker = null;
    }
    if (a && typeof a.onExit === 'function') a.onExit();
  }

  function isActive() { return active !== null; }

  // ── Render the selection grid (header / grid / orphan-note / deleted / footer) ──
  function renderSelection() {
    var M = Model;
    if (!active || !M) return;
    var mount = active.mount;
    var f = M.findDeficiency(active.deficId);
    if (!f) { exit(); return; }
    var d = f.defic;
    var idx = active.obsIdx;

    clearInjected(mount);
    var strip = q(mount, '.pp-strip');
    if (!strip) return;

    var pool = (d.photos || []).filter(function (p) { return p && !p.deleted; });
    var deletedPool = (d.photos || []).filter(function (p) { return p && p.deleted && !p.purged; });

    if (!active.pending || !(active.pending instanceof Set)) {
      var obs = (d.observations || [])[idx];
      var initial;
      if (obs && Array.isArray(obs.photoSelection)) initial = obs.photoSelection.slice();
      else initial = pool.map(function (p) { return p.id; });
      active.pending = new Set(initial);
    }

    var totalCt = pool.length;
    var pickCt = 0;
    pool.forEach(function (p) { if (active.pending.has(p.id)) pickCt++; });
    var allChecked = totalCt > 0 && pickCt === totalCt;
    var someChecked = pickCt > 0 && pickCt < totalCt;

    // ── Header ──
    var header = document.createElement('div');
    header.className = 'pp-header pe-sel-header';
    header.style.cssText = 'display:flex;align-items:center;gap:12px;background:#F2F4F7;border:1px solid #DDE1E7;border-radius:8px;padding:8px 12px;margin:6px 0;flex-wrap:wrap;';
    var letter = obsLetter(idx);
    var color = obsColor(idx);
    var showDelHtml = '';
    if (deletedPool.length > 0) {
      var pressed = active.showDeleted;
      showDelHtml = '<button type="button" data-pp-action="toggle-show-deleted" '
        + 'aria-pressed="' + (pressed ? 'true' : 'false') + '" '
        + 'style="background:' + (pressed ? '#7B5A8F' : 'transparent') + ';'
        + 'border:1.5px solid ' + (pressed ? '#7B5A8F' : 'rgba(122,90,143,.4)') + ';'
        + 'color:' + (pressed ? 'white' : '#7B5A8F') + ';'
        + 'border-radius:6px;padding:4px 10px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));font-weight:500;cursor:pointer;" '
        + 'title="Show soft-deleted photos so they can be restored">'
        + (pressed ? '\u2713 ' : '') + 'Show deleted (' + deletedPool.length + ')'
        + '</button>';
    }
    header.innerHTML =
      '<input type="checkbox" class="pp-master" data-pp-action="toggle-master"' + (allChecked ? ' checked' : '') + ' style="width:18px;height:18px;cursor:pointer;flex-shrink:0;">'
      + '<span style="font-size:calc(12px + var(--ts));color:#2C3E50;font-weight:500;">' + pickCt + ' of ' + totalCt + ' selected</span>'
      + '<span style="font-size:calc(11px + var(--ts));color:#6B7B8C;">for </span>'
      + '<span style="font-size:calc(11px + var(--ts));font-weight:500;color:white;background:' + color + ';padding:2px 8px;border-radius:10px;">Obs ' + letter + '</span>'
      + '<span style="flex:1;"></span>'
      + showDelHtml;
    strip.parentNode.insertBefore(header, strip);
    // indeterminate state set via JS (no inline <script>, which won't run when
    // injected via innerHTML — this fixes a latent no-op in the old code).
    if (someChecked) {
      var masterEl = header.querySelector('.pp-master');
      if (masterEl) masterEl.indeterminate = true;
    }

    // ── Photo grid ──
    if (!pool.length) {
      strip.innerHTML = '<div style="padding:12px;color:#888;font-size:calc(12px + var(--ts));text-align:center;width:100%;">No photos in this pin\u2019s pool yet. Upload photos first, then return to manage.</div>';
      strip.style.display = 'flex';
    } else {
      strip.style.display = 'flex';
      var html = '';
      var orphanCount = 0;
      pool.forEach(function (ph) {
        if (!ph) return;
        var src = ph.thumb || ph.dataUrl || ph.r2Url || '';
        if (!src) return;
        var checked = active.pending.has(ph.id);
        var otherIdxs = (M.getObsIndicesUsingPoolPhoto
          ? M.getObsIndicesUsingPoolPhoto(d, ph.id)
          : []
        ).filter(function (i) { return i !== idx; });
        var dotsHtml = '';
        otherIdxs.forEach(function (i) {
          dotsHtml += '<span class="pe-sel-dot" style="background:' + obsColor(i) + ';" title="Used by Obs ' + obsLetter(i) + '">' + obsLetter(i) + '</span>';
        });
        var isOrphan = !checked && otherIdxs.length === 0;
        if (isOrphan) orphanCount++;
        html += '<div class="pe-photo-thumb pe-sel-thumb' + (checked ? ' is-checked' : '') + (isOrphan ? ' is-orphan' : '') + '" '
          + 'data-pp-action="toggle-photo" data-pp-photo-id="' + ph.id + '">'
          + '<img src="' + src + '" alt="Photo" loading="lazy">'
          + '<span class="pe-sel-cb' + (checked ? ' is-checked' : '') + '" aria-hidden="true">' + (checked ? '\u2713' : '') + '</span>'
          + (isOrphan ? '<span class="pe-sel-orphan" title="No observation references this photo. Saving will leave it visible to no one.">\u26A0</span>' : '')
          + (dotsHtml ? '<div class="pe-sel-dots">' + dotsHtml + '</div>' : '')
          + '</div>';
      });
      strip.innerHTML = html;

      if (orphanCount > 0) {
        var note = document.createElement('div');
        note.className = 'pp-orphan-note';
        note.style.cssText = 'background:rgba(168,89,89,.10);border:1px solid rgba(168,89,89,.35);color:#8A3939;border-radius:6px;padding:6px 10px;margin-top:6px;font-size:calc(11px + var(--ts));';
        note.innerHTML = '\u26A0 ' + orphanCount + ' photo' + (orphanCount === 1 ? '' : 's') + ' will be referenced by no observation if you save now. They\u2019ll stay in the pool but won\u2019t appear in any report.';
        strip.parentNode.insertBefore(note, strip.nextSibling);
      }
    }

    // ── Deleted-photos section (Show deleted toggle) ──
    if (active.showDeleted && deletedPool.length > 0) {
      var delSection = document.createElement('div');
      delSection.className = 'pp-deleted pe-sel-deleted-section';
      delSection.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px dashed rgba(122,90,143,.4);';
      var label = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:calc(11px + var(--ts));color:#7B5A8F;font-weight:500;">'
        + '\uD83D\uDDD1 Recently deleted (' + deletedPool.length + ')'
        + '<span style="flex:1;"></span>'
        + '<span style="font-size:calc(10px + var(--ts));color:#6B7B8C;font-weight:400;">Click \u21BA to restore</span>'
        + '</div>';
      var grid = '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      deletedPool.forEach(function (ph) {
        if (!ph) return;
        var src = ph.thumb || ph.dataUrl || ph.r2Url || '';
        var deletedAt = '';
        if (ph.deletedDate) {
          try { deletedAt = new Date(ph.deletedDate).toLocaleString(); } catch (_) { deletedAt = ph.deletedDate; }
        }
        grid += '<div class="pe-photo-thumb pe-sel-deleted" data-pp-photo-id="' + ph.id + '" '
          + 'title="' + (deletedAt ? 'Deleted ' + deletedAt + '. Click \u21BA to restore.' : 'Click \u21BA to restore.') + '">'
          + (src ? '<img src="' + src + '" alt="Deleted photo" loading="lazy">' : '<div style="width:100%;height:100%;background:#3a3e48;"></div>')
          + '<button type="button" data-pp-action="restore-photo" data-pp-photo-id="' + ph.id + '" '
          +   'class="pe-sel-restore-btn" title="Restore this photo to the pool">\u21BA</button>'
          + '</div>';
      });
      grid += '</div>';
      delSection.innerHTML = label + grid;
      strip.parentNode.insertBefore(delSection, strip.nextSibling);
      var noteEl = mount.querySelector('.pp-orphan-note');
      if (noteEl && noteEl.nextSibling !== delSection) {
        delSection.parentNode.insertBefore(delSection, noteEl.nextSibling);
      }
    }

    // ── Footer ──
    var footer = document.createElement('div');
    footer.className = 'pp-footer pe-sel-footer';
    footer.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0 4px;flex-wrap:wrap;';
    var saveColor = '#5C7A65';
    var deleteColor = '#A85959';
    var cancelColor = '#6B7B8C';
    footer.innerHTML =
      '<button type="button" data-pp-action="cancel" '
      +   'style="background:none;border:1px solid ' + cancelColor + ';color:' + cancelColor + ';border-radius:6px;padding:6px 14px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));cursor:pointer;">Cancel</button>'
      + '<span style="flex:1;"></span>'
      + (pickCt > 0
          ? '<button type="button" data-pp-action="delete-from-pool" '
              + 'style="background:none;border:1px solid ' + deleteColor + ';color:' + deleteColor + ';border-radius:6px;padding:6px 14px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));font-weight:500;cursor:pointer;">'
              + '\uD83D\uDDD1 Delete ' + pickCt + ' from pool</button>'
          : '')
      + '<button type="button" data-pp-action="save" '
      +   'style="background:' + saveColor + ';border:none;color:white;border-radius:6px;padding:6px 16px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));font-weight:500;cursor:pointer;">'
      +   'Save as Obs ' + letter + ' selection</button>';
    var noteRef = mount.querySelector('.pp-orphan-note');
    var insertAfter = noteRef || strip;
    if (insertAfter.nextSibling) insertAfter.parentNode.insertBefore(footer, insertAfter.nextSibling);
    else insertAfter.parentNode.appendChild(footer);
  }

  // ── Actions ──
  function save() {
    var M = Model;
    if (!active || !M || !active.pending) { exit(); return; }
    var f = M.findDeficiency(active.deficId);
    if (!f) { exit(); return; }
    var pool = (f.defic.photos || []).filter(function (p) { return p && !p.deleted; });
    var picked = pool.filter(function (p) { return active.pending.has(p.id); }).map(function (p) { return p.id; });
    var savedAsDefault = (picked.length === pool.length);
    var idx = active.obsIdx;
    var letter = obsLetter(idx);
    M.setObsPhotoSelection(active.deficId, idx, savedAsDefault ? null : picked);
    M.saveNow();
    doToast(active, savedAsDefault
      ? 'Saved (default \u2014 all pool photos)'
      : 'Saved Obs ' + letter + ' selection (' + picked.length + ' photo' + (picked.length === 1 ? '' : 's') + ')',
      'success');
    exit();
  }

  function deleteFromPool() {
    var M = Model;
    if (!active || !M || !active.pending) return;
    var f = M.findDeficiency(active.deficId);
    if (!f) return;
    var pool = (f.defic.photos || []).filter(function (p) { return p && !p.deleted; });
    var ids = pool.filter(function (p) { return active.pending.has(p.id); }).map(function (p) { return p.id; });
    if (!ids.length) return;
    var n = ids.length;
    var deficId = active.deficId;
    var ctxRef = active;
    var msg = 'This will remove ' + n + ' photo' + (n === 1 ? '' : 's') + ' from this pin\u2019s pool, including from every observation that uses ' + (n === 1 ? 'it' : 'them') + '. The original ' + (n === 1 ? 'image is' : 'images are') + ' kept in storage and can be recovered from the R2 console if needed.';
    var doDelete = function () {
      ids.forEach(function (id) { M.removePoolPhoto(deficId, id); });
      M.saveNow();
      doToast(ctxRef, 'Deleted ' + n + ' photo' + (n === 1 ? '' : 's') + ' from pool', 'success');
      exit();
    };
    if (n >= 5 && typeof showTypeToConfirm === 'function') {
      showTypeToConfirm('Delete ' + n + ' photos from pool', msg).then(function (yes) { if (yes) doDelete(); });
    } else if (typeof showConfirm === 'function') {
      showConfirm('Delete ' + n + ' photo' + (n === 1 ? '' : 's') + ' from pool', msg).then(function (yes) { if (yes) doDelete(); });
    } else {
      if (window.confirm(msg)) doDelete();
    }
  }

  // Click dispatch — caller routes clicks within its editor here. Returns true
  // if the click was a picker action (so the caller can stopPropagation / not
  // fall through to its legacy thumb/lightbox handlers).
  function handleClick(e) {
    if (!active) return false;
    var M = Model;
    if (!M) return false;
    var el = e.target.closest && e.target.closest('[data-pp-action]');
    if (!el) return false;
    // Only handle clicks inside OUR mount (defense against a second editor).
    if (active.mount && !active.mount.contains(el)) return false;
    var act = el.getAttribute('data-pp-action');

    if (act === 'cancel') { exit(); return true; }
    if (act === 'save') { save(); return true; }
    if (act === 'delete-from-pool') { deleteFromPool(); return true; }
    if (act === 'toggle-master') {
      if (!active.pending) active.pending = new Set();
      var f = M.findDeficiency(active.deficId);
      if (!f) return true;
      var pool = (f.defic.photos || []).filter(function (p) { return p && !p.deleted; });
      var allCheckedNow = pool.length > 0 && pool.every(function (p) { return active.pending.has(p.id); });
      active.pending = allCheckedNow ? new Set() : new Set(pool.map(function (p) { return p.id; }));
      renderSelection();
      return true;
    }
    if (act === 'toggle-photo') {
      var pid = el.getAttribute('data-pp-photo-id');
      if (!pid || !active.pending) return true;
      if (active.pending.has(pid)) active.pending.delete(pid);
      else active.pending.add(pid);
      renderSelection();
      return true;
    }
    if (act === 'toggle-show-deleted') {
      active.showDeleted = !active.showDeleted;
      renderSelection();
      return true;
    }
    if (act === 'restore-photo') {
      e.stopPropagation();
      var rPid = el.getAttribute('data-pp-photo-id');
      if (!rPid) return true;
      var restored = M.restorePoolPhoto(active.deficId, rPid);
      if (restored) {
        M.saveNow();
        doToast(active, 'Photo restored to pool', 'success');
        renderSelection();
      }
      return true;
    }
    return false;
  }

  // Public API.
  var api = {
    open: enter,            // open(ctx) — enters selection mode in ctx.mount
    exit: exit,             // exit() — restores editor via ctx.onExit
    isActive: isActive,     // isActive() — true while a picker is open
    handleClick: handleClick, // route a delegated click; returns true if handled
    obsColor: obsColor,
    obsLetter: obsLetter
  };

  if (typeof window !== 'undefined') {
    window.FrtPhotoPicker = api;
    // Esc support: a global handler can call this to close an open picker
    // WITHOUT closing the surrounding editor (parity with the old
    // _peSelectionModeIsActive / _peExitSelectionMode hooks).
    window.__frtPickerIsActive = isActive;
    window.__frtPickerExit = exit;
  }

export const FrtPhotoPicker = api;
export default api;

