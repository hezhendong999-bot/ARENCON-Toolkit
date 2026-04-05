/**
 * ARENCON R2 Storage Worker — Cloudflare Worker
 * Handles photo/drawing storage in Cloudflare R2 bucket.
 *
 * R2 Binding: BUCKET → arencon-files
 * Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY (for JWT validation on writes)
 *
 * Routes:
 *   GET  /photos/{pid}/{tool}/{type}/{filename}   — serve file (unauthenticated, CORS)
 *   PUT  /photos/{pid}/{tool}/{type}/{filename}   — upload file (authenticated)
 *   DELETE /photos/{pid}/{tool}/{type}/{filename}  — delete file (authenticated)
 *   GET  /list/{pid}/{tool}/{type}/               — list files by prefix (unauthenticated)
 *   OPTIONS *                                      — CORS preflight
 *
 * CRITICAL: Do NOT decodeURIComponent on paths — R2 keys are stored with %20 encoding
 * because R2Photos.upload() uses encodeURIComponent() to build PUT paths.
 *
 * RESTORED+FIXED in Session 60.
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // CRITICAL: Use raw pathname — do NOT decode. R2 keys match the encoded URL path.
    const rawPath = url.pathname;

    // ── LIST: GET /list/{pid}/{tool}/{type}/ ──
    if (request.method === 'GET' && rawPath.startsWith('/list/')) {
      // Strip /list/ prefix, build R2 prefix from remaining path
      const afterList = rawPath.substring(6).replace(/\/$/, ''); // remove trailing slash
      if (!afterList || afterList.split('/').length < 2) {
        return jsonResponse({ error: 'Invalid list path' }, 400, origin);
      }
      const prefix = afterList + '/';
      try {
        const listed = await env.BUCKET.list({ prefix, limit: 1000 });
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

    // ── PHOTOS: /photos/{pid}/{tool}/{type}/{filename} ──
    if (rawPath.startsWith('/photos/')) {
      // R2 key = path without leading slash
      const r2Key = rawPath.substring(1); // "photos/..."

      // GET — serve file (unauthenticated)
      if (request.method === 'GET') {
        try {
          // Try exact key first
          let object = await env.BUCKET.get(r2Key);
          
          // If not found, try decoded key (handles mixed storage formats)
          if (!object) {
            try {
              const decodedKey = decodeURIComponent(r2Key);
              if (decodedKey !== r2Key) {
                object = await env.BUCKET.get(decodedKey);
              }
            } catch(e) {}
          }
          
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
          // Delete both encoded and decoded versions
          await env.BUCKET.delete(r2Key);
          try {
            const decodedKey = decodeURIComponent(r2Key);
            if (decodedKey !== r2Key) await env.BUCKET.delete(decodedKey);
          } catch(e) {}
          return jsonResponse({ success: true, deleted: r2Key }, 200, origin);
        } catch (e) {
          return jsonResponse({ error: 'Delete failed: ' + e.message }, 500, origin);
        }
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, origin);
  }
};
