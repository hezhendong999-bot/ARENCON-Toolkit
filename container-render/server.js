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
//   Mupdf produces unambiguous PAM RGBA. Sharp consumes it directly as RGBA
//   (raw: { channels: 4 }) and encodes WebP.
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
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
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
const BUCKET = 'arencon-files';

// Longest-dimension targets per level (pyramid). Page is scaled so the
// longest axis hits this width; both portrait and landscape pages land at
// consistent DPI for each level.
const LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288];

// L3 + L4: WebP lossless (pixel-perfect for engineering text crispness).
const LOSSLESS_LEVELS = new Set([3, 4]);

const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.API_KEY || '';

// R2 tile path prefix. Default 'tiles' matches existing FRT viewer.
// On the staging Fly app set R2_TILE_PREFIX=tiles-mupdf-staging so staging
// renders don't overwrite production tiles during A/B verification.
const TILE_PREFIX = process.env.R2_TILE_PREFIX || 'tiles';

// Mupdf binary location. Should be on PATH after `apt-get install mupdf-tools`.
const MUTOOL_BIN = process.env.MUTOOL_BIN || 'mutool';

// Build/version markers for /api/health and manifest.
const SERVICE_VERSION = '6.0.0';
const RENDERER_LABEL = 'mupdf-mutool-s107';

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

async function putTile(key, body, contentType) {
  await getS3().send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: body, ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

async function putManifest(key, manifest) {
  await getS3().send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: JSON.stringify(manifest),
    ContentType: 'application/json', CacheControl: 'public, max-age=60',
  }));
}

async function uploadAll(tasks, log) {
  let i = 0, done = 0;
  const total = tasks.length;
  const errors = [];
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try { await tasks[idx](); } catch (err) { errors.push({ idx, err: err.message }); }
      done++;
      if (done % 50 === 0 || done === total) log(`    uploaded ${done}/${total}`);
    }
  }
  const workers = Array.from({ length: Math.min(MAX_PARALLEL_UPLOADS, tasks.length) }, worker);
  await Promise.all(workers);
  if (errors.length) {
    throw new Error(`${errors.length} upload(s) failed. First: ${errors[0].err}`);
  }
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
// `mutool draw -F pam -c rgba` produces files of the form:
//
//   P7\n
//   WIDTH <w>\n
//   HEIGHT <h>\n
//   DEPTH 4\n
//   MAXVAL 255\n
//   TUPLTYPE RGB_ALPHA\n
//   ENDHDR\n
//   <raw bytes — width * height * 4 bytes of RGBA>
//
// We read the file, scan for the `ENDHDR\n` marker, parse WIDTH / HEIGHT /
// DEPTH / TUPLTYPE from the header lines, and return { width, height, data }
// where `data` is a Buffer of exactly width*height*4 raw RGBA bytes.

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
  if (depth !== 4)       throw new Error(`PAM header DEPTH=${depth} (expected 4 for RGBA)`);
  if (maxval !== 255)    throw new Error(`PAM header MAXVAL=${maxval} (expected 255)`);
  // TUPLTYPE may be "RGB_ALPHA" (mupdf writes this for -c rgba). Don't
  // hard-fail on the string — DEPTH=4 + MAXVAL=255 is the byte-level contract.

  const expected = width * height * 4;
  const actual = raw.length - dataStart;
  if (actual !== expected) {
    throw new Error(`PAM byte count mismatch: header says ${width}x${height}x4=${expected}, got ${actual}`);
  }

  // Slice out the raw RGBA bytes. .slice() shares the underlying buffer, so
  // this is O(1). We immediately hand it to sharp.
  const data = raw.slice(dataStart);
  return { width, height, data };
}

// ---- mutool: render a single page at a given DPI -----------------------------
//
// `mutool draw -F pam -c rgba -A 8 -r <dpi> -o <out> <pdf> <page>` renders
// page <page> (1-indexed) at <dpi> dots-per-inch into a PAM file at <out>.
//
//   -F pam   format: PAM (raw RGBA after ASCII header)
//   -c rgba  colorspace: RGBA, 4 channels, 8 bits each
//   -A 8     anti-aliasing level (0-8). 8 is mupdf's highest quality.
//   -r N     resolution in DPI. Native PDF coords are at 72 DPI, so passing
//            DPI = scale * 72 produces a bitmap of (widthPt * scale) px wide.
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
      '-c', 'rgba',
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

async function renderPage(pdfPath, pageNumber, nativeWpt, nativeHpt, pid, drawingId, tmpDir, log) {
  const longestDim = Math.max(nativeWpt, nativeHpt);
  const pageInfo = {
    pageNumber,
    nativeWidth: nativeWpt,
    nativeHeight: nativeHpt,
    levels: [],
  };

  log(`Page ${pageNumber}: native ${nativeWpt}x${nativeHpt} pt `
    + `(${(nativeWpt / 72).toFixed(1)}\" x ${(nativeHpt / 72).toFixed(1)}\")`);

  for (let levelIdx = 0; levelIdx < LEVEL_WIDTHS.length; levelIdx++) {
    const target = LEVEL_WIDTHS[levelIdx];
    // Scale so the LONGEST dimension hits the target. Portrait and landscape
    // both land at consistent DPI for each level.
    const scale = target / longestDim;
    const estW = Math.round(nativeWpt * scale);
    const estH = Math.round(nativeHpt * scale);
    const useLossless = LOSSLESS_LEVELS.has(levelIdx);
    const qTag = useLossless ? 'lossless'
      : (levelIdx === 0 ? `q=${THUMB_QUALITY}` : `q=${STD_QUALITY}`);

    log(`  L${levelIdx}: render ~${estW}x${estH} via mupdf [${qTag}]`);

    const pamPath = path.join(tmpDir, `p${pageNumber}_l${levelIdx}.pam`);
    let actualW, actualH;
    try {
      const res = await mutoolRender(pdfPath, pageNumber, scale, pamPath, log);
      actualW = res.width;
      actualH = res.height;
    } catch (err) {
      log(`  L${levelIdx}: RENDER FAILED — ${err.message}; skipping`);
      try { await fsUnlink(pamPath); } catch {}
      continue;
    }

    // Tile grid for this level.
    const cols = Math.ceil(actualW / TILE_SIZE);
    const rows = Math.ceil(actualH / TILE_SIZE);
    const padW = cols * TILE_SIZE;
    const padH = rows * TILE_SIZE;

    log(`  L${levelIdx}: ${actualW}x${actualH} → ${cols}x${rows} tiles (${padW}x${padH} padded)`);

    // Read PAM bitmap, pad to multiple of TILE_SIZE, hand to sharp.
    let padded;
    try {
      const { data: rgba } = await readPamBitmap(pamPath);
      // CRITICAL: NO byte manipulation. PAM is RGBA. Sharp consumes it as RGBA.
      // No .recomb, no manual swap, no anything. Just pad and tile.
      padded = await sharp(rgba, {
        raw: { width: actualW, height: actualH, channels: 4 },
      })
        .extend({
          right: padW - actualW,
          bottom: padH - actualH,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .raw()
        .toBuffer();
    } catch (err) {
      log(`  L${levelIdx}: PAD FAILED — ${err.message}; skipping`);
      try { await fsUnlink(pamPath); } catch {}
      continue;
    }

    // Raw PAM on disk no longer needed — release disk pressure.
    try { await fsUnlink(pamPath); } catch {}

    // Tile + upload (bounded concurrency).
    const uploadTasks = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        const tileKey = `${pid}/${TILE_PREFIX}/${drawingId}/page-${pageNumber}/level-${levelIdx}/${x}-${y}.webp`;
        uploadTasks.push(async () => {
          const sharpInst = sharp(padded, {
            raw: { width: padW, height: padH, channels: 4 },
          }).extract({ left, top, width: TILE_SIZE, height: TILE_SIZE });

          let tileBuf;
          if (useLossless) {
            tileBuf = await sharpInst.webp({ lossless: true, effort: 4 }).toBuffer();
          } else {
            const q = levelIdx === 0 ? THUMB_QUALITY : STD_QUALITY;
            tileBuf = await sharpInst.webp({ quality: q, effort: 4, alphaQuality: 100 }).toBuffer();
          }
          await putTile(tileKey, tileBuf, 'image/webp');
        });
      }
    }

    await uploadAll(uploadTasks, log);

    padded = null;
    if (global.gc) global.gc();

    pageInfo.levels.push({
      level: levelIdx,
      tileSize: TILE_SIZE,
      cols, rows,
      width: actualW, height: actualH,
    });
  }

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
      const pageInfo = await renderPage(pdfPath, pnum, widthPt, heightPt, pid, drawingId, tmpDir, log);
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

  } catch (err) {
    console.error(`render failed: ${err.stack || err.message}`);
  } finally {
    stopHeartbeat();
    try { await fsRm(tmpDir, { recursive: true, force: true }); } catch {}
  }
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
    time: new Date().toISOString(),
  });
});

app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`arencon-pdf-render v${SERVICE_VERSION} (${RENDERER_LABEL}) listening on :${PORT} | tilePrefix=${TILE_PREFIX}`);
});
