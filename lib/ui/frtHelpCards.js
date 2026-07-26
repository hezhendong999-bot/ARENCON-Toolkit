// lib/ui/frtHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Field Review Tool (FRT) — Help card registry (S505g, Mark).
// FRT's OWN cards for the shared Help engine (lib/ui/helpEngine.js), registered
// under the scope 'FRT'. STANDING RULE (Mark, S505f): a Help panel shows ONE
// scope and never mixes — FRT's panel shows only these cards, in What's New, in
// the Guide and in search alike.
//
// Same schema, tone and density as hubHelpCards / dieselHelpCards: compact cards
// with small 66×66 icons, plain language, one card per feature or gotcha, and a
// generous `terms` line so field searches in a user's own words land correctly.
// ─────────────────────────────────────────────────────────────────────────────
import { registerHelp } from '/lib/ui/helpEngine.js';

/* ── icons (66×66, platform-standard compact art) ─────────────────────────── */
function _ic(inner){
  return '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">'
    + '<rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/>' + inner + '</svg>';
}
var ART = {};
ART.pin = _ic('<rect x="14" y="15" width="38" height="30" rx="3" fill="#fff" stroke="#94A3B8"/>'
  +'<path d="M33,50 C33,50 26,41 26,35 a7,7 0 0 1 14,0 C40,41 33,50 33,50 z" fill="#C0445F"/>'
  +'<circle cx="33" cy="35" r="2.6" fill="#fff"/>');
ART.severity = _ic('<rect x="14" y="17" width="38" height="8" rx="4" fill="#FBE3E9" stroke="#C0445F" stroke-opacity=".5"/>'
  +'<rect x="14" y="29" width="38" height="8" rx="4" fill="#FBEDD3" stroke="#D98A1E" stroke-opacity=".5"/>'
  +'<rect x="14" y="41" width="38" height="8" rx="4" fill="#DBF3E9" stroke="#2E9E72" stroke-opacity=".5"/>');
ART.markup = _ic('<rect x="14" y="17" width="38" height="32" rx="4" fill="#fff" stroke="#94A3B8"/>'
  +'<path d="M21,42 L38,25" stroke="#C0392B" stroke-width="2.6" stroke-linecap="round"/>'
  +'<circle cx="41" cy="22" r="3.2" fill="none" stroke="#C0392B" stroke-width="2"/>');
ART.select = _ic('<rect x="15" y="18" width="36" height="30" rx="4" fill="#fff" stroke="#94A3B8" stroke-dasharray="4,3"/>'
  +'<circle cx="26" cy="31" r="4" fill="#46C5E8" fill-opacity=".5" stroke="#2C7FB8"/>'
  +'<circle cx="38" cy="36" r="4" fill="#46C5E8" fill-opacity=".5" stroke="#2C7FB8"/>'
  +'<path d="M42,24 l3,3 l6,-7" fill="none" stroke="#2E9E72" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
ART.photo = _ic('<rect x="15" y="22" width="36" height="26" rx="4" fill="#fff" stroke="#94A3B8"/>'
  +'<circle cx="33" cy="35" r="7" fill="none" stroke="#2C4770" stroke-width="2"/>'
  +'<rect x="27" y="17" width="12" height="6" rx="2" fill="#2C4770"/>');
ART.crb = _ic('<rect x="14" y="18" width="26" height="18" rx="4" fill="#fff" stroke="#94A3B8"/>'
  +'<rect x="26" y="31" width="26" height="18" rx="4" fill="#EDE9F2" stroke="#9C2742" stroke-opacity=".6"/>'
  +'<circle cx="21" cy="27" r="1.8" fill="#94A3B8"/><circle cx="27" cy="27" r="1.8" fill="#94A3B8"/>');
ART.pdf = _ic('<rect x="17" y="14" width="32" height="38" rx="3" fill="#fff" stroke="#94A3B8"/>'
  +'<rect x="23" y="23" width="20" height="3.4" rx="1.7" fill="#CBD5E1"/>'
  +'<rect x="23" y="31" width="20" height="3.4" rx="1.7" fill="#CBD5E1"/>'
  +'<rect x="23" y="39" width="12" height="3.4" rx="1.7" fill="#9C2742"/>');
ART.cloud = _ic('<path d="M22,40 a8,8 0 0 1 0,-16 a11,11 0 0 1 21,3 a7,7 0 0 1 -1,13 z" fill="#DBF3E9" stroke="#5F8068" stroke-width="1.5"/>'
  +'<path d="M28,33 l3,3 l6,-7" fill="none" stroke="#1F8A60" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>');
ART.tabs = _ic('<rect x="13" y="20" width="16" height="9" rx="3" fill="#9C2742"/>'
  +'<rect x="32" y="20" width="21" height="9" rx="3" fill="#EDE9F2" stroke="#CBD5E1"/>'
  +'<rect x="13" y="34" width="40" height="14" rx="4" fill="#fff" stroke="#CBD5E1"/>');
ART.repair = _ic('<path d="M40,20 a9,9 0 1 0 6,10 l-8,-8 z" fill="none" stroke="#2C4770" stroke-width="2.6" stroke-linejoin="round"/>'
  +'<path d="M28,36 L20,45" stroke="#2C4770" stroke-width="3.4" stroke-linecap="round"/>');

/* ── cards ────────────────────────────────────────────────────────────────── */
var CARDS = [
{
  id:'frt-pins', area:'Drawings', date:'2026-07-26', compact:true,
  title:'Dropping a deficiency on a drawing',
  pts:['Tap the drawing where the problem is and a <b>numbered pin</b> drops there.',
       'The pin and its deficiency are the same thing \u2014 open one and you are editing the other.',
       'Pin numbers follow the order you place them and renumber themselves if you delete one.'],
  chips:[['Drawings','c-where']],
  terms:'pin drop place marker deficiency on drawing tap add point number location where problem is plan sheet',
  art:ART.pin
},
{
  id:'frt-severity', area:'Deficiencies', date:'2026-07-26', compact:true,
  title:'Severity and status colours',
  pts:['Colour means the same thing everywhere: <b>red is a deficiency, amber needs attention, green is closed</b>.',
       'A deficiency moves Open \u2192 Reported \u2192 Closed as the contractor responds and you verify.',
       'General and Recommendation entries record observations that are not failures.'],
  chips:[['Deficiencies','c-where']],
  terms:'severity status colour color red amber green open reported closed general recommendation what does the colour mean priority',
  art:ART.severity
},
{
  id:'frt-markup', area:'Photos', date:'2026-07-26', compact:true,
  title:'Marking up a photo',
  pts:['Draw on a photo to point out the problem \u2014 the <b>original is always kept clean underneath</b>.',
       'The clean copy stays its own tile, so you can get back to it at any time.',
       'Erasing your marks rolls the photo back with no fuss.'],
  chips:[['Photos','c-where']],
  terms:'markup mark up draw annotate arrow circle highlight pen photo original clean copy erase undo revert point out',
  art:ART.markup
},
{
  id:'frt-select', area:'Photos', date:'2026-07-26', compact:true,
  title:'Selecting and moving marks',
  pts:['Tap marks to <b>pick</b> them \u2014 they glow with a green check but nothing moves yet.',
       'The \u2713 button groups your picks into one amber box you can drag together.',
       'Tapping a grouped mark offers <b>Unlink</b>, which removes it from the group \u2014 it never deletes it.'],
  chips:[['Photos','c-where'],['Drawings','c-where']],
  terms:'select marks move group drag pick unlink ungroup rubber band lasso copy duplicate reposition annotation escape cancel',
  art:ART.select
},
{
  id:'frt-photos', area:'Photos', date:'2026-07-26', compact:true,
  title:'Adding photos',
  pts:['Every photo spot takes a <b>drag & drop, an Upload button and a Camera button</b>.',
       'Camera opens burst mode so you can take several without leaving the screen.',
       'Photos attach to a deficiency, to the project, or straight onto a drawing pin.'],
  chips:[['Photos','c-where']],
  terms:'add photo upload camera burst drag drop attach picture image evidence take photo gallery library how do i add',
  art:ART.photo
},
{
  id:'frt-crb', area:'Deficiencies', date:'2026-07-26', compact:true,
  title:'Contractor responses',
  pts:['Each deficiency carries its own <b>thread of contractor replies</b>, with photos.',
       'A reply arriving after you issued the report is flagged so you know the sheet is stale.',
       'You decide what the response means \u2014 accepting it is what closes the deficiency.'],
  chips:[['Deficiencies','c-where']],
  terms:'contractor response reply thread crb import comment back and forth close deficiency accept verify stale sheet acknowledgement',
  art:ART.crb
},
{
  id:'frt-export', area:'Reports', date:'2026-07-26', compact:true,
  title:'Exporting the report',
  pts:['<b>Export PDF</b> builds the client report; Export Project Docs packages the supporting files.',
       'Photo and drawing quality is chosen at export time \u2014 higher quality means a larger file.',
       'Issue Report marks the sheet as issued so later contractor replies are flagged against it.'],
  chips:[['Reports','c-where']],
  terms:'export pdf report issue project docs package quality dpi resolution file size print client deliverable generate',
  art:ART.pdf
},
{
  id:'frt-cloud', area:'Getting around', date:'2026-07-26', compact:true,
  title:'Cloud & photo status dots',
  pts:['A <b>green cloud with a check</b> means a photo is safely uploaded; brown means it is still going up.',
       'Red means an upload failed; grey means it is only on this device so far.',
       'They turn green on their own as uploads finish \u2014 no need to refresh.'],
  chips:[['Everyone','c-where']],
  terms:'cloud status dot green check brown pending red failed grey local only upload sync photo safe backed up where is my photo',
  art:ART.cloud
},
{
  id:'frt-tabs', area:'Getting around', date:'2026-07-26', compact:true,
  title:'The four tabs',
  pts:['<b>Project Info, Drawings, Deficiencies and Photos</b> \u2014 the whole review lives in these four.',
       'Deficiencies carries a count of anything still open.',
       'Your work saves itself as you go; leaving saves first, so nothing is lost.'],
  chips:[['Everyone','c-where']],
  terms:'tabs project info drawings deficiencies photos navigate sections where is save autosave leaving lost work count badge',
  art:ART.tabs
},
{
  id:'frt-repair', area:'Getting around', date:'2026-07-26', compact:true,
  title:'When a photo looks missing',
  pts:['<b>Repair Photos</b> re-links pictures that show blank after a sync hiccup.',
       'Reupload pushes anything still sitting on this device up to the cloud.',
       'Try these before assuming a photo is lost \u2014 it is almost always still there.'],
  chips:[['Everyone','c-where']],
  terms:'repair photos missing blank broken image not showing lost reupload re-upload fix relink recover gone disappeared',
  art:ART.repair
}
];

registerHelp({
  tool: 'FRT',
  areas: ['Getting around','Drawings','Deficiencies','Photos','Reports'],
  cards: CARDS
});
