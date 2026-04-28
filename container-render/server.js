// ARENCON PDF Tile Renderer — mupdf Edition (S107)
//
// Replaces poppler+pdftoppm+PIL+Python (S94→S106) with mupdf via `mutool draw`.
// Renders engineering PDFs into a 5-level WebP tile pyramid in R2.
//
//   POST /api/render  body: { pid, drawingId, r2Key }  header: x-functions-key
//   GET  /api/health
//
// ── Architectural rule (S107 — DO NOT VIOLATE) ───────────────────────────────
//
//   No manual byte-level manipulation or channel reordering is ever allowed
//   in the rendering pipeline.
//
//   Mupdf produces unambiguous PAM RGB. Sharp consumes it directly as RGB
//   (raw: { channels: 3 }) and encodes WebP.
//
//   Prohibited: manual R↔B loops, .recomb for channel swaps, post-render
//   BGRA/RGBA swaps, or any other byte-level reordering.
//
//   Allowed: legitimate high-level Sharp color operations (tint, modulate,
//   gamma, etc.) for color-correctness purposes.
//
//   If color ever appears wrong, the fix belongs in the renderer configuration
//   or viewer composition — never in byte manipulation. The S102 post-render
//   BGRA-swap experiment introduced Bug A (L4 R/B inversion); subsequent
//   layered fix attempts (S103 sharp.recomb, S104 Buffer.from, S106 L3-upscale
//   guard) reduced the symptom but never fixed the cause. Switching to mupdf
//   eliminates the cause: there is no swap step in the pipeline anywhere.
//
//   S109e amendment: switched from RGBA (-c rgba) to RGB (-c rgb). PDFs have
//   no inherent page background — RGBA output yielded transparent black in
//   un-drawn regions, which composited as DARK against the FRT viewer's
//   canvas. RGB output flattens against white at render time, matching every
//   normal PDF viewer's behaviour and eliminating the "grey background" bug.
//
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);
const fsUnlink = promisify(fs.unlink);
const fsMkdir = promisify(fs.mkdir);
const fsRm = promisify(fs.rm);
const fsStat = promisify(fs.stat);

// ---- Constants ---------------------------------------------------------------

const TILE_SIZE = 512;
const THUMB_QUALITY = 75;              // L0 (thumbnail) — lossy, small
const STD_QUALITY = 92;                // L1/L2 — lossy, imperceptible at scale
const MAX_PARALLEL_UPLOADS = 12;
// S109c: lossless levels are CPU+memory-heavy. 12 parallel libvips lossless WebP
// encodings on a 384MB padded buffer can cause GC stalls and silent UV/sharp
// failures that surface as "PutObject succeeded but tile missing in R2".
// Cap concurrency on lossless levels to a safer number.
// S109d revert: dropping concurrency to 6 introduced visible inter-tile
// brightness seams in lossless WebP output. Reverting to 12 — the original
// pre-S109c behavior — until we can isolate why. The retry + verify + repair
// pipeline (kept) is what made renders complete; the concurrency cap was
// not the actual fix.
const MAX_PARALLEL_UPLOADS_LOSSLESS = 12;
// S109c: PutObject retry config. R2 occasionally returns transient 5xx or
// connection resets under heavy concurrent writes. Retry with exponential
// backoff before giving up.
const PUT_RETRY_ATTEMPTS = 3;
const PUT_RETRY_BASE_MS = 250;
const BUCKET = 'arencon-files';

// Longest-dimension targets per level (pyramid). Page is scaled so the
// longest axis hits this width; both portrait and landscape pages land at
// consistent DPI for each level.
const LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288];

// L2 + L3 + L4: WebP lossless (pixel-perfect for engineering text crispness).
// S109f: added L2 to lossless. L2 used to be lossy WebP at quality 92, which
// caused visible per-tile compression variance — the encoder applied stronger
// compression to mostly-white tiles and weaker compression to content-heavy
// tiles, leaving visible "fogginess" / brightness seams at tile boundaries.
// L2 has only 20 tiles per page so the storage cost of going lossless is
// negligible (~3MB per drawing, vs the 100+ MB pdfBuf).
const LOSSLESS_LEVELS = new Set([2, 3, 4]);

const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.API_KEY || '';

// R2 tile path prefix. Default 'tiles' matches existing FRT viewer.
// On the staging Fly app set R2_TILE_PREFIX=tiles-mupdf-staging so staging
// renders don't overwrite production tiles during A/B verification.
const TILE_PREFIX = process.env.R2_TILE_PREFIX || 'tiles';

// Mupdf binary location. Should be on PATH after `apt-get install mupdf-tools`.
const MUTOOL_BIN = process.env.MUTOOL_BIN || 'mutool';

// Build/version markers for /api/health and manifest.
const SERVICE_VERSION = '6.4.1-s110b';
const RENDERER_LABEL = 'mupdf-mutool-s110b';

// ---- R2 / S3 client ----------------------------------------------------------

let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 env vars (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)');
  }
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return s3Client;
}

// ---- R2 helpers --------------------------------------------------------------

async function downloadPdf(r2Key, log) {
  log(`R2 GET ${r2Key}`);
  const resp = await getS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: r2Key }));
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  log(`R2 GET ok — ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  return buf;
}

// ---- S109c: render trace store ----------------------------------------------
//
// Keeps detailed per-render diagnostic state in memory so we can introspect
// what actually happened on the most recent render without grovelling through
// Azure log streams. Exposed via GET /api/render-trace.
//
// Bounded — keeps the most recent N renders. State is rebuilt on container
// restart (which is fine — we only care about the most recent run).

const RENDER_TRACE_KEEP = 5;
const renderTraces = new Map();          // drawingId → trace object
const renderTraceOrder = [];             // insertion order (FIFO eviction)

function newTrace(drawingId, pid, r2Key) {
  const trace = {
    drawingId,
    pid,
    r2Key,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',                   // running | done | failed
    fatalError: null,
    pages: [],                           // [{ pageNumber, levels: [{ level, expected, putOk, putFailed, retries, verifyOk, verifyMissing, verifyRereuploaded }] }]
    summary: null,                       // populated on completion
  };
  renderTraces.set(drawingId, trace);
  renderTraceOrder.push(drawingId);
  while (renderTraceOrder.length > RENDER_TRACE_KEEP) {
    const evict = renderTraceOrder.shift();
    renderTraces.delete(evict);
  }
  return trace;
}

// ---- R2 ops with retry + verification ---------------------------------------

async function putTile(key, body, contentType) {
  let lastErr = null;
  for (let attempt = 1; attempt <= PUT_RETRY_ATTEMPTS; attempt++) {
    try {
      await getS3().send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: body, ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      return { ok: true, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (attempt < PUT_RETRY_ATTEMPTS) {
        const delay = PUT_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  // All attempts failed — throw with details so uploadAll captures it.
  throw new Error(`PutObject ${key} failed after ${PUT_RETRY_ATTEMPTS} attempts: ${lastErr.message}`);
}

async function headTile(key) {
  try {
    await getS3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function putManifest(key, manifest) {
  await getS3().send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: JSON.stringify(manifest),
    ContentType: 'application/json', CacheControl: 'public, max-age=60',
  }));
}

async function uploadAll(tasks, log, concurrency) {
  let i = 0, done = 0;
  const total = tasks.length;
  const errors = [];
  const limit = concurrency || MAX_PARALLEL_UPLOADS;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try { await tasks[idx](); } catch (err) {
        errors.push({ idx, err: err.message });
        // S109c: log every error, not just the first. Silent failures across
        // hundreds of tiles were invisible in the previous implementation.
        log(`    ✗ tile ${idx} upload failed: ${err.message}`);
      }
      done++;
      if (done % 50 === 0 || done === total) log(`    uploaded ${done}/${total}`);
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  // S109c: return errors instead of throwing. Caller decides how to react —
  // we want to keep going and record errors in the trace, not abort the whole
  // render. Verification pass runs afterward and fixes anything that's still
  // missing.
  return { total, ok: total - errors.length, errors };
}

// ---- mutool subprocess bridge ------------------------------------------------
//
// runMutool(args, log) — spawns `mutool <args>` and captures stdout/stderr.
// stderr is streamed to log() as it arrives; stdout is captured for the caller.
// Resolves with { stdout, code } on exit code 0, rejects otherwise.

function runMutool(args, log) {
  return new Promise((resolve, reject) => {
    const proc = spawn(MUTOOL_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    let stderrBuf = '';

    proc.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      let nl;
      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, nl);
        stderrBuf = stderrBuf.slice(nl + 1);
        if (line) log(`  mutool: ${line}`);
      }
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (stderrBuf) log(`  mutool: ${stderrBuf}`);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      if (code === 0) resolve({ stdout, code });
      else reject(new Error(`mutool exited ${code}: ${stderrBuf || stdout.slice(0, 300) || '(no output)'}`));
    });
  });
}

// ---- mutool: page metadata (sizes per page) ----------------------------------
//
// `mutool info -M <pdf>` lists Mediaboxes per page in points.
// Output (typical, fully explicit per-page MediaBoxes):
//
//   filename.pdf
//   PDF-1.4
//   Pages: 9
//   Retrieving info from pages 1-9...
//   Mediaboxes (9):
//        1     (3 0 R):    [ 0 0 2592 1728 ]
//        2     (5 0 R):    [ 0 0 2592 1728 ]
//        ...
//
// Output (Adobe-style PDFs with INHERITED MediaBox — S109 fix):
//
//   PDF-1.6
//   Pages: 9
//   Retrieving info from pages 1-9...
//   Mediaboxes (1):                            <-- only ONE box for ALL 9 pages
//        1     (5 0 R):    [ 0 0 2592 1728 ]
//
// PDF spec allows /MediaBox to be inherited from the /Pages tree node, in
// which case mutool reports it once instead of N times. Adobe PDF Library
// (used for engineering drawings) generates these. The S107 implementation
// looked only at Mediabox lines and saw 1 page when there were really 9 —
// the renderer then produced tiles for page 1 only and viewer fell back to
// stale content for pages 2..N.
//
// Authoritative source for page count is the "Pages: N" header line, which
// mutool emits regardless of inheritance.

async function mutoolPageInfo(pdfPath, log) {
  const { stdout } = await runMutool(['info', '-M', pdfPath], log);

  // 1) Authoritative page count from the "Pages: N" header line.
  const pagesHeaderMatch = stdout.match(/^Pages:\s+(\d+)/m);
  if (!pagesHeaderMatch) {
    throw new Error(`mutool info: missing "Pages:" header. stdout head: ${stdout.slice(0, 400)}`);
  }
  const totalPages = parseInt(pagesHeaderMatch[1], 10);
  if (totalPages < 1) {
    throw new Error(`mutool info: invalid page count ${totalPages}`);
  }

  // 2) Parse explicit Mediabox lines. May be 1..N depending on inheritance.
  // Match lines like:  "    1     (3 0 R):    [ 0 0 2592 1728 ]"
  // Tolerant of leading whitespace, tabs, and varying spacing.
  const lineRe = /^\s*(\d+)\s+\([^)]*\):\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/;
  const explicitBoxes = new Map(); // pageNum → { widthPt, heightPt }

  for (const line of stdout.split('\n')) {
    const m = lineRe.exec(line);
    if (!m) continue;
    const pageNum = parseInt(m[1], 10);
    const x0 = parseFloat(m[2]), y0 = parseFloat(m[3]);
    const x1 = parseFloat(m[4]), y1 = parseFloat(m[5]);
    const widthPt = Math.abs(x1 - x0);
    const heightPt = Math.abs(y1 - y0);
    if (widthPt > 0 && heightPt > 0) {
      explicitBoxes.set(pageNum, { widthPt, heightPt });
    }
  }

  if (explicitBoxes.size === 0) {
    throw new Error(`mutool info -M produced no parseable Mediaboxes. stdout head: ${stdout.slice(0, 400)}`);
  }

  // 3) Build the per-page list. For pages without an explicit MediaBox,
  // inherit from the lowest-numbered explicit box (typical PDF inheritance:
  // child pages walk up the /Pages tree to the nearest ancestor with a
  // /MediaBox). For Adobe-style single-root inheritance there's only one
  // box and it applies to every page.
  const sortedExplicit = [...explicitBoxes.entries()].sort((a, b) => a[0] - b[0]);
  const fallbackBox = sortedExplicit[0][1];
  const pages = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const box = explicitBoxes.get(pageNum) || fallbackBox;
    pages.push({ page: pageNum, widthPt: box.widthPt, heightPt: box.heightPt });
  }

  if (explicitBoxes.size < totalPages) {
    log(`mutool info: ${explicitBoxes.size} explicit MediaBox(es) for ${totalPages} pages — `
      + `pages without explicit boxes inherit ${fallbackBox.widthPt}x${fallbackBox.heightPt} pt`);
  }

  return pages;
}

// ---- PAM (Portable Arbitrary Map) parser -------------------------------------
//
// `mutool draw -F pam -c rgb` produces files of the form:
//
//   P7\n
//   WIDTH <w>\n
//   HEIGHT <h>\n
//   DEPTH 3\n
//   MAXVAL 255\n
//   TUPLTYPE RGB\n
//   ENDHDR\n
//   <raw bytes — width * height * 3 bytes of RGB>
//
// We read the file, scan for the `ENDHDR\n` marker, parse WIDTH / HEIGHT /
// DEPTH / TUPLTYPE from the header lines, and return { width, height, data }
// where `data` is a Buffer of exactly width*height*3 raw RGB bytes.
//
// S109e: switched from RGBA (DEPTH=4) to RGB (DEPTH=3). See mutoolRender
// docstring for rationale.

const PAM_HEADER_MAX_BYTES = 256;  // PAM headers are tiny — 7 short lines.
const ENDHDR = Buffer.from('ENDHDR\n', 'ascii');

async function readPamBitmap(pamPath) {
  const raw = await fsReadFile(pamPath);

  // Locate ENDHDR marker. It's always within the first ~120 bytes for our
  // headers; the cap is just a safety bound on malformed input.
  const searchEnd = Math.min(raw.length, PAM_HEADER_MAX_BYTES);
  const endhdrIdx = raw.slice(0, searchEnd).indexOf(ENDHDR);
  if (endhdrIdx < 0) {
    throw new Error(`PAM file missing ENDHDR marker (head: ${raw.slice(0, 80).toString('ascii')})`);
  }

  const header = raw.slice(0, endhdrIdx).toString('ascii');
  const dataStart = endhdrIdx + ENDHDR.length;

  // First line MUST be "P7" — that's the PAM magic number.
  const lines = header.split('\n');
  if (lines[0] !== 'P7') {
    throw new Error(`PAM file has wrong magic (expected "P7", got "${lines[0]}")`);
  }

  let width = 0, height = 0, depth = 0, maxval = 0, tupltype = '';
  for (const line of lines.slice(1)) {
    const [k, ...rest] = line.split(/\s+/);
    const v = rest.join(' ').trim();
    if (k === 'WIDTH')    width  = parseInt(v, 10);
    if (k === 'HEIGHT')   height = parseInt(v, 10);
    if (k === 'DEPTH')    depth  = parseInt(v, 10);
    if (k === 'MAXVAL')   maxval = parseInt(v, 10);
    if (k === 'TUPLTYPE') tupltype = v;
  }

  if (!width || !height) throw new Error(`PAM header missing WIDTH or HEIGHT`);
  if (depth !== 3)       throw new Error(`PAM header DEPTH=${depth} (expected 3 for RGB)`);
  if (maxval !== 255)    throw new Error(`PAM header MAXVAL=${maxval} (expected 255)`);
  // TUPLTYPE may be "RGB" (mupdf writes this for -c rgb). Don't hard-fail on
  // the string — DEPTH=3 + MAXVAL=255 is the byte-level contract.

  const expected = width * height * 3;
  const actual = raw.length - dataStart;
  if (actual !== expected) {
    throw new Error(`PAM byte count mismatch: header says ${width}x${height}x3=${expected}, got ${actual}`);
  }

  // Slice out the raw RGB bytes. .slice() shares the underlying buffer, so
  // this is O(1). We immediately hand it to sharp.
  const data = raw.slice(dataStart);
  return { width, height, data };
}

// ---- mutool: render a single page at a given DPI -----------------------------
//
// `mutool draw -F pam -c rgb -A 8 -r <dpi> -o <out> <pdf> <page>` renders
// page <page> (1-indexed) at <dpi> dots-per-inch into a PAM file at <out>.
//
//   -F pam   format: PAM (raw RGB after ASCII header)
//   -c rgb   colorspace: RGB, 3 channels, 8 bits each. NO ALPHA.
//   -A 8     anti-aliasing level (0-8). 8 is mupdf's highest quality.
//   -r N     resolution in DPI. Native PDF coords are at 72 DPI, so passing
//            DPI = scale * 72 produces a bitmap of (widthPt * scale) px wide.
//
// S109e fix: switched from `-c rgba` to `-c rgb`. PDF pages do not have a
// background color — they are transparent. With RGBA output, mupdf produced
// transparent-black pixels in regions where the PDF didn't draw anything,
// which composited as DARK against the FRT viewer's canvas background. With
// RGB output, mupdf flattens against white internally — the page background
// is a true opaque white in the bitmap, matching what users see in any normal
// PDF viewer. Eliminates the "grey background" bug that affected every page.
//
// We pass DPI rather than -w / -h because:
//   1. -w and -h together force a bounding-box fit which can subtly shift
//      aspect ratio at the px-rounding boundary. -r preserves aspect exactly.
//   2. The actual output dimensions are reported in the PAM header, which we
//      parse and trust as the ground truth.

async function mutoolRender(pdfPath, pageNum, scale, outPath, log) {
  const dpi = scale * 72;
  await runMutool(
    [
      'draw',
      '-F', 'pam',
      '-c', 'rgb',
      '-A', '8',
      '-r', dpi.toFixed(4),
      '-o', outPath,
      pdfPath,
      String(pageNum),
    ],
    log,
  );
  // Read back actual pixel dimensions from the PAM header. Don't return data
  // here — caller will read the file when ready (saves peak memory).
  const stat = await fsStat(outPath);
  if (stat.size < 64) {
    throw new Error(`mutool draw produced suspiciously small PAM (${stat.size} bytes)`);
  }
  // Read just the header to confirm dimensions for the manifest/log line.
  const fd = fs.openSync(outPath, 'r');
  const headerBuf = Buffer.alloc(PAM_HEADER_MAX_BYTES);
  fs.readSync(fd, headerBuf, 0, PAM_HEADER_MAX_BYTES, 0);
  fs.closeSync(fd);
  const endhdrIdx = headerBuf.indexOf(ENDHDR);
  if (endhdrIdx < 0) throw new Error('mutool draw output: PAM header missing ENDHDR');
  const headerStr = headerBuf.slice(0, endhdrIdx).toString('ascii');
  const wMatch = /\nWIDTH\s+(\d+)/.exec(headerStr);
  const hMatch = /\nHEIGHT\s+(\d+)/.exec(headerStr);
  if (!wMatch || !hMatch) throw new Error('mutool draw output: PAM header missing WIDTH/HEIGHT');
  return { width: parseInt(wMatch[1], 10), height: parseInt(hMatch[1], 10) };
}

// ---- Per-page render + tile --------------------------------------------------
//
// S109g: master-render-and-downsample pipeline.
//
// Previously each level called mutoolRender independently at that level's DPI.
// Two consequences:
//   1. At low DPI (L2 = 71 dpi), small text and fine vector lines were rendered
//      directly at low resolution by mupdf. Letterforms at 5–8 pixel height
//      lose detail no matter how good the AA. Visible as Bug C — some content
//      tiles look noticeably blurrier than others on the same level.
//   2. mupdf's edge anti-aliasing across the rendered area is not stable
//      between independent renders at different DPIs. Adjacent tiles in
//      lossless WebP encoded slightly different brightness for the same
//      vector geometry. Visible as Bug B — content-to-content seams at L2
//      and now L3.
//
// New pipeline:
//   1. Render the page ONCE at the highest level's DPI (L4, 341 dpi). This
//      gives mupdf the budget it needs to render all detail crisply.
//   2. For every level (including L4 itself), produce the level's bitmap by
//      Lanczos3 downsampling from the master. The master is a single buffer
//      with no internal tile boundaries, so downsampling is consistent across
//      what will become tile boundaries.
//   3. Pad to TILE_SIZE multiples and slice tiles as before. Encode WebP
//      (lossless for L2/L3/L4, lossy for L0/L1).
//
// Memory peak: master = 12288 × 8192 × 3 ≈ 300 MB held throughout the page.
// Resize ops add transient ~80 MB for L3, ~13 MB for L2. Easily within the
// 6.5 GB heap on Azure 8 GB hosts.
//
// Time: one mutool invocation per page instead of five — net faster despite
// the resize work, because mupdf rendering dominates and we're doing it once
// at maximum scale instead of five times.

async function renderPage(pdfPath, pageNumber, nativeWpt, nativeHpt, pid, drawingId, tmpDir, log, trace) {
  const longestDim = Math.max(nativeWpt, nativeHpt);
  const pageInfo = {
    pageNumber,
    nativeWidth: nativeWpt,
    nativeHeight: nativeHpt,
    levels: [],
  };
  // S109c: per-page trace bucket
  const pageTrace = { pageNumber, levels: [] };
  if (trace) trace.pages.push(pageTrace);

  log(`Page ${pageNumber}: native ${nativeWpt}x${nativeHpt} pt `
    + `(${(nativeWpt / 72).toFixed(1)}\" x ${(nativeHpt / 72).toFixed(1)}\")`);

  // S109g: master render at the highest level's DPI.
  const HIGHEST_LEVEL = LEVEL_WIDTHS.length - 1;
  const masterTarget = LEVEL_WIDTHS[HIGHEST_LEVEL];
  const masterScale = masterTarget / longestDim;
  log(`  Master render: scale=${masterScale.toFixed(4)} (target ${masterTarget}px on longest dim, ${(masterScale * 72).toFixed(0)} dpi)`);

  const masterPamPath = path.join(tmpDir, `p${pageNumber}_master.pam`);
  let masterW, masterH;
  try {
    const res = await mutoolRender(pdfPath, pageNumber, masterScale, masterPamPath, log);
    masterW = res.width;
    masterH = res.height;
    log(`  Master render: ${masterW}×${masterH} px`);
  } catch (err) {
    log(`  MASTER RENDER FAILED — ${err.message}; skipping page`);
    pageTrace.levels.push({ level: -1, fatalError: `master render: ${err.message}` });
    try { await fsUnlink(masterPamPath); } catch {}
    return pageInfo;
  }

  let masterRgb;
  try {
    const { data } = await readPamBitmap(masterPamPath);
    masterRgb = data;
  } catch (err) {
    log(`  MASTER READ FAILED — ${err.message}; skipping page`);
    pageTrace.levels.push({ level: -1, fatalError: `master read: ${err.message}` });
    try { await fsUnlink(masterPamPath); } catch {}
    return pageInfo;
  }
  try { await fsUnlink(masterPamPath); } catch {}

  // For each level, derive from master via resize (or use master directly for the highest level).
  for (let levelIdx = 0; levelIdx < LEVEL_WIDTHS.length; levelIdx++) {
    const target = LEVEL_WIDTHS[levelIdx];
    const targetScale = target / longestDim;
    // Compute level dims by scaling master, not by scaling native — keeps
    // pixel-dimension ratios consistent with the master we actually have.
    const levelW = (levelIdx === HIGHEST_LEVEL) ? masterW : Math.round(masterW * (target / masterTarget));
    const levelH = (levelIdx === HIGHEST_LEVEL) ? masterH : Math.round(masterH * (target / masterTarget));
    const useLossless = LOSSLESS_LEVELS.has(levelIdx);
    const qTag = useLossless ? 'lossless' : (levelIdx === 0 ? `q=${THUMB_QUALITY}` : `q=${STD_QUALITY}`);

    log(`  L${levelIdx}: ${levelW}×${levelH} via ${levelIdx === HIGHEST_LEVEL ? 'master' : 'lanczos3 downsample'} [${qTag}]`);

    // Tile grid.
    const cols = Math.ceil(levelW / TILE_SIZE);
    const rows = Math.ceil(levelH / TILE_SIZE);
    const padW = cols * TILE_SIZE;
    const padH = rows * TILE_SIZE;
    const expectedTiles = cols * rows;
    log(`  L${levelIdx}: ${cols}×${rows} tiles (${padW}×${padH} padded)`);

    // Build the padded buffer for this level.
    let padded;
    try {
      // For the highest level, use master directly. For lower levels, resize
      // from master with Lanczos3, then pad. Both end with a raw RGB buffer
      // sized padW × padH.
      let levelRgb;
      if (levelIdx === HIGHEST_LEVEL) {
        levelRgb = masterRgb;
      } else {
        // S110b: REVERT of S110a pad-and-extract.
        //
        // S110a tried to fix Bug B by padding the master, oversizing the
        // resize output, and extracting the inner region — theory was that
        // libvips strip-aligned artifacts would shift off the tile-cut grid.
        //
        // Empirical result S110: did NOT fix Bug B. Mean dLum at the
        // y=2/y=3 boundary went from 190 (s109g) to 205 (s110a) — slightly
        // worse, not better. The true root cause is something different:
        // the renderer's L2 row 1535 contains a near-solid-black row
        // (mean lum=22) while the L4 master at the corresponding region
        // is uniformly white (~235) and PIL Lanczos on the same L4
        // produces clean output (~239). Same input, completely different
        // output across the resize step. Genuine sharp/libvips bug or
        // pipeline interaction not yet localized.
        //
        // Revert to the simple S109g approach pending fresh investigation
        // next session. At least we won't make it worse.
        levelRgb = await sharp(masterRgb, {
          raw: { width: masterW, height: masterH, channels: 3 },
        })
          .resize(levelW, levelH, { kernel: 'lanczos3', fit: 'fill' })
          .raw()
          .toBuffer();
      }
      padded = await sharp(levelRgb, {
        raw: { width: levelW, height: levelH, channels: 3 },
      })
        .extend({
          right: padW - levelW,
          bottom: padH - levelH,
          background: { r: 255, g: 255, b: 255 },
        })
        .raw()
        .toBuffer();
      // Drop the resized buffer (master stays alive for next iteration).
      if (levelIdx !== HIGHEST_LEVEL) levelRgb = null;
    } catch (err) {
      log(`  L${levelIdx}: RESIZE/PAD FAILED — ${err.message}; skipping`);
      pageTrace.levels.push({ level: levelIdx, fatalError: `resize/pad: ${err.message}` });
      continue;
    }

    // Build tile specs.
    const tileSpecs = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        const tileKey = `${pid}/${TILE_PREFIX}/${drawingId}/page-${pageNumber}/level-${levelIdx}/${x}-${y}.webp`;
        tileSpecs.push({ x, y, left, top, tileKey });
      }
    }

    // Encode + upload factory.
    const buildEncodeAndPut = (spec) => async () => {
      const sharpInst = sharp(padded, {
        raw: { width: padW, height: padH, channels: 3 },
      }).extract({ left: spec.left, top: spec.top, width: TILE_SIZE, height: TILE_SIZE });

      let tileBuf;
      if (useLossless) {
        tileBuf = await sharpInst.webp({ lossless: true, effort: 4 }).toBuffer();
      } else {
        const q = levelIdx === 0 ? THUMB_QUALITY : STD_QUALITY;
        tileBuf = await sharpInst.webp({ quality: q, effort: 4 }).toBuffer();
      }
      await putTile(spec.tileKey, tileBuf, 'image/webp');
    };

    // ---- Upload pass --------------------------------------------------------
    const uploadTasks = tileSpecs.map(spec => buildEncodeAndPut(spec));
    const uploadConcurrency = useLossless ? MAX_PARALLEL_UPLOADS_LOSSLESS : MAX_PARALLEL_UPLOADS;
    const uploadResult = await uploadAll(uploadTasks, log, uploadConcurrency);
    log(`  L${levelIdx}: upload pass — ${uploadResult.ok}/${uploadResult.total} ok, ${uploadResult.errors.length} errors`);

    // ---- Verification pass: HeadObject every tile ---------------------------
    const missingSpecs = [];
    let verifyChecked = 0;
    {
      const verifyTasks = tileSpecs.map(spec => async () => {
        const exists = await headTile(spec.tileKey);
        if (!exists) missingSpecs.push(spec);
      });
      await uploadAll(verifyTasks, log, 24);
      verifyChecked = tileSpecs.length;
    }

    let repairedCount = 0;
    let stillMissingCount = 0;
    if (missingSpecs.length > 0) {
      log(`  L${levelIdx}: verify pass — ${missingSpecs.length}/${expectedTiles} tiles missing in R2; repairing`);
      const repairTasks = missingSpecs.map(spec => buildEncodeAndPut(spec));
      await uploadAll(repairTasks, log, uploadConcurrency);
      const stillMissing = [];
      const recheckTasks = missingSpecs.map(spec => async () => {
        const exists = await headTile(spec.tileKey);
        if (!exists) stillMissing.push(spec);
      });
      await uploadAll(recheckTasks, log, 24);
      repairedCount = missingSpecs.length - stillMissing.length;
      stillMissingCount = stillMissing.length;
      log(`  L${levelIdx}: repair — ${repairedCount}/${missingSpecs.length} recovered, ${stillMissingCount} still missing`);
    } else {
      log(`  L${levelIdx}: verify pass — all ${expectedTiles} tiles present in R2 ✓`);
    }

    pageTrace.levels.push({
      level: levelIdx,
      cols, rows, expected: expectedTiles,
      uploadOk: uploadResult.ok,
      uploadErrors: uploadResult.errors.length,
      uploadFirstErrors: uploadResult.errors.slice(0, 5),
      verifyChecked,
      verifyMissingAfterUpload: missingSpecs.length,
      repaired: repairedCount,
      stillMissing: stillMissingCount,
    });

    // Free the padded buffer (master remains for next level).
    padded = null;
    if (global.gc) global.gc();

    pageInfo.levels.push({
      level: levelIdx,
      tileSize: TILE_SIZE,
      cols, rows,
      width: levelW, height: levelH,
    });
  }

  // Free the master after all levels complete.
  masterRgb = null;
  if (global.gc) global.gc();

  return pageInfo;
}

// ---- KEDA-style heartbeat (preserved from S91 — works on any host) ----------
//
// Some platforms (Azure Container Apps, certain Fly.io configs) scale to zero
// when a replica is HTTP-idle. Long renders (5-8 min) trigger the cooldown.
// Workaround: while any render is active, ping our own /api/health every 30s
// to count as ingress traffic. When no renders are active, the heartbeat
// stops and the replica scales down normally.
//
// SELF_URL resolution order:
//   1. env SELF_URL (explicit override — set this on Fly.io)
//   2. CONTAINER_APP_NAME + CONTAINER_APP_ENV_DNS_SUFFIX (Azure auto-injection)
//   3. None (heartbeat skipped — only matters for scale-to-zero hosts)

const HEARTBEAT_INTERVAL_MS = 30000;
const SELF_URL = process.env.SELF_URL
  || (process.env.CONTAINER_APP_NAME && process.env.CONTAINER_APP_ENV_DNS_SUFFIX
      ? `https://${process.env.CONTAINER_APP_NAME}.${process.env.CONTAINER_APP_ENV_DNS_SUFFIX}`
      : null);

let activeRenders = 0;
let heartbeatTimer = null;

function startHeartbeat() {
  activeRenders++;
  if (heartbeatTimer || !SELF_URL) return;
  console.log(`[HEARTBEAT] start — self=${SELF_URL} interval=${HEARTBEAT_INTERVAL_MS}ms`);
  heartbeatTimer = setInterval(async () => {
    try {
      const r = await fetch(`${SELF_URL}/api/health`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) console.warn(`[HEARTBEAT] self-ping ${r.status}`);
    } catch (err) {
      console.warn(`[HEARTBEAT] self-ping failed: ${err.message}`);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  activeRenders = Math.max(0, activeRenders - 1);
  if (activeRenders === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log('[HEARTBEAT] stop — no active renders');
  }
}

// ---- Main render handler ----------------------------------------------------

async function handleRender(req, res) {
  const t0 = Date.now();
  const log = (msg) => console.log(msg);

  const { pid, drawingId, r2Key } = req.body || {};
  if (!pid || !drawingId || !r2Key) {
    return res.status(400).json({ error: 'Missing pid, drawingId, or r2Key' });
  }
  if (/\.\./.test(pid) || /\.\./.test(drawingId) || /\.\./.test(r2Key)) {
    return res.status(400).json({ error: 'Invalid characters (path traversal)' });
  }

  log(`=== render start pid=${pid} drawingId=${drawingId} ===`);
  log(`Renderer: ${RENDERER_LABEL} | Levels: ${LEVEL_WIDTHS.join(',')} `
    + `| Lossless: L${[...LOSSLESS_LEVELS].join(',L')} | TilePrefix: ${TILE_PREFIX}`);

  // Acknowledge the request now so the worker doesn't time out — the actual
  // render runs asynchronously in the background.
  res.json({ success: true, accepted: true, pid, drawingId, renderer: RENDERER_LABEL });

  // S109c: per-render trace, exposed via /api/render-trace.
  const trace = newTrace(drawingId, pid, r2Key);

  const tmpDir = path.join(os.tmpdir(), `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  startHeartbeat();
  try {
    await fsMkdir(tmpDir, { recursive: true });
    const pdfPath = path.join(tmpDir, 'input.pdf');

    const pdfBuf = await downloadPdf(r2Key, log);
    await fsWriteFile(pdfPath, pdfBuf);
    log(`PDF saved to ${pdfPath} (${(pdfBuf.length / 1024 / 1024).toFixed(1)} MB)`);

    // Page metadata (sizes in points) — single mutool invocation.
    const pages = await mutoolPageInfo(pdfPath, log);
    log(`mutool info: ${pages.length} page(s)`);

    const manifest = {
      version: 1,
      drawingId,
      pid,
      tileSize: TILE_SIZE,
      renderedAt: new Date().toISOString(),
      renderer: RENDERER_LABEL,
      // S109b: pageCount reflects ONLY pages with tiles actually written.
      // Updated after each page below. If the process dies mid-render, the
      // last successful manifest write reports the truthful count so the
      // viewer doesn't request 404-ing tiles for un-rendered pages.
      pageCount: 0,
      // S109b: totalPagesExpected is informational — the page count mutool
      // reported when the render started. Useful for "rendering 3/9..." UI.
      totalPagesExpected: pages.length,
      pages: [],
    };

    let totalTiles = 0;
    const manifestKey = `${pid}/${TILE_PREFIX}/${drawingId}/manifest.json`;

    for (let idx = 0; idx < pages.length; idx++) {
      const { page: pnum, widthPt, heightPt } = pages[idx];
      const pageInfo = await renderPage(pdfPath, pnum, widthPt, heightPt, pid, drawingId, tmpDir, log, trace);
      manifest.pages.push(pageInfo);
      manifest.pageCount = manifest.pages.length;  // S109b: keep in sync
      totalTiles += pageInfo.levels.reduce((s, l) => s + l.cols * l.rows, 0);

      // Progressive manifest — write after every page. If the process dies
      // on a later page the viewer can still use pages 1..idx+1.
      await putManifest(manifestKey, manifest);
      log(`Manifest updated: ${idx + 1}/${pages.length} pages, ${totalTiles} tiles so far`);
      if (global.gc) global.gc();
    }

    const durationMs = Date.now() - t0;
    log(`=== render done in ${(durationMs / 1000).toFixed(1)}s — ${totalTiles} tiles ===`);
    // S109c: summarize the trace.
    trace.status = 'done';
    trace.finishedAt = new Date().toISOString();
    trace.summary = summarizeTrace(trace);
    log(`Trace summary: ${JSON.stringify(trace.summary)}`);

  } catch (err) {
    console.error(`render failed: ${err.stack || err.message}`);
    trace.status = 'failed';
    trace.fatalError = err.message;
    trace.finishedAt = new Date().toISOString();
    trace.summary = summarizeTrace(trace);
  } finally {
    stopHeartbeat();
    try { await fsRm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// S109c: roll up trace details into a quick-glance summary.
function summarizeTrace(trace) {
  let totalExpected = 0, totalUploadOk = 0, totalUploadErrors = 0;
  let totalMissingAfterUpload = 0, totalRepaired = 0, totalStillMissing = 0;
  for (const p of trace.pages) {
    for (const l of p.levels) {
      if (l.fatalError) continue;
      totalExpected += l.expected || 0;
      totalUploadOk += l.uploadOk || 0;
      totalUploadErrors += l.uploadErrors || 0;
      totalMissingAfterUpload += l.verifyMissingAfterUpload || 0;
      totalRepaired += l.repaired || 0;
      totalStillMissing += l.stillMissing || 0;
    }
  }
  return {
    pages: trace.pages.length,
    totalTilesExpected: totalExpected,
    uploadPassOk: totalUploadOk,
    uploadPassErrors: totalUploadErrors,
    missingAfterUpload: totalMissingAfterUpload,
    repairedByVerify: totalRepaired,
    stillMissingAfterRepair: totalStillMissing,
  };
}

// ---- Express app ------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---- CORS ------------------------------------------------------------------
//
// The FRT viewer is hosted on https://hezhendong999-bot.github.io. Browsers
// block cross-origin requests unless the server explicitly allows them via
// Access-Control-Allow-Origin headers. We allow only the production GitHub
// Pages origin and respond to OPTIONS preflight requests.
//
// If you ever serve the FRT viewer from a different origin (custom domain,
// localhost dev), add it to ALLOWED_ORIGINS.
const ALLOWED_ORIGINS = new Set([
  'https://hezhendong999-bot.github.io',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-functions-key, x-api-key');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

function checkApiKey(req, res, next) {
  if (!API_KEY) return res.status(500).json({ error: 'API_KEY not configured' });
  const provided = req.headers['x-functions-key'] || req.headers['x-api-key'] || '';
  if (provided !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
  next();
}

app.post('/api/render', checkApiKey, (req, res) => { handleRender(req, res); });

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'arencon-pdf-render',
    version: SERVICE_VERSION,
    renderer: RENDERER_LABEL,
    levels: LEVEL_WIDTHS.length,
    losslessLevels: [...LOSSLESS_LEVELS],
    tilePrefix: TILE_PREFIX,
    activeRenders,
    heartbeat: heartbeatTimer ? 'active' : 'idle',
    // S109c: build markers — used to verify a deploy is live.
    build: 's110b-revert-to-simple-lanczos',
    selfUrlConfigured: !!SELF_URL,
    heapMb: process.env.HEAP_MB || 'default',
    time: new Date().toISOString(),
  });
});

// S109c: render trace introspection. Returns the in-memory trace for the
// most recent N renders so we can see exactly what each pass did — what
// tiles were attempted, uploaded, missing, repaired.
//   GET /api/render-trace                   — list all known drawingIds
//   GET /api/render-trace?drawingId=X       — full trace for a specific render
//   GET /api/render-trace?latest=1          — full trace for the most recent render
app.get('/api/render-trace', (req, res) => {
  const { drawingId, latest } = req.query;
  if (latest) {
    if (renderTraceOrder.length === 0) return res.json({ error: 'no traces yet' });
    const last = renderTraceOrder[renderTraceOrder.length - 1];
    return res.json(renderTraces.get(last));
  }
  if (drawingId) {
    const t = renderTraces.get(drawingId);
    if (!t) return res.status(404).json({ error: 'no trace for drawingId', drawingId });
    return res.json(t);
  }
  // No params — list summaries.
  const list = renderTraceOrder.map(id => {
    const t = renderTraces.get(id);
    return {
      drawingId: id,
      pid: t.pid,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      status: t.status,
      summary: t.summary,
    };
  });
  res.json({ count: list.length, traces: list });
});

app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`arencon-pdf-render v${SERVICE_VERSION} (${RENDERER_LABEL}) listening on :${PORT} | tilePrefix=${TILE_PREFIX}`);
});

