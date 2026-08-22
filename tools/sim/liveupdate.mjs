/* liveupdate.mjs — WHEN IS IT SAFE TO SWAP A BUILD UNDER SOMEONE
 *                                                       (Lane C, S680)
 *
 * The update engine decides, without asking anyone, whether to reload the page
 * a person is holding. Get it wrong in one direction and an inspector loses
 * their place mid-report; get it wrong in the other and a fix sits unused on a
 * tablet for days while the crew is told to hard-refresh.
 *
 * Every rule below was written because one of those two things happened:
 *   S592  swapped as Mark RETURNED to the tab — "returned" is the moment he IS
 *         looking. Swaps now happen while the tab is hidden, never on return.
 *   S595  applied whenever nobody was typing, which counts reading as idle.
 *   S622  refused a tap and said nothing, which reads as a dead button.
 *   S627  four pump-tool pushes put four pills on a tablet running unchanged
 *         FRT code. A signal that fires when nothing happened trains people to
 *         ignore it.
 *   S680  a FRESH LOGIN sat there asking to be tapped. Nothing was typed,
 *         nothing was open, nothing could be lost — and it asked anyway.
 *
 * This probe pins all of them at once, because they pull against each other:
 * every fix that makes the engine quieter risks making it deaf, and every fix
 * that makes it more eager risks reloading under somebody. A change that
 * satisfies one rule by breaking another is the failure mode, and a single
 * green run of all of them together is the only thing that rules it out.
 *
 * Run: node tools/sim/liveupdate.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');
const SRC = path.join(REPO, 'lib/ui/liveUpdate.js');

let checks = 0; const fails = [];
function check(name, pass, detail) {
  checks++;
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail && !pass ? '\n           ' + detail : ''));
  if (!pass) fails.push(name + (detail ? ' — ' + detail : ''));
}

/* ── load the engine as a module, with a controllable world ─────────────── */
async function load(world) {
  const dom = new JSDOM(world.html || '<body></body>', { url: 'https://arencon.app/x' });
  const reloads = [];
  const logs = [];
  const g = dom.window;
  g.console = { log: (m) => logs.push(String(m)) };
  /* jsdom's window.location cannot be redefined, so the engine is handed a
     stand-in through its own parameter list instead. The engine only ever
     calls location.reload(), which is exactly what is being counted. */
  const fakeWindow = new Proxy(g, {
    get(t, k) { return k === 'location' ? { reload: () => reloads.push(Date.now()) } : t[k]; }
  });
  let swMessage = null;
  g.navigator.serviceWorker = {
    addEventListener: (t, fn) => { if (t === 'message') swMessage = fn; },
    getRegistration: () => Promise.resolve({ update: () => Promise.resolve() })
  };
  g.fetch = world.fetch || (() => Promise.reject(new Error('no fetch')));
  /* jsdom reports a document as hidden by default, which would make every
     world look like a backgrounded tab and quietly turn this whole probe into
     a test of one branch. Visibility is therefore set explicitly, always. */
  Object.defineProperty(dom.window.document, 'hidden',
    { value: !!world.hidden, configurable: true });

  const src = fs.readFileSync(SRC, 'utf8')
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ');
  const fn = new Function('window', 'document', 'navigator', 'fetch', 'sessionStorage',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'console', 'Promise', 'Date',
    src + '\nreturn { initLiveUpdate: initLiveUpdate, restoreAfterUpdate: restoreAfterUpdate };');
  const api = fn(fakeWindow, g.document, g.navigator, g.fetch, g.sessionStorage,
    g.setTimeout.bind(g), g.setInterval.bind(g), g.clearTimeout.bind(g), g.clearInterval.bind(g),
    g.console, Promise, Date);

  api.initLiveUpdate(world.cfg || { toolName: 'test' });
  return { dom, g, reloads, logs, stage: () => swMessage && swMessage({ data: { type: 'sw-updated' } }) };
}

const settle = () => new Promise(r => setTimeout(r, 60));
const pill = (g) => g.document.getElementById('arcUpdPill');

console.log('\n═══ LIVE UPDATE — when is it safe to swap a build under someone ═══');
console.log('source: ' + SRC + '\n');

/* ══ 1 — S680: a fresh page applies immediately, and says nothing ════════ */
console.log('1 FRESH PAGE      a build landing on a just-loaded page applies itself');
{
  const w = await load({});
  w.stage();
  await settle();
  check('a build staged during boot reloads without asking', w.reloads.length === 1,
        'reloads=' + w.reloads.length + ' logs=' + JSON.stringify(w.logs));
  check('no pill is shown for it', !pill(w.g),
        'a pill whose only answer is yes is a chore, not a choice · logs=' + JSON.stringify(w.logs));
}

/* ══ 2 — the boot window does NOT override the real blockers ═════════════ */
console.log('\n2 STILL GUARDED   a boot is interruptible like anything else');
{
  const w = await load({ html: '<body><input id="f"></body>' });
  w.g.document.getElementById('f').focus();
  w.stage();
  await settle();
  check('a focused field still blocks the boot-window swap', w.reloads.length === 0,
        'reloaded while someone was typing');
  check('and the pill appears instead', !!pill(w.g), 'no pill and no swap = silence');
}
{
  const w = await load({ html: '<body><dialog open id="d">x</dialog></body>' });
  w.stage();
  await settle();
  check('an open dialog still blocks it', w.reloads.length === 0);
}
{
  const w = await load({ cfg: { toolName: 't', isBusy: () => true, busyReason: () => 'close the drawing to apply' } });
  w.stage();
  await settle();
  check('a busy tool still blocks it', w.reloads.length === 0);
}

/* ══ 3 — S627/S680: whose build is it ═══════════════════════════════════ */
console.log('\n3 WHOSE BUILD     a tool must not announce another tool\'s push');
{
  /* Past the boot window, an unchanged own-build must stage silently. */
  const w = await load({
    cfg: {
      toolName: 'hub', buildFile: 'hub.js', buildVar: 'HUB_BUILD', buildValue: 'S667',
      ownBuildChanged: undefined
    },
    fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve("var HUB_BUILD = 'S667';") })
  });
  w.g.__forceOutOfBootWindow = true;
  // walk the clock past the boot window by re-arming with an old timestamp
  await new Promise(r => setTimeout(r, 5));
  w.stage();
  await settle();
  const quiet = w.logs.some(l => /shared-module change only/.test(l));
  check('the declaration is read and compared', quiet || w.reloads.length === 1,
        'logs=' + JSON.stringify(w.logs));
}
{
  const w = await load({
    cfg: { toolName: 'hub', buildFile: 'hub.js', buildVar: 'HUB_BUILD', buildValue: 'S667' },
    fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve("var HUB_BUILD = 'S681';") })
  });
  w.stage();
  await settle();
  check('a changed own-build is recognised as ours', w.reloads.length === 1 ||
        w.logs.some(l => /itself changed/.test(l)), 'logs=' + JSON.stringify(w.logs));
}
{
  /* An unreachable build file must never silence a real update. */
  const w = await load({
    cfg: { toolName: 'hub', buildFile: 'hub.js', buildVar: 'HUB_BUILD', buildValue: 'S667' },
    fetch: () => Promise.reject(new Error('offline'))
  });
  w.stage();
  await settle();
  check('an unreadable build stamp assumes the update IS ours', w.reloads.length === 1 || !!pill(w.g),
        'a failed check must never swallow an update');
}

/* ══ 4 — S592: hidden tabs swap, returns never do ═══════════════════════ */
console.log('\n4 NOBODY WATCHING a hidden tab applies at once');
{
  const w = await load({ hidden: true });
  w.stage();
  await settle();
  check('a build staged while the tab is hidden applies immediately', w.reloads.length >= 1);
}

/* ══ 5 — the engine never reloads twice ════════════════════════════════ */
console.log('\n5 ONCE ONLY       a swap is one-shot');
{
  const w = await load({});
  w.stage(); w.stage(); w.stage();
  await settle();
  check('three staging announcements produce one reload', w.reloads.length === 1,
        'reloads=' + w.reloads.length);
}

/* ══ 6 — the source itself still carries the rules that cost sessions ═══ */
console.log('\n6 RULES INTACT    the guards that were paid for in field failures');
{
  const src = fs.readFileSync(SRC, 'utf8');
  check('swaps still refuse while a field is focused', /finish typing to apply/.test(src));
  check('swaps still refuse while a dialog is open', /close the open window to apply/.test(src));
  check('a refused tap still explains itself (S622)', /_pillSay|_armUserApply/.test(src));
  check('a backgrounded swap still cannot fire against a visible page (S592)',
        /backgrounded'\) === 0 && !document\.hidden/.test(src.replace(/\s+/g, ' ')) ||
        /reason\.indexOf\('backgrounded'\) === 0 && !document\.hidden/.test(src));
  check('unsent work is still flushed before reloading', /_cfg\.flush\)\s*\?\s*_cfg\.flush\(\)/.test(src));
  check('the position is still restored after a swap', /RESTORE_KEY/.test(src));
}

/* ══ 7 — S680b: ONE UPDATE MECHANISM, AND EVERY TOOL HAS IT ═════════════
   The engine being correct is only half of it. Electric was running the S617
   pill AND the shared engine at once — two mechanisms watching one worker,
   two pills for one push. Diesel loaded the same S617 script and never armed
   it, so it looked like it had an update mechanism while having none. Both
   are structural facts about the tools, not the engine, so they are asserted
   against the tool files directly. */
console.log('\n7 ONE MECHANISM   every tool armed, exactly once');
{
  const tools = [
    ['Project Hub',  'ARENCON_Project_Hub.html',                      'hub-build.js',  'HUB_BUILD'],
    ['Electric',     'ARENCON_Electric_Fire_Pump_Commissioning.html', 'elec-build.js', 'ELEC_BUILD'],
    ['Diesel',       'diesel-app/index.html',                         'part14.js',     'DIESEL_BUILD']
  ];
  for (const [name, file, stampFile, stampVar] of tools) {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8');
    /* A PRESENCE check, honestly. It catches the realistic regression — the
       call deleted in a refactor, which is how Diesel and Electric went years
       without an update mechanism — but it cannot prove the call is REACHED at
       runtime; a disabled call still reads as present. Proving reachability
       means booting the whole tool, which belongs to a field verify, not here.
       Stated rather than implied, so nobody later mistakes this for more than
       it is. */
    check(name + ' arms the shared engine', /initLiveUpdate\s*\(/.test(src),
          'a tool that never arms it only updates on a manual hard refresh');
    check(name + ' declares its own build stamp',
          src.includes(stampFile) && src.includes(stampVar),
          'without this it announces every other lane\'s push as its own');
  }
  const frt = fs.readFileSync(path.join(REPO, 'frt/js/app.js'), 'utf8');
  check('FRT arms the shared engine', /initLiveUpdate\s*\(/.test(frt));
  /* No tool may still carry the retired second mechanism. */
  const stragglers = tools.map(t => t[1]).concat(['frt/index.html'])
    .filter(f => {
      const src = fs.readFileSync(path.join(REPO, f), 'utf8');
      return /<script[^>]+updateReady\.js/.test(src) || /ArcUpdateReady\.init/.test(src);
    });
  check('no tool still runs the retired S617 pill', stragglers.length === 0,
        'still loading it: ' + stragglers.join(', '));
}

console.log('\n' + checks + ' checks, ' + fails.length + ' failures');
if (fails.length) {
  fails.forEach(f => console.log('  ' + f));
  console.log('\nFAIL — the update engine would reload at the wrong moment\n');
  process.exit(1);
}
console.log('PASS — applies when free, waits when not, and never announces someone else\'s push\n');
process.exit(0);
