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
var _PLM_CACHE_KEY = 'arencon-plm-tokens-v4';

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

/* Stored r2Key -> the R2 bucket key the worker mints and resolves against.

   S517 — SETTLED FROM THE WORKER'S OWN SOURCE (arencon-r2-worker.js, in this
   repo), not from a comment and not from a guess:

       KEY FORMAT MAPPING (the critical part!):
         URL path:  /photos/{slug}/{tool}/{type}/{fname}
         R2 key:    {slug}/photos/{tool}/{type}/{fname}
         (photos and slug are SWAPPED between URL and R2 key)

   So the swap is correct and always was. My S515 "measurement" tested the URL
   path (which the worker swaps internally before touching the bucket) and I
   read that as evidence about the bucket key. Wrong instrument, confident
   conclusion, two wasted rounds. This is FRT's exact derivation, byte for
   byte, because FRT's production report has been minting links this way. */
export function toBucketKey(k){
  if (!k || typeof k !== 'string') return '';
  var parts = k.split('/').filter(Boolean);
  if (parts.length < 2) return k;
  if (parts[0] === 'photos') return parts[1] + '/photos/' + parts.slice(2).join('/');
  return k;   // already in {slug}/photos/... form
}
/* Kept for callers that want the candidate list; there is only one now. */
export function keyCandidates(k){ var b = toBucketKey(k); return b ? [b] : []; }

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
  var keyByPhoto = new Map();
  (photos || []).forEach(function(p){
    if (!p) return;
    var src = p.r2Key;
    if (!src && p.r2Url){
      try { src = new URL(p.r2Url).pathname.replace(/^\//, ''); } catch(e){}
    }
    var bk = toBucketKey(src || '');
    if (bk) keyByPhoto.set(p, bk);
  });
  var keys = []; keyByPhoto.forEach(function(v){ keys.push(v); });
  if (!keys.length) return Promise.resolve({ href: function(){ return ''; }, minted:0, total:0 });

  return mintTokens(keys).then(function(tokenByKey){
    /* S517 — THE PROBE NO LONGER SUPPRESSES ANYTHING, AND HERE IS WHY.
       S516 probed a freshly minted token and suppressed every link when it came
       back 404. It always came back 404, so the report printed no links at all.
       Route fingerprinting against the live worker explains it: /p/{token} is a
       handled route (it answers with the plain-text "Not Found" of a real
       handler, not the JSON of an unmatched path), and one of the keys we mint
       is PROVEN to exist — its public URL serves a 266KB JPEG. So the miss is
       the TOKEN lookup, not the object: tokens are written to KV at mint time
       and are not readable back milliseconds later. FRT never trips over this
       because it mints during its photo prefetch and then spends many seconds
       rendering before any link can be clicked.
       Suppressing on an instant probe therefore punishes the report for a
       propagation delay that will have resolved long before a client opens the
       PDF. Links are baked, exactly as FRT does it. The probe survives ONLY as
       a delayed diagnostic that writes to the console — it can never change
       what the report contains. */
    var minted = Object.keys(tokenByKey).length;
    try { console.info('[photo links] minted ' + minted + ' of ' + keys.length + ' key(s)'); } catch(_){}
    var firstKey = keys.find(function(k){ return tokenByKey[k]; });
    if (firstKey){
      setTimeout(function(){
        fetch(PLM_WORKER + '/p/' + tokenByKey[firstKey], { method: 'HEAD' })
          .then(function(r){
            try {
              if (r.status === 404 || r.status === 403){
                console.error('[photo links] DIAGNOSTIC: a minted link still did not resolve ' +
                  '10s after minting (HTTP ' + r.status + '). Key: ' + firstKey +
                  ' — this is NOT propagation; the key form or the mint route needs review.');
              } else {
                console.info('[photo links] DIAGNOSTIC: link resolved 10s after minting (HTTP ' +
                  r.status + ') — links in this report are good.');
              }
            } catch(_){}
          })
          .catch(function(){});
      }, 10000);
    }
    return {
      href: function(p){
        var bk = keyByPhoto.get(p);
        var tok = bk && tokenByKey[bk];
        return tok ? (PLM_WORKER + '/p/' + tok) : '';
      },
      minted: minted,
      total: keys.length
    };
  });
}
