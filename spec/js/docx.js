/* ARENCON Specification Generator — Word output engine
   ═══════════════════════════════════════════════════════════════════════════
   spec/js/docx.js · S11

   Writes a native .docx straight from the clause tree the tool is showing.
   No template, no library: the OOXML is emitted here and packed with a
   minimal ZIP writer, so the tool keeps working with nothing to load and
   nothing that can go stale on a CDN.

   WHAT IT REPRODUCES — the same measured values the page renders from
   (ARENCON_SPEC_PK_DELTA_S10 §2–§5). If a number below looks wrong, re-read
   the Word file's XML; do not nudge it by eye.

     Page       Letter · top 1.62in · sides 1in · bottom 0.4in · header band 1in
     Body       Calibri 11, Word single spacing, an EMPTY paragraph between items
     Header     three Calibri 11 paragraphs, client first, rule under row 3 only
     Ladder     0.5/0.5 · 1.0/0.5 · 1.5/0.5 · 2.25/0.75 · 3.15/0.9 (left/hanging, in)
     Numbering  REAL Word multi-level numbering, restarted per section. A clause
                whose source outline level skips a rung is emitted at that level
                and Word fills the rung with 1 — exactly what A03 shows.
     Front      cover (letterhead, BlairMdITC TT title block), blank page,
                Table of Contents as a live TOC field. No running header on any
                of them; the body starts at Page 1.
     Cover      "Project #:" — Owner ruling S11, same label as the header.

   INPUT (see buildSpecDocx):
     sections   [{code, title, rows:[numbered rows from index.html numbered()]}]
                rows carry: kind, body, num, lvl, blank_before, indent, provenance
     header     the sg_doc_header row (client, short_client, site, city,
                project_no, revision, doc_title, issue_date)
     toc        [{code, title, page}] — the on-screen pagination, used as the
                field's cached result until Word refreshes it on open
     logo       data:image/png;base64,… (logo_base64.txt, WITH prefix)
     address    the letterhead lines, already split
   OUTPUT: a Blob you can hand to a download link.
*/

const X = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const IN = n => Math.round(n * 1440);          // inches → twips
const PT = n => Math.round(n * 2);             // points → half-points

const BODY_FONT = 'Calibri';
const MARK_FONT = 'BlairMdITC TT';

/* Number ladder in twips: left / hanging per outline level 1..5 (S10 §2). */
const LADDER = [[0.5, 0.5], [1.0, 0.5], [1.5, 0.5], [2.25, 0.75], [3.15, 0.9]]
  .map(([l, h]) => [IN(l), IN(h)]);

/* ── run / paragraph helpers ─────────────────────────────────────────────── */
function rPr(o = {}) {
  let s = '';
  if (o.font) s += `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>`;
  if (o.bold) s += '<w:b/><w:bCs/>';
  if (o.italic) s += '<w:i/><w:iCs/>';
  if (o.underline) s += '<w:u w:val="single"/>';
  if (o.color) s += `<w:color w:val="${o.color}"/>`;
  if (o.size) s += `<w:sz w:val="${PT(o.size)}"/><w:szCs w:val="${PT(o.size)}"/>`;
  if (o.highlight) s += `<w:highlight w:val="${o.highlight}"/>`;
  if (o.noProof) s += '<w:noProof/>';
  return s ? `<w:rPr>${s}</w:rPr>` : '';
}
const T = (text, o) => `<w:r>${rPr(o)}<w:t xml:space="preserve">${X(text)}</w:t></w:r>`;
const TAB = (o) => `<w:r>${rPr(o)}<w:tab/></w:r>`;
const BR = () => '<w:r><w:br/></w:r>';
const P = (pPr, inner = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
const EMPTY = '<w:p/>';                          // one blank Word paragraph = one 13.4pt line
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const CENTER = '<w:jc w:val="center"/>';
const KEEP_NEXT = '<w:keepNext/><w:keepLines/>';
const KEEP = '<w:keepLines/>';
const spacingBefore = twips => `<w:spacing w:before="${twips}"/>`;

/* A simple field: begin · instr · separate · cached result · end. */
function field(instr, resultRuns, o) {
  return `<w:r>${rPr(o)}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr(o)}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r>${rPr(o)}<w:fldChar w:fldCharType="separate"/></w:r>` + (resultRuns || '') +
    `<w:r>${rPr(o)}<w:fldChar w:fldCharType="end"/></w:r>`;
}

/* ── section properties ──────────────────────────────────────────────────── */
const PG = '<w:pgSz w:w="12240" w:h="15840"/>' +
  `<w:pgMar w:top="${IN(1.62)}" w:right="${IN(1)}" w:bottom="${IN(0.4)}" w:left="${IN(1)}" w:header="${IN(1)}" w:footer="0" w:gutter="0"/>`;
/* Front matter carries NO header. A header reference is inherited from the
   previous section only, and these come first, so leaving it out is the whole
   mechanism — nothing to switch off. */
const sectFront = () => `<w:sectPr>${PG}</w:sectPr>`;
const sectBody = (rid, first) =>
  `<w:sectPr><w:headerReference w:type="default" r:id="${rid}"/>${PG}` +
  (first ? '<w:pgNumType w:start="1"/>' : '') + '</w:sectPr>';
/* A section break INSIDE the body is a paragraph carrying sectPr. */
const sectBreak = sectPr => `<w:p><w:pPr>${sectPr}</w:pPr></w:p>`;

/* ── running header: the firm's template, read from header1.xml (S10 §3) ─── */
function headerXml(h, sec) {
  const client = h.short_client || h.client || 'Client';
  const tabs1 = `<w:tabs><w:tab w:val="center" w:pos="${IN(3.25)}"/><w:tab w:val="right" w:pos="${IN(6.5)}"/></w:tabs>`;
  const tabsR = `<w:tabs><w:tab w:val="right" w:pos="${IN(6.5)}"/></w:tabs>`;
  const rule = '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="000000"/></w:pBdr>';
  const pn = field('PAGE', T('1', { noProof: true }), { noProof: true });
  const row1 = P(tabs1, T(client) + TAB() + T(sec.title) + TAB() + T(`Section ${sec.code}`));
  const row2 = P(tabsR, T(h.doc_title || 'Project Specification') + TAB() + T('Page ') + pn);
  const row3 = P(rule + tabsR,
    T([h.site, h.city].filter(Boolean).join(', ')) + TAB() +
    T(`Project #: ${h.project_no || ''}${h.revision ? ' ' + h.revision : ''}`));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${row1}${row2}${row3}</w:hdr>`;
}

/* ── cover, blank page, TOC (S10 §4 — the approved demo, rule for rule) ──── */
function issueDateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA',
    { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

function coverXml(h, address, logoRid, logoCx, logoCy) {
  const mark = { font: MARK_FONT, size: 15 };
  const small = { font: MARK_FONT, size: 12 };
  const title = (h.doc_title || 'Project Specification Title').split('\n').map(s => s.trim()).filter(Boolean);
  const logo = logoRid ? `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${logoCx}" cy="${logoCy}"/><wp:docPr id="1" name="ARENCON INC."/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="${logoRid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${logoCx}" cy="${logoCy}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
        </pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` : T('ARENCON INC.', { bold: true });

  /* Letterhead as a borderless two-cell table: logo left, address block right
     with the burgundy rule on its left edge. */
  const cellPr = (w, border) => `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
    (border ? `<w:tcBorders><w:left w:val="single" w:sz="12" w:space="0" w:color="9C2742"/></w:tcBorders>` : '') +
    '</w:tcPr>';
  const addr = address.map((l, i) => (i ? BR() : '') + T(l, { size: 6.5 })).join('');
  const letterhead = `<w:tbl><w:tblPr><w:tblW w:w="${IN(6.5)}" w:type="dxa"/>
    <w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>
    <w:tblLook w:val="0000"/></w:tblPr>
    <w:tblGrid><w:gridCol w:w="${IN(4.3)}"/><w:gridCol w:w="${IN(2.2)}"/></w:tblGrid>
    <w:tr><w:tc>${cellPr(IN(4.3), false)}${P('', logo)}</w:tc>
          <w:tc>${cellPr(IN(2.2), true)}${P(`<w:spacing w:line="216" w:lineRule="auto"/><w:ind w:left="${IN(0.08)}"/>`, addr)}</w:tc></w:tr>
  </w:tbl>`;

  const t = (s, o) => P(CENTER, T(s, o || mark));
  const lines = [
    P(spacingBefore(IN(2.2)) + CENTER, T('Project Specification', mark)),
    ...title.map(l => t(l)),
    t('for', small), t(h.client || 'Client Name'),
    t('at', small), t(`${h.site || 'Site Address'},`), t(h.city || 'City, Province'),
    P(spacingBefore(IN(1.1)) + CENTER, T('Prepared for:')), EMPTY, t(h.client || 'Client Name', {}),
    P(spacingBefore(IN(1)) + CENTER,
      T(`Project #: ${h.project_no || '0000.00'} `) + T(h.revision || '', { size: 8 })),
    P(CENTER, T(issueDateLong(h.issue_date))),
  ];
  return letterhead + lines.join('');
}

const blankXml = () =>
  P(spacingBefore(IN(4.2)) + CENTER, T('This page left blank intentionally.'));

function tocXml(entries) {
  /* Cached result = the on-screen pagination, so the page reads correctly
     before Word refreshes it; updateFields in settings.xml asks Word to
     refresh on open so the printed numbers are Word's own. */
  const dots = `<w:tabs><w:tab w:val="left" w:pos="${IN(1.5)}"/><w:tab w:val="right" w:leader="dot" w:pos="${IN(6.5)}"/></w:tabs>`;
  return P(`<w:spacing w:before="${IN(0.3)}" w:after="${IN(0.35)}"/>` + CENTER,
    T('Table of Contents', { bold: true, size: 12 })) +
    /* the field wraps the result paragraphs: begin in the first, end in a last one */
    `<w:p><w:pPr><w:pStyle w:val="TOC1"/>${dots}<w:ind w:left="${IN(0.5)}"/></w:pPr>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    (entries[0] ? T(entries[0].code) + TAB() + T(entries[0].title) + TAB() + T(String(entries[0].page)) : '') +
    '</w:p>' +
    entries.slice(1).map(e =>
      P(`<w:pStyle w:val="TOC1"/>${dots}<w:ind w:left="${IN(0.5)}"/>`,
        T(e.code) + TAB() + T(e.title) + TAB() + T(String(e.page)))).join('') +
    `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
}

/* ── body ────────────────────────────────────────────────────────────────── */
function tableXml(r) {
  let t; try { t = JSON.parse(r.body); } catch { return ''; }
  const head = t.head || [], rows = t.rows || [];
  const cols = Math.max(head.length, ...rows.map(x => x.length), 1);
  const w = IN(5.8), cw = Math.floor(w / cols);
  const cell = (v, isHead, left) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr>` +
    P(left ? '' : CENTER, T(String(v).replace(/\|\|/g, ' · '), isHead ? { bold: true, underline: true } : {})) + '</w:tc>';
  const b = '<w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${b}</w:tblBorders>
    <w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>
    <w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>
    ${head.length ? `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map(h => cell(h, true, false)).join('')}</w:tr>` : ''}
    ${rows.map(row => `<w:tr>${row.map((c, i) => cell(c, false, i > 0)).join('')}</w:tr>`).join('')}
  </w:tbl>`;
}

function sectionBodyXml(sec, numId) {
  const out = [];
  out.push(P(`<w:pStyle w:val="Heading1"/>${KEEP_NEXT}`, T(`Section ${sec.code} – ${sec.title}`, { bold: true })));
  if (!sec.rows.length) {
    out.push(EMPTY, P(`<w:ind w:left="${IN(1)}"/>`, T('[-] No wording written for this section yet.', { highlight: 'yellow' })));
  }
  for (const r of sec.rows) {
    for (let i = 0; i < (r.blank_before ?? 1); i++) out.push(EMPTY);
    const body = r.body || '';
    const runOpts = {};
    if (r.provenance === 'empty' || (!body && r.kind !== 'table')) runOpts.highlight = 'yellow';
    const text = body || '[-]';

    if (r.kind === 'table') { out.push(tableXml(r)); continue; }

    if (r.kind === 'para' || r.kind === 'bullet') {
      const ind = r.indent == null ? (r.lvl - 1) * 0.5 : Number(r.indent);
      if (r.kind === 'bullet') {
        out.push(P(`${KEEP}<w:tabs><w:tab w:val="left" w:pos="${IN(ind + 0.25)}"/></w:tabs><w:ind w:left="${IN(ind + 0.25)}" w:hanging="${IN(0.25)}"/>`,
          T('\u2022') + TAB() + T(text, runOpts)));
      } else {
        out.push(P(`${KEEP}<w:ind w:left="${IN(ind)}"/>`, T(text, runOpts)));
      }
      continue;
    }

    /* numbered: part / article / clause — Word's own multi-level list */
    const lvl = Math.min(Math.max(r.lvl || 1, 1), 5);
    const [left, hang] = LADDER[lvl - 1];
    const bold = lvl <= 2;
    const title = bold || (text.length <= 72 && !/[.,;:]$/.test(text));
    out.push(P(`${title ? KEEP_NEXT : KEEP}<w:numPr><w:ilvl w:val="${lvl - 1}"/><w:numId w:val="${numId}"/></w:numPr>` +
      `<w:ind w:left="${left}" w:hanging="${hang}"/>` +
      (bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : ''),
      T(text, Object.assign({ bold }, runOpts))));
  }
  out.push(EMPTY, P(KEEP + CENTER, T(`END OF SECTION ${sec.code}`, { bold: true })));
  return out.join('');
}

/* ── package parts ───────────────────────────────────────────────────────── */
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

function stylesXml() {
  const f = `<w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:cs="${BODY_FONT}" w:eastAsia="${BODY_FONT}"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
  <w:docDefaults>
    <w:rPrDefault><w:rPr>${f}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-CA"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;
}

function numberingXml(count) {
  const lvls = LADDER.map(([left, hang], i) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/>` +
    `<w:lvlText w:val="${Array.from({ length: i + 1 }, (_, k) => `%${k + 1}`).join('.')}"/>` +
    `<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="${hang}"/></w:pPr>` +
    `<w:rPr>${i < 2 ? '<w:b/>' : ''}</w:rPr></w:lvl>`).join('');
  const over = LADDER.map((_, i) => `<w:lvlOverride w:ilvl="${i}"><w:startOverride w:val="1"/></w:lvlOverride>`).join('');
  /* one w:num per section — this is what makes every section restart at 1 */
  const nums = Array.from({ length: count }, (_, i) =>
    `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="0"/>${over}</w:num>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${lvls}</w:abstractNum>${nums}</w:numbering>`;
}

const settingsXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${NS}><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

/* ── PNG dimensions (IHDR) so the logo keeps its aspect at 40px tall ─────── */
function pngSize(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
function dataUrlBytes(url) {
  const raw = atob(url.split(',').pop());
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ── the document ────────────────────────────────────────────────────────── */
export async function buildSpecDocx({ sections, header, toc, logo, address }) {
  const h = header || {};
  const files = {};                               // path → Uint8Array | string
  const enc = new TextEncoder();

  /* logo */
  let logoRid = null, cx = 0, cy = 0;
  if (logo) {
    try {
      const bytes = dataUrlBytes(logo);
      const { w, h: ph } = pngSize(bytes);
      cy = Math.round(0.42 * 914400);              // 40px ≈ 0.42in tall on the demo cover
      cx = Math.round(cy * (w / ph));
      files['word/media/logo.png'] = bytes;
      logoRid = 'rIdLogo';
    } catch { logoRid = null; }
  }

  /* headers: one per section */
  const rels = [];
  const body = [];
  body.push(coverXml(h, address || [], logoRid, cx, cy), sectBreak(sectFront()));
  body.push(blankXml(), sectBreak(sectFront()));
  body.push(tocXml(toc || []), sectBreak(sectFront()));

  sections.forEach((sec, i) => {
    const rid = `rIdHdr${i + 1}`;
    files[`word/header${i + 1}.xml`] = headerXml(h, sec);
    rels.push({ id: rid, type: 'header', target: `header${i + 1}.xml` });
    body.push(sectionBodyXml(sec, i + 1));
    const sp = sectBody(rid, i === 0);
    if (i < sections.length - 1) body.push(sectBreak(sp));
    else body.push(sp);                            // the last sectPr is the body's own
  });
  if (!sections.length) body.push(sectFront());

  files['word/document.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body.join('')}</w:body></w:document>`;
  files['word/styles.xml'] = stylesXml();
  files['word/numbering.xml'] = numberingXml(Math.max(sections.length, 1));
  files['word/settings.xml'] = settingsXml();

  const relXml = rels.map(r =>
    `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${r.type}" Target="${r.target}"/>`).join('');
  files['word/_rels/document.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
${logoRid ? `<Relationship Id="${logoRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>` : ''}
${relXml}</Relationships>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
${sections.map((_, i) => `<Override PartName="/word/header${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`).join('\n')}
</Types>`;

  const entries = Object.entries(files).map(([name, data]) =>
    [name, typeof data === 'string' ? enc.encode(data) : data]);
  return new Blob([zipStore(entries)],
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* File name the way the firm names issues: 7310_17_B01_Give_Go_Spec.docx */
export function specFileName(h) {
  const no = (h.project_no || 'spec').replace(/\./g, '_');
  const who = (h.short_client || h.client || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return [no, h.revision, who, 'Spec'].filter(Boolean).join('_') + '.docx';
}

/* ── minimal ZIP writer (stored, CRC-32) ─────────────────────────────────── */
const CRC = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zipStore(entries) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255];
  const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [name, data] of entries) {
    const nm = enc.encode(name), crc = crc32(data), sz = data.length;
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)]);
    parts.push(local, nm, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nm);
    offset += local.length + nm.length + sz;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const total = offset + cdSize + end.length;
  const out = new Uint8Array(total); let p = 0;
  for (const b of [...parts, ...central, end]) { out.set(b, p); p += b.length; }
  return out;
}
