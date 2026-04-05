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

async function validateAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const jwt = authHeader.replace('Bearer ', '');
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': env.SUPABASE_SERVICE_KEY }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
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
        if (!(await validateAuth(request, env))) {
          return jsonResponse({ error: 'Unauthorized' }, 401, origin);
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
        if (!(await validateAuth(request, env))) {
          return jsonResponse({ error: 'Unauthorized' }, 401, origin);
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
