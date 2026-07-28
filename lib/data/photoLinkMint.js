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
var _PLM_CACHE_KEY = 'arencon-plm-tokens';

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

/* Stored r2Key -> actual bucket key. photos/{pid}/{rest} -> {pid}/photos/{rest}. */
export function toBucketKey(k){
  if (!k || typeof k !== 'string') return '';
  var parts = k.split('/').filter(Boolean);
  if (parts.length < 2) return k;
  if (parts[0] === 'photos') return parts[1] + '/photos/' + parts.slice(2).join('/');
  return k;
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
      // derive from URL path: .../{pid}/photos/... — take the pathname verbatim
      try { bk = new URL(p.r2Url).pathname.replace(/^\//, ''); } catch(e){}
    }
    if (bk) keyByPhoto.set(p, bk);
  });
  var keys = []; keyByPhoto.forEach(function(v){ keys.push(v); });
  return mintTokens(keys).then(function(tokenByKey){
    return {
      href: function(p){
        var bk = keyByPhoto.get(p);
        var tok = bk && tokenByKey[bk];
        return tok ? (PLM_WORKER + '/p/' + tok) : '';
      },
      minted: Object.keys(tokenByKey).length,
      total: keys.length
    };
  });
}
