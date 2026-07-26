// lib/ui/dieselHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Diesel Fire Pump Commissioning — Help card registry (S505, Mark).
// Diesel's OWN cards, handed to the shared Help engine (lib/ui/helpEngine.js).
// Same schema, tone and treatment as the Hub cards (lib/ui/hubHelpCards.js) —
// plain language, real-world meaning, one card per feature or gotcha. This file
// owns Diesel cards only; the engine pools search across every tool's cards.
//
// No framework, no build step. Classic ES module, imported by the Diesel tool
// alongside its other /lib/ modules. Importing this file runs registerHelp().
// ─────────────────────────────────────────────────────────────────────────────
import { registerHelp } from '/lib/ui/helpEngine.js';

/* ── illustrations (drawn, not screenshotted) ─────────────────────────────────
   Simple, calm line art. Same convention as hubHelpCards.js: inline SVG strings,
   Calibri labels, muted fills. Marquee cards get art; the rest run compact. */
var ART = {};

// Golden "Actual Output" curve — the headline chart feature.
ART.golden = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<line x1="34" y1="20" x2="34" y2="158" stroke="#CBD5E1"/><line x1="34" y1="158" x2="286" y2="158" stroke="#CBD5E1"/>'
+'<text x="12" y="90" font-family="Calibri" font-size="9" fill="#94A3B8" transform="rotate(-90 12 90)">Pressure</text>'
+'<text x="150" y="176" font-family="Calibri" font-size="9" fill="#94A3B8" text-anchor="middle">Flow</text>'
// measured discharge (thin)
+'<path d="M46,60 C110,66 180,86 274,120" fill="none" stroke="#6366F1" stroke-width="1.6"/>'
// a cap line (dashed)
+'<line x1="46" y1="78" x2="274" y2="78" stroke="#B05A7A" stroke-width="1.4" stroke-dasharray="5,3"/>'
+'<text x="200" y="74" font-family="Calibri" font-size="8" fill="#B05A7A">PRV @ 175 psi</text>'
// golden = min(measured, cap): flat under the cap then follows measured down
+'<path d="M46,78 L150,78 C200,86 240,104 274,120" fill="none" stroke="#D4A017" stroke-width="4"/>'
+'<circle cx="46" cy="78" r="3" fill="#D4A017"/><circle cx="150" cy="78" r="3" fill="#D4A017"/><circle cx="274" cy="120" r="3" fill="#D4A017"/>'
+'<rect x="42" y="24" width="120" height="16" rx="8" fill="#FBF3D9" stroke="#D4A017" stroke-opacity=".4"/>'
+'<text x="52" y="35" font-family="Calibri" font-size="9" font-weight="700" fill="#8A6A10">Actual Output</text></svg>';

// Pick-reading-then-shoot gauge photo model.
ART.gauge = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<rect x="20" y="24" width="120" height="142" rx="10" fill="#F8FAFC" stroke="#E2E8F0"/>'
+'<text x="30" y="44" font-family="Calibri" font-size="9" font-weight="700" fill="#1E293B">Flow point: 100%</text>'
+'<rect x="30" y="54" width="100" height="20" rx="5" fill="#fff" stroke="#CBD5E1"/><text x="38" y="68" font-family="Consolas,monospace" font-size="9" fill="#5A6473">Discharge  ___</text>'
+'<rect x="30" y="80" width="100" height="20" rx="5" fill="#EEF6FF" stroke="#2C4770" stroke-opacity=".5"/><text x="38" y="94" font-family="Consolas,monospace" font-size="9" font-weight="700" fill="#2C4770">Discharge  ◉ pick</text>'
+'<rect x="30" y="106" width="100" height="20" rx="5" fill="#fff" stroke="#CBD5E1"/><text x="38" y="120" font-family="Consolas,monospace" font-size="9" fill="#5A6473">RPM        ___</text>'
+'<path d="M150,95 L188,95" stroke="#94A3B8" stroke-width="1.5"/><path d="M182,89 L190,95 L182,101" fill="none" stroke="#94A3B8" stroke-width="1.5"/>'
+'<rect x="196" y="40" width="84" height="110" rx="10" fill="#111827"/><circle cx="238" cy="82" r="30" fill="#F8FAFC" stroke="#334155"/>'
+'<line x1="238" y1="82" x2="256" y2="66" stroke="#C0392B" stroke-width="2.5"/><circle cx="238" cy="82" r="3" fill="#334155"/>'
+'<rect x="212" y="122" width="52" height="18" rx="9" fill="#2C4770"/><text x="238" y="134.5" font-family="Calibri" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">Shoot</text></svg>';

// NFPA 20 pass/fail gates.
ART.gates = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<rect x="16" y="20" width="268" height="30" rx="6" fill="#EAF7EF" stroke="#3DBE6B" stroke-opacity=".4"/>'
+'<text x="28" y="39" font-family="Calibri" font-size="10" fill="#1A7A4A">Churn ≤ 140% of rated</text><text x="256" y="39" font-family="Calibri" font-size="11" fill="#1A7A4A" text-anchor="end">✓</text>'
+'<rect x="16" y="56" width="268" height="30" rx="6" fill="#EAF7EF" stroke="#3DBE6B" stroke-opacity=".4"/>'
+'<text x="28" y="75" font-family="Calibri" font-size="10" fill="#1A7A4A">Rated flow ≥ 100%</text><text x="256" y="75" font-family="Calibri" font-size="11" fill="#1A7A4A" text-anchor="end">✓</text>'
+'<rect x="16" y="92" width="268" height="30" rx="6" fill="#FDECEC" stroke="#C25B5B" stroke-opacity=".45"/>'
+'<text x="28" y="111" font-family="Calibri" font-size="10" fill="#A83A50">150% flow ≥ 65% of rated net</text><text x="256" y="111" font-family="Calibri" font-size="11" fill="#A83A50" text-anchor="end">✕</text>'
+'<rect x="16" y="128" width="268" height="30" rx="6" fill="#FEF6E7" stroke="#D6A93E" stroke-opacity=".45"/>'
+'<text x="28" y="147" font-family="Calibri" font-size="10" fill="#9A6A28">Override — you can set the verdict</text><text x="252" y="147" font-family="Calibri" font-size="9" fill="#9A6A28" text-anchor="end">manual ▾</text></svg>';

// Safety margin chip.
ART.margin = '<svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="190" fill="#fff"/>'
+'<line x1="34" y1="20" x2="34" y2="150" stroke="#CBD5E1"/><line x1="34" y1="150" x2="286" y2="150" stroke="#CBD5E1"/>'
+'<path d="M46,64 L150,64 C200,72 240,92 274,112" fill="none" stroke="#D4A017" stroke-width="3.5"/>'
+'<circle cx="180" cy="118" r="4" fill="#C0392B"/><text x="188" y="122" font-family="Calibri" font-size="8" fill="#5A6473">demand</text>'
+'<line x1="180" y1="118" x2="180" y2="84" stroke="#94A3B8" stroke-width="1.2" stroke-dasharray="3,3"/>'
+'<rect x="120" y="30" width="120" height="26" rx="13" fill="#EAF7EF" stroke="#3DBE6B" stroke-width="1.5"/>'
+'<text x="180" y="47" font-family="Calibri" font-size="10" font-weight="700" fill="#1A7A4A" text-anchor="middle">ADEQUATE  +34 psi</text></svg>';

// Save & leave (auto-save).
ART.save = '<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="150" fill="#fff"/>'
+'<path d="M116,58 a26,26 0 1 0 26,-26 h-26" fill="none" stroke="#5F8068" stroke-width="6" stroke-linecap="round"/>'
+'<path d="M150,44 l14,-6 l-4,15" fill="none" stroke="#5F8068" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
+'<path d="M132,60 l8,9 l16,-19" fill="none" stroke="#5F8068" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
+'<text x="150" y="108" font-family="Calibri" font-size="12" font-weight="700" fill="#1E293B" text-anchor="middle">Saved automatically</text>'
+'<text x="150" y="126" font-family="Calibri" font-size="10" fill="#5A6473" text-anchor="middle">Back and the logo save first, then leave</text></svg>';

/* ── cards ────────────────────────────────────────────────────────────────── */
var CARDS = [
{
  id:'diesel-golden-curve', area:'Performance test', date:'2026-07-25', isNew:true,
  title:'The gold “Actual Output” curve',
  pts:['The thick gold line is the <b>pressure the system actually delivers</b> — the number that matters.',
       'It follows your measured readings until a relief or reducing valve caps it, then runs flat at the cap.',
       'Turn any cap on or off with its legend pill and the gold line reshapes on the spot.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'golden curve gold line actual output delivered pressure cap relief reducing valve prv flat clamp what the pump really gives headline chart performance discharge',
  art:ART.golden
},
{
  id:'diesel-gauge-photos', area:'Performance test', date:'2026-07-24', isNew:true,
  title:'Gauge & RPM photos',
  pts:['<b>Pick the reading first, then shoot</b> — the photo is tied to that exact discharge, suction or RPM value.',
       'Later you can see which gauge photo backs up every number on the chart.',
       'The 7-point test keeps its w/PLD and w/o-PLD shots separate so they never get mixed up.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'gauge photo rpm photo reading pick then shoot flow point evidence which number came from tag pld w/o proof needle psi capture',
  art:ART.gauge
},
{
  id:'diesel-verdicts', area:'Performance test', date:'2026-07-22', isNew:true,
  title:'Pass / fail is by NFPA 20',
  pts:['Each point is scored against the <b>NFPA 20 acceptance gates</b> — churn ≤ 140%, rated ≥ 100%, 150% ≥ 65% of rated net.',
       'When a reading misses, the readout turns red and tells you the threshold it needed.',
       'You always have the final say: a <b>manual override</b> lets you set the verdict yourself.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'pass fail verdict nfpa 20 acceptance churn 140 rated 100 150 65 percent net threshold override manual set red miss needs meets certification gate',
  art:ART.gates
},
{
  id:'diesel-safety-margin', area:'Performance test', date:'2026-07-20',
  title:'Safety margin chip',
  pts:['A draggable chip on the discharge chart shows <b>how much pressure is left over</b> above what the system demands.',
       'Green ADEQUATE, amber TIGHT, red DEFICIT — read at a glance.',
       'It uses the gold “actual output” at the demand flow, not the raw gauge reading.'],
  chips:[['Discharge charts','c-where']],
  terms:'safety margin chip adequate tight deficit spare pressure headroom demand available drag chip green amber red how much left over',
  art:ART.margin
},
{
  id:'diesel-save-leave', area:'Getting around', date:'2026-07-18',
  title:'Your work saves itself',
  pts:['There is <b>no “save” button to remember</b> — every change is written as you go.',
       'Tapping Back or the logo does a full save first, then leaves. No prompt, nothing lost.',
       'The cloud dot near the top shows a quick “Saving…” whenever it syncs.'],
  chips:[['Everyone','c-where']],
  terms:'save saving autosave auto save leave back button logo exit lost data prompt do i need to save cloud dot sync where is save button',
  art:ART.save
},
{
  id:'diesel-summary-tab', area:'Getting around', date:'2026-07-15',
  title:'The Summary tab',
  pts:['Opens on <b>Summary</b> every time — a completion roll-up across checklists, battery, flow tests and signature.',
       'Tap any row to jump straight to that section.',
       'Open deficiencies show in their own strip and are <b>not</b> subtracted from the completion %.'],
  chips:[['Everyone','c-where']],
  compact:true,
  terms:'summary tab overview completion percent roll up progress how much done landing page open on jump to section deficiency strip flag'
},
{
  id:'diesel-3pt-7pt', area:'Performance test', date:'2026-07-12',
  title:'3-point vs 7-point test',
  pts:['One <b>Performance Test</b> tab holds both — switch with the toggle at the top.',
       '3-point is the straight churn / rated / 150% run; 7-point adds the in-between readings and the PLD device test.',
       'On 7-point the 25/50/75/125% rows are for the chart only — NFPA scores the 0/100/150% points.'],
  chips:[['Performance test','c-where']],
  compact:true,
  terms:'3 point 7 point three seven flow test performance toggle switch which test pld device 25 50 75 125 rows churn rated 150 difference'
},
{
  id:'diesel-caps', area:'Performance test', date:'2026-07-10',
  title:'Pressure caps on the chart',
  pts:['Relief and reducing valve settings draw as <b>flat dashed cap lines</b> and feed the gold curve.',
       'Each cap has a legend pill — turn it off to see what the pump would do without it.',
       'Caps are labelled with the device and setpoint only, e.g. “PRV @ 175 psi”.'],
  chips:[['Performance test','c-where']],
  compact:true,
  terms:'pressure cap relief reducing valve prv prdv pld setting dashed line setpoint limit legend pill toggle 150 percent flow flat line clamp golden'
},
{
  id:'diesel-photos-everywhere', area:'Photos', date:'2026-07-08',
  title:'Adding photos anywhere',
  pts:['Every photo spot takes a <b>drag & drop, an Upload button and a Camera button</b> — use whichever suits.',
       'Camera opens burst mode; a Library button inside it lets you pull from the gallery instead.',
       'Photos attach to checklists, deficiencies, site records and each flow point.'],
  chips:[['Everyone','c-where']],
  compact:true,
  terms:'photo add upload camera drag drop burst library gallery attach checklist deficiency site record flow point how to add picture image evidence'
},
{
  id:'diesel-markup', area:'Photos', date:'2026-07-05',
  title:'Marking up a photo',
  pts:['Draw on a photo to point out a problem — the <b>original is always kept clean underneath</b>.',
       'The clean copy is saved as its own tile, so you can always get back to it.',
       'Erasing your marks rolls the photo back with no fuss.'],
  chips:[['Everyone','c-where']],
  compact:true,
  terms:'markup mark up draw annotate photo arrow circle highlight original clean copy backup erase revert undo point out problem sketch on image'
},
{
  id:'diesel-deficiencies', area:'Closeout', date:'2026-07-02',
  title:'Deficiencies & closeout',
  pts:['Closeout gathers <b>deficiencies, signature, sketches and photos</b> in one place.',
       'The Closeout tab carries a ⚑ count of anything still open.',
       'Each deficiency holds its own evidence photos and a contractor response.'],
  chips:[['Closeout','c-where']],
  compact:true,
  terms:'deficiency deficiencies closeout close out signature sketch flag open count evidence photo contractor response finding issue problem list'
},
{
  id:'diesel-nameplate', area:'Getting around', date:'2026-06-28',
  title:'The nameplate row',
  pts:['Rated flow, pressure, speed and the valve settings sit in <b>one nameplate row</b> at the top of each test.',
       'These drive the chart and the pass/fail math — get them right first.',
       'NPSH is recorded here too and kept separately for the 3-point and 7-point tests.'],
  chips:[['Performance test','c-where']],
  compact:true,
  terms:'nameplate rated flow pressure speed rpm relief reducing valve npsh design values top row drives chart pass fail setpoint fill in first'
},
{
  id:'diesel-cloud-status', area:'Getting around', date:'2026-06-25',
  title:'Cloud & photo status dots',
  pts:['A <b>green cloud with a check</b> means a photo is safely uploaded; a brown dot means it’s still going up.',
       'Red means an upload failed; grey means it’s only on this device so far.',
       'They turn green on their own as uploads finish — no need to refresh.'],
  chips:[['Everyone','c-where']],
  compact:true,
  terms:'cloud status dot green check brown pending red failed grey local only upload photo sync where is my photo safe backed up uploading colour'
}
];

/* ── register ─────────────────────────────────────────────────────────────── */
registerHelp({
  tool: 'Diesel',                         // MUST match hasCards('Diesel') / comingSoon
  areas: ['Getting around','Performance test','Photos','Closeout'],
  cards: CARDS
});
