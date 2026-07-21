
var PHASES = {  setup:    { label:'Setup',    panels:[
    {id:'proj',  label:'Summary'},
    {id:'s1',    label:'1. Pre-Commissioning', dot:true},
    {id:'s2',    label:'2. Visual Inspection', dot:true}
  ]},
  tests:    { label:'Tests',    panels:[
    {id:'s3',    label:'3. Controller Tests', dot:true},
    {id:'s4',    label:'4. Performance Test', dot:true},
    {id:'s5',    label:'5. FA & Signaling', dot:true}
  ]},
  closeout: { label:'Closeout', panels:[
    {id:'defic', label:'6. Deficiencies', badge:true},
    {id:'sign',  label:'7. Signature'},
    {id:'sketch',label:'8. Sketches'},
    {id:'photos',label:'Photos'}
  ]}
};
function _phaseOf(panelId){
  for(var ph in PHASES){ if(PHASES[ph].panels.some(function(p){return p.id===panelId;})) return ph; }
  return 'setup';
}
var _activePhase = 'setup';
function renderSubNav(phase){
  var nav = document.getElementById('section-nav');
  if(!nav) return;
  var activePanel = null;
  // which panel is currently active?
  for(var ph in PHASES){ PHASES[ph].panels.forEach(function(p){ var el=document.getElementById('panel-'+p.id); if(el&&el.classList.contains('active')) activePanel=p.id; }); }
  var html='';
  // S250: phase bar removed — render ALL panels across every phase in one scrollable row (FRT-style).
  // `phase` arg is ignored; kept for caller compatibility.
  for(var phk in PHASES){ PHASES[phk].panels.forEach(function(p){
    var cls = 'nav-tab' + (p.id===activePanel?' active':'');
    var inner = p.label;
    if(p.dot) inner += '<span class="tab-dot" id="dot-'+p.id+'"></span>';
    if(p.badge) inner += '<span class="tab-count" id="defic-tab-count" style="display:none;"></span>';
    // S280: Summary tab carries the overall verdict status dot
    if(p.id==='proj') inner += '<span class="verdict-dot" id="verdict-tab-dot"></span>';
    html += '<div class="'+cls+'" id="tab-'+p.id+'" onclick="switchPanel(\''+p.id+'\')">'+inner+'</div>';
  }); }
  nav.innerHTML = html;
  // refresh the dot/badge state now that elements were recreated
  if(typeof updateProgress==='function') { /* dots refreshed via updateProgress */ }
  // S280: nav rebuild recreates #verdict-tab-dot empty — re-apply its state
  if(typeof updateVerdict==='function') updateVerdict();
}
function switchPhase(phase){
  // Clicking a phase pill navigates to the FIRST panel of that phase so the sub-nav,
  // its active highlight, and the content below all stay in sync.
  if(typeof PHASES!=='undefined' && PHASES[phase] && PHASES[phase].panels.length){
    switchPanel(PHASES[phase].panels[0].id);
    return;
  }
  _activePhase = phase;
  document.querySelectorAll('.phase-tab').forEach(function(t){ t.classList.remove('active'); });
  var pt = document.getElementById('phase-'+phase); if(pt) pt.classList.add('active');
  renderSubNav(phase);
  // refresh dots + badge for the freshly-rendered tabs
  if(typeof updateProgress==='function') updateProgress();
  if(typeof updateDeficTabBadge==='function') updateDeficTabBadge();
}
function updatePhaseFlags(){
  // Closeout flag = open deficiency count
  var flag = document.getElementById('phase-closeout-flag');
  if(!flag) return;
  var open = 0;
  try { open = (contractors.flatMap(function(n){return deficiencies[n]||[];}).concat(generalDeficiencies||[])).filter(function(d){return (d.status||'open')!=='resolved';}).length; }
  catch(e){ open = 0; }
  if(open>0){ flag.style.display='inline-flex'; flag.textContent='\u2691 '+open; }
  else { flag.style.display='none'; }
}
