/* paginate_probe.mjs — THE PAGE-BREAKING CODE, UNDER A LAW IT CANNOT BREAK
 * (Lane C, S721 — rebuild of the S693–S699 harness that was never committed)
 *
 * WHAT THIS GUARDS. lib/export/reportPdf.js paginate() — the one piece of
 * code that decides where every client PDF is cut into letter-size sheets.
 * The S686–S699 arc fixed five printing faults there (band stranded at a
 * page foot, blank Deficiency Summary page, photos painting over the next
 * page's running header, a verdict box off the sheet edge, a section
 * abandoning most of a page). Every one of those surfaced only when someone
 * printed. The original harness ran the real code in Chromium across 120
 * randomised documents; it was never committed, so nothing has mechanically
 * stopped a change from silently re-breaking printing since.
 *
 * HOW IT WORKS WITHOUT A BROWSER. paginate() measures with offsetHeight and
 * nothing else. jsdom has no layout engine, so this probe gives it one: a
 * synthetic box model in which every leaf carries its height (data-h), every
 * container is the sum of its children, a table is thead + its rows, a photo
 * box is rows-of-three, and a .page adds its 96px of padding. That is exactly
 * the arithmetic the browser performs for this markup; what it does NOT model
 * is text wrapping and CSS margins, so this probe proves the CUTTING LOGIC,
 * not pixel fidelity. Pixel fidelity is Owner's printed-report check.
 *
 * THE LAW (every randomised report, every page):
 *   1. NOTHING LOST, NOTHING TWICE — every content leaf of the original page
 *      appears exactly once across the output, in the original order.
 *   2. NO PAGE OVER THE SHEET — offsetHeight ≤ PAGE_LIMIT, except a page that
 *      is a single indivisible block taller than a page (nowhere better).
 *   3. NO ORPHANED BAND — no page ends on a section band (.sh) or a photo
 *      sub-header with nothing under it.
 *   4. NO BLANK PAGE — no page carries only its running header.
 *   5. RUNNING HEADER — page 1 has none; every later page starts with one.
 *   6. A "(cont.)" BAND ONLY STARTS A PAGE — never mid-page with content above.
 *
 * RED ARM. (a) MUTATE=1 disables the engine's overflow test — Law 2 must go
 * red. (b) ENGINE=<path to the pre-S721 reportPdf.js> reproduces the bleed the
 * harness found on its first run: a non-splittable block that did not fit the
 * room left was placed on the full page anyway (the test asked whether the
 * fresh wrapper had children, never whether the PAGE did). A harness that has never failed proves
 * nothing (PK §12).
 *
 * Setup: cd tools/sim && npm i jsdom     Run: node paginate_probe.mjs [N=120] [SEED=1]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM, VirtualConsole } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');
const N = parseInt(process.env.N || '120', 10);
const MUTATE = process.env.MUTATE === '1';
let seed = parseInt(process.env.SEED || '1', 10);
function rnd(){ seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function ri(a,b){ return a + Math.floor(rnd() * (b - a + 1)); }
function pick(a){ return a[ri(0, a.length-1)]; }

const PAGE_LIMIT = (11 * 96) - 16;   // must match the engine
const PAGE_PAD = 96;                 // .page top+bottom padding, border-box
const HEADER_H = 40;                 // compact running header

/* ── the engine, loaded fresh into each window ─────────────────────────── */
let engineSrc = fs.readFileSync(process.env.ENGINE || path.join(REPO, 'lib/export/reportPdf.js'), 'utf8');
if (MUTATE) {
  const before = engineSrc;
  engineSrc = engineSrc.replace('function _overflow(){ return curPage.offsetHeight > PAGE_LIMIT; }',
                                'function _overflow(){ return false; }');
  if (engineSrc === before) { console.error('MUTATE: overflow test not found — engine text changed; update the probe'); process.exit(2); }
}
function loadEngine(win){
  const root = {};
  new Function('window', 'document', 'console', 'module', 'exports', engineSrc)(root, win.document, { info(){}, warn(){}, log(){}, error(){} }, undefined, undefined);
  const R = root.ReportPdf || win.ReportPdf;
  if (!R || typeof R.paginate !== 'function') throw new Error('reportPdf.js did not publish paginate');
  return R;
}

/* ── synthetic box model ───────────────────────────────────────────────── */
function installLayout(win){
  const HE = win.HTMLElement.prototype;
  Object.defineProperty(HE, 'offsetHeight', { configurable: true, get: function(){ return measure(this); } });
  Object.defineProperty(HE, 'offsetWidth',  { configurable: true, get: function(){ return 716; } });
  function measure(el){
    if (!el || el.nodeType !== 1) return 0;
    const own = el.getAttribute && el.getAttribute('data-h');
    if (own != null && own !== '') return parseInt(own, 10) || 0;
    const tag = el.tagName;
    if (el.classList && el.classList.contains('nd-photos')) {
      const n = el.children.length; return n ? Math.ceil(n / 3) * 110 : 0;
    }
    if (tag === 'TR') {
      let h = 0; for (const c of el.children) h = Math.max(h, measure(c)); return h || 24;
    }
    let sum = 0;
    for (const c of el.children) sum += measure(c);
    if (el.classList && el.classList.contains('page')) sum += PAGE_PAD;
    if (el.classList && el.classList.contains('compact-header')) return HEADER_H;
    return sum;
  }
}

/* ── a randomised report ───────────────────────────────────────────────── */
let leafSeq = 0;
/* A content block is a wrapper around its content, as in the real report (an
   .sb holds a table; a photo row holds its cards). The HEIGHT and the identity
   ride on the inner content, so a wrapper clone made by the splitter measures
   0 and carries nothing — exactly what a real empty <div> does. */
function leaf(doc, cls, h, extra){
  const d = doc.createElement('div');
  if (cls) d.className = cls;
  const inner = doc.createElement('div');
  inner.className = 'in';
  inner.setAttribute('data-h', String(h));
  inner.setAttribute('data-leaf', String(++leafSeq));
  d.appendChild(inner);
  if (extra) extra(d);
  return d;
}
function band(doc, txt){
  const d = doc.createElement('div'); d.className = 'sh'; d.textContent = txt; d.setAttribute('data-h', '34');
  return d;
}
function table(doc, rows, withPhotos){
  const w = doc.createElement('div'); w.className = 'sb flush';
  const t = doc.createElement('table');
  const th = doc.createElement('thead'); const thr = doc.createElement('tr'); thr.setAttribute('data-h','28'); th.appendChild(thr); t.appendChild(th);
  const tb = doc.createElement('tbody');
  for (let i = 0; i < rows; i++) {
    const tr = doc.createElement('tr'); tr.setAttribute('data-h', String(ri(22, 60))); tr.setAttribute('data-leaf', String(++leafSeq)); tb.appendChild(tr);
    if (withPhotos && rnd() < 0.25) {
      const pr = doc.createElement('tr'); pr.className = 'ph-keep';
      const td = doc.createElement('td'); const box = doc.createElement('div'); box.className = 'nd-photos';
      const n = rnd() < 0.15 ? ri(12, 30) : ri(1, 6);      // the S687 case: 24 photos on one item
      for (let p = 0; p < n; p++) { const im = doc.createElement('img'); im.setAttribute('data-leaf', String(++leafSeq)); box.appendChild(im); }
      td.appendChild(box); pr.appendChild(td); tb.appendChild(pr);
    }
  }
  t.appendChild(tb); w.appendChild(t);
  return w;
}
function generic(doc, kids){
  const w = doc.createElement('div'); w.className = 'sb';
  for (let i = 0; i < kids; i++) {
    const r = rnd();
    if (r < 0.2) w.appendChild(table(doc, ri(3, 25), false));
    else if (r < 0.35) {                                   // a contractor block: several deficiencies (S693 bleed)
      const c = doc.createElement('div');
      const nd = ri(2, 9); for (let k = 0; k < nd; k++) c.appendChild(leaf(doc, 'defic', ri(60, 240)));
      w.appendChild(c);
    }
    else w.appendChild(leaf(doc, rnd() < 0.3 ? 'chart' : 'panel', ri(40, 420)));
  }
  return w;
}
function appendix(doc){
  const out = [];
  out.push(band(doc, 'Photo Appendix'));
  out[0].classList.add('apx-band');
  const sections = ri(1, 4);
  for (let s = 0; s < sections; s++) {
    const keep = doc.createElement('div'); keep.className = 'apx-keep';
    const sub = doc.createElement('div'); sub.className = 'apx-subhead'; sub.setAttribute('data-subhead', 'Sub ' + s); sub.setAttribute('data-h', '38'); keep.appendChild(sub);
    const first = leaf(doc, 'row', pick([240, 312]), d => { d.appendChild(doc.createElement('img')); }); keep.appendChild(first);
    out.push(keep);
    const rows = ri(0, 8);
    for (let r = 0; r < rows; r++) out.push(leaf(doc, 'row', pick([240, 312]), d => { d.appendChild(doc.createElement('img')); }));
  }
  return out;
}
function buildReport(doc){
  leafSeq = 0;
  const page = doc.createElement('div'); page.className = 'page';
  page.appendChild(leaf(doc, 'cover', ri(300, 600)));       // cover + dashboard
  if (rnd() < 0.7) page.appendChild(leaf(doc, 'dash', ri(100, 300)));
  const nSections = ri(3, 7);
  for (let s = 0; s < nSections; s++) {
    page.appendChild(band(doc, 'Section ' + (s + 1)));
    const kind = rnd();
    if (kind < 0.45) page.appendChild(table(doc, ri(4, 60), true));
    else if (kind < 0.8) page.appendChild(generic(doc, ri(1, 6)));
    else {                                                  // Deficiency Summary + verdict (keep-prev / nosplit)
      page.appendChild(generic(doc, ri(1, 4)));
      const v = leaf(doc, 'verdict nosplit keep-prev', ri(90, 300)); page.appendChild(v);
    }
    if (rnd() < 0.2) page.appendChild(leaf(doc, 'note nosplit', ri(40, 200)));
  }
  if (rnd() < 0.8) appendix(doc).forEach(n => page.appendChild(n));
  return page;
}

/* ── the law ───────────────────────────────────────────────────────────── */
function leavesOf(node){
  const out = [];
  const walk = n => { if (n.nodeType !== 1) return; if (n.hasAttribute('data-leaf')) out.push(n.getAttribute('data-leaf')); for (const c of n.children) walk(c); };
  walk(node); return out;
}
function isAtomic(el){ return el.classList && (el.classList.contains('nosplit') || el.classList.contains('apx-keep')) || (el.tagName === 'IMG'); }

let reports = 0, failures = [];
function fail(rep, law, msg){ failures.push(`report ${rep}  LAW ${law}  ${msg}`); }

for (let r = 1; r <= N; r++) {
  const vc = new VirtualConsole(); vc.on('warn', m => { if (/Pagination error/.test(String(m))) fail(r, 0, 'engine threw: ' + m); });
  const dom = new JSDOM('<!doctype html><html><body><div id="wrap"><div id="mobile-page-nav"></div></div></body></html>', { virtualConsole: vc });
  const win = dom.window, doc = win.document;
  installLayout(win);
  const page = buildReport(doc);
  doc.getElementById('wrap').insertBefore(page, doc.getElementById('mobile-page-nav'));
  const expected = leavesOf(page);
  const R = loadEngine(win);
  R.paginate(win, { header: { client: 'C', addr: 'A', title: 'T', projNo: '0000.00', rev: 'R0', dateStr: 'today' }, unwrapIds: [], insertBeforeId: 'mobile-page-nav' });
  const pages = Array.from(doc.querySelectorAll('.page'));
  reports++;
  if (!pages.length) { fail(r, 0, 'no pages produced'); continue; }

  /* 1 — nothing lost, nothing twice, same order */
  const got = pages.flatMap(leavesOf);
  if (got.join(',') !== expected.join(',')) {
    const missing = expected.filter(x => !got.includes(x)).length, dup = got.length - new Set(got).size;
    fail(r, 1, `leaves in=${expected.length} out=${got.length} missing=${missing} duplicated=${dup} order=${got.join(',') === expected.join(',') ? 'ok' : 'CHANGED'}`);
  }
  pages.forEach((pg, i) => {
    const kids = Array.from(pg.children);
    const content = kids.filter(k => !(k.classList && k.classList.contains('compact-header')));
    /* 5 — running header */
    if (i === 0 && kids[0] && kids[0].classList.contains('compact-header')) fail(r, 5, 'page 1 carries a running header');
    if (i > 0 && !(kids[0] && kids[0].classList.contains('compact-header'))) fail(r, 5, `page ${i+1} has no running header`);
    /* 4 — blank page */
    if (!content.length) fail(r, 4, `page ${i+1} is blank`);
    /* 2 — over the sheet */
    const h = pg.offsetHeight;
    if (h > PAGE_LIMIT) {
      if (process.env.DUMP) console.log("DUMP", r, i+1, h, kids.map(k => (k.className||k.tagName)+":"+k.offsetHeight+(k.getAttribute("data-h")?"":"(calc)")).join(" | "));
      const single = content.length === 1 && (isAtomic(content[0]) || content[0].children.length <= 1);
      const bandPlusSingle = content.length === 2 && content[0].classList.contains('sh') && (isAtomic(content[1]) || content[1].children.length <= 1);
      if (!(single || bandPlusSingle)) fail(r, 2, `page ${i+1} measures ${h}px > ${PAGE_LIMIT} with ${content.length} blocks (${content.map(c => c.className || c.tagName).join(' | ')})`);
    }
    /* 3 — orphaned band / sub-header */
    const last = content[content.length - 1];
    if (last && last.classList && (last.classList.contains('sh') || last.classList.contains('apx-subhead'))) fail(r, 3, `page ${i+1} ends on a heading: "${last.textContent}"`);
    /* 6 — (cont.) only at top */
    content.forEach((k, ci) => {
      if (k.classList && k.classList.contains('sh') && /\(cont\.\)$/.test(k.textContent) && ci !== 0) fail(r, 6, `page ${i+1} has a (cont.) band mid-page at block ${ci}`);
    });
  });
}

console.log(`\npaginate_probe — ${reports} randomised reports, ${failures.length} law violation(s)` + (MUTATE ? '   [MUTATE: overflow test disabled]' : ''));
if (failures.length) {
  console.log('\nVIOLATIONS (first 12):');
  failures.slice(0, 12).forEach(f => console.log('  ' + f));
  console.log(MUTATE ? '\nRED as required — the mutated engine is caught\n' : '\nFAIL — printing would break on a client report\n');
  process.exit(MUTATE ? 0 : 1);
}
if (MUTATE) { console.log('\nFAIL — the mutated engine was NOT caught; the harness has no teeth\n'); process.exit(1); }
console.log('PASS — every page letter-height, every block once, no heading stranded\n');
process.exit(0);
