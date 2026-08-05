
// S461f — PWA registration. The old block here UNREGISTERED every service
// worker on load (a ghost-cleanup for sw-diesel.js, which never existed) —
// which meant opening Diesel silently KILLED the FRT PWA's offline capability
// on that device. The root sw.js has always been the TOOLKIT's worker (root
// scope); Diesel now registers it like FRT does, and its shell is precached.
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('../sw.js').then(function(reg){
      /* S617 — "Update ready — tap to restart". Updates already install in
         the background; this is the missing last step: tell the person, let
         THEM choose the moment. nudge:false — this file's own interval below
         already checks. */
      try{ if(window.ArcUpdateReady) ArcUpdateReady.init(reg, {nudge:false}); }catch(_){ }
      setInterval(function(){
        // reg.update() throws InvalidStateError mid-install/activate — guard +
        // swallow so a transient state never surfaces as an uncaught rejection.
        try{ var p=reg.update(); if(p&&p.catch){ p.catch(function(){}); } }
        catch(e){ /* SW not in a state to update yet; ignore */ }
      },30*60*1000);
    }).catch(function(err){console.warn('[SW] Registration failed:',err);});
  });
}
