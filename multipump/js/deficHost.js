/* ═══════════════════════════════════════════════════════════════════════
   DEFICIENCIES — THE SHELL AS HOST             multipump/js/deficHost.js
   ───────────────────────────────────────────────────────────────────────
   The job's deficiencies are ONE list, filed by contractor, exactly as
   the shipped tools file them — and they are drawn by the same engine
   the shipped tools draw them with: lib/ui/deficiencies.js, loaded here
   as-is. That engine was extracted from the Diesel tool with its host
   left behind; it reaches its host by global name for a dozen things —
   the contractor list, the checklist answers, escaping, toasts, the
   photo helpers. Those are what this file is: the multi-pump shell's
   side of that contract. Nothing here redraws a deficiency; the engine
   owns every pixel of the list. (The mechanical test: grep this file for
   the deficiency markup. There is none.)

   WHAT IS DIFFERENT FROM THE SHIPPED HOST
   · Ownership. Each deficiency carries which machine it is about — or
     the room. The engine asks for that chip through _deficOwnerHook,
     defined below; in the single-pump tools the hook does not exist and
     nothing is drawn.
   · Nothing saves. debounceAutosave is a no-op on purpose.
   · Photographs. The capture helpers the engine expects (compressImage,
     the EXIF date, the burst camera, the reuse picker, delete-everywhere)
     are the tool's photo pipeline, which stores. Here each of them says
     "not yet", in place, and does nothing — photo storage ships with the
     Owner at a tablet, same as the frames.
   · Checklist findings. The roll-up of "No" answers into suggested
     deficiencies reads a global clState. In this shell the answers live in
     the room review and in the machine frames, not in one clState — the
     roll-up is empty here until it is taught to read those. Open item.

   Classic script by necessity: the engine and its inline handlers reach
   these by name. Load BEFORE lib/ui/deficiencies.js.
   ═══════════════════════════════════════════════════════════════════════ */

/* the contractor list the engine iterates — declared here, mutated in place */
const contractors = [];
/* each contractor's trade, name -> trade, as the tools keep it */
let contractorTrades = {};
/* the checklist answers the findings roll-up reads — empty here (see above) */
var clState = {};

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* nothing saves on this page */
function debounceAutosave() {}

/* one quiet line at the foot of the panel, never a toast for a background op */
function showToast(msg) {
  var el = document.getElementById('mp-defic-note');
  if (el) { el.textContent = String(msg || ''); el.style.display = msg ? '' : 'none'; }
}

/* drag styling the engine's zones expect from the host */
function handleDragOver(e) { e.preventDefault(); if (e.currentTarget) e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { if (e.currentTarget) e.currentTarget.classList.remove('drag-over'); }
function _boxUp(e, fn) { if (e && e.target && e.target.closest && e.target.closest('button')) return; fn(); }

/* how a photo object is shown and whether it is gone — same reading the tools use */
function _phSrc(p) { return p ? (p.d || p.r2Url || '') : ''; }
function _isPhotoDeleted(p) { return !!(p && p.deleted); }

/* ── photographs: not yet ──────────────────────────────────────────── */
var _MP_PHOTO_NOTE = 'Photographs on deficiencies are not stored on this page yet \u2014 they arrive with the store, Owner at a tablet.';
function _mpNotYet() { showToast(_MP_PHOTO_NOTE); }
function compressImage() { _mpNotYet(); }
function _photoDateFromExif() { _mpNotYet(); return Promise.resolve(''); }
function _openPhotoReusePicker() { _mpNotYet(); }
function deletePhotoEverywhere() { _mpNotYet(); }
function _openPmuModal() { _mpNotYet(); }
function handleFiles() { _mpNotYet(); }
var _pmuState = null;

/* ── the owner chip ───────────────────────────────────────────────── */
/* Drawn by the engine next to the status pill. One segmented control:
   Room, then each machine on the job. An untagged deficiency reads as a
   warning, because that is what it is — a work order with no address. */
function _deficOwnerHook(d, scope) {
  var MP = window.MPShell, Own = window.MPDeficiencyOwner;
  if (!MP || !Own) return '';
  var own = Own.ownerOf(d);
  var opts = [{ key: 'room', label: 'Room' }].concat(MP.pumps().map(function (p) { return { key: p.id, label: p.name }; }));
  var html = '<span class="mp-own' + (own ? '' : ' mp-own-none') + '" data-own-scope="' + escHtml(scope) + '">'
    + '<span class="mp-own-lbl">' + (own ? 'About' : 'About which?') + '</span>';
  opts.forEach(function (o) {
    var on = own && ((o.key === 'room' && own.scope === 'room') || (own.scope === 'pump' && own.id === o.key));
    html += '<button type="button" class="mp-own-btn' + (on ? ' on' : '') + '" onclick="event.stopPropagation();mpSetDeficOwner(\''
      + escHtml(scope) + '\',\'' + escHtml(o.key) + '\')">' + escHtml(o.label) + '</button>';
  });
  return html + '</span>';
}
function mpSetDeficOwner(scope, key) {
  var ref = _deficByScope(scope); if (!ref || !ref.d) return;
  if (key === 'room') MPDeficiencyOwner.tag(ref.d, 'room');
  else MPDeficiencyOwner.tag(ref.d, 'pump', key);
  if (ref.kind === 'g') renderGeneralDeficGroup(); else renderDeficGroup(ref.name);
  updateDeficSummary();
}

/* The engine's lists are top-level consts, which are not window properties.
   The shell reads them through this — a function declaration can see them
   and is reachable by name. */
function mpDeficLists() {
  return { byContractor: deficiencies, general: generalDeficiencies, contractors: contractors, trades: contractorTrades };
}

/* ── the confirm the engine asks for before a removal ─────────────── */
/* Same contract the pump tools provide (part03 _aConfirm): the sealed
   dialog engine draws it; no engine, no removal. */
function _aConfirm(msg, onOk, okText) {
  var D = window.ArenconDlg;
  if (!D) { try { console.error('[mp] dialog engine not loaded \u2014 action blocked for safety:', msg); } catch (_) {} return; }
  var t = String(okText || '').toLowerCase();
  var accent = /\b(delete|reset|revert|remove|clear|purge|discard|wipe|erase)\b/.test(t) ? 'fail' : 'info';
  D.confirm({ title: 'Confirm', icon: '?', accent: accent, message: msg, confirmText: (okText || 'OK'), onConfirm: onOk });
}

/* ── checklist findings, read from where the answers live ─────────── */
/* The engine's roll-up of "No" answers asks the host for its rows here.
   Two sources: the room review on this page, and each machine's frame —
   where the frame's own engine already knows how to list its findings,
   so it is asked, not re-read. Each row is stamped with where it came
   from, and _jumpToChecklistItemHost takes the reader there. */
function _checklistFindingsHost() {
  var MP = window.MPShell; if (!MP || typeof MP.roomFindings !== 'function') return [];
  var rows = MP.roomFindings().map(function (r) {
    return { id: 'room|' + r.key, num: r.who + ' ' + r.num, text: r.text, photos: 0, comment: '' };
  });
  var frames = MP.frames();
  MP.pumps().forEach(function (p) {
    var f = frames[p.id]; var w = f && f.contentWindow;
    if (!w || typeof w._checklistFindings !== 'function') return;
    var list = [];
    try { list = w._checklistFindings() || []; } catch (e) { list = []; }
    list.forEach(function (r) {
      rows.push({ id: p.id + '|' + r.id, num: p.name + ' ' + r.num, text: r.text, photos: r.photos || 0, comment: r.comment || '' });
    });
  });
  return rows;
}
function _jumpToChecklistItemHost(id) {
  var MP = window.MPShell; if (!MP) return false;
  var at = String(id).indexOf('|'); if (at < 0) return false;
  var where = id.slice(0, at), item = id.slice(at + 1);
  if (where === 'room') { MP.show('room'); MP.scrollToRoomRow(item); return true; }
  var f = MP.frames()[where]; if (!f) return false;
  MP.show(where);
  var w = f.contentWindow;
  if (w && typeof w._jumpToChecklistItem === 'function') { try { w._jumpToChecklistItem(item); } catch (e) {} }
  return true;
}
