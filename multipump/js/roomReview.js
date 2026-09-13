/* ═══════════════════════════════════════════════════════════════════════
   THE ROOM REVIEW                          multipump/js/roomReview.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The commissioning list itself, as one list for one room,
   and the rules for which of its rows a given pump room actually asks.

   It exists because the Diesel and Electric tools each grew their own
   Sections 1 and 2 and drifted. Two ARENCON reports on the same building
   could attest to different things depending on which pump they covered:
   the electric list asked whether the manufacturer's start-up had passed,
   whether the sensing lines had their two check valves, whether the
   packing and relief drains ran to an open drain, and whether the
   controller wiring matched the diagram. The diesel list asked none of
   those. The diesel list asked who must attend, what gauges to bring,
   the hose monsters and the PPE. The electric list asked none of those.

   ── HOW THIS LIST WAS BUILT ──────────────────────────────────────────
   Owner rulings, S729:
     · a check that existed in only one tool is kept for both, unless it
       is inherently about a diesel engine
     · where both asked the same thing, the Diesel wording wins
     · where Diesel split a check in two, it stays split
     · where one wording is wider, the wider one wins
     · redundancy removed; Diesel decides which phase a check lives in
     · visual items leave pre-commissioning

   Every sentence below is the live wording from the shipped tools except
   the rows marked 'new' (a check neither tool asked) and 'derived' (one
   reworded or split). Nothing was retyped from memory.

   ── THE ONE THING TO UNDERSTAND ABOUT SCOPE ──────────────────────────
   'visit' is answered once for the commissioning day. 'room' once for
   the installation. 'machine' once for EACH pump — so on a two-pump job
   a machine row is two answers, not one, and a single answer standing in
   for two machines is the failure this whole structure exists to stop:
   a controller nobody tested reading as tested, on the page an AHJ takes
   at face value.

   Diesel rows carry a group and are asked only of a diesel pump. They
   are not "N/A on electric" — they are absent.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* Phase 1 — before testing starts. Arranged as the day runs: what you
   arrange, what you bring, then what other people must have finished
   before you are willing to test anything. Those last rows are the pile
   the decision to proceed is made from. */
var PHASE1 = [
  { scope:'visit', src:'D1.1', text:'Coordinate with Building owner/authorized personnel, AHJ, contractor for test date and time. Coordinate alternate parking arrangement with Owner if required.' },
  { scope:'visit', src:'D1.3', text:'The following personnel shall attend the fire pump commissioning test: The sprinkler/fire pump installation contractor; The fire pump & controller test agent; TSSA inspector. Note: Sometimes the fire pump & controller testing agent is the TSSA inspector.' },
  { scope:'visit', src:'D1.9', text:'Ensure to bring ear protection and PPE.' },
  { scope:'visit', src:'D1.5', text:'Contractors shall bring calibrated gauges (not older than 12 months) to replace the installed fire pump suction and discharge gauges during the pump test.' },
  { scope:'visit', src:'D1.7', text:'The calibration standard is NIST. Ensure to take a photo of the calibration certificate.' },
  { scope:'visit', src:'D1.6', text:'Ask the Contractors to bring calibrated Hose Monsters (and paired flow chart) if possible, to minimize water damage to landscape. If not, play pipes are acceptable.' },
  { scope:'visit', src:'new', mark:'new', text:'Confirm the AHJ has been notified of the test date where notice or attendance is required.' },
  { scope:'machine', src:'D1.2', text:'Confirm with the Contractor that the suction pipe has been flushed prior to connecting to the fire pump. Written confirmation required.' },
  { scope:'room', src:'E1.3 (extracted)', text:'Confirm the underground flushing test is complete.' },
  { scope:'room', src:'D1.4', text:'Confirm hydrostatic test of the fire pump installation at 200 psi, or 50 psi in excess of maximum pressure, whichever is greater, for a minimum of 2 hours. Record what piping was in the test.' },
  { scope:'machine', src:'split of D1.8', mark:'derived', text:'Confirm control wiring and fire alarm monitoring points on this controller have been verified.' },
  { scope:'room', src:'split of D1.8', mark:'derived', text:'Confirm ESA inspection and verification of the room electrical work is complete.' },
  { scope:'machine', src:'E1.7 reworded', mark:'derived', text:'Confirm the pump and controller manufacturer\'s start-up has been completed and passed.' },
  { scope:'room', src:'new', mark:'new', text:'Confirm water supply is available for the test: municipal control valve open, or stored tank level and low-level switch confirmed.' },
  { scope:'room', src:'new', mark:'new', text:'Confirm the test arrangement is ready: test header or listed flow meter, hoses and play pipes, and a discharge location that will not cause damage.' },
];

/* Phase 2 — one walk of the room, following the water: the set, the
   suction side, the pump, the discharge run, sensing lines and jockey,
   the controller, and last the two rows that are about the room rather
   than any machine. The room rows are last on purpose — they are a
   closing sweep for tags and penetrations, not a row you walk past. */
var PHASE2 = [
  { scope:'machine', src:'D2.1', text:'Confirm fire pump components have been installed properly as per design drawings and are secure.' },
  { scope:'machine', src:'D2.2', text:'Confirm the installation of concentric and eccentric increaser/reducer (eccentric — flat side up on suction).' },
  { scope:'machine', src:'D2.23', text:'Confirm min. 10× pipe diameter is provided on the suction side of the fire pump, if the suction pipe is running perpendicular to the fire pump.' },
  { scope:'machine', src:'D2.22', text:'If any inverted U shape overhead piping is installed on the upstream side of the fire pump suction outlet, a ½" automatic air relief valve shall be provided at the top of the suction pipe.' },
  { scope:'machine', src:'new', mark:'new', text:'Confirm pump, driver and controller nameplate data matches the approved drawings, including the rated flow and pressure the test will be plotted against.' },
  { scope:'machine', src:'new', mark:'new', text:'Confirm the manufacturer\'s shop test curve for this pump is available on site.' },
  { scope:'machine', src:'D2.4', text:'Confirm the calibrated gauges have been installed on the suction and discharge side of the fire pump. Check the calibration date tag on the back of the gauge is not older than 12 months.' },
  { scope:'machine', src:'new', mark:'new', text:'Confirm the coupling guard is in place.' },
  { scope:'machine', src:'new', mark:'new', text:'Confirm an automatic air release is installed on the pump casing.' },
  { scope:'machine', src:'split of E1.10', mark:'derived', text:'Confirm the pump packing drain is installed and piped to an open drain.' },
  { scope:'machine', src:'D2.3 reworded', mark:'derived', text:'Confirm all fittings, couplings and valves from this pump’s discharge outlet to the discharge control valve are rated for the maximum pressure this driver can produce with speed control off or failed.' },
  { scope:'machine', src:'new', mark:'new', text:'Confirm a main pressure relief valve is installed where the driver can produce a pressure exceeding the rating of the system components, and that it is not isolated.' },
  { scope:'machine', src:'E1.10 + presence', mark:'derived', text:'Confirm the circulation relief valve is installed and its discharge is piped to an open drain.' },
  { scope:'machine', src:'D2.21', text:'Confirm no shut-off valves installed on the fire pump & jockey ½" pressure sensing lines. The pressure sensing line shall be installed between the fire pump/jockey discharge check valve and control valve. It is not acceptable to install the pressure sensing lines on the upstream side of the discharge check valve.' },
  { scope:'machine', src:'E1.9', text:'Confirm two check valves on sensing lines allow water flowing towards pumps from controllers, spaced min. 5 ft apart.' },
  { scope:'machine', src:'new', mark:'new', text:'Confirm the jockey pump is listed, and its pressure sensing line is independent of the fire pump’s, taken off between the jockey discharge check valve and its control valve.' },
  { scope:'machine', src:'E1.11', text:'Open controller door, check wiring and cross reference with wiring diagram for signal monitoring. Uncheck fire pump automatic shut-off.' },
  { scope:'room', src:'split of D2.3', mark:'derived', text:'Confirm the test header and its fittings are rated for the maximum pressure either pump can produce.' },
  { scope:'room', src:'E1.8 + D2.10', text:'Confirm all valves (Butterfly & OS&Y) and valve tags have been provided within the fire pump room.' },
  { scope:'room', src:'D2.11', text:'Confirm firestopping provided at each pump room penetration, except exterior wall. Any exposed pump room structural steel (not full height wall pump rooms) shall be treated with min. 1-hr F.R.R. fire spray. Interior door and frames shall be equipped with automatic door closure and rated for min. 45 minutes.' },
];

/* Only when one of the pumps is a diesel. Grouped so the walk does not
   jump between the tank, the batteries and the exhaust run.

   Every one of these is machine scope, including the fuel tank and its
   containment. With one diesel in the room that reads identically to
   calling them the room's — but a room with two diesels has two tanks,
   and a row that can only be answered once would then be answered for
   whichever engine the inspector happened to be standing at. */
var DIESEL = [
  { scope:'machine', src:'D2.5', group:'tank and containment', text:'Conduct diesel tank, concrete containment and dike inspection. Confirm no cracks on the fire pump pad. Confirm net capacity of the concrete dike exceeds 10% of diesel tank capacity. Unit: 1 US gal = 0.161 ft³. FM requires additional 2" freeboard in addition to the required dike height (normally 6" to 8").' },
  { scope:'machine', src:'D2.6', group:'tank and containment', text:'If a floor drain is located within the containment, it shall be plugged or provided with curb to prevent fuel entering the drain.' },
  { scope:'machine', src:'D2.7', group:'tank and containment', text:'Any concrete surface (e.g. pads, tank support, floor etc.) within the containment footprint shall be treated with an impermeable coating (e.g. Epoxy) / fuel oil sealant as per CSA B139-19.' },
  { scope:'machine', src:'D2.8', group:'tank and containment', text:'Confirm tank diesel level at the level indicator on top of the diesel tank. Confirm the capacity of tank and tank type (double-wall) on the tank placard. The fuel tank shall be kept as full and maintained as practical at all times but never below 66% of tank capacity (pull the rod out and measure the length).' },
  { scope:'machine', src:'D2.9', group:'tank and containment', text:'Confirm the diesel fuel tank supports (2" sch 40 pipes) are enclosed in concrete (sona-tube or concrete footing).' },
  { scope:'machine', src:'D2.20', group:'tank and containment', text:'Confirm if TSSA certificate "Fuel Oil Distributor Inspections Above Ground Tanks" has been provided at the diesel fuel tank. The TSSA certificate shall state which CSA B139 yearly edition is used (2019).' },
  { scope:'machine', src:'D2.12', group:'engine batteries', text:'Confirm if batteries and battery racks are provided.' },
  { scope:'machine', src:'D2.13', group:'engine exhaust', text:'Confirm pump engine exhaust is equipped with a muffler to discharge fumes to exterior. The discharge point shall be minimum of 12 ft above any accessible level, and not closer than 5 ft from any building openings.' },
  { scope:'machine', src:'D2.14', group:'engine exhaust', text:'The engine exhaust flex connection, exhaust pipe, long elbow and muffler shall be wrapped in high temperature insulation wrap and preferably c/w aluminum jacket within the pump room, regardless the height of the exhaust pipe.' },
  { scope:'machine', src:'D2.15', group:'engine exhaust', text:'The exhaust flex connection shall be stainless steel, seamless or welded corrugated (not interlocked), not less than 12" in length.' },
  { scope:'machine', src:'D2.16', group:'engine exhaust', text:'The flex connection shall be mechanically guarded only, and shall not be wrapped.' },
  { scope:'machine', src:'D2.17', group:'engine exhaust', text:'After the muffler, the exhaust pipe shall be a stainless-steel pressure chimney that complies with CSA B139. Black steel pipe as exhaust pipe discharge to exterior is commonly done but is not acceptable.' },
  { scope:'machine', src:'D2.18', group:'engine exhaust', text:'The chimney outlet shall be minimum of 2 ft above roof line and maintain sufficient clearance to building air intake per OFC.' },
  { scope:'machine', src:'D2.19', group:'engine exhaust', text:'Any ductwork, including intake and exhaust ducts, engine exhaust chimney that needs to travel within the building to roof after exiting the ceiling of pump room, shall be wrapped in min. 1-hr F.R.R. fire wrap. This is not required if the chimney discharges directly through the exterior wall of fire pump room.' },
];

function rowId(phase, i) { return phase + '_' + i; }

/* Every row this room asks, in order, each with the targets it needs.
   pumps is [{id, name, type:'dsl'|'ele'}]. A machine row on a two-pump
   job returns two targets; a diesel row returns only the diesel ones. */
function rowsFor(pumps) {
  pumps = pumps || [];
  var hasDiesel = pumps.some(function (p) { return p.type === 'dsl'; });
  var out = [];
  function push(phase, list) {
    list.forEach(function (r, i) {
      if (r.group && !hasDiesel) return;
      var targets;
      if (r.scope !== 'machine') targets = [null];
      else if (r.group) targets = pumps.filter(function (p) { return p.type === 'dsl'; });
      else targets = pumps.slice();
      out.push({ id: rowId(phase, i), phase: phase, scope: r.scope, group: r.group || '',
                 src: r.src, mark: r.mark || '', text: r.text, targets: targets });
    });
  }
  push('p1', PHASE1); push('p2', PHASE2); push('dsl', DIESEL);
  return out;
}

/* Rows on screen, and answers expected — they are not the same number,
   and the difference is the whole point of a two-pump report. */
function counts(pumps) {
  var rows = rowsFor(pumps);
  var answers = 0;
  rows.forEach(function (r) { answers += Math.max(1, r.targets.length); });
  return { rows: rows.length, answers: answers };
}

/* An answer key is the row plus the machine it is about — and for a room
   or visit row, the machine is DROPPED rather than trusted to be absent.
   A caller that passes a pump id for a shared row would otherwise create
   one answer per machine about a single installation, and the two could
   disagree about the same pipe with nothing to reconcile them. The row
   decides, not the caller.

   A machine row with no machine is refused outright: that answer has
   nowhere truthful to go. */
function answerKey(row, pumpId) {
  if (!row || !row.id) throw new Error('answerKey: needs the row, not just its id');
  if (row.scope !== 'machine') return row.id;
  if (!pumpId) throw new Error('answerKey: ' + row.id + ' is answered per machine and no machine was given');
  return row.id + '@' + pumpId;
}

/* What is not answered yet. The decision to proceed is taken per machine
   and is deliberately NOT part of this — an unanswered row and an
   undecided pump are different problems and must not be counted together. */
function outstanding(pumps, answers) {
  answers = answers || {};
  var out = [];
  rowsFor(pumps).forEach(function (r) {
    r.targets.forEach(function (t) {
      var k = answerKey(r, t && t.id);
      if (!answers[k]) out.push({ id: r.id, pump: t ? t.id : null, scope: r.scope, text: r.text });
    });
  });
  return out;
}

/* The four outcomes, per machine. 'part' exists because a churn-only or
   interrupted run is a real morning, and without a home for it the
   report either overstates what was done or looks unfinished. */
var OUTCOMES = [
  { key: 'complete', text: 'Proceed — installation complete for test' },
  { key: 'open',     text: 'Proceed — the open items listed do not affect the validity of the test' },
  { key: 'part',     text: 'Proceed for part of the test only — record which readings were taken and why the rest were not' },
  { key: 'stop',     text: 'Do not proceed — any run made is a preliminary run, not the acceptance test' }
];

/* A machine with no decision recorded must never be printed as tested.
   A blank performance section and no decision reads as a pump somebody
   forgot, which is worse than an honest "not tested". */
function undecided(pumps, decisions) {
  decisions = decisions || {};
  return (pumps || []).filter(function (p) { return !decisions[p.id]; }).map(function (p) { return p.id; });
}

var API = { PHASE1: PHASE1, PHASE2: PHASE2, DIESEL: DIESEL, OUTCOMES: OUTCOMES,
            rowsFor: rowsFor, counts: counts, answerKey: answerKey,
            outstanding: outstanding, undecided: undecided, rowId: rowId };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPRoomReview = API;

})(typeof window !== 'undefined' ? window : globalThis);
