#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   PLACARD OWNERSHIP — WHOSE NAMEPLATE IS BEING READ?
                                                tools/sim/mpphoto.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. The scan turns a photograph into the
   nameplate values of a signed report. The shipped rule for finding that
   photograph is "the most recent placard photo in the report", which is
   right for one pump and a coin toss for two.

   What makes it dangerous is that every safeguard downstream still
   passes. The preview shows real numbers. They are read correctly. They
   are simply the OTHER machine's, and no one looking at the report can
   tell — the manufacturer and model of two fire pumps in one room are
   very often the same, and it is the serial number and the ratings that
   differ.

   WHAT IS ASSERTED:
     1. The live tool really does pick by recency alone — the rule this
        replaces is read out of the shipped source, not assumed.
     2. RED ARM: with today's rule, scanning FP-1 returns FP-2's placard
        because it was photographed later. With ownership, FP-1 gets
        FP-1's.
     3. An untagged placard on a two-pump report is REFUSED, not guessed,
        and the refusal says what is needed.
     4. On a one-pump report nothing changes: an untagged placard is
        still read, because there is only one machine it can be of.
     5. Placards that belong to other pumps produce a refusal that says
        so, rather than "capture a placard photo first" while one is
        visible on screen.
     6. A deleted placard is not a placard — the host's own deletion rule
        is asked, never reimplemented.
     7. The pump-box fallback survives, but stays this pump's.
     8. Legacy adoption assigns a single-pump report's photos to that
        pump, keeps the room's own shots with the room, and REFUSES on a
        report with two pumps.

   Run:  node tools/sim/mpphoto.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const win = {};
for (const f of ['multipump/js/sectionScope.js', 'multipump/js/reportShape.js', 'multipump/js/photoOwner.js']) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const PO = win.MPPhotoOwner, Shape = win.MPShape;
const part07 = fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');

console.log('\n═══ PLACARD OWNERSHIP — WHOSE NAMEPLATE IS BEING READ? ═══\n');

/* 1 — the rule being replaced, read from the shipped tool */
{
  const recency = /kind\|\|''\)==='placard'[\s\S]{0,120}?slice\(-1\)/.test(part07.replace(/\s+/g, ''))
    || /placard'[\s\S]{0,200}slice\(-1\)/.test(part07);
  const asksDeleted = /_isPhotoDeleted\(p\)/.test(part07);
  if (!recency) fail('could not find the recency rule in the shipped scan — this probe may be testing a rule that no longer exists');
  else ok('the shipped scan picks the most recent placard photo in the whole report');
  if (!asksDeleted) fail('the shipped scan no longer excludes deleted photos');
  else ok('the shipped scan asks the host whether a photo is deleted (that rule is kept)');
}

/* a two-pump room: FP-1 photographed first, FP-2 second */
function twoPumps() {
  const rep = Shape.blank();
  Shape.addPump(rep, { id: 'p1', tag: 'FP-1', type: 'dsl' });
  Shape.addPump(rep, { id: 'p2', tag: 'FP-2', type: 'dsl' });
  const photos = [
    { id: 'ph1', kind: 'placard', n: 'fp1-placard.jpg', serial: 'SN-0001' },
    { id: 'ph2', kind: 'placard', n: 'fp2-placard.jpg', serial: 'SN-0002' }
  ];
  return { rep, photos };
}

/* 2 — RED ARM: recency picks the wrong machine */
{
  const { rep, photos } = twoPumps();
  const todaysRule = (ps) => ps.filter((p) => (p.kind || '') === 'placard').slice(-1)[0];
  const got = todaysRule(photos);
  if (got.serial !== 'SN-0002')
    fail('RED ARM did not reproduce — expected the later photo to win under the shipped rule');
  else ok("RED ARM reproduces: scanning FP-1 under today's rule returns FP-2's placard, because it was photographed later");

  PO.tag(photos[0], 'pump', 'p1');
  PO.tag(photos[1], 'pump', 'p2');
  const r1 = PO.placardFor(photos, 'p1', {});
  const r2 = PO.placardFor(photos, 'p2', {});
  if (!r1.photo || r1.photo.serial !== 'SN-0001') fail("FP-1's scan did not get FP-1's placard");
  else ok("FP-1's scan gets FP-1's placard");
  if (!r2.photo || r2.photo.serial !== 'SN-0002') fail("FP-2's scan did not get FP-2's placard");
  else ok("FP-2's scan gets FP-2's placard");
  if (rep.pumps.length !== 2) fail('report shape lost a pump');
}

/* 3 — untagged on a two-pump report is refused, not guessed */
{
  const { photos } = twoPumps();
  const r = PO.placardFor(photos, 'p1', {});
  if (r.photo) fail('an untagged placard was handed to a pump on a two-pump report — that is the guess this exists to stop');
  else if (r.refused !== 'unassigned' || r.candidates !== 2) fail('refused for the wrong reason: ' + JSON.stringify(r));
  else ok('two untagged placards on a two-pump report REFUSE the scan and say what is needed');
}

/* 4 — one pump: nothing changes */
{
  const photos = [{ id: 'ph1', kind: 'placard', serial: 'SN-0001' }];
  const r = PO.placardFor(photos, 'p1', { singlePump: true });
  if (!r.photo || r.photo.serial !== 'SN-0001') fail('a one-pump report stopped reading its own untagged placard');
  else ok('on a one-pump report an untagged placard is still read, exactly as today');
}

/* 5 — placards exist but belong to others */
{
  const photos = [{ id: 'ph2', kind: 'placard', serial: 'SN-0002', owner: { scope: 'pump', id: 'p2' } }];
  const r = PO.placardFor(photos, 'p1', {});
  if (r.photo) fail("FP-1's scan read a placard owned by FP-2");
  else if (r.refused !== 'other-pumps') fail('refused for the wrong reason: ' + JSON.stringify(r));
  else if (!/other pumps/i.test(r.why)) fail('the refusal does not say why a visible placard was not used');
  else ok('a placard owned by another pump refuses with a reason, not "capture a placard photo first"');
}

/* 6 — a deleted placard is not a placard */
{
  const photos = [
    { id: 'ph1', kind: 'placard', serial: 'SN-0001', owner: { scope: 'pump', id: 'p1' }, deleted: true },
    { id: 'ph0', kind: 'placard', serial: 'SN-0000', owner: { scope: 'pump', id: 'p1' } }
  ];
  const isDeleted = (p) => !!p.deleted;                       /* the host's rule, handed in */
  const r = PO.placardFor(photos, 'p1', { isDeleted });
  if (!r.photo || r.photo.serial !== 'SN-0000') fail('a deleted placard was scanned');
  else ok("a deleted placard is skipped, using the host's own deletion rule");
}

/* 7 — the pump-box fallback survives, and stays this pump's */
{
  const photos = [
    { id: 'a', kind: 'pump', serial: 'BODY-1', owner: { scope: 'pump', id: 'p1' } },
    { id: 'b', kind: 'pump', serial: 'BODY-2', owner: { scope: 'pump', id: 'p2' } }
  ];
  const r = PO.placardFor(photos, 'p1', {});
  if (!r.photo || r.photo.serial !== 'BODY-1') fail("the pump-box fallback returned another machine's photo");
  else if (r.from !== 'pump-box') fail('the fallback did not report itself as a fallback');
  else ok("the pump-box fallback survives and returns only this pump's photo");
}

/* 8 — legacy adoption */
{
  const one = Shape.blank();
  Shape.addPump(one, { id: 'p1', tag: 'FP-1', type: 'dsl' });
  const photos = [
    { id: 'a', kind: 'placard' }, { id: 'b', kind: 'pump' }, { id: 'c', kind: 'site' }
  ];
  const r = PO.adoptLegacy(photos, one, 'p1', {});
  if (r.adopted !== 2) fail('legacy adoption assigned ' + r.adopted + ' photos, expected 2');
  else if (PO.ownerOf(photos[2]).scope !== 'room') fail("the room's own site photo was filed onto a pump");
  else ok("a single-pump report's photos are adopted by that pump, and the room's site shot stays with the room");

  const { rep, photos: two } = twoPumps();
  const r2 = PO.adoptLegacy(two, rep, 'p1', {});
  if (r2.adopted) fail('adoption assigned photos on a two-pump report without being asked');
  else if (r2.refused !== 'not-single-pump') fail('refused for the wrong reason: ' + JSON.stringify(r2));
  else ok('adoption REFUSES on a two-pump report — the question is real and gets asked');

  if (PO.unassigned(two).length !== 2) fail('unassigned photos are not being surfaced for the interface to ask about');
  else ok('untagged photos are surfaced so the interface can ask which machine they are of');
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — a scan reads this machine\u2019s placard or none ═══\n');
