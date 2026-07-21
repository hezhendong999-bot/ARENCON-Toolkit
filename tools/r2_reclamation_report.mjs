#!/usr/bin/env node
/**
 * S497 — STAGE 3 (DRY-RUN ONLY): R2 RECLAMATION ELIGIBILITY REPORT.
 *
 * ⚠ THIS SCRIPT MUST NEVER DELETE ANYTHING. It contains no delete verb, no
 * write to R2, no write to Supabase. It is a READ-ONLY reporter, same pattern
 * as tools/photo_integrity_sweep.mjs and tools/retention_sweep.mjs. Any actual
 * reclamation is a separate, future, manual, Mark-present step that does not
 * exist yet — deliberately. The capability is withheld, not merely gated.
 *
 * WHY THIS EXISTS
 * When an admin purges a report, its R2 photo objects stay in the bucket
 * forever. Stage 3's question is: "which of those objects is safe to reclaim?"
 * The answer is dangerous to get wrong, because FRT reports in one project
 * SHARE R2 objects (carry-forward copies pointers, not photos). Purging FRT #2
 * must never break FRT #1's photos.
 *
 * DESIGN RULES (from DESIGN_DELETED_REPORTS_AND_RETENTION_S494 + S496 handoff)
 *  1. TOMBSTONE-DRIVEN, NEVER A BUCKET SCAN. Candidates come only from the
 *     explicit record of what was purged: tool_data_history rows with
 *     snapshot_reason='delete' whose row no longer exists in tool_data.
 *     An object nobody purged is never even considered.
 *  2. REFERENCE-COUNT BEFORE ANYTHING. An object is a candidate ONLY if no
 *     current tool_data row (live OR soft-deleted — soft-deleted reports are
 *     restorable, so their photos count as referenced) mentions its filename
 *     anywhere in its data blob. The reference harvest is a deep walk of every
 *     string in every blob — it does not assume any particular photo schema,
 *     so structures this script doesn't know about (Diesel, drawings, markup,
 *     CRB threads) still protect their objects.
 *  3. CONSERVATIVE BY CONSTRUCTION. Matching is by filename. A false match
 *     (generic filename appearing elsewhere) makes us HOLD an object, never
 *     release one. Ambiguity always resolves to "keep".
 *  4. ANOMALY CAP. More candidates than MAX_EXPECTED_CANDIDATES at once means
 *     something upstream broke — the run goes red so a human looks BEFORE
 *     anyone even thinks about reclaiming. Candidates alone are a green run.
 *
 * Verified against live data at build time (S497): 43 distinct photo keys in
 * purged snapshots, all 43 still referenced by living reports (the shared-
 * photo case, live). Expected report today: 43 held, 0 candidates.
 *
 * Output: reports/r2-reclamation.json
 * Env:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service-role read)
 */

import { writeFileSync, mkdirSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsemvinxsyphjiaqgywv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('::error::SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

const MAX_EXPECTED_CANDIDATES = 100; // anomaly cap — a spike is a fault, not policy
const CONCURRENCY = 8;               // parallel existence probes
const PROBE_TIMEOUT_MS = 15000;
const MIN_FNAME_LEN = 6;             // ignore trivially generic names — they only ever cause holds anyway

async function rest(path) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  });
  if (!r.ok) throw new Error('REST ' + r.status + ' on ' + path);
  return r.json();
}

/* ── Pointer recognition ──
   A string is treated as an R2 pointer if it looks like a worker URL or a
   bucket-style key. Both key shapes are handled (`photos/{pid}/…` URL shape
   and `{pid}/photos/…` bucket shape — the worker transposes them, S130). */
const R2_HOSTS = /(arencon-r2-worker\.[^/\s"']+|files\.arencon\.app)/;
const KEYISH = /(^|\/)(photos)\//;

function fnameOf(s) {
  // last path segment, query stripped
  const clean = String(s).split('?')[0].split('#')[0];
  const seg = clean.substring(clean.lastIndexOf('/') + 1);
  return seg && seg.length >= MIN_FNAME_LEN ? seg : null;
}

/* Deep-walk any JSON value and harvest every string that looks like an R2
   pointer. Deliberately schema-blind: whatever structure a tool stores its
   pointers in, a string mention is a reference. */
function harvest(node, out) {
  if (node == null) return;
  if (typeof node === 'string') {
    if (node.length < MIN_FNAME_LEN || node.length > 4000) return;      // dataUrls etc. are not pointers
    if (R2_HOSTS.test(node) || KEYISH.test(node)) {
      const f = fnameOf(node);
      if (f) out.add(f);
    }
    return;
  }
  if (Array.isArray(node)) { for (const v of node) harvest(v, out); return; }
  if (typeof node === 'object') { for (const k in node) harvest(node[k], out); }
}

/* Collect candidate records (with their keys/urls kept for the report) from a
   purged snapshot blob. Same recognition rules, but we keep the full string. */
function harvestPointers(node, out) {
  if (node == null) return;
  if (typeof node === 'string') {
    if (node.length < MIN_FNAME_LEN || node.length > 4000) return;
    if (R2_HOSTS.test(node) || KEYISH.test(node)) {
      const f = fnameOf(node);
      if (f) out.push({ fname: f, pointer: node });
    }
    return;
  }
  if (Array.isArray(node)) { for (const v of node) harvestPointers(v, out); return; }
  if (typeof node === 'object') { for (const k in node) harvestPointers(node[k], out); }
}

async function probeExists(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: ctl.signal });
    clearTimeout(t);
    let size = null;
    const cr = r.headers.get('content-range'); // "bytes 0-0/12345"
    if (cr && cr.includes('/')) { const n = parseInt(cr.split('/').pop(), 10); if (!isNaN(n)) size = n; }
    return { exists: r.ok, status: r.status, size };
  } catch (e) {
    clearTimeout(t);
    return { exists: false, status: 'neterr:' + (e && e.name || 'x'), size: null };
  }
}

async function main() {
  console.log('[r2-reclaim] building reference set from ALL current tool_data rows (live + soft-deleted)…');
  const current = await rest('tool_data?select=id,project_id,tool_key,instance_number,deleted_at,data');
  const referenced = new Set();
  const currentIds = new Set();
  for (const row of current) {
    currentIds.add(row.id);
    try { harvest(row.data, referenced); }
    catch (e) { console.warn('[r2-reclaim] harvest skip', row.id, e && e.message); }
  }
  console.log(`[r2-reclaim] ${current.length} current rows → ${referenced.size} referenced filenames`);

  console.log('[r2-reclaim] reading tombstone list (delete snapshots in tool_data_history)…');
  const snaps = await rest('tool_data_history?snapshot_reason=eq.delete&select=hist_id,row_id,project_id,tool_key,instance_number,snapshot_at,data&order=snapshot_at.asc');

  // A snapshot only counts as a tombstone if the row is genuinely gone.
  const tombstones = snaps.filter(s => !currentIds.has(s.row_id));
  console.log(`[r2-reclaim] ${snaps.length} delete snapshots, ${tombstones.length} are true tombstones`);

  // Harvest purged pointers; dedupe by filename, keep first-seen context.
  const purged = new Map(); // fname → { pointer, contexts: [] }
  for (const s of tombstones) {
    const ptrs = [];
    try { harvestPointers(s.data, ptrs); } catch (e) { continue; }
    for (const p of ptrs) {
      if (!purged.has(p.fname)) purged.set(p.fname, { pointer: p.pointer, contexts: [] });
      purged.get(p.fname).contexts.push({
        hist_id: s.hist_id, project_id: s.project_id,
        tool: s.tool_key, instance: s.instance_number, purged_at: s.snapshot_at
      });
    }
  }

  const held = [], candidates = [];
  for (const [fname, rec] of purged) {
    if (referenced.has(fname)) held.push({ fname, reason: 'still referenced by a current report' });
    else candidates.push({ fname, pointer: rec.pointer, contexts: rec.contexts });
  }

  // Existence probe on candidates only — a candidate whose object is already
  // gone needs no reclamation. Probes are unauthenticated GETs (R2 GET needs
  // no auth); only URL-shaped pointers can be probed.
  let i = 0;
  async function worker() {
    while (i < candidates.length) {
      const c = candidates[i++];
      if (/^https?:\/\//.test(c.pointer)) {
        const p = await probeExists(c.pointer);
        c.exists = p.exists; c.probe_status = p.status; c.size_bytes = p.size;
      } else {
        c.exists = 'unknown'; c.probe_status = 'key-only-pointer (not probeable without worker auth)';
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const stillThere = candidates.filter(c => c.exists === true);
  const report = {
    generatedAt: new Date().toISOString(),
    note: 'DRY-RUN REPORT ONLY. Nothing here deletes or authorizes deletion. ' +
          'Reclamation, if ever built, is a separate manual Mark-present step ' +
          'driven from this tombstone-based list — never a bucket scan.',
    currentRows: current.length,
    referencedFilenames: referenced.size,
    tombstoneSnapshots: tombstones.length,
    purgedDistinctFilenames: purged.size,
    heldCount: held.length,
    candidateCount: candidates.length,
    candidatesStillInR2: stillThere.length,
    candidateBytes: stillThere.reduce((s, c) => s + (c.size_bytes || 0), 0),
    held,
    candidates
  };
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/r2-reclamation.json', JSON.stringify(report, null, 2));

  console.log(`[r2-reclaim] held (still referenced): ${held.length}`);
  console.log(`[r2-reclaim] candidates (unreferenced): ${candidates.length}, of which still in R2: ${stillThere.length}`);

  if (candidates.length > MAX_EXPECTED_CANDIDATES) {
    console.error(`::error::[r2-reclaim] ANOMALY: ${candidates.length} candidates exceeds cap of ${MAX_EXPECTED_CANDIDATES}. ` +
      'Investigate upstream (mass-delete bug? reference harvest failure?) before trusting this list.');
    process.exit(1);
  }
  console.log('[r2-reclaim] ✓ normal run.');
  process.exit(0);
}

main().catch(e => { console.error('::error::r2-reclaim crashed', e); process.exit(1); });
