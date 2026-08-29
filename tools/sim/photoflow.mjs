/* ═══ photoflow.mjs — S687: an item's photo block taller than a page must FLOW,
   never bleed (the 1490.04 spill) ══════════════════════════════════════════

   WHAT THIS IS AND IS NOT. This is a LOGIC check under a modelled layout, not
   acceptance. S686 proved the hard way that two paginators agreeing under a
   simulated page says nothing about a printed one — the acceptance for this
   fix is the Owner's own export of 1490.04, page for page. What a model CAN
   do honestly is exercise the decision logic: the model here gives the photo
   box a height that grows with its child count (ceil(n/3) rows), which is the
   one behaviour — flex wrapping — the fix's measurement loop depends on.

   TWO PROOFS:
   1. INERTNESS — on a report whose groups all fit (the normal case), the fixed
      paginator's output is byte-identical to the pre-fix paginator's. The fix
      touches nothing that already worked.
   2. THE FIX — on the 1490.04 shape (one item, 24 photos), the pre-fix code
      overflows the page budget (the bug, reproduced) and the fixed code does
      not: every photo survives, in order, no page over budget, continuation
      pages carry the "(cont.)" band and a re-stamped table header. */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');
const LIVE_SRC = fs.readFileSync(path.join(REPO, 'diesel-app/js/pdfExport.js'), 'utf8');
/* S695 — the pagination block became resident 4 of the shared engine (S694).
   Pagination checks now read the ENGINE; the signature-guard and photo-box
   checks below still read the host, which is where those blocks live. */
const ENGINE_SRC = fs.readFileSync(path.join(REPO, 'lib/export/reportPdf.js'), 'utf8');
/* The pre-fix baseline is taken from git at the last field-proven commit, not
   from a copy that could go stale. */
const PRE_SRC = execSync('git show 08e1bb9:diesel-app/js/pdfExport.js', { cwd: REPO, encoding: 'utf8' });

function liftPagination(src) {
  /* S695 — engine shape (lib/export/reportPdf.js): the block sits inside
     `function paginate(win, cfg){ … _paginateWhenSettled(); }`. Lift from
     _paginateNow through the tail call. */
  const ea = src.indexOf('  function _paginateNow(){');
  const et = src.indexOf('  _paginateWhenSettled();');
  if (ea >= 0 && et > ea && src.indexOf('cfg && cfg.header') > 0) {
    return src.slice(ea, et + '  _paginateWhenSettled();'.length);
  }
  const a = src.indexOf('// ── PAGINATION ENGINE (Session 53) ──');
  if (a < 0) return null;
  /* Two shapes exist: the pre-S688 timer body ends '}, 1200);'; the S688 gate
     ends 'setTimeout(_paginateWhenSettled, 1200);'. Lift whichever is present. */
  const gate = 'setTimeout(_paginateWhenSettled, 1200);';
  const g = src.indexOf(gate, a);
  if (g >= 0) return src.slice(a, g + gate.length);
  const b = src.indexOf('}, 1200);', a);
  if (b < 0) return null;
  return src.slice(a, b + '}, 1200);'.length);
}

const ROW_H = 137;      // one visual row of 170x128 photos in the model
const PER_ROW = 3;      // photos per visual row in the model

function makeDoc(photoCounts) {
  const items = photoCounts.map((n, i) => `
    <tr><td>1.${i + 1}</td><td data-h="60">Checklist item ${i + 1}</td><td>No</td></tr>
    ${n ? `<tr class="ph-keep"><td></td><td colspan="2"><div class="nd-photos">${
        Array.from({ length: n }, (_, p) => `<a data-photo="i${i}p${p}"><img></a>`).join('')
      }</div></td></tr>` : ''}`).join('');
  const html = `<div id="wrap"><div class="page" style="padding:0.5in;">
      <div class="cover" data-h="500">COVER</div>
      <div class="sh" data-h="38">1. Prior to Commissioning Date</div>
      <div class="sb flush"><table>
        <thead><tr data-h="34"><th>#</th><th>Item</th><th>Status</th></tr></thead>
        <tbody>${items}</tbody>
      </table></div>
    </div><div id="mobile-page-nav">nav</div></div>`;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const win = dom.window;
  Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      const d = this.getAttribute && this.getAttribute('data-h');
      if (d) return Number(d);
      if (this.classList && this.classList.contains('nd-photos'))
        return Math.ceil(this.children.length / PER_ROW) * ROW_H;   // flex wrap, modelled
      let sum = 0;
      for (const k of this.children) sum += k.offsetHeight;
      return sum;
    }
  });
  return win;
}

function runPagination(src, win) {
  const block = liftPagination(src);
  if (!block) throw new Error('pagination block not found in source');
  const warnings = [];
  const conFake = { warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')), log: () => {}, info: () => {} };
  if (block.indexOf('cfg && cfg.header') >= 0) {
    /* engine shape — same header CONTENT the host shape composes, so the
       inertness diff compares geometry, never wording */
    new Function('win', 'cfg', 'setTimeout', 'console', 'Array', 'Date', 'Math', block)(
      { document: win.document },
      { header: { client: 'C', addr: 'A', title: 'Diesel Fire Pump Commissioning Report #1 - P', projNo: '1490.04', rev: 'A02' } },
      (fn) => fn(), conFake, Array, Date, Math
    );
    if (warnings.length) throw new Error('pagination swallowed an error: ' + warnings[0]);
    return Array.from(win.document.querySelectorAll('#wrap .page'));
  }
  new Function('w', 'proj', '_pdfInstNum', 'formRevision', 'setTimeout', 'console', 'Array', 'Date', 'Math', block)(
    { document: win.document },
    { client: 'C', addr: 'A', projname: 'P', projno: '1490.04', revision: 'A02' },
    1, 'A01',
    (fn) => fn(),
    conFake,
    Array, Date, Math
  );
  if (warnings.length) throw new Error('pagination swallowed an error: ' + warnings[0]);
  return Array.from(win.document.querySelectorAll('#wrap .page'));
}

const contentH = (p) => { let s = 0; for (const k of p.children) s += k.offsetHeight; return s; };
const BUDGET = (11 * 96) - 16;

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (!pass && detail ? '\n           ' + detail : ''));
}

/* ── 1: INERTNESS — normal report, old and new must agree to the byte ── */
{
  const small = [2, 1, 0, 3, 1, 2, 0, 1];   // nothing oversized
  const oldWin = makeDoc(small); runPagination(PRE_SRC, oldWin);
  const newWin = makeDoc(small); runPagination(ENGINE_SRC, newWin);
  const a = oldWin.document.getElementById('wrap').innerHTML;
  const b = newWin.document.getElementById('wrap').innerHTML;
  let at = 0; while (at < a.length && a[at] === b[at]) at++;
  check('a report whose groups all fit is BYTE-IDENTICAL before and after the fix',
        a === b, 'first differing byte at ' + at + ': …' + b.slice(Math.max(0, at - 60), at + 60));
}

/* ── 2: THE BUG, REPRODUCED — pre-fix code overflows on the 1490.04 shape ── */
{
  const win = makeDoc([24, 1, 1]);
  const pages = runPagination(PRE_SRC, win);
  check('pre-fix code overflows the sheet on a 24-photo item (the bug exists to be fixed)',
        pages.some(p => contentH(p) > BUDGET),
        'no page over budget — the reproduction itself failed, nothing below is meaningful');
}

/* ── 3: THE FIX — same shape, fixed code ── */
{
  const win = makeDoc([24, 1, 1]);
  const pages = runPagination(ENGINE_SRC, win);
  const flat = win.document.getElementById('wrap').innerHTML;

  check('no page exceeds the budget any more', pages.every(p => contentH(p) <= BUDGET),
        'worst page: ' + Math.max(...pages.map(contentH)) + 'px vs budget ' + BUDGET);
  const ids = Array.from(win.document.querySelectorAll('#wrap [data-photo]')).map(e => e.getAttribute('data-photo'));
  check('all 24 photos of item 1.1 survive', ids.filter(i => i.startsWith('i0')).length === 24,
        'found ' + ids.filter(i => i.startsWith('i0')).length);
  check('every photo of every item survives exactly once', ids.length === 26 && new Set(ids).size === 26,
        ids.length + ' photos, ' + new Set(ids).size + ' unique');
  const i0 = ids.filter(i => i.startsWith('i0'));
  check('photo order is preserved', i0.every((v, k) => v === 'i0p' + k),
        'first out-of-place: ' + i0.find((v, k) => v !== 'i0p' + k));
  check('the item row itself stays on its first page with its leading photos', (() => {
    const itemPage = pages.find(p => /Checklist item 1</.test(p.innerHTML));
    return !!itemPage && itemPage.querySelectorAll('[data-photo^="i0"]').length > 0;
  })());
  check('continuation pages re-stamp the "(cont.)" band', /\(cont\.\)/.test(flat));
  check('continuation pages re-stamp the table header',
        pages.filter(p => p.querySelector('[data-photo^="i0"]')).every(p => !!p.querySelector('thead')));
  check('later items still follow after the flowed photos', /Checklist item 3</.test(flat));
}

/* ── 4: the fix is wired into the live file at the right spot ── */
check('the flow guard sits on the placement path', /if\(_overflow\(\)\) _flowPhotoOverflow\(grp\);/.test(ENGINE_SRC));

/* ── 5: S688 — pagination WAITS for images to settle instead of hoping ──
   jsdom does not load resources, so an <img src> stays complete=false forever:
   exactly the shape of a still-loading photo. The gate must NOT paginate while
   one exists (a real timer is used here, not the instant stub, so a premature
   run has somewhere to be seen), and the hard cap must then release it —
   a hung image can never hold a report hostage. */
{
  const win = makeDoc([2, 1]);
  const holdout = win.document.createElement('img');
  holdout.setAttribute('src', 'http://nowhere.invalid/never-loads.jpg');
  win.document.querySelector('.page').appendChild(holdout);
  check('an image that has not settled is really reported unsettled by the DOM', holdout.complete === false);

  const block = liftPagination(ENGINE_SRC);
  /* S695 — the split world: the ENGINE ends in a direct settle-gate call and
     the HOST owns the 1200ms floor around ReportPdf.paginate. Both halves of
     the contract are asserted, so neither side can quietly drop its piece. */
  check('the engine block ends in the settle gate, not a bare paginate',
    /_paginateWhenSettled\(\);\s*$/.test(block || ''));
  check('the host arms the 1200ms floor around the engine call',
    /setTimeout\(function\(\)\{[\s\S]*?ReportPdf\.paginate\(w,[\s\S]*?\}, 1200\);/.test(LIVE_SRC));

  const caps = [];
  /* The marker that pagination RAN is the letter-height lock it stamps on every
     finished sheet — a two-item document may legitimately make just one page. */
  let paginated = () => (win.document.querySelector('#wrap .page') || {}).style?.height === '11in';
  new Function('win', 'cfg', 'setTimeout', 'console', 'Array', 'Date', 'Math', block)(
    { document: win.document },
    { header: { client: 'C', addr: 'A', title: 'Diesel Fire Pump Commissioning Report #1 - P', projNo: '1490.04', rev: 'A02' } },
    (fn, ms) => { if (ms >= 15000) { caps.push(fn); } else { fn(); } },   // HOLD the 15s cap; everything shorter runs now
    { warn: () => {}, error: () => {}, info: () => {}, log: () => {} },
    Array, Date, Math
  );
  check('with an unsettled image, pagination has NOT run yet', !paginated(),
        'pages were cut against a document whose geometry was not final');
  check('the 15s cap was armed', caps.length === 1);
  if (caps.length === 1) caps[0]();
  check('the cap releases the gate and the report still paginates', paginated());
}


/* ── 6: NOT PROVEN BY TEST — the band-travel fix (S689) ───────────────────
   The keep-prev band fix below in pdfExport.js is verified by READING, not by
   this probe. A modelled fixture for it did not reproduce the page split at all
   (a 1278px page stayed whole), which means the model — not the fix — is wrong,
   and a test I do not understand is worth less than no test: a green light I
   cannot explain is how S686 shipped a broken report. Recorded here so the gap
   is visible rather than silently absent. Acceptance for that fix is the
   Owner's export. */

/* ── 7: S689 — an empty signature card never reaches paper ── */
{
  /* S690: the guard must test INK, not `src`. _sigPrintSrc returns a valid data
     URL for a BLANK canvas, so a src-based test passes for every rendered pad —
     which is exactly why the S689 guard printed the blank cards anyway. */
  const guard = /if\(!_ink && !\(row\.name\|\|''\)/g;
  const hits = (LIVE_SRC.match(guard) || []).length;
  check('the blank-signature guard tests INK, on BOTH contractor and witness cards', hits === 2,
        'found ' + hits + ' of 2');
  check('no signature guard still tests the src data-URL', !/if\(!src && !\(row\.name/.test(LIVE_SRC));
  check('a card with text but no ink prints the ruled line, not a blank image',
        (LIVE_SRC.match(/\+ \(\(src && _ink\) \?/g) || []).length === 2);
  check('deficiency photos print in a fixed box, not height:auto',
        !/max-width:250px;height:auto/.test(LIVE_SRC) && /width:250px;height:188px/.test(LIVE_SRC));
  check('response photos print in a fixed box, not height:auto',
        !/max-width:220px;height:auto/.test(LIVE_SRC) && /width:220px;height:165px/.test(LIVE_SRC));
}

console.log('');
if (results.every(Boolean)) console.log('PASS — oversized photo groups flow; everything that fit before is untouched');
else { console.log('FAIL — the fix does not hold'); process.exit(1); }
