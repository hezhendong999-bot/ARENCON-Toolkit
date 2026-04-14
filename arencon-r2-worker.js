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
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
 * URL:  /list/{slug}/{tool}/{type}
 * R2:   {slug}/photos/{tool}/{type}/
 */
function listPathToR2Prefix(rawPath) {
  // rawPath = /list/{slug}/{tool}/{type}
  const afterList = rawPath.substring(6); // skip "/list/"
  const slashIdx = afterList.indexOf('/');
  if (slashIdx < 0) return afterList + '/photos/'; // just slug
  const slug = afterList.substring(0, slashIdx);
  const rest = afterList.substring(slashIdx); // /{tool}/{type}
  return slug + '/photos' + rest.replace(/\/$/, '') + '/';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const rawPath = url.pathname;

    // ── DEBUG (temporary) ──
    if (request.method === 'GET' && rawPath === '/debug') {
      try {
        const listed = await env.BUCKET.list({ limit: 20 });
        return jsonResponse({
          status: 'ok',
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
          headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
          headers.set('Cache-Control', 'public, max-age=31536000');
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
          await env.BUCKET.put(r2Key, body, {
            httpMetadata: { contentType }
          });
          return jsonResponse({ success: true, key: r2Key, size: body.byteLength }, 200, origin);
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
