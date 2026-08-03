/**
 * ARENCON — Shared Checklist Engine  v1.1.0
 * ═══════════════════════════════════════════════════════════════════════
 * VERBATIM extraction of the Diesel checklist system (S205 hybrid item +
 * S367 positional state model) into /lib/ per MODULARIZATION_ROADMAP_v2_S460
 * (checklist component: PUMP TOOLS ONLY — Diesel + Electric; FRT excluded,
 * locked S446). Same pixels, same behavior, new home.
 *
 * WHAT THIS OWNS
 *   • cid(section, visIdx) — the positional state key
 *   • migrate(loaded, savedVer) — the S367 schema-migration engine,
 *     config-driven (each tool passes schemaVer + per-version remap steps)
 *   • visibleItems(items, section) — THE canonical item walk (built-ins minus
 *     deletions, then custom items, numbered by visible index)
 *   • renderChecklist / buildItem — the S205 hybrid row (num · text ·
 *     Yes/No/N·A segmented control · photo/notes toggle · collapsible detail
 *     with comment + S205 full-width photo module)
 *   • setStatus — status toggle + detail auto-open-on-NO rule
 *   • toggleItemDetail / refreshItemPhotoUI / renderThumbs
 *   • itemNum(id) — display number for gallery badges (cfg.sectionItems)
 *
 * WHAT STAYS HOST (state + integrations — resolved LATE-BOUND as bare
 * globals at call time, so script load order never matters):
 *   STATE      clState · customItems · deletedItems   (host declares, saves,
 *              loads; the module never owns storage)
 *   PHOTOS     _isPhotoDeleted(p) · _phSrc(p) · removePhoto(id,i) ·
 *              openLightbox(photos,i) · openLightboxMarkup(photos,i)
 *   CAPTURE    S492: the photo ZONE is now rendered by the SHARED engine
 *              lib/ui/photoInput.js — this module draws no photo buttons.
 *              The host mounts it ONCE (ns:'cl') and routes the callbacks to
 *              its own proven paths:
 *                onFiles(files,ctx)  -> host's compress/add pipeline
 *                onGallery(ctx)      -> host's _galleryReuseChecklist(id)
 *              ctx['cl-id'] carries the item id. The host must still expose
 *              removePhoto(id,i) — the thumbnail \u2715 is host content.
 *              (single #global-file-input listener stays host — S280 law:
 *              exactly ONE change listener, never re-add a second)
 *   ROLL-UPS   updateProgress() · updateVerdict()
 *
 * The generated HTML intentionally references those host names in inline
 * on* attributes — the host must expose them under exactly these globals
 * (both pump tools already do). Unselected Yes/No/N·A buttons stay flat
 * neutral grey — tinting an unselected segmented button is FORBIDDEN
 * (Diesel ledger).
 *
 * USAGE (host):
 *   <script src="lib/ui/checklist.js"></script>
 *   var CL = window.ArcChecklist.create({
 *     schemaVer: 2,
 *     migrations: { 2: { re:/^s5_(\d+)$/, prefix:'s5_',
 *                        map:{0:0,1:1,2:2,3:3,4:4,5:5,6:6,8:10,9:11,10:12,11:13,12:14} } },
 *     sectionItems: function(sec){ … return the tool item array … }
 *   });
 *   // then bind the tool's existing global names to CL.* (see diesel-next)
 *
 * Classic script global window.ArcChecklist (+ CJS export for the Node
 * harness). create() is side-effect-free; nothing touches the DOM until
 * renderChecklist is called.
 */
(function (root) {
'use strict';

function create(cfg) {
  cfg = cfg || {};
  if (!cfg.schemaVer) cfg.schemaVer = 1;

  function cid(section, idx) { return `${section}_${idx}`; }

  // ── Checklist state migration ────────────────────────────────────────────
  // clState is keyed positionally (section_index). When built-in items are
  // inserted/removed/reordered, an OLD saved report's marks must be remapped to
  // the new positions or they'd slide onto the wrong items. Saves are stamped
  // with clSchemaVer; reports below the current version are remapped on load so
  // no Yes/No mark is ever lost or misaligned.  (S367 rule; engine generalized
  // S461 — each tool passes its own schemaVer + per-version remap steps. The
  // Diesel v1→v2 S5 map lives in the Diesel host config; this engine reproduces
  // the original _migrateClState output exactly — harness-verified against the
  // verbatim S367 implementation.)
  // A step = { re: /^s5_(\d+)$/, prefix: 's5_', map: {oldIdx: newIdx, …} }.
  // Keys matching `re` are remapped via `map` (dropped when absent from map —
  // that is how a removed item's stale mark is retired); all other keys copy
  // verbatim.
  function migrate(loaded, savedVer){
    if(!loaded || typeof loaded!=='object') return loaded;
    savedVer = savedVer || 1;
    if(savedVer >= cfg.schemaVer) return loaded;   // already current
    var cur = loaded;
    for(var v = savedVer + 1; v <= cfg.schemaVer; v++){
      var step = cfg.migrations && cfg.migrations[v];
      if(!step) continue;
      var out = {};
      Object.keys(cur).forEach(function(k){
        var m = step.re.exec(k);
        if(step.re.global || step.re.sticky) step.re.lastIndex = 0;
        if(m){
          var oldIdx = parseInt(m[1],10);
          if(step.map.hasOwnProperty(oldIdx)){
            out[step.prefix + step.map[oldIdx]] = cur[k];   // remap to new position
          }
          // absent from map ⇒ intentionally dropped
          return;
        }
        out[k] = cur[k];   // untouched
      });
      cur = out;
    }
    return cur;
  }

  function itemNum(id){
    if(typeof id !== 'string' || id.indexOf('_') < 0) return id;
    var us = id.lastIndexOf('_');
    var sec = id.slice(0, us);
    var idx = parseInt(id.slice(us+1), 10);
    var arr = (cfg.sectionItems ? cfg.sectionItems(sec) : null);
    if(arr && arr[idx] && arr[idx].num) return arr[idx].num;
    return id;
  }

  // ── The canonical visible-item walk ──────────────────────────────────────
  // Built-ins (minus per-section deletions) then custom items, numbered by
  // VISIBLE index — the same walk renderChecklist has always done. Exported so
  // the PDF builder / findings scan / progress roll-ups can converge on ONE
  // walk instead of re-implementing it (they each carry a copy today).
  // Read-only: never initializes clState (that stays in renderChecklist).
  // customItems / deletedItems are the host's state objects, resolved
  // late-bound via typeof (they are global lexical consts in the pump tools —
  // NOT window properties — so property lookup would miss them).
  function visibleItems(items, section){
    var _custom = (typeof customItems !== 'undefined' && customItems) ? customItems : {};
    var _delMap = (typeof deletedItems !== 'undefined' && deletedItems) ? deletedItems : {};
    var all = items.concat(_custom[section]||[]);
    var deleted = _delMap[section] || new Set();
    var outArr = [], visIdx = 0;
    all.forEach(function(item, idx){
      if(idx < items.length && deleted.has(idx)) return;
      outArr.push({ id: cid(section, visIdx), item: item, isCustom: idx >= items.length, visIdx: visIdx, rawIdx: idx });
      visIdx++;
    });
    return outArr;
  }

  function renderChecklist(items, containerId, section) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    visibleItems(items, section).forEach(function(v){
      if (!clState[v.id]) clState[v.id] = { status:null, comment:'', photos:[], customText:'' };
      const el = buildItem(v.id, v.item, section, v.visIdx, v.isCustom);
      container.appendChild(el);
    });
  }

  function buildItem(id, item, section, idx, isCustom) {
    const s = clState[id];
    const div = document.createElement('div');
    div.className = `cl-item${s.status ? ' s-'+s.status : ''}`;
    div.id = 'ci-'+id;
    var _num = (item && item.num) ? item.num : (function(){
      var sec=section.replace('s4pld','4b').replace('s5m','5').replace('s','');
      return sec+'.'+(idx+1);
    })();
    var _nPhotos = (s.photos||[]).filter(function(p){ return !_isPhotoDeleted(p); }).length;
    var _detailOpen = (s.status==='no') || _nPhotos>0;
    div.innerHTML = `
      <div class="item-main">
        <div class="item-num">${_num}</div>
        <div class="item-text" id="text-${id}">${s.customText || item.text}</div>
        <div class="item-controls">
          <div class="cl-seg">
            <button class="tog tog-yes${s.status==='yes'?' on':''}" onclick="setStatus('${id}','yes')">YES</button>
            <button class="tog tog-no${s.status==='no'?' on':''}" onclick="setStatus('${id}','no')">NO</button>
            <button class="tog tog-na${s.status==='na'?' on':''}" onclick="setStatus('${id}','na')">N/A</button>
          </div>
          <button class="item-photo-btn${_nPhotos>0?' has':''}${_detailOpen?' open-ind':''}" id="pbtn-${id}" onclick="toggleItemDetail('${id}')" title="Comment & photos" aria-label="Comment and photos">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.2"/></svg>${_nPhotos>0?`<span class="ipb-cnt">${_nPhotos}</span>`:''}
          </button>
        </div>
      </div>
      <div class="item-detail${_detailOpen?' open':''}" id="id-${id}">
        <div>
          <div class="detail-label">Comment / Note</div>
          <textarea class="comment-input" placeholder="Add a note or describe the deficiency..." oninput="clState['${id}'].comment=this.value">${s.comment}</textarea>
        </div>
        <div>
          <div class="detail-label">Photos</div>
          <!-- S492: THE SHARED PHOTO INPUT ENGINE renders this zone.
               This engine no longer draws ANY photo button of its own — the
               previous hand-rolled zone (Camera + Gallery, click-to-upload,
               no Upload button) is GONE, not wrapped. Diesel and Electric now
               get the same three-way surface FRT has: Drag&Drop + Camera +
               Upload + Gallery, from lib/ui/photoInput.js.
               The thumbnails stay here — they are this surface's own content
               (lightbox, markup, delete) — and ride in through the inner option, the
               same way the FRT pin editor does it. The ZONE is the engine's. -->
          ${(window.PhotoInput
            ? window.PhotoInput.html({
                ns: 'cl',
                ctx: { 'cl-id': id },
                hint: (_nPhotos>0 ? 'Drop more photos to add' : 'Drop photos here'),
                inner: `<div class="photo-grid" id="pg-${id}">${renderThumbs(id)}</div>`
                     + `<div class="pm-divider${_nPhotos>0?'':' hide'}" id="pmdiv-${id}"></div>`
              })
            : '<div class="pm-hint" style="color:var(--silver);">Photo input engine not loaded \u2014 add &lt;script src="lib/ui/photoInput.js"&gt;</div>')}
        </div>
      </div>`;
    return div;
  }

  // S205: camera/notes toggle — open the detail (comment + photos) on any status
  function toggleItemDetail(id){
    var detail = document.getElementById('id-'+id);
    var btn = document.getElementById('pbtn-'+id);
    if(!detail) return;
    var open = detail.classList.toggle('open');
    if(open) detail.dataset.userOpened='1'; else delete detail.dataset.userOpened;
    if(btn) btn.classList.toggle('open-ind', open);
  }

  // S205: refresh the photo module chrome (count badge, divider, hint) after add/remove
  function refreshItemPhotoUI(id){
    var n = (clState[id] && Array.isArray(clState[id].photos)) ? clState[id].photos.filter(function(p){return !_isPhotoDeleted(p);}).length : 0;
    var btn = document.getElementById('pbtn-'+id);
    if(btn){
      btn.classList.toggle('has', n>0);
      var cnt = btn.querySelector('.ipb-cnt');
      if(n>0){
        if(!cnt){ cnt=document.createElement('span'); cnt.className='ipb-cnt'; btn.appendChild(cnt); }
        cnt.textContent = n;
      } else if(cnt){ cnt.remove(); }
    }
    var div = document.getElementById('pmdiv-'+id);
    if(div) div.classList.toggle('hide', n===0);
    var detail = document.getElementById('id-'+id);
    if(detail){ var hint = detail.querySelector('.pm-hint'); if(hint) hint.textContent = n>0 ? 'Drop more photos to add' : 'Drop or tap here, or use a button'; }
  }

  function renderThumbs(id) {
    const photos = clState[id]?.photos||[];
    return photos.map((p,i)=>({p:p,i:i})).filter(o=>!_isPhotoDeleted(o.p)).map(({p,i})=>`
      <div class="photo-thumb" style="width:96px;height:96px;">
        <img src="${_phSrc(p)}" onclick="openLightbox(clState['${id}'].photos,${i})" style="cursor:zoom-in;width:100%;height:100%;object-fit:cover;" title="Click to enlarge — full resolution">
        <button class="photo-remove" onclick="removePhoto('${id}',${i})">✕</button>
        <button class="photo-markup-btn" onclick="event.stopPropagation();openLightboxMarkup(clState['${id}'].photos,${i})" title="Markup this photo">✏</button>
      </div>`).join('');
  }

  function setStatus(id, status) {
    const prev = clState[id].status;
    clState[id].status = (prev===status) ? null : status;
    /* S594 — ENTRY-TIME STAMP: recorded the instant the inspector answers, in
       the field, on whatever device is in their hand. Not at save time, not
       on wake, not by inference. Opening the report on a second device stamps
       nothing, so merely waking a device can never outrank a real answer. */
    clState[id]._ts = Date.now();
    const el = document.getElementById('ci-'+id);
    if(!el) return;
    el.className = 'cl-item' + (clState[id].status ? ' s-'+clState[id].status : '');
    ['yes','no','na'].forEach(function(s){
      var btn = el.querySelector('.tog-'+s);
      if(btn) btn.classList.toggle('on', clState[id].status===s);
    });
    var detail = document.getElementById('id-'+id);
    if(detail) {
      var _hasPhotos = (clState[id].photos||[]).filter(function(p){return !_isPhotoDeleted(p);}).length>0;
      // open on NO; otherwise keep whatever state it's in (don't slam shut a manually-opened or photo-bearing detail)
      if(clState[id].status==='no') detail.classList.add('open');
      else if(!_hasPhotos && !detail.dataset.userOpened) detail.classList.remove('open');
      var _pb=document.getElementById('pbtn-'+id); if(_pb) _pb.classList.toggle('open-ind', detail.classList.contains('open'));
    }
    updateProgress();
    updateVerdict();
  }

  return {
    cid: cid,
    migrate: migrate,
    schemaVer: cfg.schemaVer,
    visibleItems: visibleItems,
    renderChecklist: renderChecklist,
    buildItem: buildItem,
    toggleItemDetail: toggleItemDetail,
    refreshItemPhotoUI: refreshItemPhotoUI,
    setStatus: setStatus,
    renderThumbs: renderThumbs,
    itemNum: itemNum
  };
}

// ── Canonical light-mode CSS (for NEW hosts only) ───────────────────────
// Diesel + Electric keep their in-page copies for now: the checklist rules
// are interleaved with each tool's theme layers (base + dark-mode + Bold
// overlay + responsive blocks), so ripping them out is its own wave. A NEW
// tool adopting this engine injects this block and adds its own dark/theme
// overrides on top. Verbatim from the Diesel base stylesheet (S205/S341).
var CHECKLIST_CSS = [
'.cl-item{--cl-yes:#5F8068;--cl-yes-d:#426B4F;--cl-yes-bg:#E8EFE7;--cl-no:#A85959;--cl-no-d:#8E4444;--cl-no-bg:#F6E9E9;--cl-na:#5A6473;--cl-na-bg:#ECEEF1;--cl-todo:#8A7B5C;',
'  --cl-btn-upload:#4F6B8A;--cl-btn-camera:#5C7A65;--cl-btn-gallery:#7D3F4F;',
'  background:white;border-radius:10px;box-shadow:var(--shadow);margin-bottom:8px;overflow:hidden;border:1.5px solid var(--border);border-left:4px solid var(--border);transition:border-color .15s;}',
'.cl-item:not(.s-yes):not(.s-no):not(.s-na){border-left-color:var(--cl-todo);}',
'.cl-item:not(.s-yes):not(.s-no):not(.s-na) .item-num{color:var(--arencon);font-weight:800;}',
'.cl-item.s-yes{border-left-color:var(--cl-yes);}',
'.cl-item.s-no{border-left-color:var(--cl-no);box-shadow:0 2px 12px rgba(168,89,89,.12);}',
'.cl-item.s-no .item-main{background:#fdf7f7;}',
'.cl-item.s-na{border-left-color:var(--cl-na);opacity:.74;}',
'.item-main{display:flex;align-items:center;gap:12px;padding:11px 14px;}',
'.item-num{font-family:Calibri,sans-serif;font-weight:700;font-size:calc(13px + var(--ts));color:var(--silver);min-width:34px;flex-shrink:0;font-variant-numeric:tabular-nums;}',
'.cl-item.s-no .item-num{color:var(--arencon);}',
'.item-text{flex:1;font-size:calc(14px + var(--ts));font-weight:500;color:var(--slate);line-height:1.42;}',
'.item-ref{display:none;}',
'.item-controls{display:flex;gap:8px;flex-shrink:0;align-items:center;}',
'.cl-seg{display:inline-flex;gap:6px;border:none;border-radius:0;overflow:visible;flex:none;}',
'.tog{border:1px solid var(--border);background:var(--b-fieldbg);padding:7px 13px;border-radius:7px;font-size:calc(12.5px + var(--ts));font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;color:var(--steel);transition:all .13s;letter-spacing:.3px;}',
'.tog:not(.on):hover{background:color-mix(in srgb,var(--steel) 8%,transparent);color:var(--steel);}',
'.tog-yes.on{background:var(--yes-bg);color:var(--yes);border-color:var(--yes);}',
'.tog-no.on{background:var(--no-bg);color:var(--no);border-color:var(--no);}',
'.tog-na.on{background:var(--na-bg);color:var(--na);border-color:var(--na);}',
'.tog:last-child{border-right:none;}',
'.item-photo-btn{background:none;border:1.5px solid var(--border);cursor:pointer;color:var(--silver);padding:7px;border-radius:8px;display:inline-flex;line-height:0;flex:none;position:relative;transition:all .12s;}',
'.item-photo-btn:hover{background:var(--smoke);color:var(--arencon);border-color:var(--arencon);}',
'.item-photo-btn.has{color:var(--arencon);border-color:#e3c2cb;background:#fdf6f8;}',
'.item-photo-btn.open-ind{background:var(--arencon);color:#fff;border-color:var(--arencon);}',
'.item-photo-btn .ipb-cnt{position:absolute;top:-6px;right:-6px;background:var(--arencon);color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;line-height:16px;border-radius:8px;padding:0 3px;box-shadow:0 1px 3px rgba(0,0,0,.3);}',
'.item-detail{display:none;padding:4px 14px 14px 52px;flex-direction:column;gap:12px;background:#FBFCFD;border-top:1px solid #EFF1F4;}',
'.item-detail.open{display:flex;}',
'.cl-item.s-no .item-detail.open{background:#fdf7f7;}',
'.detail-label{font-size:calc(11px + var(--ts));font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--steel);margin-bottom:5px;}',
'.comment-input{width:100%;padding:9px 11px;border:1.5px solid var(--border);border-radius:7px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));color:var(--slate);resize:vertical;min-height:52px;background:white;}',
'.comment-input:focus{outline:none;border-color:var(--arencon);}',
'.pm{border:2px dashed var(--border);border-radius:8px;padding:14px;background:var(--smoke);transition:border-color .15s,background .15s;}',
'.pm.drag-over{border-color:var(--arencon);background:rgba(156,39,66,.05);}',
'.pm-divider{height:1px;background:var(--border);margin:10px 0;}',
'.pm-divider.hide{display:none;}',
'.pm-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:42px;}',
'.pm-hint{font-size:calc(12px + var(--ts));color:var(--silver);font-weight:500;flex:1 1 140px;min-width:0;}',
'.pm-btns{display:flex;gap:7px;flex:1 1 100%;flex-wrap:nowrap;justify-content:stretch;min-width:0;margin-top:8px;}',
'.pm-b{flex:0 1 auto;min-width:0;padding:5px 11px;border-radius:6px;font-size:calc(12px + var(--ts));font-weight:600;cursor:pointer;border:none;color:#fff;transition:filter .15s,transform .1s;font-family:Calibri,sans-serif;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#4F6B8A;white-space:nowrap;line-height:1.2;overflow:hidden;}',
'.pm-b:active{transform:translateY(1px);}',
'.pm-b-txt{overflow:hidden;text-overflow:ellipsis;}',
'@media(max-width:520px){.pm-b-txt{display:none;}.pm-b{padding:6px 9px;gap:0;}}',
'.pm-b:hover{filter:brightness(1.08);}',
'.pm-b.cam{background:#5C7A65;}',
'.pm-b.gal{background:#8A7689;}',
'@media(max-width:768px){.cl-item{margin-bottom:6px;}.item-main{flex-wrap:wrap;gap:6px;}.item-controls{width:100%;justify-content:flex-end;}.tog{padding:8px 14px !important;font-size:calc(13px + var(--ts)) !important;}}',
'@media(max-width:480px){.tog{padding:6px 10px !important;font-size:calc(11px + var(--ts)) !important;}.item-num{min-width:30px !important;font-size:calc(12px + var(--ts)) !important;}}'
].join('\\n');

var API = { create: create, VERSION: '1.0.0', CSS: CHECKLIST_CSS };
if (root) root.ArcChecklist = API;
try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
