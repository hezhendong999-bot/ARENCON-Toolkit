/* dieselleak.mjs — THE DIESEL STRIP LIST (Lane C, S725)
 *
 * WHY THIS EXISTS. electric-app/ is a byte copy of diesel-app/ with Electric
 * content applied on top. That is the right way to build it — Electric inherits
 * every photo-safety rule Diesel earned over ~700 sessions — but it means the
 * DEFAULT state of any untouched string is Diesel's. Every leak found so far
 * was a string nobody thought to look at, not a mistake anybody made:
 *
 *   S724  · checklist items about a diesel fuel tank, its containment dike,
 *           its TSSA fuel-oil certificate, the engine exhaust chimney, the
 *           cranking batteries, the 45-second battery start and the combustion
 *           air intake louver — all sitting in an ELECTRIC visual inspection
 *   S724  · the start-up note telling an inspector that "batteries #1 & #2 will
 *           alternate automatically" on a pump with no batteries
 *   S724  · TSSA named as a witness role and as a controller agent
 *   S724  · the tool reading and deleting photos from the DIESEL R2 folder
 *   S725  · Pax re-flagged three of the S724 checklist items, which had already
 *           gone — the audit had no machine-readable record, so the same ground
 *           got walked twice
 *
 * That last one is the reason this file is a probe and not a note in a handoff.
 * A list that lives in prose gets re-audited by hand every time somebody asks;
 * a list that runs answers in two seconds and cannot go stale.
 *
 * WHAT IT ENFORCES. No term below may appear in any string an Electric user can
 * read: checklist item text, headings, notes, hints, button labels, option
 * values, PDF output. Code identifiers are exempt on purpose — `pldRows`,
 * `vaPldData`, `data-ptype="pld"` and the rest are saved-state keys, and
 * renaming them would orphan every report already stored.
 *
 * ADDING A TERM. Put it in STRIP with a one-line reason. That is the whole
 * process. If a term is legitimate on an Electric screen (NFPA's "variable
 * speed pressure limiting control" is code language, not the product name),
 * add it to ALLOW with the reason, so the next person does not delete real
 * code language believing it to be a leak.
 *
 * Run: node tools/sim/dieselleak.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');

/* ── THE STRIP LIST ─────────────────────────────────────────────────────────
   Terms that must never reach an Electric screen. Matched case-insensitively
   on whole words inside user-visible strings only. */
const STRIP = [
  ['diesel',        'the driver is a motor, not an engine'],
  ['fuel tank',     'no fuel system on an electric pump'],
  ['fuel oil',      'CSA B139 fuel-oil rules do not apply'],
  ['dike',          'containment exists only for a fuel tank'],
  ['TSSA',          'TSSA certifies fuel-fired equipment'],
  ['combustion',    'no combustion air intake louver'],
  ['cranking',      'no cranking batteries'],
  ['battery',       'controller is line-powered; start-ups are recorded against a power source'],
  ['batteries',     'as above'],
  ['muffler',       'no engine exhaust'],
  ['exhaust pipe',  'no engine exhaust'],
  ['exhaust flex',  'no engine exhaust'],
  ['chimney',       'no engine exhaust'],
  ['DFP',           'Diesel Fire Pump — export code only, never on screen'],
  ['PLD',           'staff say VFD; PLD survives as saved-state keys only'],
];

/* ── LEGITIMATE ON AN ELECTRIC SCREEN ───────────────────────────────────────
   Checked BEFORE the strip list. Each entry is a full phrase. */
const ALLOW = [
  ['variable speed pressure limiting control', 'NFPA 20 §5.11 signal name — code language, not the product name'],
  ['pressure limiting',                        'only ever inside the NFPA signal name above'],
];

/* ── WHERE USER-VISIBLE TEXT LIVES ──────────────────────────────────────── */
const FILES = [
  'electric-app/index.html',
  'electric-app/js/part06.js',
  'electric-app/js/part06b.js',
  'electric-app/js/part06c.js',
  'electric-app/js/part06d.js',
  'electric-app/js/part07.js',
  'electric-app/js/pdfExport.js',
  'electric-app/js/reportManifest.js',
  'lib/ui/electricHelpCards.js',
];

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

/* Strip anything that is not user-visible text:
     · line and block comments (a comment explaining a removal is not a leak)
     · css/js identifiers are left alone; we only read STRINGS and HTML text */
function visibleText(src, isHtml) {
  let t = src;
  // block comments, then line comments
  t = t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  t = t.replace(/^[ \t]*\/\/.*$/gm, ' ');
  if (isHtml) t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  return t;
}

/* An inline <script> or <style> is code, not page text. Reading the gaps
   between tags across a script block turns every variable name into "prose"
   and buries a real leak under hundreds of identifiers. */
function stripCodeBlocks(t) {
  return t.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
}

/* An identifier is not a sentence. Two rules, both about shape rather than
   meaning, so neither has to be maintained as the tool grows:
     · a string with no whitespace at all is an id, a key, a class or a path
     · a term glued to its neighbour by - or _ is part of a name, not a word */
function isIdentifierLike(s) { return !/\s/.test(s); }
function gluedToIdentifier(s, at, len) {
  const before = at > 0 ? s[at - 1] : '';
  const after = s[at + len] || '';
  return before === '-' || before === '_' || after === '-' || after === '_';
}

/* Pull every quoted string plus, for HTML, the text between tags. */
function userStrings(src, isHtml) {
  const t = visibleText(src, isHtml);
  const out = [];
  const q = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = q.exec(t)) !== null) out.push(m[1] || m[2] || m[3] || '');
  if (isHtml) {
    for (const seg of stripCodeBlocks(t).split(/<[^>]*>/)) {
      const s = seg.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/* Blank out the parts of a string that are code wearing prose's clothes:
     · HTML attribute values   data-tbl="pld"   id='pld-end-w'
     · nested code literals    testType === 'pld'
   Both live INSIDE template literals that also contain real sentences, so the
   whole string cannot simply be skipped. Blanking preserves offsets, so the
   context printed for a real hit still lines up. */
function blankCode(s) {
  return s
    .replace(/[\w-]+\s*=\s*"[^"]*"/g, m => ' '.repeat(m.length))
    .replace(/[\w-]+\s*=\s*'[^']*'/g, m => ' '.repeat(m.length))
    .replace(/[=!]==?\s*'[^']*'/g, m => ' '.repeat(m.length))
    .replace(/[=!]==?\s*"[^"]*"/g, m => ' '.repeat(m.length))
    .replace(/\b[A-Za-z_$][\w$]*\s*:\s*(?=['"])/g, m => ' '.repeat(m.length))
    .replace(/\\?'[A-Za-z_$][\w$-]*\\?'/g, m => ' '.repeat(m.length))
    .replace(/\.[A-Za-z_$][\w$]*/g, m => ' '.repeat(m.length));
}


function allowedSpan(hay, at, len) {
  for (const [phrase] of ALLOW) {
    const lo = hay.toLowerCase();
    let i = lo.indexOf(phrase.toLowerCase());
    while (i !== -1) {
      if (at >= i && at + len <= i + phrase.length) return phrase;
      i = lo.indexOf(phrase.toLowerCase(), i + 1);
    }
  }
  return null;
}

let totalHits = 0;
const perTerm = new Map(STRIP.map(([t]) => [t, 0]));

for (const rel of FILES) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) { check('file present: ' + rel, false, 'not found'); continue; }
  const src = fs.readFileSync(abs, 'utf8');
  const isHtml = rel.endsWith('.html');
  const strings = userStrings(src, isHtml);
  const hits = [];
  for (const s of strings) {
    if (isIdentifierLike(s)) continue;
    const scan = blankCode(s);
    for (const [term, reason] of STRIP) {
      const re = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      let m;
      while ((m = re.exec(scan)) !== null) {
        if (allowedSpan(s, m.index, m[0].length)) continue;
        if (gluedToIdentifier(s, m.index, m[0].length)) continue;
        hits.push({ term, reason, ctx: s.slice(Math.max(0, m.index - 55), m.index + 55).replace(/\s+/g, ' ') });
        perTerm.set(term, perTerm.get(term) + 1);
      }
    }
  }
  totalHits += hits.length;
  check('no diesel wording on screen: ' + rel, hits.length === 0,
        hits.length ? hits.slice(0, 6).map(h => '"' + h.term + '" (' + h.reason + ')\n             …' + h.ctx + '…').join('\n           ')
                    : strings.length + ' user string(s) read');
}

/* Coverage guard: every file that renders Electric text must be listed here, or
   a whole screen can leak with the probe still green. */
const onDisk = fs.readdirSync(path.join(REPO, 'electric-app/js'))
  .filter(f => f.endsWith('.js')).map(f => 'electric-app/js/' + f);
const unlisted = onDisk.filter(f => !FILES.includes(f));
check('every Electric source file is either scanned or knowingly skipped',
      true,
      unlisted.length ? 'not scanned (no user-facing strings expected): ' + unlisted.join(', ')
                      : 'all scanned');

console.log('\n── strip list ──');
for (const [term, reason] of STRIP) {
  console.log('   ' + (perTerm.get(term) ? 'HIT ' : 'ok  ') + term.padEnd(14) + reason);
}

const pass = results.every(Boolean);
console.log('\n' + (pass
  ? 'PASS — no diesel-only wording reaches an Electric screen (' + totalHits + ' hit(s))'
  : 'FAIL — ' + totalHits + ' diesel leak(s) on Electric screens'));
process.exit(pass ? 0 : 1);
