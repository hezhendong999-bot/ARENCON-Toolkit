/* ARENCON — PHOTO LINK ROOT-CAUSE PROBE
   Paste this whole block into the DevTools Console with a Diesel report open.
   It changes NOTHING. It mints a token for one real photo in BOTH key forms,
   then tests each one immediately and again after 20 seconds, and prints a
   verdict. This distinguishes the three possibilities that three rounds of
   code changes could not, because only your browser has the auth token. */
(async () => {
  const W = 'https://files.arencon.app';
  const jwt = localStorage.getItem('sb-access-token');
  if (!jwt) { console.error('PROBE: no sb-access-token — sign in first.'); return; }

  // find one real, synced photo from the live state
  let ph = null;
  const scan = a => { (a || []).forEach(p => { if (!ph && p && p.r2Key && p.r2Status === 'uploaded') ph = p; }); };
  try {
    if (typeof recordPhotos !== 'undefined') scan(recordPhotos);
    if (!ph && typeof clState !== 'undefined') Object.keys(clState).forEach(k => scan(clState[k].photos));
    if (!ph && typeof generalDeficiencies !== 'undefined') generalDeficiencies.forEach(d => scan(d.photos));
  } catch (e) {}
  if (!ph) { console.error('PROBE: no uploaded photo with an r2Key found in this report.'); return; }

  const stored  = ph.r2Key.replace(/^\/+/, '');
  const parts   = stored.split('/').filter(Boolean);
  const swapped = parts[0] === 'photos' ? parts[1] + '/photos/' + parts.slice(2).join('/') : stored;

  console.log('PROBE photo   :', ph.id);
  console.log('  stored key  :', stored);
  console.log('  swapped key :', swapped);

  // 1. does the object itself serve? (unauthenticated GET on the public URL)
  const objRes = await fetch(W + '/' + stored, { method: 'GET' }).catch(e => ({ status: 'ERR ' + e.message }));
  console.log('  object GET  :', objRes.status, objRes.status === 200 ? '(photo exists)' : '(PHOTO MISSING — nothing to link to)');

  // 2. mint both forms
  let links = {};
  try {
    const r = await fetch(W + '/mintlinks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ keys: [swapped, stored] })
    });
    const j = await r.json();
    console.log('  mint HTTP   :', r.status);
    console.log('  mint body   :', JSON.stringify(j).slice(0, 400));
    links = (j && j.links) || {};
  } catch (e) { console.error('  mint FAILED :', e.message); return; }

  const test = async (label, key) => {
    const tok = links[key];
    if (!tok) { console.log(`  ${label.padEnd(9)} : no token returned for this key`); return; }
    const url = W + '/p/' + tok;
    const r = await fetch(url, { method: 'GET' }).catch(e => ({ status: 'ERR ' + e.message }));
    console.log(`  ${label.padEnd(9)} : HTTP ${r.status}   ${url}`);
    return r.status;
  };

  console.log('--- immediately after minting ---');
  await test('swapped', swapped);
  await test('stored', stored);

  console.log('--- waiting 20s (tests token-store propagation) ---');
  setTimeout(async () => {
    console.log('--- 20 seconds later ---');
    const a = await test('swapped', swapped);
    const b = await test('stored', stored);
    console.log('VERDICT:',
      a === 200 ? 'SWAPPED key works — links are correct, earlier failures were propagation timing.'
      : b === 200 ? 'STORED key works — the key form must be flipped (no swap).'
      : 'NEITHER resolves after 20s — the /p/ resolve route is not serving these tokens; the worker needs review, not the app.');
  }, 20000);
})();
