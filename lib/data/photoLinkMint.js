/* ARENCON — SHARED PHOTO LINK MINT (durable /p/{token} URLs for report photos)
   ============================================================================
   S512, Lane C. The capture export bakes any <a href> in the preview into a
   real PDF /Link annotation — but a link is only worth baking if it still
   works when the client opens the report months later, and if it exposes
   nothing. Two wrong ways, both rejected:

     • raw r2Url — leaks the account's R2 URL structure into a document that
       leaves the company, and FRT's privacy rule (its beta renderer) already
       forbids exactly this: "the raw account URL is never exposed."
     • dataURL — megabytes of base64 inside an href; not a link at all.

   The right way is the one FRT already proved: POST the photos' bucket keys to
   the R2 worker's /mintlinks (authed with the user's Supabase JWT) and receive
   opaque tokens; the printed link is https://files.arencon.app/p/{token}. The
   worker owns resolution, so links survive any viewer or re-save.

   The three helpers here are lifted from frt/js/export/pdf.js and kept
   call-compatible; only the localStorage cache key differs (namespaced
   'arencon-plm-tokens' so the two tools' caches never collide). Minted tokens
   are cached forever — a re-export mints only photos it has never minted.

   FAILURE POLICY (identical to FRT's): any photo whose key can't be derived or
   minted is rendered WITHOUT a link. No auth, no network, worker down — the
   export still completes, just with fewer clickable photos. A report that
   cannot be produced on site because a link service hiccuped would be a worse
   tool than one with a plain photo.

   Diesel photo model note: r2Key is stored as 'photos/{pid}/…' but the BUCKET
   key is '{pid}/photos/…' (Platform PK: "the bucket key differs"). toBucketKey
   performs that swap, verbatim from FRT's _toR2BucketKey.
   ========================================================================== */

var PLM_WORKER = 'https://files.arencon.app';
/* S515 — CACHE KEY BUMPED, AND THIS IS NOT COSMETIC. Every token minted before
   this fix came from a swapped (wrong) bucket key, so every one of them is a
   valid token pointing at an object that does not exist. They are cached
   forever by design. Without renaming the cache, any device that exported once
   tonight would keep serving those dead tokens from localStorage and the fix
   would appear not to work — the most confusing possible outcome. Renaming
   orphans the poisoned entries and forces a clean re-mint on the next export.
   Bump this again if the key derivation ever changes. */
var _PLM_CACHE_KEY = 'arencon-plm-tokens-v3';

function _plmJwt(){
  try { var t = localStorage.getItem('sb-access-token'); if (t) return t; } catch(e){}
  return '';
}
function _plmLoadCache(){
  try { var s = localStorage.getItem(_PLM_CACHE_KEY); return s ? JSON.parse(s) : {}; } catch(e){ return {}; }
}
function _plmSaveCache(c){
  try { localStorage.setItem(_PLM_CACHE_KEY, JSON.stringify(c)); } catch(e){}
}

/* Stored r2Key -> the two CANDIDATE bucket keys, in confidence order.

   S516 — TWO SESSIONS OF GUESSING END HERE. History:
     S512 swapped photos/{slug}/… -> {slug}/photos/…, per FRT's comment that
          the worker's own urlPathToR2Key does that swap. Links were dead.
     S515 I "measured" it: GET on the stored path returned 200, GET on the
          swapped path 404, so I removed the swap. That inference was WRONG.
          The URL path and the bucket key are different things — the worker
          serves photos/{slug}/… publicly and swaps internally before touching
          the bucket. My test proved the URL form serves images; it said
          nothing about which string /mintlinks hashes. Links then vanished
          entirely, which is how we know.

   Neither doc can settle it and neither can a GET. So: mint BOTH forms, then
   probe which one actually resolves, and use the winner. This is what FRT did
   before it narrowed to one form ("send BOTH candidate forms per photo and
   accept whichever the worker mints"). The cost is one extra KV entry per
   photo on first export, cached forever after. The benefit is that the tool
   discovers the answer from the worker instead of from a comment, and keeps
   working if the worker's mapping ever changes again. */
export function keyCandidates(k){
  if (!k || typeof k !== 'string') return [];
  var clean = k.replace(/^\/+/, '');
  var parts = clean.split('/').filter(Boolean);
  var swapped = '';
  if (parts.length >= 2 && parts[0] === 'photos'){
    swapped = parts[1] + '/photos/' + parts.slice(2).join('/');
  }
  // swapped first: it is the form the worker source is documented to hash
  return swapped ? [swapped, clean] : [clean];
}
/* Back-compat: the first candidate is the documented bucket key. */
export function toBucketKey(k){ return keyCandidates(k)[0] || ''; }

/* keys: array of BUCKET keys. Resolves to { key: token } for every key it could
   mint (cached or fresh). Never rejects. On total failure resolves {} —
   callers must treat a missing token as "render without a link". */
export function mintTokens(keys){
  if (!keys || !keys.length) return Promise.resolve({});
  var uniq = {}; keys.forEach(function(k){ if (k) uniq[k] = 1; });
  var all = Object.keys(uniq);
  var cache = _plmLoadCache();
  var out = {}, toMint = [];
  all.forEach(function(k){ if (cache[k]) out[k] = cache[k]; else toMint.push(k); });
  if (!toMint.length) return Promise.resolve(out);
  var jwt = _plmJwt();
  if (!jwt) return Promise.resolve(out);
  return fetch(PLM_WORKER + '/mintlinks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
    body: JSON.stringify({ keys: toMint })
  }).then(function(r){ if (!r.ok) throw new Error('mint HTTP ' + r.status); return r.json(); })
    .then(function(j){
      var fresh = (j && j.links) || {};
      Object.keys(fresh).forEach(function(k){ out[k] = fresh[k]; cache[k] = fresh[k]; });
      _plmSaveCache(cache);
      return out;
    })
    .catch(function(){ return out; });
}

/* One call for report builders: photos in, { href(photo) } out.
   photos: array of Diesel/Electric photo objects ({ r2Key, r2Url, ... }).
   Resolves to a lookup that returns the opaque link for a photo, or '' when the
   photo has no minted token (unsynced, mint failed, offline). */
export function buildPhotoHrefs(photos){
  var candByPhoto = new Map();
  (photos || []).forEach(function(p){
    if (!p) return;
    var src = p.r2Key;
    if (!src && p.r2Url){
      try { src = new URL(p.r2Url).pathname.replace(/^\//, ''); } catch(e){}
    }
    var cands = keyCandidates(src);
    if (cands.length) candByPhoto.set(p, cands);
  });
  var keys = [];
  candByPhoto.forEach(function(c){ c.forEach(function(k){ keys.push(k); }); });
  if (!keys.length) return Promise.resolve({ href: function(){ return ''; }, minted:0, total:0, verified:false });

  return mintTokens(keys).then(function(tokenByKey){
    /* S516 — ASK THE WORKER WHICH FORM RESOLVES, then use that one for every
       photo. One HEAD per candidate form (two requests, once per export), not
       per photo. A form "wins" if its token does not come back 404/403.
       If neither wins, every photo prints UNLINKED and the console says so:
       a report with plain photos is honest; a report full of clickable dead
       links handed to a client is not. If the probes cannot run at all
       (offline, CORS), fall back to the documented form and keep the links —
       cached tokens must still work with no network. */
    var first = null;
    candByPhoto.forEach(function(c){ if (!first) first = c; });
    var probe = function(k){
      var tok = k && tokenByKey[k];
      if (!tok) return Promise.resolve(false);
      return fetch(PLM_WORKER + '/p/' + tok, { method: 'HEAD' })
        .then(function(r){ return !(r.status === 404 || r.status === 403); })
        .catch(function(){ return null; });   // null = could not determine
    };
    return probe(first[0]).then(function(okA){
      if (okA === true)  return { idx: 0, verified: true };
      if (okA === null)  return { idx: 0, verified: false, unknown: true };
      return probe(first[1]).then(function(okB){
        if (okB === true) return { idx: 1, verified: true };
        if (okB === null) return { idx: 0, verified: false, unknown: true };
        try { console.error('[photo links] neither key form resolves — photos will print ' +
          'unlinked. Tried: ' + first[0] + ' | ' + first[1]); } catch(_){}
        return { idx: -1, verified: false };
      });
    }).then(function(win){
      try { console.info('[photo links] key form ' +
        (win.idx < 0 ? 'NONE — links suppressed' : win.idx === 0 ? 'swapped ({slug}/photos/…)' : 'as-stored (photos/{slug}/…)') +
        (win.unknown ? ' (unverified — probe unreachable, links kept)' : '') +
        '; minted ' + Object.keys(tokenByKey).length + ' token(s)'); } catch(_){}
      return {
        href: function(p){
          if (win.idx < 0) return '';
          var c = candByPhoto.get(p);
          var tok = c && tokenByKey[c[win.idx]];
          return tok ? (PLM_WORKER + '/p/' + tok) : '';
        },
        verified: !!win.verified,
        keyForm: win.idx,
        minted: Object.keys(tokenByKey).length,
        total: candByPhoto.size
      };
    });
  });
}
