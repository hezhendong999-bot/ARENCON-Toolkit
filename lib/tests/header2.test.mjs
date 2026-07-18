/* ════════════════════════════════════════════════════════════════════
 * lib/tests/header2.test.mjs — sealed header engine regression harness
 * ────────────────────────────────────────────────────────────────────
 * S488 Wave 1. The S460 handoffs referenced a "44-test harness" that was
 * never pushed to the repo (documented-but-missing). This file makes the
 * harness real: Node-runnable, no DOM, gating every /lib/ header push per
 * the S460 rule ("no /lib/ push without lib/tests green").
 *
 * Covers:
 *  A. computeFold — the pure fold solver (order, ranks, exemptions,
 *     ties, signout, degenerate inputs)
 *  B. module contract — exports, version, Z-band values (locked S460)
 *  C. S488 additions — chrome skin CSS presence, pull dot state,
 *     project-bar CSS + API presence, hubOnly wiring markers
 *
 * Run:  node lib/tests/header2.test.mjs   (exit 0 = green)
 * ════════════════════════════════════════════════════════════════════ */
import { computeFold, ENGINE2_VERSION, Z_BAND, buildHeader2 } from '../ui/headerEngine2.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0;
function t(name, fn){
  try{ fn(); pass++; }
  catch(e){ fail++; console.error('✗', name, '—', e.message); }
}
function eq(a, b, msg){
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg || '') + ' expected ' + jb + ' got ' + ja);
}
function ok(v, msg){ if (!v) throw new Error(msg || 'expected truthy'); }

/* ── A. computeFold ─────────────────────────────────────────────────── */
const I = (key, o) => Object.assign({ key }, o);

t('A01 everything fits — nothing folds', () => {
  const r = computeFold([I('a'), I('b')], { a: 50, b: 50 }, 200);
  eq(r, { visible: ['a', 'b'], folded: [] });
});
t('A02 zero avail — everything folds', () => {
  const r = computeFold([I('a'), I('b')], { a: 50, b: 50 }, 0);
  eq(r.visible, []); eq(r.folded, ['a', 'b']);
});
t('A03 lowest foldRank folds first', () => {
  const r = computeFold([I('a', { foldRank: 10 }), I('b', { foldRank: 90 })], { a: 60, b: 60 }, 80);
  eq(r, { visible: ['b'], folded: ['a'] });
});
t('A04 default rank is 50', () => {
  const r = computeFold([I('a'), I('b', { foldRank: 40 })], { a: 60, b: 60 }, 80);
  eq(r.folded, ['b']);
});
t('A05 tie folds RIGHTMOST first', () => {
  const r = computeFold([I('a'), I('b'), I('c')], { a: 50, b: 50, c: 50 }, 110);
  eq(r, { visible: ['a', 'b'], folded: ['c'] });
});
t('A06 exemptUntilLast survives while others remain', () => {
  const r = computeFold(
    [I('qr', { exemptUntilLast: true, foldRank: 5 }), I('x', { foldRank: 99 })],
    { qr: 50, x: 50 }, 60);
  eq(r, { visible: ['qr'], folded: ['x'] });
});
t('A07 exempt folds only once nothing else is left', () => {
  const r = computeFold(
    [I('qr', { exemptUntilLast: true }), I('dn', { exemptUntilLast: true })],
    { qr: 50, dn: 50 }, 40);
  ok(r.folded.length === 2, 'both exempt eventually fold');
});
t('A08 visible preserves declared order after folds', () => {
  const r = computeFold(
    [I('a', { foldRank: 90 }), I('b', { foldRank: 10 }), I('c', { foldRank: 90 })],
    { a: 40, b: 40, c: 40 }, 90);
  eq(r.visible, ['a', 'c']);
});
t('A09 folded is declared order (drawer render order)', () => {
  const r = computeFold(
    [I('a', { foldRank: 30 }), I('b', { foldRank: 10 }), I('c', { foldRank: 20 })],
    { a: 50, b: 50, c: 50 }, 0);
  eq(r.folded, ['a', 'b', 'c'], 'drawer lists in declared order regardless of fold sequence');
});
t('A10 signout flag passes through untouched', () => {
  const r = computeFold([I('so', { isSignout: true })], { so: 50 }, 0);
  eq(r.folded, ['so']);
});
t('A11 missing width treated as 0', () => {
  const r = computeFold([I('a'), I('ghost')], { a: 50 }, 50);
  eq(r.folded, []);
});
t('A12 empty items — no crash', () => {
  eq(computeFold([], {}, 100), { visible: [], folded: [] });
});
t('A13 negative avail behaves like zero', () => {
  const r = computeFold([I('a')], { a: 10 }, -5);
  eq(r.folded, ['a']);
});
t('A14 exact fit does not fold', () => {
  const r = computeFold([I('a'), I('b')], { a: 50, b: 50 }, 100);
  eq(r.folded, []);
});
t('A15 one px over folds exactly one', () => {
  const r = computeFold([I('a'), I('b')], { a: 50, b: 50 }, 99);
  eq(r.folded.length, 1);
});
t('A16 rank order across many controls', () => {
  const items = [I('r90a', { foldRank: 90 }), I('r10', { foldRank: 10 }),
                 I('r50'), I('r90b', { foldRank: 90 }), I('r20', { foldRank: 20 })];
  const w = { r90a: 40, r10: 40, r50: 40, r90b: 40, r20: 40 };
  const r = computeFold(items, w, 130);   // must fold 2: r10 then r20
  eq(new Set(r.folded).size, 2);
  ok(r.folded.includes('r10') && r.folded.includes('r20'), 'lowest two ranks folded');
});
t('A17 exempt + signout combo: signout non-exempt folds before exempt QR', () => {
  const r = computeFold(
    [I('qr', { exemptUntilLast: true }), I('so', { isSignout: true, foldRank: 50 })],
    { qr: 50, so: 50 }, 60);
  eq(r, { visible: ['qr'], folded: ['so'] });
});
t('A18 guard terminates on pathological zero-width loop', () => {
  const r = computeFold([I('a')], { a: 0 }, -1);   // total 0 > -1 forever without guard
  ok(Array.isArray(r.visible), 'returns instead of hanging');
});

/* ── B. module contract (locked S460 values) ───────────────────────── */
t('B01 version is 2.4.1', () => eq(ENGINE2_VERSION, '2.4.1'));
t('B02 buildHeader2 exported as function', () => ok(typeof buildHeader2 === 'function'));
t('B03 z-band: menu 10000', () => eq(Z_BAND.MENU, 10000));
t('B04 z-band: backdrop 10009', () => eq(Z_BAND.BACKDROP, 10009));
t('B05 z-band: drawer 10010', () => eq(Z_BAND.DRAWER, 10010));
t('B06 z-band: export pill 10050', () => eq(Z_BAND.EXPORT_PILL, 10050));
t('B07 z-band: engine range 10000–10099', () => {
  eq(Z_BAND.ENGINE_MIN, 10000); eq(Z_BAND.ENGINE_MAX, 10099);
});
t('B08 z-band: host modal floor 10100', () => eq(Z_BAND.HOST_MODAL_MIN, 10100));
t('B09 z-band frozen', () => { ok(Object.isFrozen(Z_BAND)); });

/* ── C. S488 source-contract checks (skin, pbar, pull, hubOnly) ─────── */
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../ui/headerEngine2.js'), 'utf8');
const cfgSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../ui/headerConfigs.js'), 'utf8');

t('C01 chrome skin selector present', () => ok(src.includes(':host([data-skin="chrome"]) .bar')));
t('C02 chrome skin uses inheritable tokens with S455 fallbacks', () =>
  ok(src.includes('var(--b-chrome-bg,#E6E3E9)') && src.includes('var(--b-chrome-fg,#1B1A22)')));
t('C03 navy bar untouched (Diesel canon)', () =>
  ok(src.includes('linear-gradient(135deg,#1B2438 0%,#243048 100%)')));
t('C04 IDB gradient kept for navy (sanctioned deviation S460)', () =>
  ok(src.includes('linear-gradient(90deg,#9C2742,#46C5E8)')));
t('C05 chrome meter fill is the live green (zero-deviation for Electric)', () =>
  ok(src.includes('.meter .fill{ background:#5F8068; }')));
t('C06 pull dot state present with the heartbeat blue', () =>
  ok(src.includes('[data-s="pull"]{ background:#3B82F6; }')));
t('C07 project bar CSS is the verbatim Electric port', () =>
  ok(src.includes('background:#2C3E50') && src.includes('min-height:32px')));
t('C08 project bar dark variant', () => ok(src.includes(':host([data-theme="dark"]) .pbar{ background:#151a24')));
t('C09 ctl.setProjectBar in API', () => ok(src.includes('setProjectBar(o){')));
t('C10 skin attribute written at build', () => ok(src.includes("cfg.skin || 'navy'")));
t('C11 hubOnly menu items start hidden (v1 parity)', () =>
  ok(src.includes("b._hubOnly = true; b.classList.add('hide')")));
t('C12 top-level hubOnly honored in setHubMode', () => ok(src.includes('b.node._hubHidden = !o.hub')));
t('C13 fold math respects hub-hidden widths', () =>
  ok(src.includes('_ctxHidden || b.node._hubHidden')));
t('C14 electric config: chrome skin declared', () => ok(cfgSrc.includes("skin:'chrome'")));
t('C15 electric config: day/night artwork engine-owned (S460 bug root-caused)', () => {
  const _es = cfgSrc.indexOf('export function electricHeaderConfig');
  const elec = cfgSrc.slice(_es, cfgSrc.indexOf('_signout(h.onSignout)', _es));
  ok(elec.includes('iconLight:DAYNIGHT_SUN') && elec.includes('iconDark:DAYNIGHT_MOON'),
     'electric dark entry uses engine-owned artwork');
  ok(!elec.replace(/\/\/.*$/gm, '').includes("icon:''"),
     "electric CODE no longer ships an empty icon (comments exempt; Diesel's own entry is Wave 2's business)");
});
t('C16 electric config: project bar badge hook', () => ok(cfgSrc.includes('onBadgeClick:h.onBadgeClick')));
t('C17 lifecycle event name unchanged', () => ok(src.includes("'arencon:header-ready'")));

/* ── D. S488 Wave-3 prep: FRT signal APIs + repair section + config vs LIVE ── */
t('D01 setPresence in ctl', () => ok(src.includes('setPresence(o){')));
t('D02 setR2Badge in ctl', () => ok(src.includes('setR2Badge(o){')));
t('D03 setSaveStamp in ctl', () => ok(src.includes('setSaveStamp(t){')));
t('D04 setAdmin gates admin-only CSS', () =>
  ok(src.includes("setAdmin(on){") && src.includes(':host([data-admin="1"]) .menu button.admin-only')));
t('D05 presence chip pixels verbatim (purple 122,91,160)', () =>
  ok(src.includes('rgba(122,91,160,.22)') && src.includes('rgba(122,91,160,.45)')));
t('D06 save stamp pixels verbatim (10.5px base + ts, .5 white)', () =>
  ok(src.includes('font-size:calc(10.5px + var(--ts,0px))') && src.includes('rgba(255,255,255,.5)')));
t('D07 repair section builder present with caret toggle', () =>
  ok(src.includes('mi.repairSection') && src.includes('rsec-toggle') && src.includes('rsec-items')));
t('D08 repair box collapses on hub exit', () => ok(src.includes("'.rsec-items.open'")));
t('D09 danger item styling (live #C62828)', () => ok(src.includes('.menu button.danger{ color:#C62828; }')));
t('D10 cloud tap-for-diagnostic hook', () => ok(src.includes('cfg.onCloudClick')));
const _frtRaw = cfgSrc.slice(cfgSrc.indexOf('export function frtHeaderConfig'),
                         cfgSrc.indexOf('_signout(h.onSignout', cfgSrc.indexOf('export function frtHeaderConfig')));
const frt = _frtRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');  /* code only — comments exempt */
t('D11 FRT config: CRB Import Responses present', () => ok(frt.includes('Import Responses')));
t('D12 FRT config: Export Project Docs present', () => ok(frt.includes('Export Project Docs')));
t('D13 FRT config: 5 repair items, 3 admin-gated', () => {
  eq((frt.match(/adminOnly:true/g)||[]).length, 5);   /* 3 repair items + section gate + Diagnostics (S284) */
  ok(frt.includes('Re-upload All') && frt.includes('Fix Blurry') && frt.includes('Repair R2 Links'));
});
t('D14 FRT config: locked burgundy, purple retired', () =>
  ok(frt.includes("#7d1f35") && !frt.includes('#7B2D8E')));
t('D15 FRT config: Reset Entire Project is danger', () =>
  ok(frt.includes('danger:true')));
t('D16 FRT config: real handler passthroughs, no null-wire skeleton', () =>
  ok(frt.includes('h.onCrbImport') && frt.includes('h.onExportDocs') && !frt.includes("id:'btn-ai-review'")));
t('D17 retired folder-sync indicator absent from config', () => ok(!frt.includes('sync-indicator')));
t('D18 setControlIcon + setLogo in ctl', () =>
  ok(src.includes('setControlIcon(key, html){') && src.includes('setLogo(src){')));
t('D19 offline dot state', () => ok(src.includes('[data-s="off"]{ background:#9CA3AF; }')));
t('D20 plain menu items support adminOnly', () =>
  ok(src.includes("mi.adminOnly?'admin-only':''")));
t('D21 Repair section admin-gated (S284), Diagnostics too', () =>
  ok(frt.includes('repairSection:true') && (frt.match(/adminOnly:true/g)||[]).length >= 5));

/* ── E. S488 field-bug fixes (Mark's PC review, all Playwright-reproduced) ── */
t('E01 :host must NOT define --ts (it shadowed the page text-size var)', () => {
  const host = src.slice(src.indexOf(':host{'), src.indexOf('}', src.indexOf(':host{')))
    .replace(/\/\*[\s\S]*?\*\//g, '');   /* comments exempt — they explain the rule */
  ok(!/--ts\s*:/.test(host), 'ts inherits from the page');
});
t('E02 hamburger hidden when nothing folded (no menu button on PC)', () =>
  ok(src.includes('.more:not(.has-folded){ display:none; }')));
t('E03 fold avail measures left CONTENT edge, not the flex-grown box', () =>
  ok(src.includes('leftEdge') && src.includes('getBoundingClientRect().right - barL')));
t('E04 chrome chip is the FRT pill (r16, white, #D2CEDB) with dark-mode variant', () =>
  ok(src.includes('border-radius:16px') &&
     src.includes(':host([data-skin="chrome"][data-theme="dark"]) .chip')));
t('E05 opening the drawer closes any open menu', () => {
  const od = src.slice(src.indexOf('const openDrawer'), src.indexOf('const closeDrawer'));
  ok(od.includes('closeMenus()'));
});
t('E07 fold avail RESERVES the left minimum (no self-referential measure)', () =>
  ok(src.includes('const TITLE_MIN = 64') && src.includes('reserved += c.offsetWidth')));
t('E08 title floor is structural CSS matching TITLE_MIN, and no min-width:0 survives in the title rule', () => {
  const tr = src.slice(src.indexOf('.title{'), src.indexOf('}', src.indexOf('.title{')));
  ok(tr.includes('min-width:64px') && !tr.replace(/\/\*[\s\S]*?\*\//g,'').includes('min-width:0'));
});
t('E09 left cluster clips — actions can never paint over the logo', () => {
  const lr = src.slice(src.indexOf('.left{'), src.indexOf('}', src.indexOf('.left{')));
  ok(lr.includes('overflow:hidden'));
});
t('E06 no ts-dead font declarations anywhere in the sealed CSS', () => {
  const css = src.slice(src.indexOf('const CSS = `'), src.indexOf('`;', src.indexOf('const CSS = `')));
  const dead = [...css.matchAll(/font(?:-size)?:[^;]*?\d+(?:\.\d+)?px[^;]*;/g)]
    .filter(m => !m[0].includes('var(--ts'));
  eq(dead.length, 0, 'every size scales with S/M/L: ' + dead.map(d=>d[0]).join(' | '));
});

/* ── report ─────────────────────────────────────────────────────────── */
console.log(`header2.test.mjs — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
