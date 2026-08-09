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

/* S632 — known backlog of photo records saved with no pointer and no bytes.
   39 flow-test photos on 7318.02 (both projects) and 7155.51; every one of
   their objects was confirmed present in R2, so nothing is lost — the saved
   records simply do not say where. The write-side cause is open against the
   pump tools; the Hub reads them by rebuilding the address from the photo id.
   DROP THIS TO 0 once the write side is fixed and the 39 records are repaired.
   Leaving it here permanently would re-blind the sweep by a slower route. */
const NO_POINTER_BASELINE = 39;

function idOf(x){ return x && (x.id || x._id || null); }

// Walk a project blob and collect every photo record with a pointer.
function collectPhotos(row) {
  const out = [];
  const proj = row.data || {};
  const seenObjs = new WeakSet();                  // S632: one record per photo object, however it was reached
  const pushPhoto = (p, ctx) => {
    if (!p || typeof p !== 'object') return;
    if (seenObjs.has(p)) return; seenObjs.add(p);
    if (p.deleted || p.purged || p.delState === 'deleted' || p.delAt) return;  // deleted photos are not expected to resolve
    if (!p.r2Url && !p.r2Key) {
      /* S632 — A PHOTO RECORD WITH NO POINTER IS THE FAILURE, NOT AN EXEMPTION.
         This line used to skip such records outright, on the reasoning that
         they are "dataUrl-only / pending". That reasoning holds only while the
         record still carries its bytes. When it carries neither a pointer nor
         bytes, the report is describing a photograph that nothing can locate —
         precisely the condition this sweep exists to surface — and the sweep
         was stepping over it every night and reporting green.
         That is how 39 live flow-test photos on 7318.02 and 7155.51 stayed
         hidden for two months: their objects were in R2 the whole time, but the
         saved records pointed nowhere, so the Hub could not show them and this
         net could not see them. Found by counting thumbnails on a screen, which
         is not a monitoring strategy.
         Records that still hold bytes stay exempt — they are genuinely pending
         upload and nothing is at risk yet. */
      if (!p.d && !p.dataUrl) {
        out.push({
          row_id: row.id, project_id: row.project_id, tool_key: row.tool_key,
          instance: row.instance_number, photoId: idOf(p), r2Key: null,
          r2Url: null, ctx, noPointer: true
        });
      }
      return;
    }
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

  /* S632 — SCHEMA-BLIND SWEEP OF EVERYTHING ELSE.
     The named walks above are FRT's shape: the photo pool, contractor and
     general deficiencies, observations, entries, activity, CRB threads. They
     are exactly right for FRT and they stay. But they are the whole of what
     this sweep has ever looked at, and the pump tools keep their evidence
     somewhere else entirely — recordPhotos, flowTestPhotos, flowTestPhotosPld,
     checklist and placard photos. None of those containers appear above, so no
     Diesel or Electric photograph has ever been probed by the nightly job. The
     last run read 487 pointers and every one of them was FRT's.
     A named-container list can only ever protect the containers someone
     remembered to name, and it silently stops protecting a tool the day that
     tool grows a new one. So this walk recognises a photo by its SHAPE instead:
     any object carrying an R2 pointer, or a photo-style id with image bytes. It
     is deliberately the same schema-blind doctrine the reclamation report uses.
     Deduped by object identity against the named walks above, so anything they
     already found keeps its precise context label and is not counted twice; the
     path is the context for everything they missed. */
  const looksLikePhoto = (o) =>
    !!o && typeof o === 'object' && !Array.isArray(o) &&
    (typeof o.r2Key === 'string' || typeof o.r2Url === 'string' ||
     (typeof o.id === 'string' && /^(ph|dp|sp)_/.test(o.id) &&
      ('d' in o || 'dataUrl' in o || 'r2Status' in o || 'tag' in o)));

  (function deepWalk(node, path, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) deepWalk(node[i], path, depth + 1);
      return;
    }
    if (looksLikePhoto(node)) { pushPhoto(node, path); return; }
    for (const k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      const v = node[k];
      if (v && typeof v === 'object') deepWalk(v, path ? path + '.' + k : k, depth + 1);
    }
  })(proj, '', 0);

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
  /* S632: pointerless records cannot be probed — there is nothing to probe.
     They are a finding in their own right and are reported separately below. */
  const noPointer = photos.filter(p => p.noPointer);
  const pointered = photos.filter(p => !p.noPointer);
  console.log(`[sweep] ${pointered.length} photo pointers to probe, ${noPointer.length} record(s) with NO pointer at all`);

  // Dedupe by r2Url so a shared key is probed once.
  const byUrl = new Map();
  for (const p of pointered) { if (p.r2Url && !byUrl.has(p.r2Url)) byUrl.set(p.r2Url, p); }
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

  const broken = pointered.filter(p => p.r2Url && results[p.r2Url] !== 'ok');
  const report = {
    generatedAt: new Date().toISOString(),
    rows: rows.length,
    photoPointers: pointered.length,
    uniqueUrls: uniq.length,
    brokenCount: broken.length,
    broken: broken.map(b => ({ ...b, status: results[b.r2Url] })),
    noPointerCount: noPointer.length,
    noPointerBaseline: NO_POINTER_BASELINE,
    noPointer: noPointer
  };
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/photo-integrity.json', JSON.stringify(report, null, 2));

  /* S632: the known backlog must not drown the signal. The count is printed
     loudly every run, but the job only goes RED when it grows past the recorded
     baseline — so a NEW pointerless photo is a red run the next morning, while
     the 39 already on the books stay visible without crying wolf nightly. */
  if (noPointer.length > 0) {
    console.log(`[sweep] ${noPointer.length} photo record(s) carry NO pointer and NO bytes (baseline ${NO_POINTER_BASELINE}).`);
    const npByProj = {};
    noPointer.forEach(n => { (npByProj[n.project_id] = npByProj[n.project_id] || []).push(n); });
    Object.keys(npByProj).forEach(pid =>
      console.log(`    project ${pid}: ${npByProj[pid].length} (${npByProj[pid].slice(0,3).map(n => n.ctx).join(', ')}…)`));
  }
  if (noPointer.length > NO_POINTER_BASELINE) {
    console.error(`::error::[sweep] pointerless photo records GREW: ${noPointer.length} > baseline ${NO_POINTER_BASELINE}. A photo has been saved that nothing can locate.`);
    process.exit(1);
  }

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
