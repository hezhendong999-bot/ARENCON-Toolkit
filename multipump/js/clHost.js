/* ═══════════════════════════════════════════════════════════════════════
   THE ROOM REVIEW, DRAWN BY THE SHIPPED ENGINE   multipump/js/clHost.js
   ───────────────────────────────────────────────────────────────────────
   S730d. The room review was drawn by a second renderer of my own — rows
   that looked roughly like a checklist and matched nothing. Wrong by the
   toolkit's own rule: there is ONE checklist, lib/ui/checklist.js, the
   one both pump tools and the FRT draw. This file is the shell's side of
   that engine's host contract, and the review is drawn by the engine
   itself. Every row is a real checklist row with the real segmented control,
   the real scope chips, the real comment and photo detail.

   HOW A TWO-PUMP ROW IS DRAWN. A row answered per machine becomes one
   checklist item per machine, each carrying the machine's name as the
   item hint — the same hint styling the tools use. Room and visit rows
   stay single and keep their VISIT / ROOM chip, which the engine has
   drawn since S729. Nothing new is invented to say who a row is about.

   WHERE THE ANSWER LIVES. The engine keys its own state positionally
   (rr1_0, rr1_1 …). The room review keys answers by row and machine, and
   that is what the report is built from, so the two are mapped here:
   ROWMAP carries every engine id to its row, its machine, and its answer
   key, and updateProgress copies the engine's answers across. Neither
   side has to know about the other's key.

   Load BEFORE lib/ui/checklist.js and before shell.js.
   ═══════════════════════════════════════════════════════════════════════ */

/* state the engine owns, keyed by its own ids */
var clState = {};
/* the engine asks for per-section custom items; the room review has none */
const customItems = {};
/* engine id -> { row, target, answerKey, section } */
var ROWMAP = {};

var _CLENG = null;
function mpChecklistEngine() {
  if (!_CLENG) {
    _CLENG = window.ArcChecklist.create({
      schemaVer: 1,
      sectionItems: function (sec) { return (window.MP_CL_ITEMS && window.MP_CL_ITEMS[sec]) || []; }
    });
  }
  return _CLENG;
}

/* the names the engine's markup calls by hand */
function setStatus(id, status) { return mpChecklistEngine().setStatus(id, status); }
function toggleItemDetail(id) { return mpChecklistEngine().toggleItemDetail(id); }
function cid(section, idx) { return mpChecklistEngine().cid(section, idx); }
function renderThumbs(id) { return mpChecklistEngine().renderThumbs(id); }

/* Answers written by the engine are copied onto the row-and-machine keys
   the report is built from. Called by the engine after every answer. */
function updateProgress() {
  if (window.MPShell && typeof window.MPShell.syncAnswers === 'function') window.MPShell.syncAnswers();
}
function updateVerdict() {}

/* photographs on a review row: not stored yet, same as everywhere else here */
function _clNotYet() { if (typeof showToast === 'function') showToast(_MP_PHOTO_NOTE); }
function clUpload() { _clNotYet(); }
function clCamera() { _clNotYet(); }
function clGallery() { _clNotYet(); }
function clDrop(e) { if (e && e.preventDefault) e.preventDefault(); _clNotYet(); }
function removeClPhoto() { _clNotYet(); }
function openClPhotoMarkup() { _clNotYet(); }
