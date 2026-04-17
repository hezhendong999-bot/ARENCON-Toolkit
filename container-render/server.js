// ARENCON PDF Tile Render — Container Edition
// Session 89 — native poppler (pdftocairo) replacing WASM pdfium
//
// POST /api/render
// Headers: x-functions-key: <api key>
// Body: { pid, drawingId, r2Key }
//
// Downloads PDF from R2, renders each page at 5 zoom levels using native
// pdftocairo (poppler), slices into 512×512 WebP tiles, uploads tiles +
// manifest back to R2.
//
// Why pdftocairo: native FreeType font hinting + subpixel rendering produces
// razor-sharp engineering text. WASM pdfium had these features compiled out,
// causing visibly soft text compared to Fieldwire.
//
// Manifest schema identical to S88 — FRT viewer consumes tiles unchanged.

const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const execFileAsync = promisify(execFile);
const fsWriteFile = promisify(fs.writeFile);
const fsUnlink = promisify(fs.unlink);
const fsMkdir = promisify(fs.mkdir);
const fsRm = promisify(fs.rm);

// ---- Constants (unchanged from S88) ----------------------------------------

const TILE_SIZE = 512;
const THUMB_QUALITY = 75;         // L0 thumbnail only
const STD_QUALITY = 92;           // Lossy levels: L1, L2
const MAX_PARALLEL_UPLOADS = 12;
const BUCKET = 'arencon-files';

// Level target size (longest page dimension, in pixels).
// L5 (24576px) still excluded — even with native rendering, the raw bitmap
// (1.6 GB) would dominate container memory. Can revisit with streaming tiles.
const LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288];

// Levels using lossless WebP encoding (pixel-perfect engineering line work).
const LOSSLESS_LEVELS = new Set([3, 4]);

const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.API_KEY || '';

// ---- R2 / S3 client (built once) ------------------------------------------

let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY env vars');
  }
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return s3Client;
}

// ---- R2 helpers (unchanged from S88) ---------------------------------------

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
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

async function putManifest(key, manifest) {
  await getS3().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: JSON.stringify(manifest),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=60',
  }));
}

// Throttled parallel upload pool — bounded concurrency without external deps.
async function uploadAll(tasks, log) {
  let i = 0;
  let done = 0;
  const total = tasks.length;
  const errors = [];
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        await tasks[idx]();
      } catch (err) {
        errors.push({ idx, err: err.message });
      }
      done++;
      if (done % 50 === 0 || done === total) log(`    uploaded ${done}/${total}`);
    }
  }
  const workers = Array.from({ length: Math.min(MAX_PARALLEL_UPLOADS, tasks.length) }, worker);
  await Promise.all(workers);
  if (errors.length) {
    throw new Error(`${errors.length} tile upload(s) failed. First: ${errors[0].err}`);
  }
}

// ---- Get PDF page count via pdfinfo ----------------------------------------

async function getPdfPageCount(pdfPath, log) {
  const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error('Could not determine page count from pdfinfo');
  const count = parseInt(match[1], 10);
  log(`pdfinfo: ${count} page(s)`);
  return count;
}

// ---- Get native page dimensions via pdfinfo --------------------------------

function parsePdfInfo(stdout) {
  // Parse "Page N size: W x H pts" lines from pdfinfo output
  const pages = {};
  const sizeRegex = /^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/gm;
  let m;
  while ((m = sizeRegex.exec(stdout)) !== null) {
    pages[parseInt(m[1], 10)] = {
      width: parseFloat(m[2]),
      height: parseFloat(m[3]),
    };
  }
  // Fallback: single "Page size:" line (non -l mode)
  if (Object.keys(pages).length === 0) {
    const single = stdout.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)/m);
    if (single) {
      pages[1] = { width: parseFloat(single[1]), height: parseFloat(single[2]) };
    }
  }
  return pages;
}

async function getPdfPageSizes(pdfPath, pageCount, log) {
  const { stdout } = await execFileAsync('pdfinfo', [
    '-f', '1', '-l', String(pageCount), pdfPath
  ]);
  const sizes = parsePdfInfo(stdout);
  log(`pdfinfo: got dimensions for ${Object.keys(sizes).length} page(s)`);
  return sizes;
}

// ---- Render a single page at a single level using pdftocairo ---------------

async function renderPageAtLevel(pdfPath, pageNum, targetWidth, tmpDir) {
  const outPrefix = path.join(tmpDir, `p${pageNum}_w${targetWidth}`);
  // pdftocairo -png -scale-to <W> scales the LONGEST dimension to W pixels.
  // This matches our existing LEVEL_WIDTHS semantics exactly.
  await execFileAsync('pdftocairo', [
    '-png',
    '-scale-to', String(targetWidth),
    '-f', String(pageNum),
    '-l', String(pageNum),
    '-singlefile',
    '-antialias', 'best',
    pdfPath,
    outPrefix,
  ], {
    // pdftocairo can use substantial memory for large renders; allow up to 5 min
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return outPrefix + '.png';
}

// ---- Per-page render + tile ------------------------------------------------

async function renderPage(pdfPath, pageNumber, nativeW, nativeH, pid, drawingId, tmpDir, log) {
  const longestDim = Math.max(nativeW, nativeH);

  const pageInfo = {
    pageNumber,
    nativeWidth: nativeW,
    nativeHeight: nativeH,
    levels: [],
  };

  log(`Page ${pageNumber}: native ${nativeW}x${nativeH} pt (${(nativeW / 72).toFixed(1)}" x ${(nativeH / 72).toFixed(1)}")`);

  for (let levelIdx = 0; levelIdx < LEVEL_WIDTHS.length; levelIdx++) {
    const target = LEVEL_WIDTHS[levelIdx];
    const scale = target / longestDim;
    const estW = Math.round(nativeW * scale);
    const estH = Math.round(nativeH * scale);

    log(`  L${levelIdx}: rendering ${estW}x${estH} via pdftocairo -scale-to ${target}`);

    let pngPath;
    try {
      pngPath = await renderPageAtLevel(pdfPath, pageNumber, target, tmpDir);
    } catch (err) {
      log(`  L${levelIdx}: RENDER FAILED — ${err.message}; skipping`);
      continue;
    }

    // Read rendered PNG metadata to get actual dimensions
    let meta;
    try {
      meta = await sharp(pngPath).metadata();
    } catch (err) {
      log(`  L${levelIdx}: PNG READ FAILED — ${err.message}; skipping`);
      try { await fsUnlink(pngPath); } catch {}
      continue;
    }

    const actualW = meta.width;
    const actualH = meta.height;

    // Tile the level into TILE_SIZE × TILE_SIZE WebP tiles
    const cols = Math.ceil(actualW / TILE_SIZE);
    const rows = Math.ceil(actualH / TILE_SIZE);
    const padW = cols * TILE_SIZE;
    const padH = rows * TILE_SIZE;
    const useLossless = LOSSLESS_LEVELS.has(levelIdx);
    const qTag = useLossless ? 'lossless' : (levelIdx === 0 ? `q=${THUMB_QUALITY}` : `q=${STD_QUALITY}`);
    log(`  L${levelIdx}: ${actualW}x${actualH} → ${cols}x${rows} tiles [${qTag}]`);

    // Pad to tile-size multiple (sharp reads directly from PNG — no raw buffer needed)
    let padded;
    try {
      padded = await sharp(pngPath)
        .ensureAlpha()
        .extend({
          right: padW - actualW,
          bottom: padH - actualH,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .raw()
        .toBuffer();
    } catch (err) {
      log(`  L${levelIdx}: PAD FAILED — ${err.message}; skipping`);
      try { await fsUnlink(pngPath); } catch {}
      continue;
    }

    // Delete temp PNG immediately — we have the raw buffer
    try { await fsUnlink(pngPath); } catch {}

    // Build upload tasks for THIS level
    const uploadTasks = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        const tileKey = `${pid}/tiles/${drawingId}/page-${pageNumber}/level-${levelIdx}/${x}-${y}.webp`;
        uploadTasks.push(async () => {
          const sharpInst = sharp(padded, { raw: { width: padW, height: padH, channels: 4 } })
            .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE });
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

    // Upload THIS level's tiles before next level (bounds peak memory)
    await uploadAll(uploadTasks, log);

    // Free padded buffer
    padded = null;
    if (global.gc) global.gc();

    pageInfo.levels.push({
      level: levelIdx,
      tileSize: TILE_SIZE,
      cols,
      rows,
      width: actualW,
      height: actualH,
    });
  }

  return pageInfo;
}

// ---- Main render handler ---------------------------------------------------

async function handleRender(req, res) {
  const t0 = Date.now();
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };

  const { pid, drawingId, r2Key } = req.body || {};
  if (!pid || !drawingId || !r2Key) {
    return res.status(400).json({ error: 'Missing pid, drawingId, or r2Key' });
  }
  if (/\.\./.test(pid) || /\.\./.test(drawingId) || /\.\./.test(r2Key)) {
    return res.status(400).json({ error: 'Invalid characters in identifiers' });
  }

  log(`=== render start pid=${pid} drawingId=${drawingId} r2Key=${r2Key} ===`);
  log(`Renderer: pdftocairo (native poppler) | Levels: ${LEVEL_WIDTHS.join(',')} | Lossless: L${[...LOSSLESS_LEVELS].join(',L')}`);

  // Create temp directory for this render job
  const tmpDir = path.join(os.tmpdir(), `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fsMkdir(tmpDir, { recursive: true });
  const pdfPath = path.join(tmpDir, 'input.pdf');

  try {
    // Download PDF from R2
    const pdfBuf = await downloadPdf(r2Key, log);
    await fsWriteFile(pdfPath, pdfBuf);
    log(`PDF saved to ${pdfPath} (${(pdfBuf.length / 1024 / 1024).toFixed(1)} MB)`);

    // Free the in-memory PDF buffer — we read from disk from here
    // (128MB PDFs shouldn't linger while rendering burns 400MB+ per level)
    // pdfBuf is const so we can't null it, but leaving scope handles it.

    // Get page count and dimensions
    const pageCount = await getPdfPageCount(pdfPath, log);
    const pageSizes = await getPdfPageSizes(pdfPath, pageCount, log);

    const manifest = {
      version: 1,
      drawingId,
      pid,
      tileSize: TILE_SIZE,
      renderedAt: new Date().toISOString(),
      renderer: 'pdftocairo',
      pageCount,
      pages: [],
    };

    let totalTiles = 0;
    const manifestKey = `${pid}/tiles/${drawingId}/manifest.json`;

    for (let p = 1; p <= pageCount; p++) {
      // Get native dimensions (pts) — fallback to page 1 if not found
      const sz = pageSizes[p] || pageSizes[1] || { width: 792, height: 612 };
      const pageInfo = await renderPage(pdfPath, p, sz.width, sz.height, pid, drawingId, tmpDir, log);
      manifest.pages.push(pageInfo);
      totalTiles += pageInfo.levels.reduce((s, l) => s + l.cols * l.rows, 0);

      // Progressive manifest: write after each page
      await putManifest(manifestKey, manifest);
      log(`Manifest updated: ${p}/${pageCount} pages, ${totalTiles} tiles so far`);

      // GC between pages — prevent memory fragmentation from accumulating
      if (global.gc) { global.gc(); log(`  GC after page ${p}`); }
    }

    log(`Final manifest written: ${manifestKey}`);
    const durationMs = Date.now() - t0;
    log(`=== render done in ${(durationMs / 1000).toFixed(1)}s — ${totalTiles} tiles ===`);

    res.json({
      success: true,
      pid,
      drawingId,
      pageCount,
      totalTiles,
      manifestKey,
      durationMs,
      renderer: 'pdftocairo',
      levels: LEVEL_WIDTHS.length,
    });
  } catch (err) {
    console.error(`render failed: ${err.stack || err.message}`);
    res.status(500).json({ error: err.message, type: err.name || 'RenderError' });
  } finally {
    // Cleanup temp directory
    try { await fsRm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ---- Express app -----------------------------------------------------------

const app = express();
app.use(express.json({ limit: '1mb' }));

// Auth middleware for /api/render
function checkApiKey(req, res, next) {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API_KEY not configured on container' });
  }
  // Accept x-functions-key header (backward compat with Worker)
  // or standard x-api-key header
  const provided = req.headers['x-functions-key'] || req.headers['x-api-key'] || '';
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// POST /api/render — matches Azure Function path for zero Worker changes
app.post('/api/render', checkApiKey, (req, res) => {
  // Fire-and-forget: respond 200 immediately, render in background.
  // NOTE: Unlike Azure Functions, Container Apps won't kill us after 230s.
  // We still respond fast so the Worker's ctx.waitUntil resolves quickly.
  // But we DO wait for completion and return the real result, because
  // Container Apps supports long-running HTTP (up to 30 min timeout).
  handleRender(req, res);
});

// GET /api/health — unauthenticated
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'arencon-pdf-render',
    version: '3.0.0',
    renderer: 'pdftocairo',
    levels: LEVEL_WIDTHS.length,
    losslessLevels: [...LOSSLESS_LEVELS],
    time: new Date().toISOString(),
  });
});

// Catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`arencon-pdf-render v3.0.0 (pdftocairo) listening on :${PORT}`);
});
