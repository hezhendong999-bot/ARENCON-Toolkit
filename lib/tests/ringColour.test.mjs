/* ════════════════════════════════════════════════════════════════════
 * lib/tests/ringColour.test.mjs — the inspector ring is the colour the
 * person CHOSE, pulled from their account. Never a derived one.
 * Run:  node lib/tests/ringColour.test.mjs   (exit 0 = green)
 *
 * WHY THIS FILE EXISTS. Measured off a screenshot of 1490.04: a colleague's
 * ring painted #B972F7, exactly what his account holds; Mark's painted
 * #F2C4EF, slot 10 of the id-hash fallback palette, while his account held
 * #F419FF. Everyone resolved correctly except the person looking at the
 * screen — because sign-in seeds a LOCAL placeholder row so your own name
 * appears without a round trip, and resolveInspector returned that
 * placeholder and exited before the line that fetches the real record.
 * S628b had already marked such rows "partial, fetch anyway"; nothing could
 * ever read the flag, so that fix shipped and changed nothing. Twice is
 * enough — this asserts the OUTCOME (which hex the viewer would paint),
 * not the mechanism, so a future refactor cannot pass it while regressing.
 * ════════════════════════════════════════════════════════════════════ */
global.window = { addEventListener: (t,f)=>{ (global.__L=global.__L||{})[t]=f; },
                  dispatchEvent: e => { const f=(global.__L||{})[e.type]; if(f) f(e); } };
global.CustomEvent = class { constructor(t,o){ this.type=t; this.detail=(o||{}).detail; } };
const { Model, INSPECTOR_COLOR_PALETTE } = await import('../../frt/js/data/model.js');

const ME = '877c9ec2-e7d8-4ae1-8ff9-ab2619d0aa8f';   // Mark
const OTHER = '96745410-41b2-4c06-a0c5-785138aa7fe1'; // Elvis
const DB = { [ME]: { id: ME, full_name: 'Mark He', ring_color: '#F419FF' },
             [OTHER]: { id: OTHER, full_name: 'Elvis Ho', ring_color: '#B972F7' } };

let fetches = 0;
Model.setInspectorFetch(ids => { fetches++; return Promise.resolve(ids.map(i => DB[i]).filter(Boolean)); });
Model.setCurrentUser(ME);

let pass=0, fail=0;
const T=(n,c)=>{ if(c){pass++;} else {fail++; console.error('  ✗',n);} };

/* boot exactly as app.js does: seed my own name locally, no round trip */
Model.setInspectorEntry(ME, 'Mark He');

const seeded = Model.resolveInspector(ME).color;
T('placeholder still paints something immediately (no blank pin)', !!seeded);
T('placeholder colour is the guessed one, as before', INSPECTOR_COLOR_PALETTE.includes(seeded));

/* colleague, never seeded */
Model.resolveInspector(OTHER);

await new Promise(r => setTimeout(r, 20));

T('MY chosen colour is now what the viewer would paint',
  Model.inspectorColorFor(ME) === '#F419FF');
T("colleague's chosen colour unaffected",
  Model.inspectorColorFor(OTHER) === '#B972F7');
T('no guessed palette colour survives for a resolved person',
  !INSPECTOR_COLOR_PALETTE.includes(Model.inspectorColorFor(ME)));

/* re-asking must not re-fetch forever */
const before = fetches;
Model.resolveInspector(ME); Model.resolveInspector(ME);
await new Promise(r => setTimeout(r, 20));
T('resolved rows are not re-fetched (no request loop)', fetches === before);

/* LIVE SAVE: the panel writes, the model must follow without a reload */
let notified = 0;
Model.onChange('inspectors', () => notified++);
const { saveColour } = await import('../ui/headerIdentity.js');
window.dispatchEvent(new CustomEvent('arencon:ring-colour', { detail:{ userId: ME, colour:'#27FF24' } }));
T('a saved colour reaches the model with no reload', Model.inspectorColorFor(ME) === '#27FF24');
T('screens are told to repaint', notified >= 1);

/* a malformed announcement must never blank someone */
window.dispatchEvent(new CustomEvent('arencon:ring-colour', { detail:{ userId: ME, colour:'not-a-colour' } }));
T('garbage announcement ignored', Model.inspectorColorFor(ME) === '#27FF24');
window.dispatchEvent(new CustomEvent('arencon:ring-colour', { detail:{ userId: ME } }));
T('missing colour ignored', Model.inspectorColorFor(ME) === '#27FF24');

console.log(`ringColour.test.mjs — ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
