/* ════════════════════════════════════════════════════════════════════
 * ARENCON SHARED ENGINE — regression harness (S460 contract, rule: no
 * /lib/ push without this passing).  Run:  node lib/tests/engine2.test.mjs
 * Pure-logic tests only (no DOM): fold solver, z-band contract, zoom
 * math, config-factory integrity for all three tools.
 * ════════════════════════════════════════════════════════════════════ */
import { computeFold, Z_BAND, ENGINE2_VERSION } from '../ui/headerEngine2.js';
import { zoomFrom } from '../export/zoomMath.js';
import { dieselHeaderConfig, electricHeaderConfig, frtHeaderConfig } from '../ui/headerConfigs.js';

let pass = 0, fail = 0;
function T(name, cond){
  if (cond){ pass++; }
  else { fail++; console.error('  ✗ FAIL:', name); }
}
function section(s){ console.log('— ' + s); }

/* ── 1. Z-BAND CONTRACT ─────────────────────────────────────────── */
section('z-band contract');
T('engine band floor', Z_BAND.ENGINE_MIN === 10000);
T('engine band ceiling', Z_BAND.ENGINE_MAX === 10099);
T('menu in band', Z_BAND.MENU >= Z_BAND.ENGINE_MIN && Z_BAND.MENU <= Z_BAND.ENGINE_MAX);
T('backdrop in band', Z_BAND.BACKDROP >= Z_BAND.ENGINE_MIN && Z_BAND.BACKDROP <= Z_BAND.ENGINE_MAX);
T('drawer in band', Z_BAND.DRAWER >= Z_BAND.ENGINE_MIN && Z_BAND.DRAWER <= Z_BAND.ENGINE_MAX);
T('pill in band', Z_BAND.EXPORT_PILL >= Z_BAND.ENGINE_MIN && Z_BAND.EXPORT_PILL <= Z_BAND.ENGINE_MAX);
T('drawer above backdrop', Z_BAND.DRAWER > Z_BAND.BACKDROP);
T('engine above host header', Z_BAND.ENGINE_MIN > Z_BAND.HOST_HEADER_MAX);
T('host modals above engine', Z_BAND.HOST_MODAL_MIN > Z_BAND.ENGINE_MAX);

/* ── 2. FOLD SOLVER (S448 spec) ─────────────────────────────────── */
section('fold solver');
const items = [
  { key:'nav',       foldRank:30 },
  { key:'idb',       foldRank:20 },
  { key:'inspector', foldRank:40 },
  { key:'ai',        foldRank:10 },
  { key:'reports',   foldRank:11 },
  { key:'more',      foldRank:12 },
  { key:'qr',        foldRank:5,  exemptUntilLast:true },
  { key:'dark',      foldRank:6,  exemptUntilLast:true },
  { key:'signout',   foldRank:15, isSignout:true }
];
const W = { nav:80, idb:90, inspector:110, ai:120, reports:110, more:90, qr:44, dark:44, signout:100 };
const total = Object.values(W).reduce((a,b)=>a+b,0);

let r = computeFold(items, W, total + 10);
T('everything fits → nothing folds', r.folded.length === 0);

r = computeFold(items, W, total - 1);
T('first fold is lowest non-exempt rank (ai)', r.folded.length === 1 && r.folded[0] === 'ai');

r = computeFold(items, W, 200);
T('exempt survive while non-exempt remain', r.visible.includes('qr') && r.visible.includes('dark'));

r = computeFold(items, W, 40);
T('exempt fold only at the end (qr rank<dark)', r.folded.includes('qr'));

r = computeFold(items, W, 300);
const declared = items.map(i => i.key);
T('drawer order == declared order',
  r.folded.every((k, i, a) => i === 0 || declared.indexOf(a[i-1]) < declared.indexOf(k)));

r = computeFold(items, W, 0);
T('zero width folds everything, no hang', r.visible.length === 0 && r.folded.length === items.length);

/* ── 3. ZOOM MATH (field cases) ─────────────────────────────────── */
section('zoom math');
T('desktop 100%', zoomFrom({ outerWidth:1000, innerWidth:1000, vvWidth:1000, vvScale:1 }) === 1);
T('desktop page-zoom 150%', Math.abs(zoomFrom({ outerWidth:1440, innerWidth:960, vvWidth:960, vvScale:1 }) - 1.5) < 0.03);
T('iOS page-fit NOT double-counted (S460 bug)',
  zoomFrom({ outerWidth:390, innerWidth:980, vvWidth:980, vvScale:0.4 }) === zoomFrom({ outerWidth:390, innerWidth:980, vvWidth:980, vvScale:1 }));
T('iOS pinch-in counted once', Math.abs(zoomFrom({ outerWidth:390, innerWidth:195, vvWidth:195, vvScale:2 }) - 2) < 0.03);
T('desktop pinch (visual < layout) multiplies', Math.abs(zoomFrom({ outerWidth:960, innerWidth:960, vvWidth:480, vvScale:2 }) - 2) < 0.03);
T('degenerate inputs clamp', zoomFrom({ outerWidth:0, innerWidth:0 }) >= 0.3 && zoomFrom({ outerWidth:1e9, innerWidth:1 }) <= 6);

/* ── 4. CONFIG FACTORY INTEGRITY (all three tools) ──────────────── */
section('config factories');
const spies = {};
const H = new Proxy({}, { get:(t,k)=> (spies[k] = spies[k] || (()=>{})) });
[['diesel', dieselHeaderConfig], ['electric', electricHeaderConfig], ['frt', frtHeaderConfig]].forEach(([name, fac]) => {
  let cfg = null, threw = false;
  try{ cfg = fac(H); }catch(e){ threw = true; }
  T(name + ': factory runs on handler proxy', !threw && cfg && typeof cfg === 'object');
  if (!cfg) return;
  T(name + ': has actions array', Array.isArray(cfg.actions) && cfg.actions.length > 0);
  const keys = cfg.actions.map(a => a.key).filter(Boolean);
  T(name + ': action keys unique', new Set(keys).size === keys.length);
  T(name + ': every action has a type', cfg.actions.every(a => typeof a.type === 'string' || a.type === undefined));
  cfg.actions.forEach(a => {
    if (a.type === 'menu') T(name + ':' + (a.key||'?') + ' menu items have labels',
      (a.items||[]).every(mi => mi.divider || mi.repairSection || typeof mi.label === 'string'));
  });
  T(name + ': at most one signout', cfg.actions.filter(a => a.isSignout).length <= 1);
});

/* ── result ─────────────────────────────────────────────────────── */
console.log('\n' + pass + ' passed, ' + fail + ' failed  (engine2 v' + ENGINE2_VERSION + ')');
if (fail > 0) process.exit(1);
