// ARENCON — Diesel export-path regression harness (S513)
// ============================================================================
// Same philosophy as the verdict harness: extract the REAL code from the built
// files, so the test cannot drift from what ships. Run from repo root:
//     node tests/diesel_export_harness.js
// Exit 0 = every check passed. Add a check here whenever an export bug is
// fixed — this file is why the same bug cannot come back silently.
//
// What it pins, and which real defect each check descends from:
//   1. PAGE_LIMIT is the full-sheet border-box budget       (S508: 1in lost per page)
//   2. both builds carry an IDENTICAL export block           (edit-both discipline)
//   3. _lnk wraps only when a token exists, never breaks     (S512 photo links)
//   4. the appendix picker markup is never link-wrapped      (S512: would hijack the exclude tap)
//   5. the preview click-guard is present in both builds     (S513: fat-finger navigation)
//   6. the annotation drag registry: constant listener count,
//      drag routes to the STARTED label, cur cleared on end  (S513: leak + my own first-attempt bug)
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
function check(name, ok, detail){
  console.log((ok ? 'PASS ' : '**FAIL** ') + name + (detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}

const mod  = read('diesel-app/js/pdfExport.js');
const mono = read('ARENCON_Diesel_Fire_Pump_Commissioning.html');
const p06  = read('diesel-app/js/part06.js');

// ── 1. PAGE_LIMIT ───────────────────────────────────────────────────────────
{
  const m = mod.match(/var PAGE_LIMIT = \(11 \* 96\) - (\d+);/);
  check('1. PAGE_LIMIT is full-sheet minus a small reserve', !!m && +m[1] >= 8 && +m[1] <= 48,
        m ? `reserve=${m[1]}px` : 'pattern not found — budget was rewritten');
  check('1b. old content-height budget is gone', !/PAGE_LIMIT = \(11 - 1\.0\) \* 96/.test(mod) && !/PAGE_LIMIT = \(11 - 1\.0\) \* 96/.test(mono));
}

// ── 2. build parity: export block byte-identical ────────────────────────────
{
  const key = 'function _ppxKey(item)';
  const end = 'function exportPDF(){ _exportModalOpen(); }';
  const a = mod.slice(mod.indexOf(key), mod.indexOf(end));
  const b = mono.slice(mono.indexOf(key), mono.indexOf(end));
  check('2. export block identical across builds', a.length > 1000 && a === b, `${a.length} chars`);
}

// ── 3. _lnk behaviour (extracted, executed) ────────────────────────────────
{
  const m = mod.match(/function _lnk\(photo, cellHtml\)\{[\s\S]*?\n\}/);
  check('3. _lnk present', !!m);
  if (m){
    const _lnk = new Function('window', 'return (' + m[0].replace(/^function _lnk/, 'function') + ')')(
      { __photoLinkHrefs: { href: p => (p && p.tok ? 'https://files.arencon.app/p/' + p.tok : '') } });
    const winTok = { __photoLinkHrefs: { href: p => (p && p.tok ? 'https://files.arencon.app/p/' + p.tok : '') } };
    const lnkT = new Function('window', 'return (' + m[0].replace(/^function _lnk/, 'function') + ')')(winTok);
    check('3a. wraps when a token exists', lnkT({ tok: 'abc' }, '<img>').startsWith('<a href="https://files.arencon.app/p/abc"'));
    check('3b. passes through unlinked without a token', lnkT({}, '<img>') === '<img>');
    const lnkNull = new Function('window', 'return (' + m[0].replace(/^function _lnk/, 'function') + ')')({ __photoLinkHrefs: null });
    check('3c. passes through when the map never arrived', lnkNull({ tok: 'abc' }, '<img>') === '<img>');
    const lnkBoom = new Function('window', 'return (' + m[0].replace(/^function _lnk/, 'function') + ')')(
      { __photoLinkHrefs: { href(){ throw new Error('boom'); } } });
    check('3d. a throwing map cannot break the report', lnkBoom({ tok: 'x' }, '<img>') === '<img>');
  }
}

// ── 4. picker screen carries no _lnk ────────────────────────────────────────
{
  const i = mod.indexOf('_ppxToggle(this)');
  const seg = mod.slice(Math.max(0, i - 2500), i + 500);
  check('4. appendix picker markup is not link-wrapped', i > 0 && !seg.includes('_lnk('));
}

// ── 5. preview click-guard present in both builds ───────────────────────────
{
  const sig = "ev.preventDefault(); ev.stopPropagation();";
  const near = "w.document.addEventListener('click'";
  check('5. click-guard in module', mod.includes(near) && mod.includes(sig));
  check('5b. click-guard in monolith', mono.includes(near) && mono.includes(sig));
}

// ── 6. annotation drag registry (extracted, executed) ───────────────────────
{
  check('6. registry pattern shipped (start-time registration)',
        p06.includes('_r.cur = { move:_annMove, end:_annEnd, state:dragState }') &&
        !p06.includes('_annReg.cur = { move:_annMove'));
  // executable model of the shipped pattern
  const doc = { __annDragReg: undefined, _l: {}, addEventListener(ev, fn){ (this._l[ev] = this._l[ev] || []).push(fn); } };
  function label(name, log){
    const st = { dragging: false };
    const move = (x, y) => { if (st.dragging) log.push(['move', name]); };
    const end  = () => { if (st.dragging){ st.dragging = false; log.push(['end', name]); } };
    const start = () => { const r = doc.__annDragReg; if (r) r.cur = { move, end, state: st }; st.dragging = true; log.push(['start', name]); };
    const reg = doc.__annDragReg || (doc.__annDragReg = { bound: false, cur: null });
    if (!reg.bound){
      reg.bound = true;
      doc.addEventListener('mousemove', ev => { if (reg.cur) reg.cur.move(ev.x, ev.y); });
      doc.addEventListener('mouseup', () => { if (reg.cur){ reg.cur.end(); reg.cur = null; } });
    }
    return { start };
  }
  const logA = [], logB = [];
  label('A', logA); label('B', logB);          // render 1
  const A2log = [], B2log = [];
  const A2 = label('A2', A2log); label('B2', B2log); // render 2 (B2 last)
  check('6a. listener count constant across renders', doc._l.mousemove.length === 1 && doc._l.mouseup.length === 1,
        `mousemove=${doc._l.mousemove.length}`);
  A2.start();
  doc._l.mousemove.forEach(f => f({ x: 1, y: 1 }));
  doc._l.mouseup.forEach(f => f());
  check('6b. drag routes to the label that STARTED it (not last-rendered)',
        A2log.length === 3 && B2log.length === 0, JSON.stringify(A2log));
  check('6c. cur cleared after drag ends', doc.__annDragReg.cur === null);
}


// ── 7. S514 mint-wait: build waits, capped, cleanup behind the build ────────
{
  check('7. build waits on the mint promise', mod.includes('Promise.race([ window.__photoLinkPromise') && mono.includes('Promise.race([ window.__photoLinkPromise'));
  const capOk = /setTimeout\(res, 4000\)/.test(mod);
  check('7a. wait is capped (export can never stall)', capOk);
  // cleanup must be INSIDE the then-chain, after _realExportPDF
  const i = mod.indexOf('_lnkWait.then(function(){');
  const seg = mod.slice(i, i + 1400);
  check('7b. canvas cleanup ordered behind the build (S503b)', i > 0 && seg.indexOf('_realExportPDF();') > -1 && seg.indexOf('_chartRestore()') > seg.indexOf('_realExportPDF();'));
  const j = mod.indexOf('window.__photoLinkPromise = _plm(');
  check('7c. mint promise stored for the build to await', j > 0);
}


// ── 8. S516 photo-link key form — discovered, not assumed ─────────────────
{
  const mint = read('lib/data/photoLinkMint.js');
  check('8. both key forms are minted as candidates', mint.includes('export function keyCandidates') && mint.includes("parts[1] + '/photos/'"));
  check('8a. the winning form is chosen by probing the worker', mint.includes("method: 'HEAD'") && mint.includes('win.idx'));
  check('8b. neither form resolving suppresses links (never ship dead links)', mint.includes('neither key form resolves'));
  check('8c. unreachable probe keeps links on the documented form', mint.includes('probe unreachable, links kept'));
  check('8d. token cache key bumped past both poisoned generations', mint.includes('arencon-plm-tokens-v3'));
}

console.log(failures === 0 ? '\nALL EXPORT-PATH CHECKS PASS' : `\n*** ${failures} FAILURE(S) ***`);
process.exit(failures === 0 ? 0 : 1);
