/* ══════════════════════════════════════════════════════════════════════════
   DIESEL — REPORT MANIFEST                 diesel-app/js/reportManifest.js
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PHASE 2, Part A. THIS FILE IS NOT YET WIRED INTO THE TOOL. It is
   built and proven beside the live code; switching collectState/_applyLoadedState
   over to it is Part B and happens with Mark present, because it is the
   save-and-load path and a wrong collect is invisible until a value goes
   missing on a tablet three days later.

   WHAT IT IS. One declared list of every key a Diesel report carries: how each
   is gathered off the screen, and how each is put back. The engine that reads
   it is lib/data/reportState.js. Electric will have its own list against the
   same engine — same machinery, different personality.

   WHY IT EXISTS. The live collect and apply paths are two hand-written lists
   that nothing keeps in step. What that has already cost:
     • witnessSignRows was collected on every save and never applied (S496).
       Add a witness, save, reload — the array came back empty and the next
       save pushed the emptiness to the cloud. Signatures gone, no error.
     • flowTestPhotosPld is applied TWICE, sixteen lines apart, to this day.
       Harmless only because it happens to be idempotent.
   A key declared once, with both directions named, makes both faults
   structural rather than a matter of somebody noticing.

   HOW TO READ AN ENTRY. `key` is the name in the saved report. `collect` says
   how it is read; `apply` how it is written back. `kind: 'custom'` means the
   step is genuinely Diesel's own — the engine still ACCOUNTS for the key, it
   just calls a host function to do the work. `note` is why, for the next
   person. Deliberate one-sidedness must say so in collectOnlyReason /
   applyOnlyReason, or the audit fails.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* Every element id gathered into `proj`. This list is the one that used to sit
   inline in collectState — the "hand-maintained list of ~80 ids". */
var PROJ_FIELD_IDS = [
  'pi-projno','pi-client','pi-projname','pi-addr','pi-prepby','pi-date',
  'pi-contractor','pi-version','pi-ref','pi-revision','pi-date-modified',
  'pm-prv','pm-rpm','pm-equip','pm-pitot','pm-pitotflow','pm-rated-flow',
  'pm-relief','pm-reducing','pm-relief-pld','pm-reducing-pld',
  'pm-pitot-pld','pm-pitotflow-pld','pm-rated-flow-pld',
  'ws-static-flow','ws-static-psi','ws-res-flow','ws-res-psi',
  'dem-spr-flow','dem-spr-psi','dem-hose-flow',
  'pld-ws-static-flow','pld-ws-static-psi','pld-ws-res-flow','pld-ws-res-psi',
  'pld-dem-spr-flow','pld-dem-spr-psi','pld-dem-hose-flow',
  'pm-prv-pld','pm-pld-setting','pm-rpm-pld',
  'ps-jci-d','ps-jci-f','ps-jco-d','ps-jco-f','ps-fci-d','ps-fci-f','ps-fco-d','ps-fco-f',
  'ps-jci-d-pld','ps-jci-f-pld','ps-jco-d-pld','ps-jco-f-pld',
  'ps-fci-d-pld','ps-fci-f-pld','ps-fco-d-pld','ps-fco-f-pld',
  'np-mfr','np-model','np-serial','np-size','np-stages','np-impeller','np-bhp','np-maxbhp',
  'np-drvmfg','np-drvsn','np-ctlmfg','np-ctlsn',
  'np-mfr-pld','np-model-pld','np-serial-pld','np-size-pld','np-stages-pld','np-impeller-pld',
  'np-bhp-pld','np-maxbhp-pld','np-drvmfg-pld','np-drvsn-pld','np-ctlmfg-pld','np-ctlsn-pld',
  'so-name','so-title','so-company','so-date','test-result'
];

var KEYS = [
  { key: 'proj',
    collect: { kind: 'fields', ids: PROJ_FIELD_IDS },
    apply:   { kind: 'fields', lockedFrom: 'hubLockedIds' },
    note: 'Hub-launched reports lock project identity to the URL params; a stale blob must never overwrite them (S264).' },

  { key: 'testType',
    collect: { kind: 'custom', fn: 'collectTestType' },
    apply:   { kind: 'custom', fn: 'applyTestType' },
    note: 'Omitted entirely when no button is lit — a default nobody chose must never leave the device (S622i).' },

  { key: 'ttChosen',
    collect: { kind: 'custom', fn: 'collectTtChosen' },
    applyOnlyReason: null,
    apply:   { kind: 'custom', fn: 'applyNoop' },
    note: 'Restored as part of applyTestType, which needs both values at once; declared here so the key is not invisible.' },

  { key: 'npshPsi',
    collect: { kind: 'scalar', ref: 'npshPsi' },
    apply:   { kind: 'scalar', ref: 'npshPsi', mirrorTo: 'npsh-psi' } },

  { key: 'npshPsiPld',
    collect: { kind: 'scalar', ref: 'npshPsiPld' },
    apply:   { kind: 'scalar', ref: 'npshPsiPld', mirrorTo: 'npsh-psi-pld' } },

  { key: 'equipChecked',
    collect: { kind: 'checkboxGroup', name: 'equip3a', positions: true },
    apply:   { kind: 'writeOnly' },
    note: 'Legacy positional list. Still written so a tablet on an older cached build shows an equipment list; never read back by this build (S616c).' },

  { key: 'equipChecked4b',
    collect: { kind: 'checkboxGroup', name: 'equip4b', positions: true },
    apply:   { kind: 'writeOnly' },
    note: 'As equipChecked, for the 7-point tab.' },

  { key: 'equipState',
    collect: { kind: 'checkboxGroup', name: 'equip3a' },
    apply:   { kind: 'custom', fn: 'applyEquipState' },
    note: 'Answers by identity, not position, so two inspectors can be reconciled (S616c).' },

  { key: 'equipState4b',
    collect: { kind: 'checkboxGroup', name: 'equip4b' },
    apply:   { kind: 'custom', fn: 'applyEquipState4b' } },

  { key: 'pitotRows',
    collect: { kind: 'custom', fn: 'collectPitotRows' },
    apply:   { kind: 'custom', fn: 'applyPitotRows' },
    note: 'Rows live only in the DOM and carry permanent ids so devices can be paired (S321/S540).' },

  { key: 'customEquip',
    collect: { kind: 'custom', fn: 'collectCustomEquip' },
    apply:   { kind: 'custom', fn: 'applyCustomEquip' },
    note: 'Custom equipment TEXT was never persisted before S321 — only its checkbox index.' },

  { key: 'stdData',
    collect: { kind: 'rowsCopy', ref: 'stdData' },
    apply:   { kind: 'rowsInPlace', ref: 'stdData', pairWith: 'assignRowPreservePhotos' },
    note: 'Typed fields come from the payload; local photo binaries the cloud stripped are kept (S393 union).' },

  { key: 'pldData',
    collect: { kind: 'rowsCopy', ref: 'pldData' },
    apply:   { kind: 'rowsInPlace', ref: 'pldData', pairWith: 'assignRowPreservePhotos' } },

  { key: 'pumpCurvePoints',
    collect: { kind: 'rowsCopy', ref: 'pumpCurvePoints', mintIds: 'cv' },
    apply:   { kind: 'listReplace', ref: 'pumpCurvePoints' },
    note: 'Rows carry minted ids so the merge engine pairs them by identity (S605).' },

  { key: 'pldPumpCurvePoints',
    collect: { kind: 'rowsCopy', ref: 'pldPumpCurvePoints', mintIds: 'cv' },
    apply:   { kind: 'listReplace', ref: 'pldPumpCurvePoints' } },

  { key: 'clState',
    collect: { kind: 'deepCopy', ref: 'clState' },
    apply:   { kind: 'custom', fn: 'applyClState' },
    note: 'Runs the schema migration and strips per-item timestamps; both are Diesel history, not engine behaviour.' },

  { key: 'clSchemaVer',
    collect: { kind: 'constant', value: 2 },
    apply:   { kind: 'custom', fn: 'applyNoop' },
    note: 'Read by applyClState to decide the migration; declared so the key is accounted for.' },

  { key: 'customItems',
    collect: { kind: 'deepCopy', ref: 'customItems' },
    apply:   { kind: 'objectMerge', ref: 'customItems' } },

  { key: 'contractors',
    collect: { kind: 'listCopy', ref: 'contractors' },
    apply:   { kind: 'listReplace', ref: 'contractors' } },

  { key: 'contractorTrades',
    collect: { kind: 'deepCopy', ref: 'contractorTrades' },
    apply:   { kind: 'custom', fn: 'applyContractorTrades' },
    note: 'The host REASSIGNS this one, so it goes through an accessor — a reference would point at the replaced object.' },

  { key: 'deficiencies',
    collect: { kind: 'deepCopy', ref: 'deficiencies' },
    apply:   { kind: 'objectReplace', ref: 'deficiencies' },
    note: 'Full replace: a deficiency removed on another device must not survive here.' },

  { key: 'generalDeficiencies',
    collect: { kind: 'deepCopy', ref: 'generalDeficiencies' },
    apply:   { kind: 'listReplace', ref: 'generalDeficiencies' } },

  { key: 'contractorSignRows',
    collect: { kind: 'rowsCopy', ref: 'contractorSignRows' },
    apply:   { kind: 'listReplace', ref: 'contractorSignRows' } },

  { key: 'witnessSignRows',
    collect: { kind: 'rowsCopy', ref: 'witnessSignRows' },
    apply:   { kind: 'listReplace', ref: 'witnessSignRows' },
    note: 'THE S496 BUG. Collected on every save, applied nowhere, so witness signatures round-tripped to empty and the next save erased them from the cloud too. The audit in reportState.js exists because of this key.' },

  { key: 'sigStrokes',
    collect: { kind: 'custom', fn: 'collectSigStrokes' },
    apply:   { kind: 'custom', fn: 'applySigStrokes' },
    note: 'Wrapped {s:[...]} per canvas so the per-key stamp survives JSON; bare arrays drop attached properties (S605).' },

  { key: 'batData',
    collect: { kind: 'custom', fn: 'collectBatData' },
    apply:   { kind: 'custom', fn: 'applyBatData' } },

  { key: 'flowTestPhotos',
    collect: { kind: 'custom', fn: 'collectFlowTestPhotos' },
    apply:   { kind: 'listReplace', ref: 'flowTestPhotos' } },

  { key: 'flowTestPhotosPld',
    collect: { kind: 'custom', fn: 'collectFlowTestPhotosPld' },
    apply:   { kind: 'listReplace', ref: 'flowTestPhotosPld' },
    note: 'The live apply path assigns this key twice, sixteen lines apart. Declared once here — that duplication cannot be expressed in a manifest.' },

  { key: 'recordPhotos',
    collect: { kind: 'custom', fn: 'collectRecordPhotos' },
    apply:   { kind: 'listReplace', ref: 'recordPhotos' } },

  { key: 'deletedItems',
    collect: { kind: 'mapOfSets', ref: 'deletedItems' },
    apply:   { kind: 'mapOfLists', ref: 'deletedItems' },
    note: 'Tombstones. Without them a photo deleted on one device resurrects through the merge on another.' },

  { key: 'sketchEntries',
    collect: { kind: 'custom', fn: 'collectSketchEntries' },
    apply:   { kind: 'listReplace', ref: 'sketchEntries' } },

  { key: 'formRevision',
    collect: { kind: 'scalar', ref: 'formRevision' },
    apply:   { kind: 'scalar', ref: 'formRevision', skipFalsy: true } },

  { key: 'formDateModified',
    collect: { kind: 'scalar', ref: 'formDateModified' },
    apply:   { kind: 'scalar', ref: 'formDateModified', skipFalsy: true } },

  { key: 'appendixExcluded',
    collect: { kind: 'setToList', ref: 'appendixExcl' },
    apply:   { kind: 'custom', fn: 'applyAppendixLegacy' },
    note: 'One-way legacy exclusion list; only read when the newer appendixState is absent (S315/S616c).' },

  { key: 'appendixState',
    collect: { kind: 'custom', fn: 'collectAppendixState' },
    apply:   { kind: 'custom', fn: 'applyAppendixState' },
    note: 'Putting a photo BACK is a decision, not an absence — both answers carry their time so the later one wins either way (S616c).' },

  { key: 'distribution',
    collect: { kind: 'listCopy', ref: 'distribution' },
    apply:   { kind: 'listReplace', ref: 'distribution' } },

  { key: 'smState',
    collect: { kind: 'deepCopy', ref: 'smState' },
    apply:   { kind: 'perKeyMerge', ref: 'smState' },
    note: 'Per-chart only, for charts this build knows — a chart name from a newer build must not invent a chart here.' },

  { key: 'smCapVis',
    collect: { kind: 'deepCopy', ref: 'smCapVis' },
    apply:   { kind: 'perKeyMerge', ref: 'smCapVis' } },

  { key: 'annDsForce',
    collect: { kind: 'deepCopy', ref: 'annDsForce' },
    apply:   { kind: 'perKeyMerge', ref: 'annDsForce', replace: true } }
];

var manifest = {
  tool: 'diesel',
  version: '1.0.0',
  projFieldIds: PROJ_FIELD_IDS,
  keys: KEYS
};

if (root) root.DieselReportManifest = manifest;
try { if (typeof module !== 'undefined' && module.exports) module.exports = manifest; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
