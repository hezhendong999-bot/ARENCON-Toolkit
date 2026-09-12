/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Specification Generator — DOCUMENT ENGINE
   spec/js/specDoc.js

   The clause library and the job tool print the SAME document. They differ in
   what they let you do to it, not in what it looks like. So the page lives
   here, once, and both hosts call it. Neither host draws a page, a number, a
   header, a cover or a table of contents of its own.

   "Engine shared, personality per-tool config": the host supplies the rows and
   two small hooks — how a row's text is painted, and what extra classes a row
   carries — and gets back a paginated document. Everything else is fixed,
   because everything else is the firm's page.

   Extracted verbatim from spec/index.html in S12. The comments explaining WHY
   each measurement is what it is came with it; they are the record of four
   sessions of getting it wrong.
   ══════════════════════════════════════════════════════════════════════════ */

export const SPEC_DOC_VERSION = '1.0.0';

export const escapeHtml = s =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Split as a template literal so the address is never a harvestable
   plain-text mailto in the page source. */
export const MAIL = 'mail' + '@' + 'arencon.com';

const PH = (v, tpl) => v ? escapeHtml(v) : `<span class="ph">${escapeHtml(tpl)}</span>`;

/* ── numbering follows the source document ───────────────────────────────
   Numbers are never STORED — they are computed every render, so moving or
   deleting a clause renumbers everything below it.

   Counting tree position cannot reproduce Word. Where a source document jumps
   from Part straight to a clause with no article between, the tree has no rung
   at the middle level to count, so counting produced 1.1 where the Word file
   prints 1.1.1. Word does not count position: it keeps a counter per outline
   level and prints every rung, substituting 1 for any rung that has no item of
   its own. A clause carries its own level from the document it came from
   (source_level), so that is what drives the number.

   Clauses authored inside the tool have no source level. For those, depth in
   the tree is the level — which is the same answer, because nothing the tool
   creates can skip a rung. */
export function numbered(rows) {
  const kids = new Map();
  rows.forEach(r => {
    const k = r.parent_id || '_root';
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(r);
  });
  kids.forEach(a => a.sort((x, y) => x.sort_order - y.sort_order));
  const out = [];
  const count = [];          // count[i] = current number at outline level i+1
  (function walk(parent, depth) {
    const list = kids.get(parent) || [];
    for (const r of list) {
      const isNum = ['part', 'article', 'clause'].includes(r.kind);
      let num = '', lvl = depth;
      if (isNum) {
        lvl = r.source_level || depth;
        count[lvl - 1] = (count[lvl - 1] || 0) + 1;
        count.length = lvl;                       // a number resets all deeper levels
        /* Fill any rung with no item of its own with 1 — this is the step that
           reproduces the source, and the reason a clause can read 1.1.1 in a
           section that has no 1.1 heading. */
        num = Array.from({ length: lvl }, (_, i) => count[i] || 1).join('.');
      }
      out.push({ ...r, num, lvl });
      walk(r.id, isNum ? lvl + 1 : depth);
    }
  })('_root', 1);
  return out;
}

/* ── the date on the cover ───────────────────────────────────────────────
   Toronto local, long form — matches the date written on the firm's covers.
   Parsed as a plain calendar date, NOT as an instant: 'YYYY-MM-DD' through the
   Date constructor is read as UTC midnight, which prints as the PREVIOUS day
   for everyone in Eastern Time. */
export function issueDateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-CA',
    { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ── running page header ─────────────────────────────────────────────────
     row 1   <client>                    <section title>   Section <code>
     row 2   <doc title>                                   Page <n>
     row 3   <site>, <city>                       Project #: <no> <rev>

   Mirrors header1.xml paragraph for paragraph. Every row is a 3-column grid so
   the centre tab (para 1) and the right tabs (all three) land where Word's tab
   stops put them. Rows 2 and 3 leave the centre cell empty, exactly as those
   paragraphs have no centre tab. The rule is on row 3 only. No date anywhere —
   the file has none.

   UNFILLED FIELDS SHOW THE TEMPLATE, NOT NOTHING. Collapsing a blank field hid
   two of the three rows, so the header looked like a different header rather
   than an empty one. Placeholders are drawn in the same position and size as
   real values but greyed, so the shape is honest AND nobody mistakes 0000.00
   A01 for a real project number on an issued document. */
export function headHtml(header, sectionCode, sectionTitle, page) {
  const h = header || {};
  const where = [h.site, h.city].filter(Boolean).join(', ');
  const proj = [h.project_no, h.revision].filter(Boolean).join(' ');
  return `<div class="pg-head">
    <div class="r"><span>${PH(h.client, 'Client Name')}</span>
      <span class="c">${escapeHtml(sectionTitle || '')}</span>
      <span class="e">Section ${escapeHtml(sectionCode)}</span></div>
    <div class="r"><span>${PH(h.doc_title, 'Project Specification Title')}</span>
      <span class="c"></span>
      <span class="e">Page ${page}</span></div>
    <div class="r rule"><span>${PH(where, 'Site Address, City, Province')}</span>
      <span class="c"></span>
      <span class="e">Project #: ${PH(proj, '0000.00 A01')}</span></div>
  </div>`;
}

/* ── front matter ────────────────────────────────────────────────────────
   Read from document.xml, not invented. The file opens with three pages, each
   its own section break, none carrying the running header.

   The source file said "Project No:" on the cover and "Project #:" in the
   running header. The Owner ruled (S11): "Project #:" everywhere. The cover
   follows the header; the Word file was the inconsistency. */
export function coverHtml(header, logoSrc) {
  const h = header || {};
  const title = (h.doc_title || '').trim();
  const lines = title
    ? title.split('\n').map(l => `<div class="t">${escapeHtml(l.trim())}</div>`).join('')
    : '<div class="t"><span class="ph">Project Specification Title</span></div>';
  return `<div class="cover-top">
      <img class="cover-logo" src="${logoSrc}" alt="ARENCON INC.">
      <div class="cover-addr">1551 CATERPILLAR ROAD, SUITE 206<br>
        MISSISSAUGA, ON &nbsp;&nbsp;L4X 2Z6 CANADA<br><br>
        P: 905 615 1774<br>F: 905 615 9351<br>E: ${escapeHtml(MAIL)}</div>
    </div>
    <div class="cover-title">
      <div class="t">Project Specification</div>
      ${lines}
      <div class="t sm">for</div>
      <div class="t">${PH(h.client, 'Client Name')}</div>
      <div class="t sm">at</div>
      <div class="t tight">${PH(h.site, 'Site Address')},</div>
      <div class="t">${PH(h.city, 'City, Province')}</div>
    </div>
    <div class="cover-prep">Prepared for:<br><br>${PH(h.client, 'Client Name')}</div>
    <div class="cover-no">Project #: ${PH(h.project_no, '0000.00')}
      <small>${PH(h.revision, 'A01')}</small><br>
      ${PH(issueDateLong(h.issue_date), 'Date of Issuance')}</div>`;
}

export const BLANK_HTML = '<div class="blank-note">This page left blank intentionally.</div>';

/* Leader dots are their own flex element between title and page number — not a
   border on the title, which stops short whenever the title is narrower than
   its column. */
export function tocHtml(entries) {
  return '<div class="toc-title">Table of Contents</div>' +
    entries.map(e => `<div class="toc-sec"><span class="n">${escapeHtml(e.code)}</span>` +
      `<span>${escapeHtml(e.title)}</span><span class="dots"></span>` +
      `<span class="pg">${e.page}</span></div>`).join('');
}

export function tableHtml(r) {
  let t; try { t = JSON.parse(r.body); } catch { return ''; }
  const cell = (v, head, left) =>
    `<td class="${head ? 'h' : ''} ${left ? 'l' : ''}">${escapeHtml(v)}</td>`;
  return `<table class="spec-tbl" data-id="${r.id}">
    <tr>${(t.head || []).map(h => cell(h, true)).join('')}</tr>
    ${(t.rows || []).map(row => `<tr>${row.map((c, i) =>
      cell(String(c).replace(/\|\|/g, ' \u00b7 '), false, i > 0)).join('')}</tr>`).join('')}
  </table>`;
}

/* ── blocks ──────────────────────────────────────────────────────────────
   One block = one thing that must not be split across a page. `keepNext`
   travels with the block after it, so a heading is never stranded at a foot.

   doc = {
     sections : [{ id, code, title }]        in print order
     rowsFor  : sectionId => [clause rows]   raw; this engine numbers them
     bodyHtml : row => string                REQUIRED. Host paints the text.
     rowClass : row => string                optional extra classes
     emptyNote: string                       optional, shown for a bare section
   } */
export function buildBlocks(doc) {
  const blocks = [];
  const bodyHtml = doc.bodyHtml || (r => escapeHtml(r.body));
  const rowClass = doc.rowClass || (() => '');
  for (const sec of doc.sections) {
    const rows = numbered(doc.rowsFor(sec.id));
    blocks.push({ section: sec.code, keepNext: true,
      html: `<div class="sec-title" data-sec="${sec.id}">Section ${escapeHtml(sec.code)} \u2013 ${escapeHtml(sec.title)}</div>` });
    if (!rows.length) {
      blocks.push({ section: sec.code, html: '<div class="blank"></div>' });
      blocks.push({ section: sec.code,
        html: `<div class="ln empty" data-lvl="3"><div class="num"></div><div class="tx">${escapeHtml(doc.emptyNote || '[-] No wording written for this section yet.')}</div></div>` });
    }
    rows.forEach(r => {
      for (let i = 0; i < (r.blank_before ?? 1); i++)
        blocks.push({ section: sec.code, keepNext: true, html: '<div class="blank"></div>' });
      const extra = rowClass(r);

      if (r.kind === 'table') { blocks.push({ section: sec.code, id: r.id, html: tableHtml(r) }); return; }

      if (r.kind === 'para' || r.kind === 'bullet') {
        const ind = r.indent == null ? (r.lvl - 1) * 0.5 : r.indent;
        const bullet = r.kind === 'bullet';
        blocks.push({ section: sec.code, id: r.id,
          html: `<div class="ln free ${bullet ? 'bul' : ''} ${extra}" data-id="${r.id}"
                   style="margin-left:${ind}in">${bullet ? '<div class="dot">\u2022</div>' : ''}<div class="tx">${bodyHtml(r)}</div></div>` });
        return;
      }

      const title = r.lvl <= 2 || (r.body.length <= 72 && !/[.,;:]$/.test(r.body));
      blocks.push({ section: sec.code, keepNext: title, id: r.id,
        html: `<div class="ln ${extra}" data-lvl="${r.lvl}" data-id="${r.id}"><div class="num">${r.num}</div><div class="tx">${bodyHtml(r)}</div></div>` });
    });
    blocks.push({ section: sec.code, html: '<div class="blank"></div>' });
    blocks.push({ section: sec.code, html: `<div class="eos">END OF SECTION ${escapeHtml(sec.code)}</div>` });
    blocks.push({ section: sec.code, pageBreak: true, html: '' });
  }
  return blocks;
}

/* ── pagination ──────────────────────────────────────────────────────────
   Lay the blocks into Letter pages. A block is never split, so a clause can
   never break across a page.

   Returns the table-of-contents entries, which the Word export seeds its own
   TOC field from. */
export function paginate(host, doc) {
  host.innerHTML = '';
  const blocks = buildBlocks(doc);
  if (!blocks.length) {
    host.innerHTML = '<div class="page"><div class="empty-state">Nothing to show.</div></div>';
    return [];
  }
  /* Page budget from the Word file's sectPr: 11in tall, top 1.62in, bottom
     0.4in. This was once hardcoded to a 1in top while the page CSS said
     1.62in, so every page was laid out 0.62in taller than it really was and
     the last lines ran off the bottom edge. */
  const USABLE = (11 - 1.62 - 0.4) * 96;
  let page = null, used = 0, pageNo = 0;

  /* FRONT MATTER GOES ON AFTER THE BODY IS LAID OUT, NOT BEFORE. The table of
     contents has to state the page each section starts on, and that is not
     known until the body has actually been paginated — writing it first would
     mean guessing. So the body is laid out, each section's opening page is
     recorded as it happens, and the three front pages are then inserted ahead
     of it. They carry no running header and no page number, exactly as the
     file's own section breaks have them, so the body still starts at Page 1. */
  const toc = [];
  const titleOf = code => (doc.sections.find(s => s.code === code) || {}).title || '';
  const newPage = (sec) => {
    pageNo++;
    page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = headHtml(doc.header, sec, titleOf(sec), pageNo);
    host.appendChild(page);
    used = 0;
    if (!toc.length || toc[toc.length - 1].code !== sec) {
      toc.push({ code: sec, title: titleOf(sec), page: pageNo });
    }
  };
  newPage(blocks[0].section);

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.pageBreak) { if (i < blocks.length - 1) newPage(blocks[i + 1].section); continue; }
    const holder = document.createElement('div');
    holder.innerHTML = b.html;
    const node = holder.firstElementChild;
    if (!node) continue;
    page.appendChild(node);
    let h = node.offsetHeight;

    if (b.keepNext && blocks[i + 1] && !blocks[i + 1].pageBreak) {
      const probe = document.createElement('div');
      probe.innerHTML = blocks[i + 1].html;
      const pn = probe.firstElementChild;
      if (pn) { page.appendChild(pn); h += pn.offsetHeight; page.removeChild(pn); }
    }
    if (used + h > USABLE && used > 0) {
      page.removeChild(node);
      newPage(b.section);
      page.appendChild(node);
      used = node.offsetHeight;
    } else {
      used += node.offsetHeight;
    }
  }

  /* Now the body is laid out and toc[] holds the real opening page of every
     section, so the front matter can be built and put in front of it. */
  if (doc.frontMatter !== false) {
    const front = document.createDocumentFragment();
    const pages = [['cover', coverHtml(doc.header, doc.logo)], ['blank', BLANK_HTML], ['toc', tocHtml(toc)]];
    for (const [kind, html] of pages) {
      const p = document.createElement('div');
      /* pg- prefix: 'blank' alone collides with the empty-line rule */
      p.className = 'page front pg-' + kind;
      p.innerHTML = html;
      front.appendChild(p);
    }
    host.insertBefore(front, host.firstChild);
  }
  return toc;
}
