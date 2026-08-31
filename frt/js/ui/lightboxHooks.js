/**
 * ARENCON FRT — Lightbox personality (S679-B, unification Phase L2)
 * ═════════════════════════════════════════════════════════════════
 * FRT's photo-viewer behaviour, packaged as the hook object the shared shell
 * (lib/ui/lightbox.js, Phase L1) accepts. NOT WIRED INTO LIVE FRT — Phase L3
 * does the cutover after the Owner's field verification. Until then FRT's own
 * viewer (frt/js/ui/lightbox.js) keeps running unchanged.
 *
 * EVERY CARRIED FEATURE, BY NAME (Owner's instruction, S679: nothing useful
 * may be lost — each line below is asserted by frt/tests/sim/lbhooks.mjs or
 * named in the L3 field-verify list):
 *
 *   photoSrc precedence     r2Url → dataUrl → thumb (the live _showPhoto rule)
 *   S341 fallback ladder    load error steps to the next source, never a
 *                           blank frame
 *   S205 context labels     per-photo _ctxLabel in the info bar
 *   S410 caption+date edit  tap the bar → inline caption + date inputs;
 *                           date writes p.addedDate; Model marked dirty
 *   NEVER-BAKE (S351)       strokes are vectors in p._markupStrokes with
 *                           their authoring frame p._mkFrame; the photo
 *                           binary is NEVER modified; display is an overlay
 *   S650 durable save       save order: rescue stashed → Model.saveNow() →
 *                           rescue cleared ONLY on write success
 *   S628c unload rescue     pagehide/visibility flush to localStorage
 *                           (same key: 'frt_markup_rescue_v1'), boot-time
 *                           restore keyed by photo id
 *   S354 deletion saves     "changed since attach" gates the save, so
 *                           erasing every stroke still persists
 *   S372/S363 erase-all     clearing the last stroke commits cleared state
 *   frt-markup-saved event  kept verbatim — the R2/backup listeners in
 *                           photos.js run off it
 *   S626 persist door       re-entry during a save in flight is blocked
 *                           (shell-side _persistBusy owns it in L2+)
 *   S459l selection engine  the shared selection API (hasSel/confirmPick/
 *                           applySel/…) is ALREADY installed on FRT's
 *                           MarkupEngine — the adapter passes it through,
 *                           it does not reimplement (locked spec applies)
 *
 * DELIBERATE DIFFERENCE, ADOPTED, NOT SILENT: the shell's Escape ladder is
 * S295 ("steps down, never destroys work": selection → tool → close; markup
 * exit only via pencil/Save"). FRT's old ladder exited markup on the second
 * Escape. S295 is the later Owner rule and strokes survive via the draft
 * stash either way. Flagged for the L3 field verify.
 */
import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';

var RESCUE_KEY = 'frt_markup_rescue_v1';   // SAME key as the live viewer — boot repair reads one place

export function buildFrtLightboxHooks(deps) {
  deps = deps || {};
  var E = deps.markupEngine || (typeof window !== 'undefined' ? window.MarkupEngine : null);
  var _cur = null;          // the photo currently shown (P2 keeps it honest)
  var _curN = 0;
  var _srcTried = new WeakMap();   // S341 ladder position per photo

  /* ── photo source (the live _showPhoto rule, verbatim precedence) ── */
  /* S715: _localUrl is a TRANSIENT object URL for the photograph read off the
     device (photoBlobs), attached by the FRT shim just before open. It leads
     the ladder because it is the only full-size source that exists before an
     upload confirms — without it a photo taken in a parkade would open at its
     480px preview. It is never written to photo.dataUrl (a blob: URL there
     would be persisted and synced as a dead pointer) and is stripped on both
     persist paths; see Model._stripBlobUrls and syncWorker stripBinaries. */
  function photoSrc(p) { return (p && (p._localUrl || p.r2Url || p.dataUrl || p.thumb)) || ''; }
  function srcLadder(p) {
    var l = [];
    if (p) { [p._localUrl, p.r2Url, p.dataUrl, p.thumb].forEach(function (s) { if (s && l.indexOf(s) < 0) l.push(s); }); }
    return l;
  }

  /* ── never-bake overlay (S351): strokes composited OVER the stage paint,
        in their authoring frame, hidden while the engine canvas is live ── */
  function renderOverlay(ctx, p, nw, nh, markupActive) {
    if (markupActive) return;                       // engine canvas owns the surface
    var strokes = p && p._markupStrokes;
    if (!strokes || !strokes.length || !E || !E.renderStrokesToContext) return;
    var f = p._mkFrame || { w: nw, h: nh };
    ctx.save();
    try { ctx.scale(nw / (f.w || nw), nh / (f.h || nh)); E.renderStrokesToContext(ctx, strokes, f.w || nw, f.h || nh); }
    catch (_) { } finally { ctx.restore(); }
  }

  /* ── S410 caption+date bar + S205 context label, mounted on P2 ── */
  function caption(p) {
    if (p.caption && p.caption.trim()) return p.caption.trim();
    var d = p.addedDate || p.date || p.timestamp || '';
    return d ? String(d).slice(0, 10) : 'Add caption\u2026';
  }
  function onPhotoShown(p, i, n) {
    _cur = p; _curN = n;
    var ov = document.getElementById('dlb-overlay'); if (!ov) return;
    var bar = document.getElementById('frt-lb-info');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'frt-lb-info';
      bar.style.cssText = 'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:12;' +
        'max-width:min(92vw,640px);background:rgba(20,20,28,.92);border:1px solid rgba(255,255,255,.14);' +
        'border-radius:10px;padding:7px 14px;font:13px Calibri,sans-serif;color:#d0d8f0;text-align:center;' +
        'cursor:pointer;pointer-events:auto;';
      ov.appendChild(bar);
      bar.addEventListener('click', function () { _editCaption(bar); });
    }
    bar._photo = p;
    _renderBar(bar, p);
  }
  function _renderBar(bar, p) {
    bar.textContent = '';
    if (p._ctxLabel) {
      var c = document.createElement('span');
      c.style.cssText = 'color:#e0a36a;margin-right:8px;'; c.textContent = p._ctxLabel;
      bar.appendChild(c);
    }
    bar.appendChild(document.createTextNode(caption(p)));
  }
  function _editCaption(bar) {
    var p = bar._photo; if (!p) return;
    var current = p.caption || '';
    var curDate = '';
    try { var d0 = new Date(p.addedDate || p.date || p.timestamp || ''); if (!isNaN(d0.getTime())) curDate = d0.toISOString().slice(0, 10); } catch (_) { }
    bar.innerHTML = '<div style="display:flex;gap:6px;align-items:center;">' +
      '<input id="frt-cap-in" type="text" placeholder="Add caption..." style="flex:1;min-width:0;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:4px 8px;font:13px Calibri,sans-serif;color:#d0d8f0;outline:none;">' +
      '<input id="frt-date-in" type="date" title="Photo date" style="flex:0 0 auto;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:4px 6px;font:12px Calibri,sans-serif;color:#d0d8f0;outline:none;color-scheme:dark;">' +
      '</div>';
    var inp = bar.querySelector('#frt-cap-in'), dinp = bar.querySelector('#frt-date-in');
    inp.value = current; dinp.value = curDate;
    inp.focus(); inp.select();
    dinp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    dinp.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    dinp.addEventListener('change', function (ev) {
      if (dinp.value) { p.addedDate = dinp.value; try { Model.touch && Model.touch(); } catch (_) { } }
      ev.stopPropagation();
    });
    inp.addEventListener('blur', function (ev) {
      if (ev.relatedTarget && ev.relatedTarget.id === 'frt-date-in') return;   // S410 #3: date keeps the editor open
      p.caption = inp.value.trim();
      try { Model.touch && Model.touch(); } catch (_) { }
      _renderBar(bar, p);
    });
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { inp.blur(); ev.preventDefault(); }
      if (ev.key === 'Escape') { inp.value = current; inp.blur(); ev.preventDefault(); }
      ev.stopPropagation();
    });
  }

  /* ── the engine adapter: DieselMarkup-shaped surface over FRT's engine.
        S459l already installed the shared selection API onto MarkupEngine,
        so selection passes through untouched; only attach/naming differ. ── */
  var _styleFn = null;
  function _syncStyle() {
    if (!_styleFn || !E) return;
    try {
      var st = _styleFn() || {};
      if (st.tool !== undefined && E.tool !== st.tool) E.tool = st.tool;
      if (st.color) E.color = st.color;
      if (st.size) E.size = Math.max(1, st.size / 3);   // shell hands Diesel's size*3 convention
      if (st.alpha !== undefined) E.opacity = st.alpha;
    } catch (_) { }
  }
  var adapter = {
    attach: function (cv, img, mk, styleFn) {
      _styleFn = styleFn || null;
      if (cv) cv.style.display = 'none';               // FRT's engine builds its own canvas
      var host = (cv && cv.parentNode) || (img && img.parentNode) || document.body;
      E.attach(host, img, (_cur && _cur._origBlob) || null, _syncStyle,
        (_cur && _cur._markupStrokes) || null);        // never-bake: reload the photo's OWN vectors
      if (E.canvas) E.canvas.addEventListener('pointerdown', _syncStyle, true);
      _syncStyle();
    },
    detach: function () { try { E.detach(); } catch (_) { } _styleFn = null; },
    clear: function () { E.clear && E.clear(); },
    render: function () { E._render && E._render(); },
    composite: function () { /* FRT display is the P1 overlay; p.mk never exists */ },
    undo: function () { E.undo && E.undo(); },
    redoOp: function () { E.redo && E.redo(); },
    isDirty: function () { return !!(E.isDirty && E.isDirty()); },
    hasChangesSinceAttach: function () {
      return E.hasChangesSinceAttach ? E.hasChangesSinceAttach() : !!(E.isDirty && E.isDirty());
    },
    toMk: function () { var s = E.exportStrokes ? E.exportStrokes() : []; return (s && s.length) ? { o: s } : null; },
    exportStrokes: function () { return E.exportStrokes ? E.exportStrokes() : []; },
    deleteSelected: function () { (E.deleteSelected || E.deleteSelection || function () { }).call(E); },
    opaqueBase: false,
    get canvas() { return E.canvas || null; },
    get strokes() { return E.strokes || []; },
    get w() { return E.w; }, get h() { return E.h; },
    get _textController() { return E._textController || null; },
    _onTextStart: function () { }, _onTextEnd: function () { },
    /* shared selection engine (S459l) — pass-through, locked spec */
    hasSel: function () { return !!(E.hasSel && E.hasSel()); },
    deselect: function () { E.deselect && E.deselect(); },
    cancelSelect: function () { E.cancelSelect && E.cancelSelect(); },
    setSelectSub: function (s) { E.setSelectSub && E.setSelectSub(s); },
    getSelectSub: function () { return E.getSelectSub ? E.getSelectSub() : 'rubber'; },
    confirmPick: function () { E.confirmPick && E.confirmPick(); },
    commitSel: function (a) { E.commitSel && E.commitSel(a); },
    applySel: function (f, v, l) { E.applySel && E.applySel(f, v, l); },
    snapSel: function () { return E._snapSel ? E._snapSel() : []; },
    ungroupActive: function () { E.ungroupActive && E.ungroupActive(); },
    deleteTrashPicks: function () { return E.deleteTrashPicks ? E.deleteTrashPicks() : 0; },
    onSelChange: function (fn) { E.onSelChange && E.onSelChange(fn); }
  };

  /* ── S650 persist: the value and its rescue, in the proven order ── */
  function _stashRescue(p, strokes, frame) {
    try { localStorage.setItem(RESCUE_KEY, JSON.stringify({ photoId: p.id, strokes: strokes, mkFrame: frame, at: Date.now() })); } catch (_) { }
  }
  function _clearRescue() { try { localStorage.removeItem(RESCUE_KEY); } catch (_) { } }

  function persistMarkup(p, eng, done) {
    var changed = eng.hasChangesSinceAttach ? eng.hasChangesSinceAttach() : eng.isDirty();
    if (!changed) { done(); return; }                  // S354: unchanged reopen exits clean
    var strokes = eng.exportStrokes();
    var frame = (E && E.w && E.h) ? { w: E.w, h: E.h } : (p._mkFrame || null);
    var finish = function (cleanBlob) {
      /* never-bake: the stored image stays CLEAN; strokes+frame are data */
      if (cleanBlob) {
        p._origBlob = cleanBlob;
        try { var u = URL.createObjectURL(cleanBlob); p.dataUrl = u; } catch (_) { }
      }
      p._annotated = !!(strokes && strokes.length);
      p._markupStrokes = strokes;
      if (frame) p._mkFrame = frame;
      /* the R2/backup listeners in photos.js run off this event — kept verbatim */
      try { document.dispatchEvent(new CustomEvent('frt-markup-saved', { detail: { photo: p, blob: cleanBlob, strokes: strokes, cleanBlob: cleanBlob, mkFrame: frame } })); } catch (_) { }
      /* S650 order: stash first, write, clear only on success */
      _stashRescue(p, strokes, frame);
      var dur = null;
      try { dur = Model.saveNow ? Model.saveNow() : null; } catch (_) { }
      if (dur && typeof dur.then === 'function') {
        dur.then(function () { _clearRescue(); done(); })
          .catch(function (e) {
            try { console.warn('[FRT lbhooks] S650: durable save failed, rescue kept:', e && e.message); } catch (_) { }
            done();                                    // stamped in memory + rescued; not a markup failure
          });
      } else {
        try { Model.touch && Model.touch(); } catch (_) { }
        done();
      }
    };
    if (E && E.cleanBlob) {
      E.cleanBlob().then(finish).catch(function (e) { toast('Save failed: ' + (e && e.message), 'error'); done(e || new Error('save failed')); });
    } else {
      finish(null);
    }
  }

  /* ── S372/S363: a deliberate full-erase commits cleared state ── */
  function clearMarkup(p) {
    delete p.mk;                        // legacy field, if a pre-S292 record carried one
    p._markupStrokes = [];
    p._annotated = false;
    try { document.dispatchEvent(new CustomEvent('frt-markup-saved', { detail: { photo: p, blob: null, strokes: [], cleanBlob: null, mkFrame: p._mkFrame || null } })); } catch (_) { }
    _stashRescue(p, [], p._mkFrame || null);
    var dur = null; try { dur = Model.saveNow ? Model.saveNow() : null; } catch (_) { }
    if (dur && typeof dur.then === 'function') { dur.then(_clearRescue).catch(function () { }); }
    else { try { Model.touch && Model.touch(); } catch (_) { } }
  }

  /* ── revert = deleting vector data; the binary was never touched ── */
  function revertMarkup(p, eng, finish) {
    var dirty = !!(eng && eng.isDirty && eng.isDirty());
    var has = !!(p._markupStrokes && p._markupStrokes.length) || !!p.mk;
    if (!has && !dirty) { finish(false); return; }
    var doIt = function () {
      clearMarkup(p);
      finish(true, 'Markup removed \u2014 original photo untouched');
    };
    if (typeof window._aConfirm === 'function') window._aConfirm('Remove all markup from this photo? The original photo is untouched.', doIt, 'Remove markup');
    else if (deps.confirm) deps.confirm('Remove all markup from this photo? The original photo is untouched.').then(function (y) { if (y) doIt(); else finish(false); });
    else doIt();
  }

  /* ── S628c/S650: unload flush + boot restore (same key, same contract) ── */
  function flushForUnload(markupActive) {
    try {
      var p = _cur; if (!p) return false;
      if (markupActive && E) {
        var changed = E.hasChangesSinceAttach ? E.hasChangesSinceAttach() : E.isDirty();
        if (!changed) return false;
        var strokes = E.exportStrokes();
        var frame = (E.w && E.h) ? { w: E.w, h: E.h } : null;
        p._markupStrokes = strokes;                    // same two fields a real save writes
        if (frame) p._mkFrame = frame;
        p._annotated = !!(strokes && strokes.length);
        try { Model.touch && Model.touch(); } catch (_) { }
        _stashRescue(p, strokes, frame);
        return true;
      }
      /* post-save window: re-stash from the RECORD while the model is dirty */
      if (p._markupStrokes && p._markupStrokes.length && Model.isDirty && Model.isDirty()) {
        _stashRescue(p, p._markupStrokes, p._mkFrame || null);
        return true;
      }
      return false;
    } catch (_) { return false; }
  }
  function restoreRescue(photos) {
    try {
      var raw = localStorage.getItem(RESCUE_KEY); if (!raw) return 0;
      var r = JSON.parse(raw);
      if (!r || !r.photoId || !r.strokes) { _clearRescue(); return 0; }
      var n = 0;
      (photos || []).forEach(function (p) {
        if (!p || p.id !== r.photoId) return;
        if (p._markupStrokes && p._markupStrokes.length) return;   // record already has them
        p._markupStrokes = r.strokes;
        if (r.mkFrame) p._mkFrame = r.mkFrame;
        p._annotated = !!(r.strokes && r.strokes.length);
        n++;
      });
      if (n) { try { Model.touch && Model.touch(); } catch (_) { } }
      _clearRescue();
      return n;
    } catch (_) { return 0; }
  }

  /* ── S341 ladder: on a load error, hand back the next source ── */
  function photoSrcFallback(p, failedSrc) {
    if (!p) return null;
    var l = srcLadder(p);
    var at = _srcTried.get(p) || 0;
    var idx = l.indexOf(failedSrc);
    var next = Math.max(at, idx + 1);
    if (next >= l.length) return null;
    _srcTried.set(p, next + 1);
    return l[next];
  }

  return {
    /* the shell's hook contract */
    showToast: function (m) { toast(m); },
    _photoSrc: photoSrc,
    _isPhotoDeleted: function (p) { return !!(p && p.deleted); },
    _isRealImageBlob: function () { return Promise.resolve(true); },
    _r2Fname: function (p) { return ((p && (p.filename || p.id)) || 'photo') + '.jpg'; },
    markupEngine: adapter,
    renderOverlay: renderOverlay,
    onPhotoShown: onPhotoShown,
    persistMarkup: persistMarkup,
    clearMarkup: clearMarkup,
    revertMarkup: revertMarkup,
    photoSrcFallback: photoSrcFallback,
    /* L3 wiring surface (kept off the shell contract deliberately) */
    flushForUnload: flushForUnload,
    restoreRescue: restoreRescue,
    _current: function () { return _cur; }
  };
}
