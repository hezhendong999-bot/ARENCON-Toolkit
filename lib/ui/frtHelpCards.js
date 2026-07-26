// lib/ui/frtHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Field Review Tool — COMPLETE task-style guide (S506, Mark).
// PURPOSE (Mark's brief, verbatim intent): teach someone who does NOT know this
// tool how to use EVERY feature. Cards are JOBS, not descriptions — verb titles,
// steps in order, one workflow per card. Reference lookups (colours, dots) are
// kept short and live at the end of their area. Scope 'FRT' (standing rule:
// one panel = one scope, never mixed). Built from a code walk of the live FRT
// modules (deficiencies/viewer/markup/photos/drawings/export/AI/header menu) —
// every card maps to a real control that exists in the tool today.
// ─────────────────────────────────────────────────────────────────────────────
import { registerHelp } from '/lib/ui/helpEngine.js';

/* ── icons (66×66 compact art, reused across related tasks) ───────────────── */
function _ic(inner){
  return '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">'
    + '<rect width="66" height="66" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/>' + inner + '</svg>';
}
var ART = {};
ART.pin = _ic('<rect x="14" y="15" width="38" height="30" rx="3" fill="#fff" stroke="#94A3B8"/><path d="M33,50 C33,50 26,41 26,35 a7,7 0 0 1 14,0 C40,41 33,50 33,50 z" fill="#C0445F"/><circle cx="33" cy="35" r="2.6" fill="#fff"/>');
ART.obs = _ic('<path d="M30,46 C30,46 23,37 23,31 a7,7 0 0 1 14,0 C37,37 30,46 30,46 z" fill="#C0445F"/><rect x="38" y="18" width="9" height="7" rx="2" fill="#EDE9F2" stroke="#9C2742" stroke-opacity=".6"/><rect x="38" y="28" width="9" height="7" rx="2" fill="#EDE9F2" stroke="#9C2742" stroke-opacity=".6"/><rect x="38" y="38" width="9" height="7" rx="2" fill="#EDE9F2" stroke="#9C2742" stroke-opacity=".6"/>');
ART.tabs = _ic('<rect x="13" y="20" width="16" height="9" rx="3" fill="#9C2742"/><rect x="32" y="20" width="21" height="9" rx="3" fill="#EDE9F2" stroke="#CBD5E1"/><rect x="13" y="34" width="40" height="14" rx="4" fill="#fff" stroke="#CBD5E1"/>');
ART.info = _ic('<rect x="15" y="16" width="36" height="34" rx="4" fill="#fff" stroke="#94A3B8"/><rect x="21" y="24" width="24" height="4" rx="2" fill="#CBD5E1"/><rect x="21" y="32" width="18" height="4" rx="2" fill="#CBD5E1"/><path d="M38,42 l6,-6 l4,4 l-6,6 h-4 z" fill="#9C2742" fill-opacity=".8"/>');
ART.sheet = _ic('<rect x="16" y="14" width="34" height="38" rx="3" fill="#fff" stroke="#94A3B8"/><line x1="22" y1="24" x2="44" y2="24" stroke="#CBD5E1"/><line x1="22" y1="32" x2="44" y2="32" stroke="#CBD5E1"/><path d="M22,44 L32,36 L38,41 L44,37" fill="none" stroke="#2C7FB8" stroke-width="2"/>');
ART.folder = _ic('<path d="M14,22 h14 l4,5 h20 v20 a3,3 0 0 1 -3,3 h-32 a3,3 0 0 1 -3,-3 z" fill="#FBEDD3" stroke="#D98A1E" stroke-opacity=".6"/>');
ART.scale = _ic('<line x1="16" y1="44" x2="50" y2="22" stroke="#2C4770" stroke-width="3" stroke-linecap="round"/><line x1="20" y1="47" x2="24" y2="41" stroke="#2C4770" stroke-width="2"/><line x1="31" y1="40" x2="35" y2="34" stroke="#2C4770" stroke-width="2"/><line x1="42" y1="33" x2="46" y2="27" stroke="#2C4770" stroke-width="2"/>');
ART.pen = _ic('<path d="M20,46 L40,26 l6,6 L26,52 l-8,2 z" fill="#fff" stroke="#2C4770" stroke-width="2" stroke-linejoin="round"/><path d="M40,26 l4,-4 a3,3 0 0 1 6,6 l-4,4 z" fill="#C0392B"/>');
ART.text = _ic('<rect x="15" y="18" width="36" height="30" rx="4" fill="#fff" stroke="#94A3B8"/><text x="33" y="40" font-family="Calibri" font-size="22" font-weight="700" fill="#2C4770" text-anchor="middle">Aa</text>');
ART.poly = _ic('<path d="M16,46 L28,30 L38,38 L50,20" fill="none" stroke="#C0392B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="46" r="3" fill="#C0392B"/><circle cx="28" cy="30" r="3" fill="#C0392B"/><circle cx="38" cy="38" r="3" fill="#C0392B"/><circle cx="50" cy="20" r="3" fill="#C0392B"/>');
ART.erase = _ic('<rect x="18" y="30" width="20" height="14" rx="3" transform="rotate(-25 28 37)" fill="#F4C7CF" stroke="#C0445F"/><line x1="34" y1="46" x2="50" y2="46" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/>');
ART.select = _ic('<rect x="15" y="18" width="36" height="30" rx="4" fill="#fff" stroke="#94A3B8" stroke-dasharray="4,3"/><circle cx="26" cy="31" r="4" fill="#46C5E8" fill-opacity=".5" stroke="#2C7FB8"/><circle cx="38" cy="36" r="4" fill="#46C5E8" fill-opacity=".5" stroke="#2C7FB8"/><path d="M42,24 l3,3 l6,-7" fill="none" stroke="#2E9E72" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
ART.severity = _ic('<rect x="14" y="17" width="38" height="8" rx="4" fill="#FBE3E9" stroke="#C0445F" stroke-opacity=".5"/><rect x="14" y="29" width="38" height="8" rx="4" fill="#FBEDD3" stroke="#D98A1E" stroke-opacity=".5"/><rect x="14" y="41" width="38" height="8" rx="4" fill="#DBF3E9" stroke="#2E9E72" stroke-opacity=".5"/>');
ART.contractor = _ic('<circle cx="26" cy="26" r="7" fill="#EDE9F2" stroke="#5E5B68"/><path d="M14,50 a12,10 0 0 1 24,0 z" fill="#EDE9F2" stroke="#5E5B68"/><rect x="40" y="34" width="12" height="12" rx="3" fill="#FBEDD3" stroke="#D98A1E"/>');
ART.search = _ic('<circle cx="29" cy="29" r="11" fill="#fff" stroke="#2C4770" stroke-width="2.6"/><line x1="38" y1="38" x2="49" y2="49" stroke="#2C4770" stroke-width="3.4" stroke-linecap="round"/>');
ART.log = _ic('<rect x="16" y="14" width="34" height="38" rx="3" fill="#fff" stroke="#94A3B8"/><circle cx="23" cy="24" r="2" fill="#2C7FB8"/><rect x="28" y="22" width="16" height="3.4" rx="1.7" fill="#CBD5E1"/><circle cx="23" cy="33" r="2" fill="#2C7FB8"/><rect x="28" y="31" width="16" height="3.4" rx="1.7" fill="#CBD5E1"/><circle cx="23" cy="42" r="2" fill="#2C7FB8"/><rect x="28" y="40" width="12" height="3.4" rx="1.7" fill="#CBD5E1"/>');
ART.photo = _ic('<rect x="15" y="22" width="36" height="26" rx="4" fill="#fff" stroke="#94A3B8"/><circle cx="33" cy="35" r="7" fill="none" stroke="#2C4770" stroke-width="2"/><rect x="27" y="17" width="12" height="6" rx="2" fill="#2C4770"/>');
ART.markup = _ic('<rect x="14" y="17" width="38" height="32" rx="4" fill="#fff" stroke="#94A3B8"/><path d="M21,42 L38,25" stroke="#C0392B" stroke-width="2.6" stroke-linecap="round"/><circle cx="41" cy="22" r="3.2" fill="none" stroke="#C0392B" stroke-width="2"/>');
ART.send = _ic('<rect x="13" y="24" width="22" height="17" rx="3" fill="#fff" stroke="#94A3B8"/><path d="M38,32 h10 m-4,-4 l4,4 l-4,4" fill="none" stroke="#2C7FB8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M50,46 C50,46 45,40 45,36 a5,5 0 0 1 10,0 C55,40 50,46 50,46 z" fill="#C0445F"/>');
ART.trash = _ic('<path d="M22,24 h22 l-2,26 a3,3 0 0 1 -3,3 h-12 a3,3 0 0 1 -3,-3 z" fill="#FBE3E9" stroke="#C0445F"/><rect x="19" y="18" width="28" height="5" rx="2.5" fill="#C0445F"/><path d="M44,38 a8,8 0 1 1 -3,-6" fill="none" stroke="#2E9E72" stroke-width="2.4" stroke-linecap="round"/><path d="M44,29 v9 h-9" fill="none" stroke="#2E9E72" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
ART.crb = _ic('<rect x="14" y="18" width="26" height="18" rx="4" fill="#fff" stroke="#94A3B8"/><rect x="26" y="31" width="26" height="18" rx="4" fill="#EDE9F2" stroke="#9C2742" stroke-opacity=".6"/><circle cx="21" cy="27" r="1.8" fill="#94A3B8"/><circle cx="27" cy="27" r="1.8" fill="#94A3B8"/>');
ART.ai = _ic('<rect x="15" y="18" width="36" height="30" rx="6" fill="#fff" stroke="#94A3B8"/><path d="M25,38 l4,-10 l4,10 m-6.5,-3.5 h5" stroke="#9C2742" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M40,28 v10 M37,28 h6" stroke="#9C2742" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
ART.pdf = _ic('<rect x="17" y="14" width="32" height="38" rx="3" fill="#fff" stroke="#94A3B8"/><rect x="23" y="23" width="20" height="3.4" rx="1.7" fill="#CBD5E1"/><rect x="23" y="31" width="20" height="3.4" rx="1.7" fill="#CBD5E1"/><rect x="23" y="39" width="12" height="3.4" rx="1.7" fill="#9C2742"/>');
ART.issue = _ic('<rect x="17" y="14" width="32" height="38" rx="3" fill="#fff" stroke="#94A3B8"/><path d="M24,34 l6,6 l12,-14" fill="none" stroke="#2E9E72" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
ART.json = _ic('<path d="M24,16 c-5,0 -5,6 -5,9 s0,8 -5,8 c5,0 5,5 5,8 s0,9 5,9" fill="none" stroke="#2C4770" stroke-width="2.4" stroke-linecap="round"/><path d="M42,16 c5,0 5,6 5,9 s0,8 5,8 c-5,0 -5,5 -5,8 s0,9 -5,9" fill="none" stroke="#2C4770" stroke-width="2.4" stroke-linecap="round"/>');
ART.cloud = _ic('<path d="M22,40 a8,8 0 0 1 0,-16 a11,11 0 0 1 21,3 a7,7 0 0 1 -1,13 z" fill="#DBF3E9" stroke="#5F8068" stroke-width="1.5"/><path d="M28,33 l3,3 l6,-7" fill="none" stroke="#1F8A60" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>');
ART.repair = _ic('<path d="M40,20 a9,9 0 1 0 6,10 l-8,-8 z" fill="none" stroke="#2C4770" stroke-width="2.6" stroke-linejoin="round"/><path d="M28,36 L20,45" stroke="#2C4770" stroke-width="3.4" stroke-linecap="round"/>');
ART.qr = _ic('<rect x="16" y="16" width="13" height="13" rx="2" fill="none" stroke="#1B1A22" stroke-width="2.4"/><rect x="37" y="16" width="13" height="13" rx="2" fill="none" stroke="#1B1A22" stroke-width="2.4"/><rect x="16" y="37" width="13" height="13" rx="2" fill="none" stroke="#1B1A22" stroke-width="2.4"/><rect x="39" y="39" width="4" height="4" fill="#1B1A22"/><rect x="46" y="46" width="4" height="4" fill="#1B1A22"/>');
ART.redact = _ic('<rect x="16" y="14" width="34" height="38" rx="3" fill="#fff" stroke="#94A3B8"/><circle cx="33" cy="30" r="8" fill="none" stroke="#CBD5E1" stroke-width="2"/><rect x="22" y="26" width="22" height="9" rx="2" fill="#1B1A22"/>');

/* ── cards ────────────────────────────────────────────────────────────────── */
var CARDS = [

/* ═══ START HERE ═══ */
{
  id:'frt-concept-pin', area:'Start here', date:'2026-07-26', isNew:true, compact:true,
  title:'How FRT thinks: pins and observations',
  pts:['A <b>pin is a place on a drawing</b>, not a single problem.',
       'One pin can hold <b>several observations</b> \u2014 everything you found at that spot.',
       'Everything else in the tool builds on that: photos, contractors and status all attach per observation.'],
  chips:[['Read this first','c-new']],
  terms:'concept how it works pin observation multiple problems same spot model basics start understand obs a b tabs',
  art:ART.obs
},
{
  id:'frt-start-review', area:'Start here', date:'2026-07-26', isNew:true, compact:true,
  title:'Start a field review',
  pts:['Open the project from the Hub \u2014 FRT opens with your project already loaded.',
       'Fill in <b>Project Info</b> first: client, address and the date of inspection go on every report cover.',
       'Upload your drawings under <b>Drawings</b>, then walk the site recording deficiencies as pins.',
       'Everything saves itself as you go \u2014 there is no save button to remember.'],
  chips:[['Everyone','c-where']],
  terms:'start begin new review first time setup open project how do i start walkthrough getting started field visit',
  art:ART.tabs
},
{
  id:'frt-tabs', area:'Start here', date:'2026-07-26', compact:true,
  title:'Get around the four tabs',
  pts:['<b>Project Info</b> is the record, <b>Drawings</b> the plans, <b>Deficiencies</b> the findings, <b>Photos</b> everything you shot.',
       'The Deficiencies tab carries a count of what is still open.',
       'Tap Back or the logo to leave \u2014 it saves first, no prompt, nothing lost.'],
  chips:[['Everyone','c-where']],
  terms:'tabs navigate move between sections project info drawings deficiencies photos back leave exit count badge',
  art:ART.tabs
},

/* ═══ PROJECT INFO ═══ */
{
  id:'frt-fill-info', area:'Project Info', date:'2026-07-25', compact:true,
  title:'Fill in the project record',
  pts:['Enter the <b>client and project address</b> \u2014 they print in the report header on every page.',
       'Set the <b>Date of Inspection</b> to the day you walked the site; Date of Issue fills when you issue.',
       'These fields feed the PDF cover directly, so fix a typo here and the report follows.'],
  chips:[['Project Info','c-where']],
  terms:'client address date of inspection issue modified project record fill in details cover page header typo change',
  art:ART.info
},
{
  id:'frt-set-name', area:'Project Info', date:'2026-07-25', compact:true,
  title:'Put your name on your work',
  pts:['Open the header menu and choose <b>Set Name</b>.',
       'Your name then rides on the activity log and shows others you are in the project.',
       'Do this once per device \u2014 it sticks.'],
  chips:[['Everyone','c-where']],
  terms:'set name inspector who am i identity activity log presence working in project device',
  art:ART.info
},

/* ═══ DRAWINGS ═══ */
{
  id:'frt-upload-drawings', area:'Drawings', date:'2026-07-24', compact:true,
  title:'Upload your drawings',
  pts:['On the Drawings tab, drop PDF or image files straight in \u2014 or use the upload button.',
       'Multi-page PDFs split into sheets automatically; a Processing badge shows while they cook.',
       'You can cancel an upload mid-way if you grabbed the wrong file.'],
  chips:[['Drawings','c-where']],
  terms:'upload drawings add plans pdf image sheets pages processing import cancel wrong file drop',
  art:ART.sheet
},
{
  id:'frt-folders', area:'Drawings', date:'2026-07-24', compact:true,
  title:'Organize sheets into folders',
  pts:['Group sheets by area or discipline: select them and <b>Save to New Folder</b>.',
       'Rename a folder from its header; All folders shows everything at once.',
       '<b>Select all in folder</b> grabs a whole folder for a batch action in one tap.'],
  chips:[['Drawings','c-where']],
  terms:'folders organize group sheets move save to new folder rename select all discipline area sort',
  art:ART.folder
},
{
  id:'frt-rename-sheets', area:'Drawings', date:'2026-07-24', compact:true,
  title:'Rename sheets \u2014 one or many',
  pts:['Open a sheet\u2019s menu to <b>Rename Drawing</b> \u2014 the original name is kept alongside.',
       '<b>Batch rename</b> fixes a whole selection in one pass.',
       'Good names matter: the sheet name is what prints under drawing crops in the report.'],
  chips:[['Drawings','c-where']],
  terms:'rename sheet drawing name batch rename many original name title prints report label fix names',
  art:ART.sheet
},
{
  id:'frt-scale', area:'Drawings', date:'2026-07-23', compact:true,
  title:'Set the drawing scale, then measure',
  pts:['Open the drawing, pick the <b>dimension tool</b>, and trace a length you know \u2014 a door, a grid bay.',
       'Type its real length in feet and inches and <b>Save scale</b> \u2014 the sheet is now calibrated.',
       'Every dimension you draw after that reads true. Re-calibrating offers to update all dimensions or only measured ones.'],
  chips:[['Drawings','c-where']],
  terms:'scale calibrate measure dimension tool feet inches known length set scale update all measured only true distance',
  art:ART.scale
},
{
  id:'frt-redact-seal', area:'Drawings', date:'2026-07-23', compact:true,
  title:'Redact a seal before sharing',
  pts:['Turn on <b>seal redaction mode</b> when a drawing carries a stamp that must not go out.',
       'Draw the redaction over the seal \u2014 it exports blacked out.',
       'The underlying drawing is untouched; redaction is a layer, not an edit.'],
  chips:[['Drawings','c-where']],
  terms:'seal redaction redact stamp engineer seal hide black out cover share drawing export confidential',
  art:ART.redact
},

/* ═══ DRAWING VIEWER ═══ */
{
  id:'frt-viewer-basics', area:'Drawing viewer', date:'2026-07-22', compact:true,
  title:'Open a drawing and get around',
  pts:['Tap a sheet to open the viewer. <b>Pinch or scroll to zoom, drag to pan</b>.',
       'The toolbar holds every tool; tap one to arm it, tap again or press Escape to put it away.',
       'Escape cancels the active tool only \u2014 it never closes the viewer.'],
  chips:[['Drawing viewer','c-where']],
  terms:'open drawing viewer zoom pan pinch scroll navigate toolbar escape close basics move around',
  art:ART.sheet
},
{
  id:'frt-pen', area:'Drawing viewer', date:'2026-07-22', compact:true,
  title:'Draw and highlight',
  pts:['<b>Pen</b> draws freehand; <b>highlight</b> lays translucent colour that never darkens where strokes overlap.',
       'Pick colours from the toolbar before or while drawing.',
       'Your marks live on their own layer \u2014 the drawing underneath is never altered.'],
  chips:[['Drawing viewer','c-where']],
  terms:'pen draw freehand highlight highlighter marker colour color overlap layer sketch annotate',
  art:ART.pen
},
{
  id:'frt-text-tool', area:'Drawing viewer', date:'2026-07-22', compact:true,
  title:'Add text notes',
  pts:['Arm the <b>text tool</b> and tap where the note belongs; type, use New line for a second row.',
       'Set <b>text colour and background colour</b> so the note reads over any drawing.',
       'Place confirms it; Discard throws it away.'],
  chips:[['Drawing viewer','c-where']],
  terms:'text note label callout type words background colour place discard new line write on drawing',
  art:ART.text
},
{
  id:'frt-polyline', area:'Drawing viewer', date:'2026-07-22', compact:true,
  title:'Draw straight runs',
  pts:['The <b>polyline tool</b> draws straight segments \u2014 tap each corner in turn.',
       'Perfect for tracing pipe runs or marking a route.',
       'Confirm to keep it; Cancel abandons the run.'],
  chips:[['Drawing viewer','c-where']],
  terms:'polyline straight line segments pipe run route trace corners multi point draw lines',
  art:ART.poly
},
{
  id:'frt-dimension', area:'Drawing viewer', date:'2026-07-22', compact:true,
  title:'Measure on the drawing',
  pts:['With the sheet calibrated, arm the <b>dimension tool</b> and drag between two points.',
       'The true distance draws on the sheet in feet and inches.',
       'Not calibrated yet? It walks you through setting the scale first.'],
  chips:[['Drawing viewer','c-where']],
  terms:'measure dimension distance between points feet inches length how far calibrated ruler',
  art:ART.scale
},
{
  id:'frt-eraser', area:'Drawing viewer', date:'2026-07-21', compact:true,
  title:'Erase your marks',
  pts:['The <b>eraser</b> removes your pen, highlight and other marks \u2014 rub across them.',
       'It only ever touches your markup layer; the drawing itself cannot be erased.',
       'For one precise mark, select it instead and delete just that.'],
  chips:[['Drawing viewer','c-where']],
  terms:'erase eraser remove marks rub out delete markup undo drawing safe mistake',
  art:ART.erase
},
{
  id:'frt-select-marks', area:'Drawing viewer', date:'2026-07-21', compact:true,
  title:'Select, move and copy marks',
  pts:['Arm <b>select</b>, then tap marks to pick them \u2014 they glow with a green check. Or drag a rubber-band around several.',
       'Tap <b>\u2713</b> to group your picks into one amber box, then drag the box to move them together.',
       'Tap a grouped mark for <b>Unlink</b> \u2014 it leaves the group but stays on the drawing. The copy handle duplicates the whole selection.'],
  chips:[['Drawing viewer','c-where'],['Photos','c-where']],
  terms:'select move marks group ungroup unlink drag pick rubber band lasso copy duplicate reposition amber check',
  art:ART.select
},

/* ═══ PINS & THE PIN EDITOR ═══ */
{
  id:'frt-record-defic', area:'Pins', date:'2026-07-26', isNew:true, compact:true,
  title:'Record a deficiency on a drawing',
  pts:['Open the drawing, arm the <b>pin tool</b>, and tap the spot \u2014 a numbered pin drops and opens for editing.',
       'Describe what you found, set the priority, and add photos right there.',
       'Close with \u2715 or Escape \u2014 it is already saved. The pin number now appears on the drawing and in the Deficiencies tab.'],
  chips:[['Start here','c-new'],['Drawing viewer','c-where']],
  terms:'record deficiency create new add pin drop tap spot problem found write up first how do i log',
  art:ART.pin
},
{
  id:'frt-add-obs', area:'Pins', date:'2026-07-25', compact:true,
  title:'Add another problem at the same spot',
  pts:['Open the pin and <b>add an observation</b> \u2014 it appears as its own tab (Obs A, Obs B\u2026).',
       'Each observation carries its own description, priority, photos and contractor.',
       'One spot, one pin, however many findings \u2014 the report groups them under that pin number.'],
  chips:[['Pins','c-where']],
  terms:'add observation second problem same spot same location obs a b another finding multiple tab',
  art:ART.obs
},
{
  id:'frt-open-pin-editor', area:'Pins', date:'2026-07-25', compact:true,
  title:'Open the pin editor from anywhere',
  pts:['Tap a <b>Board card</b> to edit that one observation; tap a table row or the pin on the drawing to open the whole pin.',
       'From any photo, <b>Open in pin editor</b> jumps to the pin that photo belongs to.',
       'It closes only on \u2715 or Escape \u2014 a stray tap outside cannot lose your edits.'],
  chips:[['Pins','c-where']],
  terms:'open pin editor edit deficiency board card table row from photo focused close escape ways in',
  art:ART.pin
},
{
  id:'frt-place-pin-later', area:'Pins', date:'2026-07-24', compact:true,
  title:'Pin a deficiency written off-drawing',
  pts:['Created a deficiency without a location? Its editor shows <b>Place on a drawing</b>.',
       'Tap it, pick the sheet, tap the spot \u2014 the pin lands and the two are linked.',
       '<b>Open in drawing viewer \u2197</b> in any editor jumps you to the pin on its sheet.'],
  chips:[['Pins','c-where']],
  terms:'place on drawing pin later no location add pin to existing written first jump to drawing open viewer',
  art:ART.pin
},

/* ═══ DEFICIENCIES ═══ */
{
  id:'frt-priority', area:'Deficiencies', date:'2026-07-23', compact:true,
  title:'Set priority and type',
  pts:['Mark a failure <b>High</b> or <b>Low</b> priority \u2014 that drives its colour and where it sorts.',
       'Use <b>General</b> for observations that are not failures, and <b>Recommendation</b> for advice.',
       'Recommendations can be kept out of the report entirely at export time.'],
  chips:[['Deficiencies','c-where']],
  terms:'priority high low general recommendation type severity what kind classify observation advice',
  art:ART.severity
},
{
  id:'frt-status-flow', area:'Deficiencies', date:'2026-07-23', compact:true,
  title:'Walk a deficiency to closed',
  pts:['A finding starts <b>Open</b>, turns <b>Reported</b> once it has gone out in an issued report, and ends <b>Closed</b> when verified fixed.',
       'Tap the status control on a card to change it.',
       'Closing asks for <b>closing remarks</b> \u2014 what you saw that satisfied you. Closed this report and previously closed are kept apart.'],
  chips:[['Deficiencies','c-where']],
  terms:'status open reported closed change cycle close remarks note verified fixed resolved walk flow',
  art:ART.severity
},
{
  id:'frt-assign-contractor', area:'Deficiencies', date:'2026-07-22', compact:true,
  title:'Assign the contractor',
  pts:['In the observation, tap <b>Assign</b> and pick from existing contractors \u2014 or <b>New contractor\u2026</b> with a name and trade.',
       'Trades group them, so the report can split work by discipline.',
       'Rename or delete a contractor from its row menu; the list is shared across the project.'],
  chips:[['Deficiencies','c-where']],
  terms:'assign contractor new trade responsible who fixes create rename delete company abc sprinklers discipline',
  art:ART.contractor
},
{
  id:'frt-find-defic', area:'Deficiencies', date:'2026-07-22', compact:true,
  title:'Find any deficiency fast',
  pts:['The search box takes a <b>pin number, contractor name or any words</b> from the text.',
       'Filter by Outstanding / high / low / Closed / New this report \u2014 or view <b>By contractor</b>.',
       'Filters and search stack, so \u201Coutstanding + this contractor\u201D is two taps.'],
  chips:[['Deficiencies','c-where']],
  terms:'find search filter outstanding high low closed new this report by contractor pin number locate where is',
  art:ART.search
},
{
  id:'frt-reopen', area:'Deficiencies', date:'2026-07-21', compact:true,
  title:'Reopen a closed deficiency',
  pts:['Fix did not hold? Use <b>Select for reopen</b> on the closed item.',
       'It returns to Outstanding with its history intact \u2014 nothing is rewritten.',
       'The activity log records the reopen, so the paper trail stays honest.'],
  chips:[['Deficiencies','c-where']],
  terms:'reopen closed again failed fix came back select for reopen history outstanding return',
  art:ART.trash
},
{
  id:'frt-move-obs', area:'Deficiencies', date:'2026-07-21', compact:true,
  title:'Move an observation to the right place',
  pts:['Filed it on the wrong pin? <b>Move</b> lists every other pin \u2014 pick the destination.',
       '<b>Move to Site Records</b> takes it out of the deficiency list entirely for general site notes.',
       'Photos travel with the observation.'],
  chips:[['Deficiencies','c-where']],
  terms:'move observation wrong pin transfer site records relocate change pin filed wrong place photos travel',
  art:ART.send
},
{
  id:'frt-activity-log', area:'Deficiencies', date:'2026-07-20', compact:true,
  title:'See what happened on a pin',
  pts:['Open the pin\u2019s <b>Activity Log</b> for the full trail \u2014 status changes, assignments, closes and reopens, with names and times.',
       'Useful when a contractor disputes when something was reported.',
       'The log writes itself; you never maintain it.'],
  chips:[['Deficiencies','c-where']],
  terms:'activity log history trail who changed when audit dispute record timeline what happened',
  art:ART.log
},

/* ═══ PHOTOS ═══ */
{
  id:'frt-add-photos', area:'Photos', date:'2026-07-20', compact:true,
  title:'Add photos \u2014 three ways, anywhere',
  pts:['Every photo spot takes <b>drag & drop, an Upload button and a Camera button</b>.',
       'Camera opens burst mode \u2014 shoot several without leaving; a Library button inside pulls from the gallery.',
       'Photos land as Site, General or Deficiency photos depending on where you added them.'],
  chips:[['Photos','c-where']],
  terms:'add photo upload camera burst drag drop library gallery site general deficiency picture evidence take',
  art:ART.photo
},
{
  id:'frt-markup-photo', area:'Photos', date:'2026-07-19', compact:true,
  title:'Mark up a photo',
  pts:['Open the photo and draw \u2014 arrows, circles, text \u2014 to point at the problem.',
       'The <b>original stays clean underneath</b>; erasing your marks rolls it straight back.',
       'Add a caption and set the photo date from the same screen.'],
  chips:[['Photos','c-where']],
  terms:'markup photo draw annotate arrow circle caption date original clean erase revert point out',
  art:ART.markup
},
{
  id:'frt-send-to-pin', area:'Photos', date:'2026-07-19', compact:true,
  title:'Send a photo to the right pin',
  pts:['From any photo, <b>Send to a pin</b> or <b>Move or copy to another pin</b> \u2014 pick the destination.',
       'An undo chip appears right after (\u201CJust added \u00B7 \u21A9\u201D) \u2014 one tap takes it back.',
       'Copying keeps it in both places; moving leaves no copy behind.'],
  chips:[['Photos','c-where']],
  terms:'send photo to pin move copy another pin wrong pin reassign undo just added transfer attach',
  art:ART.send
},
{
  id:'frt-select-photos', area:'Photos', date:'2026-07-18', compact:true,
  title:'Work on many photos at once',
  pts:['Tap <b>Select</b> to enter select mode, then tap photos \u2014 or Select all / Deselect all.',
       'Bulk actions then apply to the whole selection.',
       'The All Photos view gathers every photo in the project; filters split Site / General / Deficiency.'],
  chips:[['Photos','c-where']],
  terms:'select mode many photos bulk multiple all photos filter site general deficiency batch clear selection',
  art:ART.select
},
{
  id:'frt-delete-photos', area:'Photos', date:'2026-07-18', compact:true,
  title:'Delete a photo \u2014 and get it back',
  pts:['<b>Delete photo</b> is recoverable \u2014 <b>Restore</b> brings it back.',
       '<b>Delete forever</b> is permanent and says so before it acts.',
       'Download saves the full-quality file to the device. The Photo Delete Log shows what was deleted, by whom, when.'],
  chips:[['Photos','c-where']],
  terms:'delete photo recover restore forever permanent download save device delete log who deleted undo trash',
  art:ART.trash
},

/* ═══ CONTRACTOR RESPONSES ═══ */
{
  id:'frt-import-crb', area:'Contractor responses', date:'2026-07-17', compact:true,
  title:'Bring contractor responses in',
  pts:['Header menu \u2192 <b>Import Responses</b>, and pick the response file the contractor sent back.',
       'Replies file themselves onto the right deficiencies, photos included.',
       'A reply that lands after you issued is flagged \u2014 you will know the issued sheet is stale.'],
  chips:[['Contractor responses','c-where']],
  terms:'import responses contractor reply crb bring in file received answer late stale flag',
  art:ART.crb
},
{
  id:'frt-review-thread', area:'Contractor responses', date:'2026-07-17', compact:true,
  title:'Review the thread and close it out',
  pts:['Each deficiency carries its own <b>response thread</b> \u2014 read replies and add your comment inline.',
       'The contractor saying \u201Cdone\u201D does not close anything: <b>you verify and close</b>, with remarks.',
       'The thread prints with the deficiency, so the record shows the whole exchange.'],
  chips:[['Contractor responses','c-where']],
  terms:'response thread review comment reply verify accept close conversation exchange record print',
  art:ART.crb
},

/* ═══ AI REVIEW ═══ */
{
  id:'frt-ai-review', area:'AI review', date:'2026-07-16', compact:true,
  title:'Let AI polish your write-ups',
  pts:['Header menu \u2192 AI Review: <b>Full Review</b> suggests improvements, <b>Full Rewrite</b> redrafts each description.',
       'Every suggestion shows Original next to Suggested \u2014 Accept, append, or skip per item, or Accept All.',
       'Nothing changes until you accept; your words stay yours.'],
  chips:[['AI review','c-where']],
  terms:'ai review rewrite polish descriptions suggestions accept skip append improve grammar professional wording',
  art:ART.ai
},
{
  id:'frt-ai-usage', area:'AI review', date:'2026-07-16', compact:true,
  title:'Watch AI usage and cost',
  pts:['<b>Usage & Costs</b> in the header menu shows what the AI features have consumed.',
       'Broken down per run, so a heavy rewrite session is visible.',
       'Check it before running Full Rewrite across a very large project.'],
  chips:[['AI review','c-where']],
  terms:'usage costs ai spend consumption tokens how much price track budget',
  art:ART.ai
},

/* ═══ REPORTS & EXPORT ═══ */
{
  id:'frt-export-pdf', area:'Reports', date:'2026-07-26', isNew:true, compact:true,
  title:'Export the PDF report',
  pts:['<b>Export PDF</b> opens the options panel. Pick the <b>scope</b>: everything, exclude recommendations, or recommendations only.',
       'Set <b>photo quality and drawing detail</b> \u2014 higher looks better and weighs more; sheet size defaults to Letter portrait.',
       '<b>Export Report</b> builds it. What the report will include is listed before you commit.'],
  chips:[['Reports','c-where']],
  terms:'export pdf report options scope quality dpi drawing detail sheet size letter exclude recommendations build generate client',
  art:ART.pdf
},
{
  id:'frt-distribution', area:'Reports', date:'2026-07-15', compact:true,
  title:'Choose who the report addresses',
  pts:['The <b>Distribution</b> block lists recipients \u2014 the Owner is always on it.',
       'Tick the contractors it concerns; the export needs at least one.',
       'Other recipients adds anyone else by name for the distribution line.'],
  chips:[['Reports','c-where']],
  terms:'distribution recipients owner contractors other who gets report address list send to',
  art:ART.pdf
},
{
  id:'frt-issue', area:'Reports', date:'2026-07-15', compact:true,
  title:'Issue the report',
  pts:['<b>Issue Report</b> stamps this revision as issued and sets the Date of Issue.',
       'Open findings flip to <b>Reported</b> \u2014 they are now formally on record.',
       'Contractor replies arriving after this moment get flagged against the issued sheet.'],
  chips:[['Reports','c-where']],
  terms:'issue report formally send out stamp date of issue reported revision record official',
  art:ART.issue
},
{
  id:'frt-json', area:'Reports', date:'2026-07-14', compact:true,
  title:'Back up or hand off the project',
  pts:['<b>Download JSON</b> saves the whole project to a file; <b>Import JSON</b> loads one back in.',
       '<b>Export Project Docs</b> packages the supporting documents for delivery.',
       'A JSON in your files is the belt-and-braces backup before anything drastic.'],
  chips:[['Reports','c-where']],
  terms:'backup json download import load hand off transfer export project docs package save file restore',
  art:ART.json
},

/* ═══ EVERYDAY REFERENCE ═══ */
{
  id:'frt-cloud-dots', area:'Everyday reference', date:'2026-07-13', compact:true,
  title:'Read the cloud and photo dots',
  pts:['<b>Green cloud with a check</b>: safely uploaded. <b>Brown</b>: still going up.',
       '<b>Red</b>: an upload failed and will be retried. <b>Grey</b>: only on this device so far.',
       'They turn green on their own as uploads finish \u2014 no refresh needed.'],
  chips:[['Everyone','c-where']],
  terms:'cloud dot status green brown red grey upload sync photo safe pending failed local meaning colour',
  art:ART.cloud
},
{
  id:'frt-fix-photos', area:'Everyday reference', date:'2026-07-13', compact:true,
  title:'When a photo looks missing',
  pts:['Header menu \u2192 <b>Repair Photos</b> re-links pictures showing blank after a sync hiccup.',
       '<b>Re-upload All Photos</b> pushes anything still local up to the cloud.',
       'Run these before assuming a photo is gone \u2014 it is almost always still there.'],
  chips:[['Everyone','c-where']],
  terms:'photo missing blank broken not showing repair photos reupload re-upload fix recover lost gone',
  art:ART.repair
},
{
  id:'frt-qr-tablet', area:'Everyday reference', date:'2026-07-12', compact:true,
  title:'Open this project on a tablet',
  pts:['Tap the <b>QR button</b> in the header \u2014 it shows this project as a code.',
       'Scan it with the tablet and the same project opens there.',
       'No typing project numbers into a field device.'],
  chips:[['Everyone','c-where']],
  terms:'qr code tablet scan open on device transfer phone field no typing',
  art:ART.qr
},
{
  id:'frt-admin-tools', area:'Everyday reference', date:'2026-07-12', compact:true,
  title:'Admin & maintenance tools',
  pts:['<b>R2 Cleanup</b> and the <b>Orphan Report</b> tidy cloud storage; the <b>Reset</b> family wipes a page, tab or the whole project.',
       'These are deliberate, confirmed actions for administrators \u2014 not part of a normal review.',
       'If you think you need a Reset, export a JSON backup first.'],
  chips:[['Admin only','c-admin']],
  terms:'admin r2 cleanup orphan report reset page tab project idb maintenance dangerous wipe backup first',
  art:ART.repair
}
];

registerHelp({
  tool: 'FRT',
  areas: ['Start here','Project Info','Drawings','Drawing viewer','Pins','Deficiencies','Photos','Contractor responses','AI review','Reports','Everyday reference'],
  cards: CARDS
});
