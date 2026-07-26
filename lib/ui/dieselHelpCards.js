// lib/ui/dieselHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Diesel Fire Pump Commissioning — Help card registry (S505, Mark).
// Diesel's OWN cards, handed to the shared Help engine (lib/ui/helpEngine.js).
// Same schema, tone and DENSITY as the Hub cards (lib/ui/hubHelpCards.js) —
// COMPACT cards with small 66×66 icons, plain language, one card per feature or
// gotcha. S505b: rebuilt to the Hub's compact scale — the first pass shipped
// oversized 300×190 illustrations that rendered ~446px wide in the 880px dialog
// and dwarfed the tool. Compact + small icon is the platform-matching size.
//
// No framework, no build step. Classic ES module, imported by the Diesel tool
// alongside its other /lib/ modules. Importing this file runs registerHelp().
// ─────────────────────────────────────────────────────────────────────────────
import { registerHelp } from '/lib/ui/helpEngine.js';

/* ── icons (small 66×66, mirrors the Hub's compact-card art) ──────────────────
   Calm single-glyph line marks. Rendered at 66px by .help-card.compact
   .help-card-shot{flex:0 0 66px}. Muted fills, no heavy colour. */
var ART = {};
function _ic(inner){
  return '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">'
    + '<rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/>' + inner + '</svg>';
}
ART.golden = _ic('<line x1="14" y1="18" x2="14" y2="50" stroke="#CBD5E1"/><line x1="14" y1="50" x2="52" y2="50" stroke="#CBD5E1"/>'
  +'<path d="M18,44 L34,44 C42,46 48,49 50,45" fill="none" stroke="#D4A017" stroke-width="3" stroke-linecap="round"/>'
  +'<line x1="18" y1="34" x2="50" y2="34" stroke="#B05A7A" stroke-width="1.2" stroke-dasharray="3,2"/>');
ART.gauge = _ic('<circle cx="33" cy="30" r="15" fill="#fff" stroke="#334155"/><line x1="33" y1="30" x2="43" y2="22" stroke="#C0392B" stroke-width="2"/><circle cx="33" cy="30" r="2" fill="#334155"/>'
  +'<rect x="20" y="50" width="26" height="6" rx="3" fill="#2C4770"/>');
ART.gates = _ic('<rect x="14" y="16" width="38" height="9" rx="3" fill="#DBF3E9" stroke="#2E9E72" stroke-opacity=".4"/>'
  +'<rect x="14" y="29" width="38" height="9" rx="3" fill="#DBF3E9" stroke="#2E9E72" stroke-opacity=".4"/>'
  +'<rect x="14" y="42" width="38" height="9" rx="3" fill="#FBE3E9" stroke="#C0445F" stroke-opacity=".4"/>');
ART.margin = _ic('<path d="M14,40 L32,40 C42,42 46,46 50,48" fill="none" stroke="#D4A017" stroke-width="3" stroke-linecap="round"/>'
  +'<rect x="20" y="16" width="30" height="12" rx="6" fill="#DBF3E9" stroke="#2E9E72" stroke-width="1.2"/><text x="35" y="25" font-family="Calibri" font-size="8" font-weight="700" fill="#1F8A60" text-anchor="middle">+34</text>');
ART.save = _ic('<path d="M24,33 a9,9 0 1 0 9,-9 h-9" fill="none" stroke="#5F8068" stroke-width="3" stroke-linecap="round"/><path d="M26,37 l4,4 l8,-9" fill="none" stroke="#5F8068" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
ART.summary = _ic('<rect x="16" y="16" width="34" height="6" rx="3" fill="#9C2742"/><rect x="16" y="28" width="26" height="5" rx="2.5" fill="#CBD5E1"/><rect x="16" y="38" width="30" height="5" rx="2.5" fill="#CBD5E1"/><rect x="16" y="48" width="20" height="5" rx="2.5" fill="#CBD5E1"/>');
ART.test = _ic('<circle cx="22" cy="33" r="4" fill="#2C7FB8"/><circle cx="33" cy="33" r="4" fill="#2C7FB8"/><circle cx="44" cy="33" r="4" fill="#2C7FB8"/><line x1="18" y1="46" x2="48" y2="46" stroke="#CBD5E1"/>');
ART.caps = _ic('<line x1="16" y1="30" x2="50" y2="30" stroke="#B05A7A" stroke-width="2" stroke-dasharray="4,3"/><path d="M16,44 L34,44 C42,44 46,40 50,30" fill="none" stroke="#D4A017" stroke-width="2.5" stroke-linecap="round"/>');
ART.photo = _ic('<rect x="15" y="22" width="36" height="26" rx="4" fill="#fff" stroke="#94A3B8"/><circle cx="33" cy="35" r="7" fill="none" stroke="#2C4770" stroke-width="2"/><rect x="27" y="17" width="12" height="6" rx="2" fill="#2C4770"/>');
ART.markup = _ic('<rect x="15" y="18" width="36" height="30" rx="4" fill="#fff" stroke="#94A3B8"/><path d="M22,40 L38,24" stroke="#C0392B" stroke-width="2.5" stroke-linecap="round"/><circle cx="40" cy="22" r="3" fill="none" stroke="#C0392B" stroke-width="2"/>');
ART.defic = _ic('<path d="M33,16 L50,46 L16,46 Z" fill="none" stroke="#C0445F" stroke-width="2.5" stroke-linejoin="round"/><line x1="33" y1="28" x2="33" y2="37" stroke="#C0445F" stroke-width="2.5" stroke-linecap="round"/><circle cx="33" cy="42" r="1.6" fill="#C0445F"/>');
ART.nameplate = _ic('<rect x="14" y="20" width="38" height="26" rx="3" fill="#EFEDF0" stroke="#CBD5E1"/><line x1="33" y1="20" x2="33" y2="46" stroke="#CBD5E1"/><line x1="14" y1="33" x2="52" y2="33" stroke="#CBD5E1"/>');
ART.cloud = _ic('<path d="M22,40 a8,8 0 0 1 0,-16 a11,11 0 0 1 21,3 a7,7 0 0 1 -1,13 z" fill="#DBF3E9" stroke="#5F8068" stroke-width="1.5"/><path d="M28,33 l3,3 l6,-7" fill="none" stroke="#1F8A60" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>');

/* ── cards (all compact — tool-scale, Hub density) ────────────────────────── */
var CARDS = [
{
  id:'diesel-golden-curve', area:'Performance test', date:'2026-07-25', isNew:true, compact:true,
  title:'The gold “Actual Output” curve',
  pts:['The thick gold line is the <b>pressure the system actually delivers</b> — the number that matters.',
       'It follows your measured readings until a relief or reducing valve caps it, then runs flat at the cap.',
       'Turn any cap on or off with its legend pill and the gold line reshapes on the spot.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'golden curve gold line actual output delivered pressure cap relief reducing valve prv flat clamp what the pump really gives headline chart performance discharge',
  art:ART.golden
},
{
  id:'diesel-gauge-photos', area:'Performance test', date:'2026-07-24', isNew:true, compact:true,
  title:'Gauge & RPM photos',
  pts:['<b>Pick the reading first, then shoot</b> — the photo is tied to that exact discharge, suction or RPM value.',
       'Later you can see which gauge photo backs up every number on the chart.',
       'The 7-point test keeps its w/PLD and w/o-PLD shots separate so they never get mixed up.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'gauge photo rpm photo reading pick then shoot flow point evidence which number came from tag pld w/o proof needle psi capture',
  art:ART.gauge
},
{
  id:'diesel-verdicts', area:'Performance test', date:'2026-07-22', isNew:true, compact:true,
  title:'Pass / fail is by NFPA 20',
  pts:['Each point is scored against the <b>NFPA 20 acceptance gates</b> — churn ≤ 140%, rated ≥ 100%, 150% ≥ 65% of rated net.',
       'When a reading misses, the readout turns red and tells you the threshold it needed.',
       'You always have the final say: a <b>manual override</b> lets you set the verdict yourself.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'pass fail verdict nfpa 20 acceptance churn 140 rated 100 150 65 percent net threshold override manual set red miss needs meets certification gate',
  art:ART.gates
},
{
  id:'diesel-safety-margin', area:'Performance test', date:'2026-07-20', compact:true,
  title:'Safety margin chip',
  pts:['A draggable chip on the discharge chart shows <b>how much pressure is left over</b> above what the system demands.',
       'Green ADEQUATE, amber TIGHT, red DEFICIT — read at a glance.',
       'It uses the gold “actual output” at the demand flow, not the raw gauge reading.'],
  chips:[['Discharge charts','c-where']],
  terms:'safety margin chip adequate tight deficit spare pressure headroom demand available drag chip green amber red how much left over',
  art:ART.margin
},
{
  id:'diesel-save-leave', area:'Getting around', date:'2026-07-18', compact:true,
  title:'Your work saves itself',
  pts:['There is <b>no “save” button to remember</b> — every change is written as you go.',
       'Tapping Back or the logo does a full save first, then leaves. No prompt, nothing lost.',
       'The cloud dot near the top shows a quick “Saving…” whenever it syncs.'],
  chips:[['Everyone','c-where']],
  terms:'save saving autosave auto save leave back button logo exit lost data prompt do i need to save cloud dot sync where is save button',
  art:ART.save
},
{
  id:'diesel-summary-tab', area:'Getting around', date:'2026-07-15', compact:true,
  title:'The Summary tab',
  pts:['Opens on <b>Summary</b> every time — a completion roll-up across checklists, battery, flow tests and signature.',
       'Tap any row to jump straight to that section.',
       'Open deficiencies show in their own strip and are <b>not</b> subtracted from the completion %.'],
  chips:[['Everyone','c-where']],
  terms:'summary tab overview completion percent roll up progress how much done landing page open on jump to section deficiency strip flag',
  art:ART.summary
},
{
  id:'diesel-3pt-7pt', area:'Performance test', date:'2026-07-12', compact:true,
  title:'3-point vs 7-point test',
  pts:['One <b>Performance Test</b> tab holds both — switch with the toggle at the top.',
       '3-point is the straight churn / rated / 150% run; 7-point adds the in-between readings and the PLD device test.',
       'On 7-point the 25/50/75/125% rows are for the chart only — NFPA scores the 0/100/150% points.'],
  chips:[['Performance test','c-where']],
  terms:'3 point 7 point three seven flow test performance toggle switch which test pld device 25 50 75 125 rows churn rated 150 difference',
  art:ART.test
},
{
  id:'diesel-caps', area:'Performance test', date:'2026-07-10', compact:true,
  title:'Pressure caps on the chart',
  pts:['Relief and reducing valve settings draw as <b>flat dashed cap lines</b> and feed the gold curve.',
       'Each cap has a legend pill — turn it off to see what the pump would do without it.',
       'Caps are labelled with the device and setpoint only, e.g. “PRV @ 175 psi”.'],
  chips:[['Performance test','c-where']],
  terms:'pressure cap relief reducing valve prv prdv pld setting dashed line setpoint limit legend pill toggle 150 percent flow flat line clamp golden',
  art:ART.caps
},
{
  id:'diesel-photos-everywhere', area:'Photos', date:'2026-07-08', compact:true,
  title:'Adding photos anywhere',
  pts:['Every photo spot takes a <b>drag & drop, an Upload button and a Camera button</b> — use whichever suits.',
       'Camera opens burst mode; a Library button inside it lets you pull from the gallery instead.',
       'Photos attach to checklists, deficiencies, site records and each flow point.'],
  chips:[['Everyone','c-where']],
  terms:'photo add upload camera drag drop burst library gallery attach checklist deficiency site record flow point how to add picture image evidence',
  art:ART.photo
},
{
  id:'diesel-markup', area:'Photos', date:'2026-07-05', compact:true,
  title:'Marking up a photo',
  pts:['Draw on a photo to point out a problem — the <b>original is always kept clean underneath</b>.',
       'The clean copy is saved as its own tile, so you can always get back to it.',
       'Erasing your marks rolls the photo back with no fuss.'],
  chips:[['Everyone','c-where']],
  terms:'markup mark up draw annotate photo arrow circle highlight original clean copy backup erase revert undo point out problem sketch on image',
  art:ART.markup
},
{
  id:'diesel-deficiencies', area:'Closeout', date:'2026-07-02', compact:true,
  title:'Deficiencies & closeout',
  pts:['Closeout gathers <b>deficiencies, signature, sketches and photos</b> in one place.',
       'The Closeout tab carries a ⚑ count of anything still open.',
       'Each deficiency holds its own evidence photos and a contractor response.'],
  chips:[['Closeout','c-where']],
  terms:'deficiency deficiencies closeout close out signature sketch flag open count evidence photo contractor response finding issue problem list',
  art:ART.defic
},
{
  id:'diesel-nameplate', area:'Getting around', date:'2026-06-28', compact:true,
  title:'The nameplate row',
  pts:['Rated flow, pressure, speed and the valve settings sit in <b>one nameplate row</b> at the top of each test.',
       'These drive the chart and the pass/fail math — get them right first.',
       'NPSH is recorded here too and kept separately for the 3-point and 7-point tests.'],
  chips:[['Performance test','c-where']],
  terms:'nameplate rated flow pressure speed rpm relief reducing valve npsh design values top row drives chart pass fail setpoint fill in first',
  art:ART.nameplate
},
{
  id:'diesel-cloud-status', area:'Getting around', date:'2026-06-25', compact:true,
  title:'Cloud & photo status dots',
  pts:['A <b>green cloud with a check</b> means a photo is safely uploaded; a brown dot means it’s still going up.',
       'Red means an upload failed; grey means it’s only on this device so far.',
       'They turn green on their own as uploads finish — no need to refresh.'],
  chips:[['Everyone','c-where']],
  terms:'cloud status dot green check brown pending red failed grey local only upload photo sync where is my photo safe backed up uploading colour',
  art:ART.cloud
}
];

/* ── register ─────────────────────────────────────────────────────────────── */
registerHelp({
  tool: 'Diesel',                         // MUST match hasCards('Diesel') / comingSoon
  areas: ['Getting around','Performance test','Photos','Closeout'],
  cards: CARDS
});
