/**
 * ARENCON R2 Storage Worker — Cloudflare Worker
 * Handles photo/drawing storage in Cloudflare R2 bucket.
 *
 * R2 Binding: BUCKET → arencon-files
 * Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * KEY FORMAT MAPPING (the critical part!):
 *   URL path:  /photos/{slug}/{tool}/{type}/{fname}
 *   R2 key:    {slug}/photos/{tool}/{type}/{fname}
 *   (photos and slug are SWAPPED between URL and R2 key)
 *
 *   List URL:  /list/{slug}/{tool}/{type}
 *   R2 prefix: {slug}/photos/{tool}/{type}/
 *
 * Session 60 — reconstructed with correct path mapping.
 */

const ALLOWED_ORIGINS = [
  'https://hezhendong999-bot.github.io',
  'http://localhost',
  'http://127.0.0.1'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin && origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    // S129 Item 1.2 — allow conditional-write headers so the client can
    // send If-Match: <etag> on PUT for read-merge-write race protection.
    // Expose ETag on GET so the client can capture it from the response.
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Content-Type, If-Match, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

// S83: Hardcoded anon key as fallback when SUPABASE_SERVICE_KEY env secret is missing/rotated.
// This key is safe to embed — same anon key the frontend uses. /auth/v1/user only needs ANY
// valid apikey paired with the user's JWT. Service role gives no extra power for this call.
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';
const SUPABASE_URL_FALLBACK = 'https://xsemvinxsyphjiaqgywv.supabase.co';

async function validateAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'no-auth-header' };
  }
  const jwt = authHeader.replace('Bearer ', '');
  // Anon key alone is not a real user — reject so it doesn't grant write access.
  if (jwt === SUPABASE_ANON_KEY_FALLBACK || jwt === env.SUPABASE_ANON_KEY) {
    return { ok: false, reason: 'anon-key-not-user' };
  }
  const supaUrl = env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
  // Try service key first (preferred), then anon fallback (works for /auth/v1/user).
  const apikeys = [env.SUPABASE_SERVICE_KEY, env.SUPABASE_ANON_KEY, SUPABASE_ANON_KEY_FALLBACK].filter(Boolean);
  for (let i = 0; i < apikeys.length; i++){
    try {
      const res = await fetch(`${supaUrl}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': apikeys[i] }
      });
      if (res.ok) return { ok: true };
      // 401 from Supabase = bad user token. Don't try other apikeys.
      if (res.status === 401) return { ok: false, reason: 'supabase-rejected-jwt-' + res.status };
      // 403 / 5xx = apikey problem. Try next apikey.
    } catch (e) {
      // Network err — try next
    }
  }
  return { ok: false, reason: 'all-apikeys-failed' };
}

/**
 * Convert URL path to R2 key.
 * URL:  /photos/{slug}/{tool}/{type}/{fname...}
 * R2:   {slug}/photos/{tool}/{type}/{fname...}
 * Also handles legacy URLs where slug has spaces instead of underscores.
 */
function urlPathToR2Key(rawPath) {
  // rawPath = /photos/{slug}/{tool}/{type}/{fname}
  // Remove leading /photos/ → {slug}/{tool}/{type}/{fname}
  const afterPhotos = rawPath.substring(8); // skip "/photos/"
  const slashIdx = afterPhotos.indexOf('/');
  if (slashIdx < 0) return afterPhotos;
  const slug = afterPhotos.substring(0, slashIdx);
  const rest = afterPhotos.substring(slashIdx); // /{tool}/{type}/{fname}
  return slug + '/photos' + rest;
}

/**
 * Try multiple key variations to find the file in R2.
 * Handles: encoded %20, decoded spaces, underscore slugs.
 */
async function getR2Object(bucket, rawPath) {
  const key1 = urlPathToR2Key(rawPath);
  let obj = await bucket.get(key1);
  if (obj) return obj;

  // Try decoded version (spaces)
  try {
    const decoded = decodeURIComponent(key1);
    if (decoded !== key1) {
      obj = await bucket.get(decoded);
      if (obj) return obj;
    }
  } catch(e) {}

  // Try with spaces→underscores (legacy slug conversion)
  try {
    const underscored = decodeURIComponent(key1).replace(/\s/g, '_');
    if (underscored !== key1) {
      obj = await bucket.get(underscored);
      if (obj) return obj;
    }
  } catch(e) {}

  return null;
}

/**
 * Convert list URL path to R2 prefix.
 *
 * URL:  /list/{folder}/{tool}/{type}
 * R2 :  {folder}/photos/{tool}/{type}/
 *
 * S130 — This MUST match urlPathToR2Key's transposition. FRT's R2 keys are
 * stored as `{folder}/photos/{tool}/{type}/{filename}` — the worker's
 * urlPathToR2Key moves `photos` from the front of the URL into the middle
 * of the stored key. Confirmed against live R2 (/debug shows real keys like
 * `1490.04_..._Upgrade/photos/frt/drawings/...`).
 *
 * A prior commit wrongly "fixed" this to produce `photos/{folder}/...`
 * (photos at front) based on FRT's URL shape rather than the STORED key
 * shape. That made every list match nothing → Hub Cloud Storage showed
 * "None" for everything. Reverted to the transposed form that matches
 * what's actually in the bucket.
 */
function listPathToR2Prefix(rawPath) {
  // rawPath = /list/{folder}/{tool}/{type}
  const afterList = rawPath.substring(6); // skip "/list/"
  const slashIdx = afterList.indexOf('/');
  if (slashIdx < 0) return afterList + '/photos/'; // just the folder
  const folder = afterList.substring(0, slashIdx);
  const rest = afterList.substring(slashIdx); // /{tool}/{type}
  return folder + '/photos' + rest.replace(/\/$/, '') + '/';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const rawPath = url.pathname;

    // ── DEBUG (temporary) ──
    // Optional ?prefix=foo/bar/ filters by R2 key prefix.
    // Optional ?limit=200 (default 20, max 1000).
    if (request.method === 'GET' && rawPath === '/debug') {
      try {
        const prefix = url.searchParams.get('prefix') || undefined;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 1000);
        const listed = await env.BUCKET.list({ prefix, limit });
        return jsonResponse({
          status: 'ok',
          prefix: prefix || '(none)',
          totalObjects: listed.objects.length,
          truncated: listed.truncated,
          keys: listed.objects.map(o => ({ key: o.key, size: o.size }))
        }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500, origin);
      }
    }

    // ── LIST: GET /list/{slug}/{tool}/{type} ──
    if (request.method === 'GET' && rawPath.startsWith('/list/')) {
      let prefix = listPathToR2Prefix(rawPath);
      try {
        let listed = await env.BUCKET.list({ prefix, limit: 1000 });
        // If no results, try decoded+underscored prefix
        if (listed.objects.length === 0) {
          try {
            const altPrefix = decodeURIComponent(prefix).replace(/\s/g, '_');
            if (altPrefix !== prefix) {
              listed = await env.BUCKET.list({ prefix: altPrefix, limit: 1000 });
            }
          } catch(e) {}
        }
        const files = listed.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          httpEtag: obj.httpEtag
        }));
        return jsonResponse({ files, truncated: listed.truncated }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: 'List failed: ' + e.message }, 500, origin);
      }
    }

    // ── LIST ALL: GET /listall/{pid} ──
    // S124 A4 — returns ALL R2 keys under {pid}/ prefix (photos + tiles +
    // pdfbufs). Used by the orphan-cleanup diagnostic to enumerate every
    // object owned by a project so it can be diffed against live state.
    // Authenticated — reveals the full object inventory of a project.
    if (request.method === 'GET' && rawPath.startsWith('/listall/')) {
      const auth = await validateAuth(request, env);
      if (!auth.ok) {
        return jsonResponse({ error: 'Unauthorized', reason: auth.reason }, 401, origin);
      }
      const pid = decodeURIComponent(rawPath.substring(9)).replace(/\/$/, '');
      if (!pid) return jsonResponse({ error: 'Missing project id' }, 400, origin);
      // S130 — R2 keys are stored as `{folder}/photos/frt/{type}/...` (the
      // worker's urlPathToR2Key transposes `photos` into the middle). So a
      // listall prefix that captures everything under a project is just
      // `{folder}/` — NOT `photos/{folder}/`. A prior commit wrongly added
      // the `photos/` front-prefix; confirmed wrong against live /debug.
      const prefix = pid + '/';
      try {
        let allObjects = [];
        let cursor = undefined;
        let pages = 0;
        do {
          const listed = await env.BUCKET.list({ prefix, limit: 1000, cursor });
          for (const o of listed.objects) {
            allObjects.push({ key: o.key, size: o.size, uploaded: o.uploaded });
          }
          cursor = listed.truncated ? listed.cursor : null;
          pages++;
          if (pages >= 20) break; // hard cap: 20k objects
        } while (cursor);
        const totalBytes = allObjects.reduce(function(s, o) { return s + (o.size || 0); }, 0);
        return jsonResponse({
          pid: pid,
          count: allObjects.length,
          totalBytes: totalBytes,
          truncated: !!cursor,
          objects: allObjects
        }, 200, origin);
      } catch (e) {
        return jsonResponse({ error: 'Listall failed: ' + e.message }, 500, origin);
      }
    }

    // ── MULTIPART UPLOAD: for files >100MB (worker single-PUT body limit) ──
    // Init  : POST   /multipart/init/{slug}/{tool}/{type}/{fname}    → {uploadId}
    // Part  : PUT    /multipart/part/{slug}/{tool}/{type}/{fname}?uploadId=X&partNumber=N → {etag}
    // Done  : POST   /multipart/complete/{slug}/{tool}/{type}/{fname}?uploadId=X
    //         body = [{ partNumber: 1, etag: "..." }, ...]
    // Abort : DELETE /multipart/abort/{slug}/{tool}/{type}/{fname}?uploadId=X
    if (rawPath.startsWith('/multipart/')) {
      const auth = await validateAuth(request, env);
      if (!auth.ok) {
        return jsonResponse({ error: 'Unauthorized', reason: auth.reason }, 401, origin);
      }
      // Strip /multipart/{action}/ → leaves /photos-style path
      const segs = rawPath.split('/');
      // segs = ['', 'multipart', '{action}', '{slug}', '{tool}', '{type}', ...{fname segments}]
      const action = segs[2];
      if (segs.length < 7) return jsonResponse({ error: 'Bad multipart path' }, 400, origin);
      // Reconstitute as /photos/{slug}/{tool}/{type}/{fname...} so urlPathToR2Key works
      const photosPath = '/photos/' + segs.slice(3).join('/');
      const r2Key = urlPathToR2Key(photosPath);
      const uploadId = url.searchParams.get('uploadId') || '';

      try {
        if (action === 'init' && request.method === 'POST') {
          const contentType = request.headers.get('X-Upload-Content-Type') || 'application/octet-stream';
          const mp = await env.BUCKET.createMultipartUpload(r2Key, {
            httpMetadata: { contentType }
          });
          return jsonResponse({ uploadId: mp.uploadId, key: r2Key }, 200, origin);
        }
        if (action === 'part' && request.method === 'PUT') {
          if (!uploadId) return jsonResponse({ error: 'Missing uploadId' }, 400, origin);
          const partNumber = parseInt(url.searchParams.get('partNumber') || '0', 10);
          if (!partNumber) return jsonResponse({ error: 'Missing partNumber' }, 400, origin);
          const mp = env.BUCKET.resumeMultipartUpload(r2Key, uploadId);
          const body = await request.arrayBuffer();
          const part = await mp.uploadPart(partNumber, body);
          return jsonResponse({ partNumber: part.partNumber, etag: part.etag }, 200, origin);
        }
        if (action === 'complete' && request.method === 'POST') {
          if (!uploadId) return jsonResponse({ error: 'Missing uploadId' }, 400, origin);
          const parts = await request.json();
          if (!Array.isArray(parts) || !parts.length) return jsonResponse({ error: 'Bad parts list' }, 400, origin);
          const mp = env.BUCKET.resumeMultipartUpload(r2Key, uploadId);
          const obj = await mp.complete(parts);
          return jsonResponse({ success: true, key: r2Key, etag: obj.httpEtag, size: obj.size }, 200, origin);
        }
        if (action === 'abort' && request.method === 'DELETE') {
          if (!uploadId) return jsonResponse({ error: 'Missing uploadId' }, 400, origin);
          const mp = env.BUCKET.resumeMultipartUpload(r2Key, uploadId);
          await mp.abort();
          return jsonResponse({ success: true, aborted: r2Key }, 200, origin);
        }
        return jsonResponse({ error: 'Bad multipart method/action' }, 400, origin);
      } catch (e) {
        return jsonResponse({ error: 'Multipart failed: ' + e.message }, 500, origin);
      }
    }

    // ── RENDER: POST /render → proxy to Azure Function (key held server-side) ──
    // Body: { pid, drawingId, r2Key }  — r2Key is the actual R2 bucket key
    // Auth: Supabase JWT (same Bearer token as /photos PUT)
    // Returns 202 Accepted immediately. Function may take 5+ minutes — outbound
    // fetch is kept alive via ctx.waitUntil so Worker doesn't abort it.
    if (request.method === 'POST' && rawPath === '/render') {
      const auth = await validateAuth(request, env);
      if (!auth.ok) {
        return jsonResponse({ error: 'Unauthorized', reason: auth.reason }, 401, origin);
      }
      const funcKey = env.AZURE_FUNC_KEY;
      const funcUrl = env.AZURE_FUNC_URL || 'https://arencon-pdf-render.azurewebsites.net/api/render';
      if (!funcKey) {
        return jsonResponse({ error: 'AZURE_FUNC_KEY secret not configured on Worker' }, 500, origin);
      }
      let body;
      try {
        body = await request.text();
        // Light validation — ensure it parses as JSON with required fields
        const parsed = JSON.parse(body);
        if (!parsed || !parsed.pid || !parsed.drawingId || !parsed.r2Key) {
          return jsonResponse({ error: 'Body must include pid, drawingId, r2Key' }, 400, origin);
        }
      } catch (e) {
        return jsonResponse({ error: 'Invalid JSON body: ' + e.message }, 400, origin);
      }
      // Dispatch — keep alive after Worker returns. We don't process the
      // response (Function returns 504 on >230s anyway). FRT polls the
      // manifest URL to detect completion.
      const renderFetch = fetch(funcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-functions-key': funcKey
        },
        body: body
      }).then(r => {
        console.log('[render] Function status', r.status);
      }).catch(e => {
        console.warn('[render] forward error:', e && e.message);
      });
      if (ctx && ctx.waitUntil) ctx.waitUntil(renderFetch);
      return jsonResponse({ success: true, accepted: true }, 202, origin);
    }

    // ── TILES: /{pid}/{tilePrefix}/{drawingId}/... (unauthenticated, immutable cache) ──
    // Served directly by R2 key = URL path minus leading slash.
    // Tile prefixes used:
    //   /tiles/                   — production (current Azure Container App, future Fly.io prod)
    //   /tiles-mupdf-staging/     — S107 mupdf rewrite staging app (parallel testing)
    //   /tiles-*  (pattern)       — any future staging variant
    if (request.method === 'GET' && /^\/[^/]+\/tiles(-[^/]+)?\//.test(rawPath)) {
      const r2Key = decodeURIComponent(rawPath.slice(1));
      try {
        const object = await env.BUCKET.get(r2Key);
        if (!object) {
          return new Response('Not Found', { status: 404, headers: cors });
        }
        const headers = new Headers(cors);
        const isManifest = r2Key.endsWith('.json');
        headers.set('Content-Type', isManifest ? 'application/json' : (object.httpMetadata?.contentType || (r2Key.endsWith('.webp') ? 'image/webp' : 'image/jpeg')));
        headers.set('Cache-Control', isManifest ? 'public, max-age=60' : 'public, max-age=31536000, immutable');
        if (object.httpEtag) headers.set('ETag', object.httpEtag);
        return new Response(object.body, { status: 200, headers });
      } catch (e) {
        return jsonResponse({ error: 'Tile get failed: ' + e.message }, 500, origin);
      }
    }

    // ── PHOTOS: /photos/{slug}/{tool}/{type}/{filename} ──
    if (rawPath.startsWith('/photos/')) {
      const r2Key = urlPathToR2Key(rawPath);

      // GET — serve file (unauthenticated)
      if (request.method === 'GET') {
        try {
          const object = await getR2Object(env.BUCKET, rawPath);
          if (!object) {
            return new Response('Not Found', { status: 404, headers: cors });
          }
          const headers = new Headers(cors);
          const ct = object.httpMetadata?.contentType || 'image/jpeg';
          headers.set('Content-Type', ct);
          // S331f — mutable markup/data JSON must NOT be long-cached. A one-year
          // cache made the conditional-PUT ETag go stale, so every markup save
          // after the first 412'd (S205 Bug B) and fell back to an unconditional
          // write (race protection skipped). Serve JSON uncached so each read
          // returns R2's live ETag; binaries (photos/drawings) stay immutable.
          const isMutableJson = rawPath.endsWith('.json') || ct === 'application/json';
          headers.set('Cache-Control', isMutableJson
            ? 'no-cache, no-store, must-revalidate'
            : 'public, max-age=31536000');
          headers.set('ETag', object.httpEtag || '');
          return new Response(object.body, { status: 200, headers });
        } catch (e) {
          return jsonResponse({ error: 'Get failed: ' + e.message }, 500, origin);
        }
      }

      // PUT — upload (authenticated)
      if (request.method === 'PUT') {
        const auth = await validateAuth(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: 'Unauthorized', reason: auth.reason }, 401, origin);
        }
        try {
          const contentType = request.headers.get('Content-Type') || 'image/jpeg';
          const body = await request.arrayBuffer();
          // S129 Item 1.2 — Conditional PUT. R2's put() accepts an `onlyIf`
          // option that maps directly to HTTP precondition semantics:
          //   If-Match: <etag>  → only succeed if current object has this ETag
          //   If-None-Match: *  → only succeed if object does NOT exist
          // On precondition failure, R2 throws and we return 412 so the client
          // can re-GET, re-merge, and retry. Markup uses this to close the
          // read-merge-write race window between concurrent inspectors.
          const ifMatchHdr = request.headers.get('If-Match');
          const ifNoneMatchHdr = request.headers.get('If-None-Match');
          const putOpts = { httpMetadata: { contentType } };

          // ── S555 — STOP GUESSING WHICH ETAG FORM R2 WANTS. ──────────────
          // This has now been wrong in BOTH directions. S129 sent the quoted
          // form, S130 stripped the quotes to "fix" it, and the comment left
          // behind says stripping made every conditional PUT 412 forever.
          // Flipping it back produced the identical symptom from the other
          // side: on 1490.04 EVERY markup save 412'd three times and then
          // fell through to an unconditional write with race protection off —
          // on a single device, with nobody else editing. A guard that is
          // always wrong is worse than no guard, because it looks armed.
          //
          // The fix is not a third guess. R2 has ONE stored etag; the only
          // question is punctuation. Try the client's value exactly as sent,
          // and if the precondition fails, try the same value with the quotes
          // toggled BEFORE reporting a conflict. A genuine concurrent write
          // fails both forms and still returns 412, so real race protection
          // is unchanged — we only stop reporting a formatting mismatch as a
          // collision. Costs one extra attempt on a path that should be rare.
          const _etagForms = (v) => {
            if (!v) return [];
            const bare = v.replace(/^W\//, '').replace(/^"|"$/g, '');
            const quoted = '"' + bare + '"';
            // client's exact value first — that is the common case once correct
            return v === quoted ? [quoted, bare] : [v, quoted, bare]
              .filter((x, i, a) => a.indexOf(x) === i);
          };

          async function _conditionalPut() {
            if (ifMatchHdr) {
              const forms = _etagForms(ifMatchHdr);
              for (let i = 0; i < forms.length; i++) {
                try {
                  const r = await env.BUCKET.put(r2Key, body, {
                    ...putOpts, onlyIf: { etagMatches: forms[i] }
                  });
                  if (r !== null) {
                    if (i > 0) console.log('[r2worker] S555: If-Match matched on alternate etag form');
                    return r;
                  }
                } catch (e) { /* precondition threw — try the next form */ }
              }
              return null;                       // genuine conflict
            }
            if (ifNoneMatchHdr === '*') {
              try {
                return await env.BUCKET.put(r2Key, body, {
                  ...putOpts, onlyIf: { etagDoesNotMatch: '*' }
                });
              } catch (e) { return null; }
            }
            return await env.BUCKET.put(r2Key, body, putOpts);
          }

          let putResult;
          try {
            putResult = await _conditionalPut();
          } catch (preErr) {
            return jsonResponse({
              error: 'Precondition Failed',
              reason: 'concurrent_write_detected'
            }, 412, origin);
          }
          if (putResult === null && (ifMatchHdr || ifNoneMatchHdr === '*')) {
            // Every form failed → a real concurrent write, not punctuation.
            return jsonResponse({
              error: 'Precondition Failed',
              reason: 'concurrent_write_detected'
            }, 412, origin);
          }
          // Echo the resulting ETag so the client can use it for the NEXT
          // If-Match without an extra GET. Header is also exposed via CORS.
          const respBody = { success: true, key: r2Key, size: body.byteLength };
          if (putResult && putResult.httpEtag) respBody.etag = putResult.httpEtag;
          const respHeaders = { 'Content-Type': 'application/json', ...corsHeaders(origin) };
          if (putResult && putResult.httpEtag) respHeaders['ETag'] = putResult.httpEtag;
          return new Response(JSON.stringify(respBody), { status: 200, headers: respHeaders });
        } catch (e) {
          return jsonResponse({ error: 'Upload failed: ' + e.message }, 500, origin);
        }
      }

      // DELETE — remove (authenticated)
      if (request.method === 'DELETE') {
        const auth = await validateAuth(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: 'Unauthorized', reason: auth.reason }, 401, origin);
        }
        try {
          await env.BUCKET.delete(r2Key);
          return jsonResponse({ success: true, deleted: r2Key }, 200, origin);
        } catch (e) {
          return jsonResponse({ error: 'Delete failed: ' + e.message }, 500, origin);
        }
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, origin);
  }
};
