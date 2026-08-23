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
/* The pre-fix baseline is taken from git at the last field-proven commit, not
   from a copy that could go stale. */
const PRE_SRC = execSync('git show 08e1bb9:diesel-app/js/pdfExport.js', { cwd: REPO, encoding: 'utf8' });

function liftPagination(src) {
  const a = src.indexOf('// ── PAGINATION ENGINE (Session 53) ──');
  const b = src.indexOf('}, 1200);', a);
  if (a < 0 || b < 0) return null;
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
  new Function('w', 'proj', '_pdfInstNum', 'formRevision', 'setTimeout', 'console', 'Array', 'Date', 'Math', block)(
    { document: win.document },
    { client: 'C', addr: 'A', projname: 'P', projno: '1490.04', revision: 'A02' },
    1, 'A01',
    (fn) => fn(),
    { warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')), log: () => {} },
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
  const newWin = makeDoc(small); runPagination(LIVE_SRC, newWin);
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
  const pages = runPagination(LIVE_SRC, win);
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
check('the flow guard sits on the placement path', /if\(_overflow\(\)\) _flowPhotoOverflow\(grp\);/.test(LIVE_SRC));

console.log('');
if (results.every(Boolean)) console.log('PASS — oversized photo groups flow; everything that fit before is untouched');
else { console.log('FAIL — the fix does not hold'); process.exit(1); }
