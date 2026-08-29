/* headericon.mjs — A LABEL CHANGE MUST NOT DELETE THE BUTTON (Lane C, S697)
 *
 * MARK, 29 AUG: "the More button doesn't work at all — it's not even a button
 * right now. It showed as a button for one second, then reverted."
 *
 * THE MECHANISM. A MENU control's node is its WRAPPER — the button PLUS its
 * dropdown. setControlIcon wrote innerHTML onto that node, so flipping the
 * save-flag dot on the More button deleted the button and the menu together
 * and left a bare text node that still reads "More" and does nothing. It fired
 * about a second after load, which is why the header came up correct and then
 * went dead. Diesel's 'more' was the only menu-key caller; every other caller
 * names an ICON control, which IS its own button — so the bug was invisible
 * everywhere else, and a fix that only special-cased Diesel would leave the
 * trap armed for the next tool that flags a menu.
 *
 * WHAT THIS ENFORCES:
 *   1. after setControlIcon on a MENU control, the button still exists
 *   2. …and its dropdown still exists
 *   3. …and the new label is on the BUTTON, not on the wrapper
 *   4. …and the button still responds to a click (handler intact)
 *   5. ICON controls are untouched by the fix: the label lands on the button
 *      itself, exactly as before
 *
 * FAIL-FIRST: checks 1–4 fail against any tree where setControlIcon writes to
 * the wrapper.
 *
 * Run: node tools/sim/headericon.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_HERE, '../..');
const SRC = process.env.HDR_SRC || path.join(REPO, 'lib/ui/headerEngine2.js');

const results = [];
function check(name, pass, detail) {
  results.push(pass);
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

console.log('\n═══ HEADER setControlIcon PROBE ═══\n');

const src = fs.readFileSync(SRC, 'utf8');
const at = src.indexOf('    setControlIcon(key, html){');
if (at < 0) { console.error('SUBJECT MISSING: setControlIcon not found — did it move?'); process.exit(2); }
let depth = 0, end = -1;
for (let j = src.indexOf('{', at); j < src.length; j++) {
  if (src[j] === '{') depth++;
  else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
}
const body = src.slice(src.indexOf('{', at) + 1, end - 1);

/* a DOM just deep enough to tell a wrapper from a button */
function El(tag, cls) {
  return {
    tagName: tag, className: cls || '', _html: null, children: [],
    classList: { contains: (c) => (cls || '').split(' ').indexOf(c) >= 0 },
    set innerHTML(v) { this._html = v; this.children = []; },   // innerHTML DESTROYS children — as in a real DOM
    get innerHTML() { return this._html; },
    querySelector(sel) {
      const want = sel.replace(':scope > ', '').replace('.', '');
      return this.children.filter(c => c.classList.contains(want))[0] || null;
    },
    appendChild(c) { this.children.push(c); return c; }
  };
}

function makeMenuControl() {
  const wrap = El('div', 'mwrap');
  const btn = El('button', 'hbtn');
  btn.innerHTML = '&#9881;&#65039; More &#9662;';
  btn._clicks = 0;
  btn.click = function () { btn._clicks++; };
  const menu = El('div', 'menu');
  wrap.appendChild(btn); wrap.appendChild(menu);
  return wrap;
}
function makeIconControl() {
  const ib = El('button', 'hicon');
  ib.innerHTML = 'S';
  return ib;
}

function runSetControlIcon(node, html) {
  const fn = new Function('byKey', 'key', 'html', body);
  fn(() => node, 'k', html);
}

const FLAG = '\u2699\uFE0F More \u25BE<span class="wn-dot wn-pulse"></span>';

/* 1–4: the menu control */
{
  const wrap = makeMenuControl();
  runSetControlIcon(wrap, FLAG);
  const btn = wrap.querySelector('.hbtn');
  const menu = wrap.querySelector('.menu');
  check('1. the button survives a label change on a menu control', !!btn,
        btn ? '' : 'wrapper innerHTML was overwritten — button destroyed');
  check('2. the dropdown survives too', !!menu,
        menu ? '' : 'the menu element went with it — the control is inert');
  check('3. the new label lands on the BUTTON, not the wrapper',
        !!btn && btn.innerHTML === FLAG && wrap._html === null,
        'btn=' + (btn ? String(btn.innerHTML).slice(0, 40) : 'GONE') +
        ' wrapperHtml=' + String(wrap._html).slice(0, 40));
  let clicked = false;
  if (btn) { btn.click(); clicked = btn._clicks === 1; }
  check('4. the button still responds to a click', clicked,
        clicked ? '' : 'the surviving node is not the original button');
}

/* 5: icon controls unchanged */
{
  const ib = makeIconControl();
  runSetControlIcon(ib, 'M');
  check('5. an icon control still takes the label on itself', ib.innerHTML === 'M',
        'got ' + ib.innerHTML);
}

const fails = results.filter(r => !r).length;
console.log('\n' + (fails ? fails + ' CHECK(S) FAILED' : 'PASS — a label change relabels; it never dismantles the control'));
process.exit(fails ? 1 : 0);
