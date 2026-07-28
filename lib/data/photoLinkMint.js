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
var _PLM_CACHE_KEY = 'arencon-plm-tokens-v2';

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

/* Stored r2Key -> bucket key.

   S515 — THIS USED TO SWAP THE FIRST TWO SEGMENTS AND THAT WAS WRONG. The
   original was written from the Platform PK note "the bucket key differs"
   (photos/{pid}/… -> {pid}/photos/…). Measured against live R2, which serves
   GET unauthenticated so it can simply be asked:

     photos/{pid}/diesel/original/x.jpg   -> HTTP 200, 266,780 bytes
     {pid}/photos/diesel/original/x.jpg   -> HTTP 404
     photos/{proj}/frt/original/y.jpg     -> HTTP 200, 2,781,389 bytes
     {proj}/photos/frt/original/y.jpg     -> HTTP 404

   Both tools store the key EXACTLY as the live object path, and r2Url is that
   path appended to the worker origin. There is no swap. The PK note is wrong,
   or describes a layout that no longer exists — either way the bucket answered
   the question and the doc did not.

   Worse, /mintlinks mints a token for ANY key without checking that the object
   exists, so the swapped keys minted happily and produced links that were
   clickable and dead. Nothing failed loudly; the report just carried dead
   links. Identity is now the transform, and the export verifies rather than
   assumes (see buildPhotoHrefs). */
export function toBucketKey(k){
  if (!k || typeof k !== 'string') return '';
  return k.replace(/^\/+/, '');
}

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
    var bk = '';
    if (p.r2Key) bk = toBucketKey(p.r2Key);
    if (!bk && p.r2Url){
      // derive from URL path: the worker serves the bucket key verbatim
      try { bk = new URL(p.r2Url).pathname.replace(/^\//, ''); } catch(e){}
    }
    if (bk) keyByPhoto.set(p, bk);
  });
  var keys = []; keyByPhoto.forEach(function(v){ keys.push(v); });
  return mintTokens(keys).then(function(tokenByKey){
    /* S515 — PROBE ONE LINK BEFORE TRUSTING THE BATCH. /mintlinks returns a
       token for any key it is given, existing or not, so a wrong key format
       produced a report full of clickable dead links with nothing failing.
       One HEAD against a single minted link costs one round-trip and turns a
       silent class of bug into a console warning plus unlinked photos, which
       is the honest output when we cannot prove the links work. If the probe
       cannot run (offline, CORS), we keep the links — absence of proof is not
       proof of failure, and the cached-token path must still work offline. */
    var probeKey = Object.keys(tokenByKey)[0];
    var ok = Promise.resolve(true);
    if (probeKey){
      ok = fetch(PLM_WORKER + '/p/' + tokenByKey[probeKey], { method: 'HEAD' })
        .then(function(r){
          if (r.status === 404 || r.status === 403){
            try { console.error('[photo links] minted link does not resolve (HTTP ' + r.status +
              ') for key: ' + probeKey + ' — photos will print unlinked'); } catch(_){}
            return false;
          }
          return true;
        })
        .catch(function(){ return true; });   // could not probe: keep the links
    }
    return ok.then(function(good){
      return {
        href: function(p){
          if (!good) return '';
          var bk = keyByPhoto.get(p);
          var tok = bk && tokenByKey[bk];
          return tok ? (PLM_WORKER + '/p/' + tok) : '';
        },
        verified: good,
        minted: Object.keys(tokenByKey).length,
        total: keys.length
      };
    });
  });
}
