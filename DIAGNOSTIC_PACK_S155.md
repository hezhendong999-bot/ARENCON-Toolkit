# DIAGNOSTIC PACK — S155 bug triage

**Project affected:** 4380.24 SP 114 East S WH Sprk Upgrade B01
**Bugs:** (1) drawings disappear after upload, (2) photos sometimes not sticking, (3) pins land in wrong position when viewed on different device from where they were dropped

**Status: INVESTIGATION ONLY. No code shipped.**

---

## How to run

You'll need **two diagnostics**, run separately, on the actual project where the bugs occurred:

- **DIAGNOSTIC A** — runs before any action; captures wipe events for drawings, photos, AND pin position desync. Use this when you upload a PDF or take a photo to reproduce bugs 1 and 2, AND simultaneously captures pin coordinate state for bug 3.
- **DIAGNOSTIC B** — pin-coordinate-only snapshot. Run on **both** the tablet (where pins are correct) AND the PC (where they're off), then send both outputs.

Open DevTools → Console tab.

If you're on Android/iPad without F12, install Eruda by typing this in the URL bar:
```
javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/eruda';document.body.appendChild(s);s.onload=function(){eruda.init();};})();
```

---

## DIAGNOSTIC A — wipe + photo events watcher

Paste this whole block into the console of the affected project (Hub mode, `?project=` in URL). Press Enter.

```js
(function(){
  if(!window.Model||!Model.getProject){console.log('[DIAG-A] Model not ready'); return;}
  var p=Model.getProject();
  if(!p){console.log('[DIAG-A] No project loaded'); return;}

  window._diagA={
    project: p.projectNumber || p.id,
    start: Date.now(),
    initialDrawings: (p.drawings||[]).length,
    initialDeficiencies: (p.deficiencies||[]).length,
    addDrawing: [],
    addDeficiency: [],
    addPhoto: [],
    setProject_calls: [],
    applyMerged_calls: [],
    array_shrinks: [],
    cloud_pulls: [],
    push_calls: [],
    poll_count_changes: []
  };

  function _t(){return ((Date.now()-window._diagA.start)/1000).toFixed(2);}
  function _sizes(){var pp=Model.getProject(); if(!pp)return null; var totalPhotos=0; (pp.deficiencies||[]).forEach(function(d){(d.observations||[]).forEach(function(o){totalPhotos+=((o.photos||[]).length);});}); return {d:(pp.drawings||[]).length, x:(pp.deficiencies||[]).length, ph:totalPhotos};}

  var origAdd=Model.addDrawing;
  Model.addDrawing=function(d){
    var before=_sizes();
    var r=origAdd.apply(this,arguments);
    var after=_sizes();
    window._diagA.addDrawing.push({t:_t(),name:d&&d.name,before:before,after:after});
    console.log('[DIAG-A +drawing] "'+(d&&d.name)+'" '+JSON.stringify(before)+' → '+JSON.stringify(after)+' t+'+_t());
    return r;
  };

  if(Model.addDeficiency){
    var origAddDefic=Model.addDeficiency;
    Model.addDeficiency=function(){
      var before=_sizes();
      var r=origAddDefic.apply(this,arguments);
      var after=_sizes();
      window._diagA.addDeficiency.push({t:_t(),before:before,after:after});
      return r;
    };
  }

  if(Model.addObservationPhoto){
    var origAddPhoto=Model.addObservationPhoto;
    Model.addObservationPhoto=function(){
      var before=_sizes();
      var args=Array.prototype.slice.call(arguments);
      var r=origAddPhoto.apply(this,arguments);
      var after=_sizes();
      window._diagA.addPhoto.push({t:_t(),deficId:args[0],obsIdx:args[1],before:before,after:after});
      console.log('[DIAG-A +photo] defic='+args[0]+' obs='+args[1]+' '+JSON.stringify(before)+' → '+JSON.stringify(after)+' t+'+_t());
      return r;
    };
  }

  var origSet=Model.setProject;
  Model.setProject=function(np){
    var before=_sizes();
    var newSizes=np?{d:(np.drawings||[]).length,x:(np.deficiencies||[]).length}:null;
    var t=_t();
    var stack=(new Error()).stack||'';
    var entry={t:t,before:before,incoming:newSizes,stack:stack.split('\n').slice(1,6).join(' | ')};
    if(before&&newSizes){
      if(newSizes.d<before.d){
        entry.alert='DRAWINGS_SHRUNK';
        console.warn('[DIAG-A ⚠️ setProject SHRUNK drawings] '+before.d+' → '+newSizes.d+' at t+'+t);
        console.warn('Stack:', stack);
        window._diagA.array_shrinks.push(entry);
      }
      if(newSizes.x<before.x){
        entry.alert=(entry.alert?entry.alert+',':'')+'DEFICIENCIES_SHRUNK';
        console.warn('[DIAG-A ⚠️ setProject SHRUNK deficiencies] '+before.x+' → '+newSizes.x+' at t+'+t);
        console.warn('Stack:', stack);
        window._diagA.array_shrinks.push(entry);
      }
    }
    window._diagA.setProject_calls.push(entry);
    return origSet.apply(this,arguments);
  };

  if(Model.applyMerged){
    var origMerge=Model.applyMerged;
    Model.applyMerged=function(np){
      var before=_sizes();
      var newSizes=np?{d:(np.drawings||[]).length,x:(np.deficiencies||[]).length}:null;
      var t=_t();
      window._diagA.applyMerged_calls.push({t:t,before:before,incoming:newSizes,stack:(new Error()).stack.split('\n').slice(1,6).join(' | ')});
      if(before&&newSizes&&newSizes.d<before.d){
        console.warn('[DIAG-A ⚠️ applyMerged SHRUNK drawings] '+before.d+' → '+newSizes.d+' at t+'+t);
      }
      return origMerge.apply(this,arguments);
    };
  }

  if(window.SyncEngine&&SyncEngine.pull){
    var origPull=SyncEngine.pull;
    SyncEngine.pull=function(){
      var t=_t();
      window._diagA.cloud_pulls.push({t:t,started:true,sizes_before:_sizes()});
      console.log('[DIAG-A ☁ pull START] t+'+t);
      var r=origPull.apply(this,arguments);
      if(r&&r.then){
        r.then(function(d){
          window._diagA.cloud_pulls.push({t:_t(),resolved:true,d_count:d?(d.drawings||[]).length:null,x_count:d?(d.deficiencies||[]).length:null,sizes_after:_sizes()});
          console.log('[DIAG-A ☁ pull END] returned d='+(d?(d.drawings||[]).length:'null')+' t+'+_t());
        });
      }
      return r;
    };
  }

  if(window.SyncEngine&&SyncEngine.push){
    var origPush=SyncEngine.push;
    SyncEngine.push=function(){
      var t=_t();
      window._diagA.push_calls.push({t:t,sizes:_sizes()});
      console.log('[DIAG-A ☁ push] t+'+t+' '+JSON.stringify(_sizes()));
      return origPush.apply(this,arguments);
    };
  }

  var lastSizes=_sizes();
  setInterval(function(){
    var s=_sizes();
    if(!s||!lastSizes)return;
    if(s.d!==lastSizes.d||s.x!==lastSizes.x||s.ph!==lastSizes.ph){
      var t=_t();
      window._diagA.poll_count_changes.push({t:t,from:lastSizes,to:s});
      console.log('[DIAG-A poll] '+JSON.stringify(lastSizes)+' → '+JSON.stringify(s)+' at t+'+t);
      lastSizes=s;
    }
  },500);

  console.log('[DIAG-A] armed.');
  console.log('[DIAG-A] Initial sizes: drawings='+window._diagA.initialDrawings+' deficiencies='+window._diagA.initialDeficiencies);
  console.log('[DIAG-A] Now reproduce the bug:');
  console.log('  → Upload a PDF that has been disappearing, OR');
  console.log('  → Take a photo via pin editor that has not been sticking');
  console.log('[DIAG-A] When the bug fires, run:');
  console.log('  copy(JSON.stringify(window._diagA, null, 2))');
  console.log('[DIAG-A] Then paste the clipboard back to chat.');
})();
```

After arming, reproduce the bug (upload PDF / take photo). When the bug fires, type:

```
copy(JSON.stringify(window._diagA, null, 2))
```

Paste the clipboard into chat.

---

## DIAGNOSTIC B — pin position snapshot

Open the same project, view the affected drawing (where pins are mis-positioned). Paste this in console:

```js
(function(){
  var img=document.getElementById('dv-image');
  var wrap=document.getElementById('dv-img-wrap');
  var area=document.getElementById('dv-canvas-area');
  var proj=Model.getProject();
  if(!proj){console.log('[DIAG-B] no project'); return;}

  // Find current drawing
  var current=null;
  try {
    if(window._viewerCurrentDrawing) current=window._viewerCurrentDrawing();
  } catch(_){}
  if(!current){
    // Fallback: match by displayed name
    var titleEl=document.querySelector('.dv-title-text, #dv-title, [class*="dv-title"]');
    var titleText=titleEl?titleEl.textContent.trim():'';
    if(titleText&&proj.drawings){
      current=proj.drawings.filter(function(d){return d.name===titleText||titleText.indexOf(d.name)>=0;})[0]||proj.drawings[0];
    } else current=(proj.drawings||[])[0];
  }

  var dpr=window.devicePixelRatio||1;
  var touchMM=null;
  try { touchMM=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches; } catch(_){}

  var pinsForDwg=[];
  if(current){
    (proj.deficiencies||[]).forEach(function(d){
      if(d.drawingId===current.id&&d.pinX!=null){
        pinsForDwg.push({num:d.num,id:d.id,pinX:d.pinX,pinY:d.pinY});
      }
    });
  }

  var imgRect=img?img.getBoundingClientRect():null;
  var wrapRect=wrap?wrap.getBoundingClientRect():null;
  var areaRect=area?area.getBoundingClientRect():null;

  var tiledActive=false, tiledDims=null;
  try {
    tiledActive=window.TiledPdf&&TiledPdf.isActive&&TiledPdf.isActive();
    if(tiledActive&&TiledPdf.getDimensions) tiledDims=TiledPdf.getDimensions();
  } catch(_){}

  var snap={
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    devicePixelRatio: dpr,
    pointerCoarse: touchMM,
    screen: {w:screen.width,h:screen.height,innerW:innerWidth,innerH:innerHeight},
    project: proj.projectNumber||proj.id,
    drawing: current?{id:current.id,name:current.name,storedW:current.width,storedH:current.height,pdfTiled:current.pdfTiled,r2Url:current.r2Url,thumb_size:current.thumb?current.thumb.length:0}:null,
    img: img?{
      natW: img.naturalWidth,
      natH: img.naturalHeight,
      src: (img.src||'').slice(0,120),
      computed_display: getComputedStyle(img).display
    }:null,
    wrap: wrap?{
      style_w: wrap.style.width||'(none)',
      style_h: wrap.style.height||'(none)',
      rect_w: wrapRect?Math.round(wrapRect.width):null,
      rect_h: wrapRect?Math.round(wrapRect.height):null,
      transform: wrap.style.transform
    }:null,
    area: areaRect?{w:Math.round(areaRect.width),h:Math.round(areaRect.height)}:null,
    img_rect_on_screen: imgRect?{w:Math.round(imgRect.width),h:Math.round(imgRect.height),left:Math.round(imgRect.left),top:Math.round(imgRect.top)}:null,
    tiled_active: tiledActive,
    tiled_dims: tiledDims,
    viewer_state: {
      _scale: window._scale!==undefined?window._scale:'(not exposed)',
      _fitScale: window._fitScale!==undefined?window._fitScale:'(not exposed)',
      _panX: window._panX!==undefined?window._panX:'(not exposed)',
      _panY: window._panY!==undefined?window._panY:'(not exposed)'
    },
    pinsForThisDrawing: pinsForDwg,
    pinsForThisDrawing_count: pinsForDwg.length,
    head_visible: HEAD_VISIBLE_FROM_INDEX_HTML()
  };
  function HEAD_VISIBLE_FROM_INDEX_HTML(){
    var meta=document.querySelector('meta[name="commit-sha"]');
    if(meta) return meta.content;
    var swReg=null;
    try{if(navigator.serviceWorker&&navigator.serviceWorker.controller)swReg=navigator.serviceWorker.controller.scriptURL;}catch(_){}
    return '(no commit-sha meta; SW='+swReg+')';
  }

  console.log('[DIAG-B] snapshot taken. Run on BOTH devices, send both outputs.');
  console.log(JSON.stringify(snap,null,2));
  copy(JSON.stringify(snap,null,2));
  console.log('[DIAG-B] copied to clipboard.');
})();
```

The output auto-copies to clipboard. Paste both PC and tablet snapshots into chat — they need to be of the **same drawing on the same project**.

---

## What I'll learn from each output

**From DIAGNOSTIC A** I'll see:
- Whether `Model.setProject` is being called with a smaller drawings array (and the stack trace tells me which code path)
- Whether the cloud pull is racing the local push (timestamps will show)
- Whether `addObservationPhoto` is succeeding but a wipe happens after
- Whether the empty-array guard is firing (or failing to)

**From DIAGNOSTIC B** I'll see:
- Stored drawing dimensions vs displayed image natural dimensions on each device
- Whether the iPad downscale path is involved
- Whether tile mode is unexpectedly active on a flat-image PDF (or vice versa)
- The actual `pinX`/`pinY` fractional values stored — if they ARE different between sessions, the bug is in storage; if they're the same, the bug is in rendering math

---

## What I am NOT doing

- Not shipping any code fix until I see the diagnostic output for at least bug 1 or bug 3
- Not auto-generating any session deliverables
- Not assuming any of the three bugs are caused by my S155 commit until evidence says so

When you have time (no rush), run the diagnostics and paste back. I'll triage from there.
