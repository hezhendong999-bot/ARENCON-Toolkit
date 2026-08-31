/* ARENCON /lib/ — Sync Worker (S446 extraction)
   VERBATIM from FRT frt/js/data/syncWorker.js. Off-thread serialize/strip +
   merge3 + parseLarge. imports './merge.js' (sits beside it in /lib/data/).
   stripBinaries walks FRT's project shape; all array walks are || []-guarded
   so tools without those collections (Electric) are unaffected. */
/**
 * ARENCON FRT — Sync Worker (P-6 minimal scope, S128)
 * ═══════════════════════════════════════════════════
 *
 * Background-thread worker that handles CPU-heavy serialization work so the
 * main UI thread doesn't freeze during saves on big projects.
 *
 * Scope (minimal — see HANDOFF_SESSION_128.md):
 *   - serializePush : deep-clone + strip-binaries + JSON.stringify  (the 200-400ms hog)
 *   - merge3Worker  : 3-way merge for 412 conflict resolution        (50-500ms on big merges)
 *
 * NOT in scope (deliberate):
 *   - IDB writes (splitting IDB ownership across threads is a footgun)
 *   - R2 uploads (already async; small win, large surface)
 *   - Model/Auth/state ownership (worker is stateless — main thread orchestrates)
 *
 * Design:
 *   - Worker has NO state. Each RPC is request/response with a correlation id.
 *   - Worker uses JSON.parse(JSON.stringify(...)) for stripping to exactly match
 *     legacy behavior (NOT structuredClone, which preserves Maps/Dates/etc.).
 *   - Worker imports merge.js as an ES6 module so the merge engine has ONE source
 *     of truth shared with main thread.
 *
 * RPC protocol (from main thread):
 *   postMessage({ id: 'rpc-123', op: 'serializePush', payload: { proj } })
 *   postMessage({ id: 'rpc-124', op: 'merge3',        payload: { base, mine, theirs } })
 *   postMessage({ id: 'rpc-125', op: 'ping' })   // health check
 *
 * RPC response (to main thread):
 *   postMessage({ id: 'rpc-123', ok: true,  result: <op-specific> })
 *   postMessage({ id: 'rpc-123', ok: false, error: 'message' })
 *
 * History (S128): created. Replaces inline strip-and-stringify in sync.js push()
 * and inline merge3 call in sync.js _handleConflict(). Fallback to inline if
 * Worker constructor fails (very old browsers, restrictive CSP).
 */

import { merge3 } from './merge.js';

/**
 * Strip binary photo/drawing data from a project deep-clone.
 *
 * MUST match the legacy strip pattern from sync.js push() EXACTLY (S128 P-6
 * porting). Anything pushed to cloud that contains a dataUrl/dataBlob will
 * blow up the tool_data row size and re-introduce the S125-era cloud-row-
 * bloat bug. Tests in syncWorker.test.js lock this in.
 *
 * Strip targets:
 *   - drawings[]: dataUrl, dataBlob, thumb, _hasLocalBlob, markupObjects, markupData
 *   - photos[]:   dataUrl, dataBlob
 *   - signatures: sigInspectorData, sigWitnessData
 *   - contractors[].deficiencies[].observations[].photos[]:  dataUrl, dataBlob
 *   - contractors[].deficiencies[].photos[]:                 dataUrl, dataBlob
 *   - generalDeficiencies[].observations[].photos[]:         dataUrl, dataBlob
 *   - generalDeficiencies[].photos[]:                        dataUrl, dataBlob
 */
export function stripBinaries(data) {
  (data.drawings || []).forEach(function(d) {
    delete d.dataUrl; delete d.dataBlob; delete d.thumb; delete d._hasLocalBlob;
    delete d.markupObjects; delete d.markupData;
  });
  (data.photos || []).forEach(function(p) {
    delete p.dataUrl; delete p.dataBlob; delete p._localUrl;
  });
  if (data.signatures) {
    delete data.signatures.sigInspectorData;
    delete data.signatures.sigWitnessData;
  }
  (data.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) {
      (d.observations || []).forEach(function(o) {
        (o.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; delete p._localUrl; });
      });
      (d.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; delete p._localUrl; });
    });
  });
  (data.generalDeficiencies || []).forEach(function(d) {
    (d.observations || []).forEach(function(o) {
      (o.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; delete p._localUrl; });
    });
    (d.photos || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; delete p._localUrl; });
  });
  return data;
}

/**
 * Serialize a project for cloud push.
 *
 * Returns { strippedData, jsonBody } where:
 *   - strippedData : the stripped object (used as _lastSeenSnapshot after push)
 *   - jsonBody     : the JSON string ready to be a fetch body
 *
 * The host has a choice: send strippedData (and let fetch stringify it) or
 * send jsonBody directly. Current sync.js takes the object; we return both
 * so future callers can use the pre-serialized string and avoid re-stringify.
 */
export function serializePush(proj) {
  if (!proj || typeof proj !== 'object') {
    throw new Error('serializePush: proj is required');
  }
  // EXACTLY match legacy: JSON.parse(JSON.stringify(...)) — NOT structuredClone.
  // Legacy behavior silently drops functions, undefined, Symbols, etc.
  // structuredClone would preserve them and could leak unexpected fields.
  var data = JSON.parse(JSON.stringify(proj));
  stripBinaries(data);
  // jsonBody returned for callers that want to skip re-stringify.
  // Note: this is the bare data, not the full payload — caller adds
  // project_id, tool_key, instance_number, updated_by, updated_at.
  var jsonBody = JSON.stringify(data);
  return { strippedData: data, jsonBody: jsonBody };
}

/**
 * Run 3-way merge in the worker thread. Pure passthrough to merge.js merge3.
 * Exported for direct testability; the worker RPC handler delegates here.
 */
export function merge3InWorker(base, mine, theirs) {
  return merge3(base, mine, theirs);
}

/**
 * S130 Item 5.3 — Parse a large JSON string in the worker thread.
 *
 * Used by sync.js pull() to move the JSON.parse() of cloud responses off the
 * main thread. Pulls on 10MB+ projects can block the UI for 100-300ms; running
 * the parse in the worker lets the main thread stay responsive (paying only
 * the structuredClone cost on receive, which is faster than JSON.parse).
 *
 * Contract:
 *   - Returns the parsed value (object/array/primitive) — same as JSON.parse.
 *   - Empty / falsy text returns null (matches Auth.request legacy semantics
 *     for empty response bodies).
 *   - Throws SyntaxError on malformed JSON (same as JSON.parse).
 *
 * The host (syncWorkerHost.js) falls back to inline JSON.parse if the worker
 * is unavailable, so callers can use this without checking worker availability.
 */
export function parseLarge(text) {
  if (!text) return null;
  if (typeof text !== 'string') {
    throw new Error('parseLarge: text must be a string, got ' + typeof text);
  }
  return JSON.parse(text);
}

// ── Worker RPC dispatcher ───────────────────────────────────────────
// Only registers the message handler when we're actually running inside
// a Worker scope. When imported by unit tests in Node/jsdom, the
// `self.addEventListener` line below is a no-op (jsdom has `self`,
// but no `postMessage` to the main thread, so we guard with a feature check).

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' &&
    typeof window === 'undefined') {
  self.addEventListener('message', function(e) {
    var msg = e.data || {};
    var id = msg.id;
    var op = msg.op;
    var payload = msg.payload || {};

    try {
      var result;
      switch (op) {
        case 'ping':
          result = { pong: true, t: Date.now() };
          break;
        case 'serializePush':
          result = serializePush(payload.proj);
          break;
        case 'merge3':
          result = merge3InWorker(payload.base, payload.mine, payload.theirs);
          break;
        case 'parseLarge':
          result = parseLarge(payload.text);
          break;
        default:
          throw new Error('Unknown op: ' + op);
      }
      self.postMessage({ id: id, ok: true, result: result });
    } catch (err) {
      self.postMessage({
        id: id,
        ok: false,
        error: (err && err.message) || String(err)
      });
    }
  });
}
