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
 * RESTORED in Session 60 after accidental overwrite with AI Worker code.
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

    const path = decodeURIComponent(url.pathname);

    // ── LIST: GET /list/{pid}/{tool}/{type}/ ──
    if (request.method === 'GET' && path.startsWith('/list/')) {
      const parts = path.replace('/list/', '').replace(/\/$/, '').split('/');
      if (parts.length < 3) {
        return jsonResponse({ error: 'Invalid list path' }, 400, origin);
      }
      // R2 key prefix: {pid}/{tool}/{type}/  (list API uses folder WITHOUT /photos/ prefix)
      const prefix = parts.join('/') + '/';
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
    if (path.startsWith('/photos/')) {
      const r2Key = path.replace(/^\//, ''); // Remove leading slash → "photos/..."

      // GET — serve file (unauthenticated)
      if (request.method === 'GET') {
        try {
          const object = await env.BUCKET.get(r2Key);
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
