/* ARENCON Diesel test harness — Tier 1 (smoke + stomp tripwires) + Tier 2 (behavior).
 * Plain Node + Puppeteer, no test framework. Serves the repo root on a local port,
 * boots the tool headless in STANDALONE mode (no ?project → no cloud, no secrets),
 * and exits non-zero on any failure so GitHub Actions turns the commit red.
 *
 * WHY THIS EXISTS: a concurrent workstream pushes to main continuously; S391 wiped
 * shipped features (gauge-photo engine) unnoticed until the field hit it. Tier 1's
 * tripwires catch that class within minutes of the push. Tier 2 regression-tests
 * the S393 photo-loss bug class (merge dropping un-synced local captures).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const FILE = 'ARENCON_Diesel_Fire_Pump_Commissioning.html';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8791;

let failures = [];
function check(name, ok, detail) {
  const line = (ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' — ' + detail : '');
  console.log(line);
  if (!ok) failures.push(name + (detail ? ' — ' + detail : ''));
}

/* ── Tier 1a: source tripwires — shipped features that a stomp/revert would erase ── */
const TRIPWIRES = [
  ['gauge photo engine',        '_flowPhotoSetActiveReading'],
  ['gauge modal title',         'Gauge & RPM'],
  ['AI placard scan',           '_placardScan'],
  ['S395 JWT pre-flight',       '_jwtExpired'],
  ['S393 retention guard',      '_keepD'],
  ['S393 merge union fix',      'ROOT-CAUSE FIX (7-Point loss)'],
  ['S398 instance key helper',  '_r2Fname'],
  ['S394 no-instance block',    'no-instance-block'],
  ['S397 AI proxy endpoint',    'functions/v1/ai-proxy'],
  ['merge photo preserver',     '_assignRowPreservePhotos'],
  ['build string',              "var DIESEL_BUILD"],
];

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]));
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        const ext = path.extname(p).toLowerCase();
        res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const src = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
  for (const [name, needle] of TRIPWIRES) {
    check('tripwire: ' + name, src.includes(needle), src.includes(needle) ? '' : 'missing "' + needle + '"');
  }
  const buildMatch = src.match(/var DIESEL_BUILD = '(S[\d.]+)'/);
  check('build string parseable', !!buildMatch, buildMatch ? buildMatch[1] : 'no match');

  const srv = await serve();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Resource hiccups (favicon, CDN blips) are not code breakage; uncaught JS is.
      if (!/favicon|net::ERR|Failed to load resource/i.test(t)) consoleErrors.push(t);
    }
  });

  /* ── Tier 1b: boot — standalone mode, zero uncaught JS errors ── */
  try {
    await page.goto('http://127.0.0.1:' + PORT + '/' + FILE, { waitUntil: 'networkidle2', timeout: 90000 });
  } catch (e) {
    check('page boot (networkidle2)', false, String(e.message).slice(0, 120));
  }
  await new Promise((r) => setTimeout(r, 2500)); // settle: deferred init, chart libs
  check('boot: no uncaught JS errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('boot: no console.error (code)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const boot = await page.evaluate(() => ({
    build: (typeof DIESEL_BUILD !== 'undefined') ? DIESEL_BUILD : null,
    hasCollect: typeof _collectCloudState === 'function',
    hasMergeFn: typeof _assignRowPreservePhotos === 'function',
    hasToggle: !!Array.from(document.querySelectorAll('button,div,span')).find((el) => /7-Point with PLD/.test(el.textContent || '')),
    bodyLen: (document.body.innerText || '').length,
    noInstanceBlock: !!document.getElementById('no-instance-block'),
  }));
  check('runtime: DIESEL_BUILD set', /^S[\d.]+$/.test(boot.build || ''), String(boot.build));
  check('runtime: _collectCloudState global', boot.hasCollect);
  check('runtime: _assignRowPreservePhotos global', boot.hasMergeFn);
  check('runtime: test-type toggle rendered', boot.hasToggle);
  check('runtime: page has content', boot.bodyLen > 500, 'len=' + boot.bodyLen);
  check('runtime: standalone NOT hard-blocked', !boot.noInstanceBlock, 'no-instance overlay must not fire without ?project');

  /* ── Tier 2a: S393 merge-union — un-synced local capture must survive a cloud merge ── */
  const t2a = await page.evaluate(() => {
    const target = { photos: [
      { id: 'ph_local_fresh', d: 'data:image/jpeg;base64,AAAA', r2Status: '' },     // just captured, not uploaded
      { id: 'ph_tombstoned', d: 'data:image/jpeg;base64,BBBB', deleted: true },     // real delete — must NOT resurrect
    ], other: 'x' };
    const cloud = { photos: [ { id: 'ph_cloud_known', d: '', r2Url: 'https://w/x.jpg' } ], other: 'cloudval' };
    _assignRowPreservePhotos(target, cloud);
    const ids = target.photos.map((p) => p && p.id);
    return { keptFresh: ids.includes('ph_local_fresh'), keptCloud: ids.includes('ph_cloud_known'),
             resurrected: ids.includes('ph_tombstoned'), fieldsMerged: target.other === 'cloudval' };
  });
  check('T2: merge keeps un-synced local capture (S393)', t2a.keptFresh);
  check('T2: merge keeps cloud photos', t2a.keptCloud);
  check('T2: merge honors tombstones (no resurrect)', !t2a.resurrected);
  check('T2: merge applies non-photo fields', t2a.fieldsMerged);

  /* ── Tier 2b: blob re-attach — cloud copy w/o bytes regains local d by id ── */
  const t2b = await page.evaluate(() => {
    const target = { photos: [ { id: 'ph_1', d: 'data:image/jpeg;base64,LOCALBYTES', r2Status: '' } ] };
    const cloud  = { photos: [ { id: 'ph_1', d: '', tag: 'suction' } ] };
    _assignRowPreservePhotos(target, cloud);
    const p = target.photos.find((x) => x && x.id === 'ph_1');
    return { d: p && p.d, tag: p && p.tag };
  });
  check('T2: blob re-attached onto cloud copy', t2b.d === 'data:image/jpeg;base64,LOCALBYTES');
  check('T2: cloud metadata (tag) preserved', t2b.tag === 'suction');

  /* ── Tier 2c: retention — un-uploaded photo bytes survive into cloud payload ── */
  const t2c = await page.evaluate(() => {
    flowTestPhotos.length = 0;
    flowTestPhotos.push({ d: 'data:image/jpeg;base64,KEEPME', n: 't.jpg', id: 'ph_t2c', r2Status: '', r2Key: '', r2Url: '' });
    const s = _collectCloudState();
    flowTestPhotos.length = 0;
    const p = (s.flowTestPhotos || []).find((x) => x && x.id === 'ph_t2c');
    return { d: p ? p.d : null, build: s._build };
  });
  check('T2: un-uploaded bytes kept in cloud state (retention)', t2c.d === 'data:image/jpeg;base64,KEEPME');
  check('T2: state stamps build', /^S[\d.]+$/.test(t2c.build || ''), String(t2c.build));

  /* ── Tier 2d: UI — switching to 7-Point must not throw ── */
  const preErr = pageErrors.length;
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button,div,span')).find((n) => /7-Point with PLD/.test(n.textContent || '') && n.offsetParent !== null);
    if (el) el.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  check('T2: switching to 7-Point throws no errors', pageErrors.length === preErr, pageErrors.slice(preErr).join(' | '));

  /* ── Explorer: seeded random interaction — hunts bugs nobody predicted.
   * Deterministic (re-run with the printed seed to reproduce). Destructive
   * controls and file inputs excluded; strays from window.open are closed. */
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  browser.on('targetcreated', async (t) => { try { const pg = await t.page(); if (pg && pg !== page) await pg.close(); } catch (_) {} });
  {
    let s = 398001 >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const before = pageErrors.length;
    for (let i = 0; i < 40; i++) {
      try {
        await page.evaluate((r) => {
          const els = Array.from(document.querySelectorAll('button, [onclick], a, select, [role="button"], .btn'))
            .filter((e) => e.offsetParent !== null)
            .filter((e) => !/delete|remove|clear|reset|sign ?out|log ?out|wipe/i.test((e.textContent || '') + (e.title || '')))
            .filter((e) => !(e.tagName === 'INPUT' && e.type === 'file'));
          if (!els.length) return;
          els[Math.floor(r * els.length)].click();
        }, rnd());
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 160));
      if (i % 7 === 6) { try { await page.keyboard.press('Escape'); } catch (_) {} }
    }
    const fresh = pageErrors.slice(before);
    check('explorer(Diesel, seed=398001, steps=40): no JS errors', fresh.length === 0, fresh.slice(0, 3).join(' | '));
  }

  await browser.close();
  srv.close();

  console.log('\n' + (failures.length ? 'RESULT: ' + failures.length + ' FAILURE(S)' : 'RESULT: ALL GREEN'));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
