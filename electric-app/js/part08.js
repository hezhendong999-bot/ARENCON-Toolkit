
// Tab bar drag scroll (click-hold-drag on tabs or gaps)
var tabDrag = {};
document.querySelector('.section-nav')?.addEventListener('mousedown', function(e) {
  var nav = this;
  tabDrag = { nav: nav, startX: e.clientX, scrollLeft: nav.scrollLeft, active: true, moved: false, target: e.target };
  nav.style.cursor = 'grabbing';
  e.preventDefault();
});
document.addEventListener('mousemove', function(e) {
  if (!tabDrag.active) return;
  var delta = tabDrag.startX - e.clientX;
  if(Math.abs(delta) > 3) tabDrag.moved = true;
  tabDrag.nav.scrollLeft = tabDrag.scrollLeft + delta;
});
document.addEventListener('mouseup', function() {
  if (!tabDrag.active) return;
  if (tabDrag.nav) tabDrag.nav.style.cursor = 'grab';
  // If didn't drag, treat as click on the tab
  if(!tabDrag.moved && tabDrag.target && tabDrag.target.classList.contains('nav-tab')) {
    tabDrag.target.click();
  }
  tabDrag.active = false;
  tabDrag.moved = false;
});

