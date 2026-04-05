/**
 * ARENCON R2 Storage Worker — with diagnostic endpoint
 * Temporarily includes /debug to check bucket access
 */

const ALLOWED_ORIGINS = [
  'https://hezhendong999-bot.github.io',
  'http://localhost',
  'http://127.0.0.1',
  '*'
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
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
    const cors = corsHeaders();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const rawPath = url.pathname;

    // ── DEBUG: GET /debug — list first 20 keys in bucket ──
    if (request.method === 'GET' && rawPath === '/debug') {
      try {
        const hasBucket = !!env.BUCKET;
        const bucketType = typeof env.BUCKET;
        if (!hasBucket) {
          return jsonResponse({ error: 'env.BUCKET is not bound', type: bucketType, envKeys: Object.keys(env) }, 500);
        }
        const listed = await env.BUCKET.list({ limit: 20 });
        return jsonResponse({
          status: 'ok',
          bucketBound: true,
          totalObjects: listed.objects.length,
          truncated: listed.truncated,
          keys: listed.objects.map(o => ({ key: o.key, size: o.size }))
        }, 200);
      } catch (e) {
        return jsonResponse({ error: 'Bucket list failed: ' + e.message, stack: e.stack }, 500);
      }
    }

    // ── LIST: GET /list/... ──
    if (request.method === 'GET' && rawPath.startsWith('/list/')) {
      const afterList = rawPath.substring(6).replace(/\/$/, '');
      if (!afterList) {
        return jsonResponse({ error: 'Empty list path' }, 400);
      }
      const prefix = afterList + '/';
      try {
        const listed = await env.BUCKET.list({ prefix, limit: 1000 });
        const files = listed.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded
        }));
        return jsonResponse({ files, truncated: listed.truncated, prefix }, 200);
      } catch (e) {
        return jsonResponse({ error: 'List failed: ' + e.message }, 500);
      }
    }

    // ── PHOTOS: /photos/... ──
    if (rawPath.startsWith('/photos/')) {
      const r2Key = rawPath.substring(1); // remove leading /

      if (request.method === 'GET') {
        try {
          // Try raw key first
          let object = await env.BUCKET.get(r2Key);
          // Fallback: decoded key
          if (!object) {
            try {
              const decoded = decodeURIComponent(r2Key);
              if (decoded !== r2Key) object = await env.BUCKET.get(decoded);
            } catch(e) {}
          }
          if (!object) {
            return jsonResponse({ error: 'Not found', triedKey: r2Key }, 404);
          }
          const headers = new Headers(cors);
          headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
          headers.set('Cache-Control', 'public, max-age=31536000');
          return new Response(object.body, { status: 200, headers });
        } catch (e) {
          return jsonResponse({ error: 'Get failed: ' + e.message }, 500);
        }
      }

      if (request.method === 'PUT') {
        if (!(await validateAuth(request, env))) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        try {
          const contentType = request.headers.get('Content-Type') || 'image/jpeg';
          const body = await request.arrayBuffer();
          await env.BUCKET.put(r2Key, body, { httpMetadata: { contentType } });
          return jsonResponse({ success: true, key: r2Key, size: body.byteLength }, 200);
        } catch (e) {
          return jsonResponse({ error: 'Upload failed: ' + e.message }, 500);
        }
      }

      if (request.method === 'DELETE') {
        if (!(await validateAuth(request, env))) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        try {
          await env.BUCKET.delete(r2Key);
          try {
            const decoded = decodeURIComponent(r2Key);
            if (decoded !== r2Key) await env.BUCKET.delete(decoded);
          } catch(e) {}
          return jsonResponse({ success: true, deleted: r2Key }, 200);
        } catch (e) {
          return jsonResponse({ error: 'Delete failed: ' + e.message }, 500);
        }
      }
    }

    return jsonResponse({ error: 'Not found', path: rawPath }, 404);
  }
};
