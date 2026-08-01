/**
 * R2 Worker mock — replaces the global `fetch` so tests that call R2 client
 * methods (R2.upload, R2.list, R2.listAll, R2.del) hit this mock instead of
 * the real Cloudflare Worker.
 *
 * Response shapes mirror the actual deployed Worker (verified against the
 * Worker source pasted in S128). The contract test in
 * frt/tests/contracts/r2Worker.contract.test.js verifies real Worker keeps
 * returning these shapes.
 */

import { vi } from 'vitest';

/* S560: the client moved to the files.arencon.app custom domain (frt/js/data/
   r2.js workerHost) while this mock still stripped the old workers.dev origin —
   so every path check missed, everything fell to the 404 catch-all, and two
   URL-construction tests failed for reasons that had nothing to do with URLs.
   Strip whichever origin the request actually used. */
const WORKER_URLS = ['https://files.arencon.app',
                     'https://arencon-r2-worker.hezhendong999.workers.dev'];

export function installR2Mock(initialBucket = {}) {
  // bucket: { [r2Key]: { body: ArrayBuffer|Blob|string, size: number, contentType: string } }
  const bucket = { ...initialBucket };

  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    let path = url;
    for (const o of WORKER_URLS) { if (path.startsWith(o)) { path = path.slice(o.length); break; } }
    const method = (init.method || 'GET').toUpperCase();
    const authHeader = (init.headers && (init.headers.Authorization || init.headers.authorization)) || '';

    function json(body, status = 200) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    function unauthorized() {
      return json({ error: 'Unauthorized', reason: 'no-auth-header' }, 401);
    }

    // /listall/{pid} — auth required
    if (method === 'GET' && path.startsWith('/listall/')) {
      if (!authHeader.startsWith('Bearer ')) return unauthorized();
      const pid = decodeURIComponent(path.substring('/listall/'.length).replace(/\/$/, ''));
      const prefix = pid + '/';
      const matches = Object.keys(bucket)
        .filter(k => k.startsWith(prefix))
        .map(k => ({ key: k, size: bucket[k].size || 0, uploaded: new Date().toISOString() }));
      const totalBytes = matches.reduce((s, o) => s + o.size, 0);
      return json({ pid, count: matches.length, totalBytes, truncated: false, objects: matches });
    }

    // /list/{slug}/{tool}/{type} — no auth
    if (method === 'GET' && path.startsWith('/list/')) {
      // URL: /list/{slug}/{tool}/{type}  →  R2 prefix: {slug}/photos/{tool}/{type}/
      const afterList = path.substring('/list/'.length).replace(/\/$/, '');
      const segs = afterList.split('/');
      const [slug, tool, type] = segs;
      const prefix = `${slug}/photos/${tool}/${type}/`;
      const files = Object.keys(bucket)
        .filter(k => k.startsWith(prefix))
        .map(k => ({
          key: k,
          size: bucket[k].size || 0,
          uploaded: new Date().toISOString(),
          httpEtag: '"mock-etag"'
        }));
      return json({ files, truncated: false });
    }

    // PUT /photos/{slug}/{tool}/{type}/{fname} — auth required
    if (method === 'PUT' && path.startsWith('/photos/')) {
      if (!authHeader.startsWith('Bearer ')) return unauthorized();
      // URL → R2 key conversion (matches urlPathToR2Key in worker)
      const afterPhotos = path.substring('/photos/'.length);
      const firstSlash = afterPhotos.indexOf('/');
      const slug = afterPhotos.substring(0, firstSlash);
      const rest = afterPhotos.substring(firstSlash);
      const r2Key = slug + '/photos' + rest;
      const body = init.body;
      const size = body instanceof ArrayBuffer ? body.byteLength
                 : body instanceof Blob ? body.size
                 : typeof body === 'string' ? body.length
                 : 0;
      bucket[r2Key] = {
        body,
        size,
        contentType: (init.headers && (init.headers['Content-Type'] || init.headers['content-type'])) || 'application/octet-stream'
      };
      return json({ success: true, key: r2Key, size });
    }

    // GET /photos/... — no auth (public download)
    if (method === 'GET' && path.startsWith('/photos/')) {
      const afterPhotos = path.substring('/photos/'.length);
      const firstSlash = afterPhotos.indexOf('/');
      const slug = afterPhotos.substring(0, firstSlash);
      const rest = afterPhotos.substring(firstSlash);
      const r2Key = slug + '/photos' + rest;
      const obj = bucket[r2Key];
      if (!obj) return new Response('Not Found', { status: 404 });
      return new Response(obj.body, {
        status: 200,
        headers: { 'Content-Type': obj.contentType || 'image/jpeg' }
      });
    }

    // DELETE /photos/... — auth required
    if (method === 'DELETE' && path.startsWith('/photos/')) {
      if (!authHeader.startsWith('Bearer ')) return unauthorized();
      const afterPhotos = path.substring('/photos/'.length);
      const firstSlash = afterPhotos.indexOf('/');
      const slug = afterPhotos.substring(0, firstSlash);
      const rest = afterPhotos.substring(firstSlash);
      const r2Key = slug + '/photos' + rest;
      delete bucket[r2Key];
      return json({ success: true, deleted: r2Key });
    }

    return new Response('Not Found', { status: 404 });
  });

  globalThis.fetch = fetchMock;

  return {
    fetchMock,
    bucket,
    seed(r2Key, body, contentType = 'application/octet-stream') {
      const size = body instanceof ArrayBuffer ? body.byteLength
                 : body instanceof Blob ? body.size
                 : typeof body === 'string' ? body.length
                 : 0;
      bucket[r2Key] = { body, size, contentType };
    },
    reset() {
      Object.keys(bucket).forEach(k => delete bucket[k]);
      fetchMock.mockClear();
    }
  };
}
