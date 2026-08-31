/* chipcolour.mjs — IDENTITY IS NOT A VERDICT (Lane C, S699)
 *
 * MARK: "the export-modal chip colours look wrong."
 *
 * THE MECHANISM. The export panel gives each contractor a colour by hashing
 * their name into a palette. That palette contained the system's STATUS hues:
 * #5B7A52 and #5A7D6E are the pass/closed green, #9C6B3E and #8A6B4A the
 * attention amber, #7A5A5A the fail red. Colour in these tools means the same
 * thing everywhere and is never decoration — so a contractor could sit on the
 * distribution panel wearing "closed", or "deficiency", purely because of how
 * their name happened to hash. It reads wrong because it IS wrong.
 *
 * A palette rule that is only a promise drifts back the first time someone
 * wants "a bit more variety", so it is a test:
 *
 *   1. no identity colour falls in the pass/closed GREEN band
 *   2. no identity colour falls in the attention AMBER band
 *   3. no identity colour falls in the fail RED band
 *   4. colours stay MUTED — no saturated hue may enter by the back door
 *      (the ARENCON rule; burgundy is for primary CTAs, never chips)
 *   5. the assignment is still STABLE — one name, one colour, every time —
 *      and spread across the palette rather than collapsing onto one entry
 *   6. owner and pooled-recipient colours are outside the status bands too
 *
 * FAIL-FIRST: 1–3 fail against the pre-fix palette (CC_PRE=1).
 *
 * Run: node tools/sim/chipcolour.mjs
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');
const PRE = process.env.CC_PRE === '1';

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

/* hex → hue (0-360), saturation and lightness (0-1) */
function hsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255,
        g = parseInt(hex.slice(3, 5), 16) / 255,
        b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}
/* The bands colour already OWNS in this system. An identity may not enter them. */
const BANDS = [
  { name: 'pass/closed green', lo: 80,  hi: 165 },
  { name: 'attention amber',   lo: 20,  hi: 55  },
  { name: 'fail red',          lo: 345, hi: 20  }   // wraps
];
function bandOf(hex) {
  const { h, s } = hsl(hex);
  if (s < 0.06) return null;                       // effectively neutral — no meaning carried
  for (const b of BANDS) {
    const inBand = b.lo > b.hi ? (h >= b.lo || h <= b.hi) : (h >= b.lo && h <= b.hi);
    if (inBand) return b.name;
  }
  return null;
}

console.log('\n═══ EXPORT CHIP COLOUR PROBE ' + (PRE ? '(pre-fix arm)' : '') + ' ═══\n');

const src = fs.readFileSync(path.join(REPO, 'lib/export/reportPdf.js'), 'utf8');
function palOf(name) {
  const m = src.match(new RegExp('var ' + name + " = (\\[[^\\]]*\\]|'#[0-9A-Fa-f]{6}')"));
  if (!m) throw new Error(name + ' not found');
  return JSON.parse(m[1].replace(/'/g, '"'));
}
const PALETTE = PRE
  ? ['#2C6E8F','#5B7A52','#8A5A7A','#9C6B3E','#4A6B8A','#6E5A8A','#5A7D6E','#8A6B4A','#436B6B','#7A5A5A']
  : palOf('_EXM_CTR_PALETTE');
const OWNER_C = PRE ? '#3E4C66' : palOf('_EXM_OWNER_C');
const OTHER_C = PRE ? '#8A7689' : palOf('_EXM_OTHER_C');

/* 1–3: no identity colour in a status band */
for (const band of BANDS) {
  const hits = PALETTE.filter(c => bandOf(c) === band.name);
  check('no identity colour sits in the ' + band.name + ' band', hits.length === 0,
    hits.length ? hits.map(c => c + ' (hue ' + Math.round(hsl(c).h) + '\u00B0)').join(', ') : PALETTE.length + ' colours clear');
}

/* 4: muted */
{
  const loud = PALETTE.filter(c => hsl(c).s > 0.62);
  check('4. every identity colour stays muted (no saturated hue slips in)', loud.length === 0,
    loud.length ? loud.map(c => c + ' sat ' + hsl(c).s.toFixed(2)).join(', ')
                : 'max saturation ' + Math.max(...PALETTE.map(c => hsl(c).s)).toFixed(2));
}

/* 5: stable and spread — run the SHIPPED hash */
{
  const ctx = { String, Math };
  vm.createContext(ctx);
  const fn = src.match(/function _exmColorFor\(name\)\{[\s\S]*?\n\}/);
  vm.runInContext('var _EXM_CTR_PALETTE = ' + JSON.stringify(PALETTE) + ';\n' + (fn ? fn[0] : ''), ctx);
  const names = ['Vipond Fire','Classic Fire + Life Safety','ABC sprinkler','South test','North test',
                 'Same test','Black Creek Plumbing','Iron Mountain','Troy Life & Fire','Chubb Edwards'];
  const first = names.map(n => vm.runInContext('_exmColorFor(' + JSON.stringify(n) + ')', ctx));
  const again = names.map(n => vm.runInContext('_exmColorFor(' + JSON.stringify(n) + ')', ctx));
  const stable = first.join() === again.join();
  const distinct = new Set(first).size;
  const anyBand = first.filter(c => bandOf(c));
  check('5. assignment is stable, spread, and never lands on a status colour',
    stable && distinct >= 4 && anyBand.length === 0,
    'stable=' + stable + ' distinct=' + distinct + '/' + names.length +
    (anyBand.length ? ' STATUS HITS=' + anyBand.join(',') : ''));
}

/* 6: owner + pooled recipient */
{
  const ob = bandOf(OWNER_C), tb = bandOf(OTHER_C);
  check('6. owner and pooled-recipient colours are outside the status bands', !ob && !tb,
    'owner=' + OWNER_C + (ob ? ' → ' + ob : ' ok') + '  pooled=' + OTHER_C + (tb ? ' → ' + tb : ' ok'));
}

const fails = results.filter(r => !r).length;
console.log('\n' + (fails ? fails + ' CHECK(S) FAILED' : 'PASS — a chip says who, never how it went'));
process.exit(fails ? 1 : 0);
