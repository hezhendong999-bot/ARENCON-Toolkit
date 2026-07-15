/* ARENCON FRT test — Tier 1 (boot + stomp tripwires) + Explorer (seeded monkey).
 * FRT is a modular ES6 PWA (frt/), so the static server must send correct MIME
 * types or the browser refuses every module import. Standalone boot (no ?project),
 * zero uncaught JS errors, feature tripwires from live source, then a seeded
 * random-interaction pass hunting bugs nobody predicted. Exit non-zero on failure.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8792;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

let failures = [];
function check(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures.push(name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Feature tripwires — derived from LIVE source, not memory. A concurrent-push
 * revert that erases any of these turns the commit red. */
const TRIPWIRES = [
  ['FRT build string',      'frt/js/app.js',            /FRT_BUILD = '(S[\d.]+)'/],
  ['SW cache version',      'sw.js',                    /var CACHE_NAME = 'arencon-frt-v(\d+)'/],
  ['CloudSync layer',       'frt/js/app.js',            /CloudSync/],
  ['R2 photo layer',        null,                       /R2Photos/],          // anywhere under frt/js
  ['WebGL pin renderer',    null,                       /pinsGL/],
  ['markup engine',         null,                       /markupEngine/],
  // S481 photo-loss guarantees — these MUST survive every future edit. If a
  // concurrent-push revert erases any, the recurring photo-loss class is back.
  ['S481 no-orphan-delete guard',   'frt/js/data/r2.js',        /delPhotoGuarded/],
  ['S481 merge pointer-protection', 'frt/js/data/merge.js',     /_protectPhotoPointer/],
  ['S481 heal probe-before-null',   'frt/js/data/photoOutbox.js', /REPOINTED/],
];

function srcOf(rel) { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; } }
function anywhere(re) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  return walk(path.join(ROOT, 'frt', 'js')).some((f) => f.endsWith('.js') && re.test(fs.readFileSync(f, 'utf8')));
}

/* Seeded explorer — deterministic pseudo-random interaction. Reproduce any
 * failure by re-running with the seed printed in the log. Destructive-looking
 * controls (delete/remove/clear/sign out) and file inputs are excluded. */
async function explore(page, seed, steps, pageErrors, label) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const before = pageErrors.length;
  for (let i = 0; i < steps; i++) {
    try {
      await page.evaluate((r) => {
        const els = Array.from(document.querySelectorAll('button, [onclick], a, select, [role="button"], .btn'))
          .filter((e) => e.offsetParent !== null)
          .filter((e) => !/delete|remove|clear|reset|sign ?out|log ?out|wipe/i.test((e.textContent || '') + (e.title || '')))
          .filter((e) => !(e.tagName === 'INPUT' && e.type === 'file'));
        if (!els.length) return;
        els[Math.floor(r * els.length)].click();
      }, rnd());
    } catch (_) { /* navigation race — fine */ }
    await sleep(160);
    if (i % 7 === 6) { try { await page.keyboard.press('Escape'); } catch (_) {} }
  }
  const fresh = pageErrors.slice(before);
  check('explorer(' + label + ', seed=' + seed + ', steps=' + steps + '): no JS errors',
    fresh.length === 0, fresh.slice(0, 3).join(' | '));
}

(async () => {
  for (const [name, rel, re] of TRIPWIRES) {
    const ok = rel ? re.test(srcOf(rel) || '') : anywhere(re);
    check('tripwire(FRT): ' + name, ok);
  }

  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(PORT, '127.0.0.1');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  browser.on('targetcreated', async (t) => {           // explorer may hit window.open — close strays
    try { const pg = await t.page(); if (pg && pg !== page) await pg.close(); } catch (_) {}
  });
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));

  try {
    await page.goto('http://127.0.0.1:' + PORT + '/frt/index.html', { waitUntil: 'networkidle2', timeout: 90000 });
  } catch (e) { check('FRT boot (networkidle2)', false, String(e.message).slice(0, 120)); }
  await sleep(3000);
  check('FRT boot: no uncaught JS errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  const body = await page.evaluate(() => (document.body.innerText || '').length);
  check('FRT boot: page has content', body > 200, 'len=' + body);

  await explore(page, 411001, 40, pageErrors, 'FRT');

  await browser.close();
  srv.close();
  console.log('\n' + (failures.length ? 'RESULT: ' + failures.length + ' FAILURE(S)' : 'RESULT: ALL GREEN'));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
