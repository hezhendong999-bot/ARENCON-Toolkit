#!/usr/bin/env node
/**
 * S481 — NIGHTLY PHOTO-INTEGRITY SWEEP (Mark: the office-side early-warning net).
 *
 * Reads EVERY tool_data row (all projects, all tools) via the Supabase
 * service-role key, walks every photo record, and probes each photo's r2Url
 * (R2 GET is unauthenticated, so no R2 credential is needed). Reports every
 * photo whose pointer does NOT resolve — a broken pointer surfaces here, at
 * the office, within a day, instead of when a report is due in the field.
 *
 * This is the safety net BEHIND the structural guarantees (the no-orphan-delete
 * guard + merge pointer-protection). If anything ever slips a gate, this catches
 * it fast. It is READ-ONLY — it never mutates data, never deletes anything.
 *
 * Exit code: 0 if all pointers resolve; 1 if any broken pointer is found (so the
 * Actions run goes red and emails Mark). Writes reports/photo-integrity.json.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service-role read, bypasses RLS)
 */

import { writeFileSync, mkdirSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsemvinxsyphjiaqgywv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('::error::SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

const CONCURRENCY = 12;          // parallel HEAD/GET probes
const PROBE_TIMEOUT_MS = 15000;

function idOf(x){ return x && (x.id || x._id || null); }

// Walk a project blob and collect every photo record with a pointer.
function collectPhotos(row) {
  const out = [];
  const proj = row.data || {};
  const pushPhoto = (p, ctx) => {
    if (!p || typeof p !== 'object') return;
    if (p.deleted || p.purged) return;             // deleted photos are not expected to resolve
    if (!p.r2Url && !p.r2Key) return;              // no pointer to check (may be dataUrl-only / pending)
    out.push({
      row_id: row.id, project_id: row.project_id, tool_key: row.tool_key,
      instance: row.instance_number, photoId: idOf(p), r2Key: p.r2Key || null,
      r2Url: p.r2Url || null, ctx
    });
  };
  (proj.photos || []).forEach(p => pushPhoto(p, 'pool'));
  const walkDefics = (defics, who) => (defics || []).forEach(d => {
    (d.photos || []).forEach(p => pushPhoto(p, who + ':defic:' + idOf(d)));
    (d.observations || []).forEach(o => (o.photos || []).forEach(p => pushPhoto(p, who + ':obs')));
    (d.entries || []).forEach(e => (e.photos || []).forEach(p => pushPhoto(p, who + ':entry')));
    (d.activity || []).forEach(a => (a.photos || []).forEach(p => pushPhoto(p, who + ':activity')));
    // CRB thread photos
    (d.responses || []).forEach(r => (r.rectPhotos || r.photos || []).forEach(p => pushPhoto(p, who + ':crb-resp')));
    (d.arenconReviews || []).forEach(r => (r.followupPhotos || r.photos || []).forEach(p => pushPhoto(p, who + ':crb-review')));
  });
  (proj.contractors || []).forEach(c => walkDefics(c.deficiencies, 'ctr:' + idOf(c)));
  walkDefics(proj.generalDeficiencies, 'general');
  return out;
}

async function probe(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
  try {
    // 1-byte Range GET — the worker does not support HEAD (documented), and a
    // Range GET is cheap and confirms the object serves.
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? 'ok' : String(r.status);
  } catch (e) {
    clearTimeout(t);
    return 'neterr:' + (e && e.name || 'x');
  }
}

async function main() {
  console.log('[sweep] fetching all tool_data rows…');
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/tool_data?select=id,project_id,tool_key,instance_number,data`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!resp.ok) { console.error('::error::supabase read failed', resp.status); process.exit(1); }
  const rows = await resp.json();
  console.log(`[sweep] ${rows.length} rows`);

  let photos = [];
  for (const row of rows) {
    try { photos = photos.concat(collectPhotos(row)); }
    catch (e) { console.warn('[sweep] parse skip', row.id, e && e.message); }
  }
  console.log(`[sweep] ${photos.length} photo pointers to probe`);

  // Dedupe by r2Url so a shared key is probed once.
  const byUrl = new Map();
  for (const p of photos) { if (p.r2Url && !byUrl.has(p.r2Url)) byUrl.set(p.r2Url, p); }
  const uniq = [...byUrl.values()];

  const results = {};
  let i = 0;
  async function worker() {
    while (i < uniq.length) {
      const idx = i++; const p = uniq[idx];
      results[p.r2Url] = await probe(p.r2Url);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const broken = photos.filter(p => p.r2Url && results[p.r2Url] !== 'ok');
  const report = {
    generatedAt: new Date().toISOString(),
    rows: rows.length,
    photoPointers: photos.length,
    uniqueUrls: uniq.length,
    brokenCount: broken.length,
    broken: broken.map(b => ({ ...b, status: results[b.r2Url] }))
  };
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/photo-integrity.json', JSON.stringify(report, null, 2));

  if (broken.length === 0) {
    console.log(`[sweep] ✓ all ${uniq.length} photo pointers resolve. No broken photos.`);
    process.exit(0);
  }
  // Group broken by project for a readable summary.
  const byProj = {};
  broken.forEach(b => { (byProj[b.project_id] = byProj[b.project_id] || []).push(b); });
  console.error(`::error::[sweep] ${broken.length} BROKEN photo pointer(s) across ${Object.keys(byProj).length} project(s)`);
  Object.keys(byProj).forEach(pid => {
    console.error(`  project ${pid}: ${byProj[pid].length} broken`);
    byProj[pid].slice(0, 20).forEach(b =>
      console.error(`    [${b.status}] ${b.ctx} photo=${b.photoId} key=${b.r2Key}`));
  });
  process.exit(1);
}

main().catch(e => { console.error('::error::sweep crashed', e); process.exit(1); });
