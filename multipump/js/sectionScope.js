/* ═══════════════════════════════════════════════════════════════════════
   SECTION SCOPE MODEL                     multipump/js/sectionScope.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The multi-pump report's foundation: every piece of data a
   fire pump report carries today, declared as belonging to THE ROOM, to
   A PUMP, or to A GROUP of pumps that run together.

   WHY IT EXISTS. Today a report has one answer for everything, so on a
   two-pump job one wrong exhaust flex still reads complete. The fix is not
   a bigger form — it is knowing, for every field, whether there is one of
   it or one per pump. Get this list wrong and the error is invisible until
   a signed report says the wrong thing about the wrong machine.

   NOTHING HERE IS LIVE. This tool does not launch until it is finished.
   The shipped Diesel and Electric tools are untouched and keep running.

   HOW SCOPE WAS DECIDED. One physical thing, one answer. A room has one
   suction, one jockey maintaining system pressure, one attendance list, so
   those are ROOM. A pump has its own nameplate, its own curve, its own
   controller, so those are PUMP. A combined run is a measured test of
   pumps running together, so it is GROUP — and it only exists when the
   inspector says those pumps run together.

   THE AWKWARD ONE. `proj` in today's tools is a single saved key holding
   roughly eighty field ids, and it spans both scopes: project number and
   water supply sit in it beside nameplate and pump data. It cannot be
   carried across whole. PROJ_ROOM / PROJ_PUMP below split it, and the
   probe proves every id landed in exactly one of them.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* ── project fields: today's one flat list, split ────────────────────── */

/* One per report. Identity, the supply feeding the room, the demand the
   system must meet, the jockey holding system pressure, and the sign-off. */
var PROJ_ROOM = [
  'pi-projno','pi-client','pi-projname','pi-addr','pi-prepby','pi-date',
  'pi-contractor','pi-version','pi-ref','pi-revision','pi-date-modified',
  /* water supply — one supply serves the room */
  'ws-static-flow','ws-static-psi','ws-res-flow','ws-res-psi',
  'pld-ws-static-flow','pld-ws-static-psi','pld-ws-res-flow','pld-ws-res-psi',
  /* building demand — a property of the system, not of a pump */
  'dem-spr-flow','dem-spr-psi','dem-hose-flow',
  'pld-dem-spr-flow','pld-dem-spr-psi','pld-dem-hose-flow',
  /* jockey cut-in / cut-out — ONE jockey maintains system pressure.
     Owner ruling, S728: shared. A second jockey would mean two systems in
     one room, which is a system layer, not a spare field. */
  'ps-jci-d','ps-jci-f','ps-jco-d','ps-jco-f',
  'ps-jci-d-pld','ps-jci-f-pld','ps-jco-d-pld','ps-jco-f-pld',
  /* sign-off */
  'so-name','so-title','so-company','so-date'
];

/* One per pump. Nameplate, the machine's own data, its own cut-in/cut-out,
   and its own overall result. */
var PROJ_PUMP = [
  'pm-prv','pm-rpm','pm-equip','pm-pitot','pm-pitotflow','pm-rated-flow',
  'pm-relief','pm-reducing','pm-relief-pld','pm-reducing-pld',
  'pm-pitot-pld','pm-pitotflow-pld','pm-rated-flow-pld',
  'pm-prv-pld','pm-pld-setting','pm-rpm-pld',
  /* fire pump cut-in / cut-out — each pump has its own */
  'ps-fci-d','ps-fci-f','ps-fco-d','ps-fco-f',
  'ps-fci-d-pld','ps-fci-f-pld','ps-fco-d-pld','ps-fco-f-pld',
  /* nameplate and placard — read by the AI placard scan, per machine */
  'np-mfr','np-model','np-serial','np-size','np-stages','np-impeller','np-bhp','np-maxbhp',
  'np-drvmfg','np-drvsn','np-ctlmfg','np-ctlsn',
  'np-mfr-pld','np-model-pld','np-serial-pld','np-size-pld','np-stages-pld','np-impeller-pld',
  'np-bhp-pld','np-maxbhp-pld','np-drvmfg-pld','np-drvsn-pld','np-ctlmfg-pld','np-ctlsn-pld',
  /* Electric only: auto-transfer timing. Peak = time to transfer to the
     alternate source, restore = time to return to normal. Each controller
     has its own transfer switch, so these are the machine's, not the room's.
     Found by tools/sim/mpscope.mjs — the Electric tool carries six project
     fields the Diesel tool does not, and reading the two lists by eye missed
     every one of them. */
  'at-std-peak','at-std-restore','at-pld-std-peak','at-pld-std-restore',
  'at-pld-vfd-peak','at-pld-vfd-restore',
  /* pass / fail is a verdict on a machine, not on a room */
  'test-result'
];

/* ── saved keys ──────────────────────────────────────────────────────── */
/* scope: 'room' | 'pump' | 'group' | 'split'
   only:  'dsl' | 'ele' | undefined (both drive types)
   why:   the reason, for the next person. A scope with no reason is a guess. */
var KEY_SCOPE = [
  /* ─ room ─ */
  { key:'proj',              scope:'split',
    why:'Holds both scopes today. Split by PROJ_ROOM / PROJ_PUMP above.' },
  { key:'contractors',       scope:'room',  why:'Who attended the visit. One list.' },
  { key:'contractorTrades',  scope:'room',  why:'Rides with contractors.' },
  { key:'contractorSignRows',scope:'room',  why:'A contractor signs the visit, not a machine.' },
  { key:'witnessSignRows',   scope:'room',  why:'As above. (The S496 bug key — collected, never applied.)' },
  { key:'sigStrokes',        scope:'room',  why:'The signature canvases those rows belong to.' },
  { key:'distribution',      scope:'room',  why:'Who receives the report. One report, one list.' },
  { key:'appendixState',     scope:'room',  why:'Which photos appear in the appendix of THIS document.' },
  { key:'appendixExcluded',  scope:'room',  why:'Legacy one-way exclusion list, read only when appendixState is absent.' },
  { key:'sketchEntries',     scope:'room',  why:'Sketches of the room and its piping.' },
  { key:'recordPhotos',      scope:'room',  why:'Record photos of the room. Pump evidence rides on the pump.' },
  { key:'generalDeficiencies',scope:'room', why:'Findings that belong to no single machine.' },
  { key:'formRevision',      scope:'room',  why:'Identity of the document.' },
  { key:'formDateModified',  scope:'room',  why:'When the document was last changed. One document, one date.' },
  { key:'deletedItems',      scope:'room',
    why:'Tombstones must stay ONE list. Splitting them per pump would let a photo deleted on one device resurrect through the merge under another scope.' },

  /* ─ split by item ─ */
  { key:'clState',           scope:'split',
    why:'The checklist answers. Each ITEM carries its own scope — the room items answered once, the pump items once per pump. This is the split that makes a two-pump report honest.' },
  { key:'clSchemaVer',       scope:'room',  why:'One schema version for the document.' },
  { key:'customItems',       scope:'split', why:'A custom checklist item inherits the scope of the section it was added to.' },
  { key:'deficiencies',      scope:'split',
    why:'One list, each entry tagged with its owner — room, a named pump, or a group. "Excessive vibration" with no owner does not tell a contractor which machine to look at.' },

  /* ─ pump ─ */
  { key:'testType',          scope:'pump',  why:'3-point or 7-point is chosen per machine tested.' },
  { key:'ttChosen',          scope:'pump',  why:'Rides with testType.' },
  { key:'npshPsi',           scope:'pump',  why:'Suction condition at THIS pump.' },
  { key:'npshPsiPld',        scope:'pump',  why:'Suction condition at this pump, pressure-limiting variant.' },
  { key:'equipChecked',      scope:'pump',  why:'Equipment present for this pump\u2019s test. Legacy positional list, still written.' },
  { key:'equipChecked4b',    scope:'pump',  why:'Equipment present for this pump’s 7-point test. Legacy positional list.' },
  { key:'equipState',        scope:'pump',  why:'Answers by identity so two inspectors can be reconciled.' },
  { key:'equipState4b',      scope:'pump',  why:'Equipment answers by identity for this pump’s 7-point test.' },
  { key:'customEquip',       scope:'pump',  why:'Custom equipment text for this pump\u2019s test.' },
  { key:'pitotRows',         scope:'pump',  why:'Readings taken at this pump.' },
  { key:'stdData',           scope:'pump',  why:'This pump\u2019s flow test table.' },
  { key:'pldData',           scope:'pump',  why:'This pump’s flow test table, pressure-limiting variant.' },
  { key:'pumpCurvePoints',   scope:'pump',  why:'A curve belongs to the machine it was measured on.' },
  { key:'pldPumpCurvePoints',scope:'pump',  why:'This pump’s curve, pressure-limiting variant.' },
  { key:'flowTestPhotos',    scope:'pump',  why:'Gauge photos from this pump\u2019s test.' },
  { key:'flowTestPhotosPld', scope:'pump',  why:'Gauge photos from this pump’s pressure-limiting test.' },
  { key:'smState',           scope:'pump',  why:'Chart display state, and the charts are per pump.' },
  { key:'smCapVis',          scope:'pump',  why:'Which capacity markers are visible on this pump’s chart.' },
  { key:'annDsForce',        scope:'pump',  why:'Forced data-label state on this pump’s chart.' },
  { key:'batData',           scope:'pump',  only:'dsl', why:'Battery readings. One engine, one set.' },
  { key:'batPower',          scope:'pump',  only:'ele', why:'Electric battery/power readings.' },
  { key:'vaStdData',         scope:'pump',  only:'ele', why:'Voltage and amperage at this controller.' },
  { key:'vaPldData',         scope:'pump',  only:'ele', why:'Voltage and amperage at this controller, pressure-limiting variant.' },
  { key:'autoTransfer',      scope:'pump',  only:'ele', why:'This controller\u2019s transfer switch.' },

  /* ─ group — new, has no equivalent in today's tools ─ */
  { key:'groups',            scope:'room',  isNew:true,
    why:'Which pumps run together THIS round. Asked per round: the same pumps can be independent one year and parallel the next.' },
  { key:'combinedData',      scope:'group', isNew:true,
    why:'The combined flow table. MEASURED, never a calculated overlay of the solo curves.' },
  { key:'combinedCurvePoints',scope:'group',isNew:true,
    why:'The combined curve, with each pump\u2019s solo curve drawn alongside for comparison.' },
  { key:'combinedPhotos',    scope:'group', isNew:true,
    why:'Gauge photos from the combined run.' },

  /* ─ equipment layer — new ─ */
  { key:'pumpRoster',        scope:'room',  isNew:true,
    why:'The pumps that exist in this building, with stable ids. The ONLY place a pump is born. Identity is fixed at creation so removing one never renumbers another.' }
];

var API = {
  PROJ_ROOM: PROJ_ROOM,
  PROJ_PUMP: PROJ_PUMP,
  KEY_SCOPE: KEY_SCOPE,
  scopeOf: function (key) {
    for (var i = 0; i < KEY_SCOPE.length; i++) if (KEY_SCOPE[i].key === key) return KEY_SCOPE[i].scope;
    return null;
  },
  keysIn: function (scope) {
    return KEY_SCOPE.filter(function (k) { return k.scope === scope; }).map(function (k) { return k.key; });
  },
  appliesTo: function (key, type) {
    for (var i = 0; i < KEY_SCOPE.length; i++) {
      if (KEY_SCOPE[i].key === key) return !KEY_SCOPE[i].only || KEY_SCOPE[i].only === type;
    }
    return false;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPScope = API;

})(typeof window !== 'undefined' ? window : globalThis);
