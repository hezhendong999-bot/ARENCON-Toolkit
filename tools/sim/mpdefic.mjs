#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   DEFICIENCY OWNERSHIP — WHICH MACHINE IS THIS ABOUT?
                                                tools/sim/mpdefic.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. A deficiency is the part of the
   report somebody acts on. It reaches a contractor with a description
   and photographs, and the contractor walks into a room with two
   machines in it. "Controller fails to start on pressure drop" against
   neither machine is a work order that cannot be filled: ask and lose a
   day, or guess and repair the controller that was working while the
   failed one stays failed in a building that is supposed to be
   protected.

   WHAT IS ASSERTED:
     1. The contractor grouping is untouched — ownership is a tag, never
        a regrouping. The shipped report is built from that grouping.
     2. A deficiency raised from a shared checklist item belongs to the
        room; one raised from a machine item belongs to that machine —
        decided by the item's own scope, not by a second rule that can
        drift from it.
     3. RED ARM: untagged, a contractor attending FP-2 is handed FP-1's
        controller fault as if it were FP-2's.
     4. A contractor attending one machine sees that machine's work and
        the room's, and none of the other machine's.
     5. Issuing is BLOCKED while any deficiency on a two-pump report does
        not say which machine. On a one-pump report nothing changes.
     6. Responses and their photographs ride with the deficiency, never
        owned separately.
     7. Legacy adoption assigns a single-pump report's deficiencies, puts
        general ones on the room, and refuses on two pumps.
     8. Deleted deficiencies are skipped using the host's own rule.

   Run:  node tools/sim/mpdefic.mjs        (exit 0 green / 1 red)
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
for (const f of ['multipump/js/sectionScope.js', 'multipump/js/reportShape.js',
                 'multipump/js/checklistScope.js', 'multipump/js/deficiencyOwner.js']) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    .replace("typeof window !== 'undefined' ? window : globalThis", 'window');
  new Function('window', 'var module;\n' + src)(win);
}
const DO = win.MPDeficiencyOwner, CL = win.MPChecklistScope, Shape = win.MPShape;
const part06d = fs.readFileSync(path.join(REPO, 'diesel-app/js/part06d.js'), 'utf8');

console.log('\n═══ DEFICIENCY OWNERSHIP — WHICH MACHINE IS THIS ABOUT? ═══\n');

/* 1 — the shipped grouping is by contractor, and stays that way */
{
  const grouped = /deficiencies\[(ctr|k)\]/.test(part06d);
  if (!grouped) fail('the shipped tool no longer groups deficiencies by contractor — this probe is testing a shape that has changed');
  else ok('the shipped tool groups deficiencies by contractor; ownership tags entries and leaves that grouping alone');
}

function room() {
  const rep = Shape.blank();
  Shape.addPump(rep, { id: 'p1', tag: 'FP-1', type: 'dsl' });
  Shape.addPump(rep, { id: 'p2', tag: 'FP-2', type: 'dsl' });
  return rep;
}
function defics() {
  return {
    byContractor: {
      'Acme Fire': [
        { id: 'd1', text: 'Controller fails to start on pressure drop', item: 's3_1', photos: [{ id: 'pd1' }] },
        { id: 'd2', text: 'Churn pressure below rated', item: 's4_2' }
      ],
      'Bell Mechanical': [
        { id: 'd3', text: 'Suction strainer partially blocked', item: 's2_1' }
      ]
    },
    general: [{ id: 'g1', text: 'Pump room lighting inadequate' }]
  };
}

/* 2 — the item's scope decides */
{
  CL.SECTION_SCOPE.s2 = 'room';
  const a = DO.ownerForItem('s3_1', 'p1');
  const b = DO.ownerForItem('s2_1', 'p1');
  if (!a || a.scope !== 'pump' || a.id !== 'p1') fail('a controller deficiency was not attached to the machine');
  else if (!b || b.scope !== 'room') fail('a shared-item deficiency was attached to a machine');
  else ok('a machine item raises a machine deficiency; a shared item raises a room one — the checklist ruling decides both');
  const c = DO.ownerForItem('s3_1', null);
  if (c) fail('a machine deficiency was given an owner with no machine known');
  else ok('with no machine known, no owner is invented');
}

/* 3 — RED ARM */
{
  const { byContractor, general } = defics();
  const todaysView = byContractor['Acme Fire'];            /* everything, for everyone */
  const fp2Sees = todaysView.map((d) => d.text);
  if (!fp2Sees.some((t) => /Controller fails/.test(t)))
    fail('RED ARM did not reproduce');
  else ok("RED ARM reproduces: untagged, a contractor attending FP-2 is handed FP-1's controller fault as FP-2's");

  DO.tag(byContractor['Acme Fire'][0], 'pump', 'p1');
  DO.tag(byContractor['Acme Fire'][1], 'pump', 'p1');
  DO.tag(byContractor['Bell Mechanical'][0], 'room');
  DO.tag(general[0], 'room');

  const forP2 = DO.forPump(byContractor, general, 'p2', {});
  if (forP2.some((x) => x.d.id === 'd1')) fail("FP-2's list still contains FP-1's controller fault");
  else ok("FP-2's list does not contain FP-1's faults");

  /* 4 — the machine's own plus the room's */
  const forP1 = DO.forPump(byContractor, general, 'p1', {});
  const ids = forP1.map((x) => x.d.id).sort();
  if (ids.join(',') !== 'd1,d2,d3,g1') fail('FP-1 sees: ' + ids.join(',') + ' — expected its own two plus the room\u2019s two');
  else ok("FP-1 sees its own two faults plus the room's two, and nothing of FP-2's");
  if (forP1[0].at.contractor !== 'Acme Fire') fail('the contractor grouping was lost on the way through');
  else ok('each entry still reports the contractor it is filed under');
}

/* 5 — issuing is blocked while a machine is unnamed */
{
  const rep = room();
  const { byContractor, general } = defics();             /* fresh, untagged */
  let r = DO.readyToIssue(byContractor, general, rep, {});
  if (r.ok) fail('a two-pump report with unnamed machines was cleared for issue');
  else if (r.unassigned !== 4) fail('expected 4 unnamed, got ' + r.unassigned);
  else ok('issuing is blocked while 4 deficiencies do not say which machine');

  DO.walk(byContractor, general, (d, at) => DO.tag(d, at.general ? 'room' : 'pump', 'p1'));
  r = DO.readyToIssue(byContractor, general, rep, {});
  if (!r.ok) fail('a fully tagged two-pump report was still blocked');
  else ok('once every deficiency names a machine or the room, issuing is clear');

  const one = Shape.blank();
  Shape.addPump(one, { id: 'p1', tag: 'FP-1', type: 'dsl' });
  const d2 = defics();
  if (!DO.readyToIssue(d2.byContractor, d2.general, one, {}).ok)
    fail('a one-pump report was blocked — nothing should change for single-pump work');
  else ok('on a one-pump report nothing changes: no tagging required, no block');
}

/* 6 — responses ride with their deficiency */
{
  const d = { id: 'd9', responses: [{ id: 'r1', owner: { scope: 'pump', id: 'p2' }, photos: [{ id: 'pr1' }] }] };
  DO.tag(d, 'pump', 'p1');
  if (d.responses[0].owner) fail('a response kept an owner of its own — it can drift from its deficiency');
  else ok('a response and its photographs ride with the deficiency, never owned separately');
}

/* 7 — legacy adoption */
{
  const one = Shape.blank();
  Shape.addPump(one, { id: 'p1', tag: 'FP-1', type: 'dsl' });
  const { byContractor, general } = defics();
  const r = DO.adoptLegacy(byContractor, general, one, 'p1');
  if (r.adopted !== 4) fail('legacy adoption took ' + r.adopted + ', expected 4');
  else if (!DO.isRoom(general[0])) fail('a general deficiency was filed onto a machine');
  else if (!DO.ownedBy(byContractor['Acme Fire'][0], 'p1')) fail("a contractor deficiency was not adopted by the report's one pump");
  else ok("a single-pump report's deficiencies are adopted, and general ones stay the room's");

  const two = room();
  const d2 = defics();
  const r2 = DO.adoptLegacy(d2.byContractor, d2.general, two, 'p1');
  if (r2.adopted) fail('adoption assigned machines on a two-pump report without being asked');
  else if (!/wrong machine/.test(r2.why)) fail('the refusal does not give the reason');
  else ok('adoption REFUSES on a two-pump report, and says why it matters');
}

/* 8 — deleted deficiencies are skipped by the host's rule */
{
  const { byContractor, general } = defics();
  DO.walk(byContractor, general, (d) => DO.tag(d, 'pump', 'p1'));
  byContractor['Acme Fire'][0].deleted = true;
  const seen = DO.forPump(byContractor, general, 'p1', { isDeleted: (d) => !!d.deleted });
  if (seen.some((x) => x.d.id === 'd1')) fail('a deleted deficiency was issued');
  else ok("a deleted deficiency is skipped, using the host's own rule");
}

console.log('');
if (fails) { console.log(`═══ ${fails} FAILURE(S) ═══\n`); process.exit(1); }
console.log('═══ ALL GREEN — every work order names its machine ═══\n');
