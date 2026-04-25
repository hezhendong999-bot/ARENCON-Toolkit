// ARENCON PDF Tile Render Function
// Session 102 — Monolithic L0/L1/L2 (single padded-square tile per level)
//   Eliminates per-<img> rasterization seams at fit-zoom. See MONOLITHIC_LEVELS.
// Session 88 — pdfium swap + L5 (24576px) + WebP lossless at L3/L4
// Session 85 origin — Azure Functions Node.js v4 programming model
//
// POST /api/render
// Headers: x-functions-key: <function key>
// Body: { pid, drawingId, r2Key }
//
// Downloads PDF from R2, renders each page at 6 zoom levels using @hyzyla/pdfium
// (Chrome's PDF renderer, WebAssembly build — dramatically sharper text than pdfjs-dist),
// slices into 512x512 WebP tiles, uploads tiles + manifest back to R2.
//
// Manifest schema unchanged from S87 (FRT viewer reads per-page levels[] array
// dynamically — extra level per page is transparent to client).

const { app } = require('@azure/functions');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PDFiumLibrary } = require('@hyzyla/pdfium');
const sharp = require('sharp');

// ---- Constants ------------------------------------------------------------

const TILE_SIZE = 512;
const THUMB_QUALITY = 75;         // L0 thumbnail only
const STD_QUALITY = 92;           // Lossy levels: L1, L2
const MAX_PARALLEL_UPLOADS = 12;
const BUCKET = 'arencon-files';

// Level target size (longest page dimension, in pixels).
// Scale per level = target / max(nativeW, nativeH) in points.
// L4 (12288px) = ~341 DPI native on a 36" sheet — crisp engineering text.
// L5 (24576px) removed: pdfium's WASM heap is hard-capped at 2 GB; a 24576×16384
// bitmap = 1.6 GB leaves no headroom for pdfium's internal state, causing
// "Cannot enlarge memory" + OOM kill (exit code 137) after 3 pages.
const LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288];

// S102 — Monolithic levels: render as a single padded-square tile (cols=1, rows=1)
// instead of slicing into 512×512 chunks. Eliminates per-<img> rasterization seams
// at fit-zoom (the L2 grey-grid issue) by giving the viewer one image with no
// internal element boundaries. Constrained to L0/L1/L2 because L3/L4 monolithic
// would exceed iPad GPU texture limits (a 12288×12288 padded square is 600M px).
//
// Verified S102 via 3×3 merged-tile diagnostic: a single <img> spanning a 1536×1536
// region had ZERO internal seams while the rest of the drawing (still tiled) did.
// Mark visually confirmed.
//
// Storage impact: padded square at L2 (e.g., 2560×2560 covering 2560×1700 content)
// adds ~50% area but the white pad compresses to near-zero in WebP. Net file size
// is comparable to or smaller than the current 5×4 grid of 512×512 tiles, since
// fewer headers and better global encoder context offset the pad.
const MONOLITHIC_LEVELS = new Set([0, 1, 2]);

// Levels using lossless WebP encoding (pixel-perfect engineering line work).
// L3 (6144px) and L4 (12288px) are the zoom tiers where users read text —
// lossless eliminates any encoder-introduced edge artifacts.
// L0/L1/L2 stay lossy (thumbs, far-zoom, imperceptible).
//
// S102 attempted L2 lossless to fix the L2 fit-zoom grid seam (see dead-end
// #11 in the seam-investigation log). Hypothesis was that per-tile WebP
// prediction-context shifts at boundaries (~7 unit/channel) were creating
// the visible seam. Mode 2 single-<img> diagnostic proved seam IS in source
// pixel content; lossless L2 was the proposed fix. After deploy + tile
// pyramid regeneration on test drawing, seam was UNCHANGED at L2 fit zoom.
// Encoding context was not the cause. The seam likely originates further
// upstream (pdfium rendering producing faint per-tile gradients, or bilinear
// sampling artifacts intrinsic to the slicing+display pipeline). Reverted.
const LOSSLESS_LEVELS = new Set([3, 4]);

// Per-level bitmap memory budget. pdfium WASM heap = 2 GB hard cap.
// Budget set lower to leave headroom for pdfium's internal rendering state
// (font caches, path buffers, transparency groups).
const MAX_LEVEL_BYTES = 1_500_000_000;   // 1.5 GB

// ---- Lazy-loaded pdfium (WASM, zero native deps) --------------------------

let pdfiumLibrary = null;
async function getPdfium() {
  if (pdfiumLibrary) return pdfiumLibrary;
  pdfiumLibrary = await PDFiumLibrary.init();
  return pdfiumLibrary;
}

// ---- R2 / S3 client (built once per warm instance) ------------------------

let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY app settings');
  }
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return s3Client;
}

// ---- R2 helpers (unchanged from S87) --------------------------------------

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

// ---- Custom pdfium render callback: BGRA -> RGBA, return raw bitmap -------
//
// pdfium defaults to BGRA colorspace. Sharp encodes RGB channel order to
// JPEG/WebP/PNG, so passing BGRA raw → sharp.webp() would swap red and blue
// in the output (visible on colored annotations; invisible on black line work).
// We do the swap once here before handing to sharp. In-place on the returned
// Uint8Array — pdfium passes us the fresh copy, it's ours to mutate.
//
// Perf: ~100M ops/sec on V8, so ~4s for a 400MP L5 bitmap. Acceptable against
// multi-second render + encode time.

function bgraToRgbaRender({ data }) {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const b = data[i];
    data[i] = data[i + 2];   // R = old B
    data[i + 2] = b;         // B = old R
    // G (i+1) and A (i+3) unchanged
  }
  return Promise.resolve(data);
}

// ---- Per-page render + tile (pdfium-based, per-level upload) --------------

async function renderPage(pdfDoc, pageNumber, pid, drawingId, log) {
  // Native size is discovered on the L0 iteration via getOriginalSize() (no
  // render needed — it's a metadata call on the loaded page). Subsequent levels
  // re-load the page since render auto-closes.
  const pageInfo = {
    pageNumber,
    nativeWidth: 0,
    nativeHeight: 0,
    levels: [],
  };
  let nativeW = 0;
  let nativeH = 0;
  let longestDim = 0;

  for (let levelIdx = 0; levelIdx < LEVEL_WIDTHS.length; levelIdx++) {
    // Load fresh page — render auto-closes at the end of the call
    const page = pdfDoc.getPage(pageNumber - 1);

    // First iteration: capture native dimensions (this is a cheap metadata call
    // on the already-loaded page; page stays loaded for the render below)
    if (levelIdx === 0) {
      const sz = page.getOriginalSize();
      nativeW = sz.originalWidth;
      nativeH = sz.originalHeight;
      longestDim = Math.max(nativeW, nativeH);
      pageInfo.nativeWidth = nativeW;
      pageInfo.nativeHeight = nativeH;
      log(`Page ${pageNumber}: native ${nativeW}x${nativeH} pt (${(nativeW / 72).toFixed(1)}\" x ${(nativeH / 72).toFixed(1)}\")`);
    }

    const target = LEVEL_WIDTHS[levelIdx];
    // Scale so the LONGEST dimension hits the target. This keeps portrait pages
    // from producing 3GB buffers at L5 while still reaching high DPI on landscape.
    const scale = target / longestDim;
    const w = Math.round(nativeW * scale);
    const h = Math.round(nativeH * scale);

    // Memory budget gate — skip L5 (or any level) that would exceed safe bitmap size.
    // Note: we've already loaded the page for this iteration; flush it with a tiny
    // render so pdfium closes it (otherwise the loaded page leaks until doc.destroy).
    const expectedBytes = w * h * 4;
    if (expectedBytes > MAX_LEVEL_BYTES) {
      log(`  L${levelIdx}: SKIP ${w}x${h} (${(expectedBytes / 1e9).toFixed(2)} GB exceeds ${(MAX_LEVEL_BYTES / 1e9).toFixed(1)} GB budget)`);
      try { await page.render({ scale: 0.05, render: ({ data }) => Promise.resolve(data) }); } catch {}
      continue;
    }

    log(`  L${levelIdx}: render ${w}x${h} @ scale ${scale.toFixed(3)} (${(expectedBytes / 1e6).toFixed(0)} MB bitmap)`);

    // Render at this level's scale (page auto-closes)
    let renderResult = null;
    try {
      renderResult = await page.render({
        scale,
        render: bgraToRgbaRender,
      });
    } catch (err) {
      // WASM OOM or pdfium internal error — log and skip this level
      log(`  L${levelIdx}: RENDER FAILED — ${err.message}; skipping this level`);
      continue;
    }

    const rgba = renderResult.data;
    const actualW = renderResult.width;
    const actualH = renderResult.height;

    // S102 — monolithic level handling: force 1×1 grid by using a tile size
    // that covers the whole bitmap. Pads to a square, but white pad compresses
    // near-free in WebP. Eliminates per-<img> seams at fit-zoom on the client.
    const isMonolithic = MONOLITHIC_LEVELS.has(levelIdx);
    const effTileSize = isMonolithic ? Math.max(actualW, actualH) : TILE_SIZE;

    // Tile the level into effTileSize × effTileSize WebP tiles
    const cols = Math.ceil(actualW / effTileSize);
    const rows = Math.ceil(actualH / effTileSize);
    const padW = cols * effTileSize;
    const padH = rows * effTileSize;
    const useLossless = LOSSLESS_LEVELS.has(levelIdx);
    const qTag = useLossless ? 'lossless' : (levelIdx === 0 ? `q=${THUMB_QUALITY}` : `q=${STD_QUALITY}`);
    log(`  L${levelIdx}: ${cols}x${rows} tiles @ ${effTileSize}px [${qTag}]${isMonolithic ? ' (monolithic)' : ''}`);

    // Pre-pad to multiple of effTileSize so every tile is the full size.
    // Sharp does this efficiently — streaming to .raw().toBuffer() once.
    let padded;
    try {
      padded = await sharp(rgba, { raw: { width: actualW, height: actualH, channels: 4 } })
        .extend({
          right: padW - actualW,
          bottom: padH - actualH,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .raw()
        .toBuffer();
    } catch (err) {
      log(`  L${levelIdx}: PAD FAILED — ${err.message}; skipping this level`);
      // Let GC reclaim rgba on next iter
      renderResult = null;
      continue;
    }

    // Free raw bitmap now that padded copy exists
    renderResult = null;

    // Build upload task list for THIS level only (keeps `padded` closure scope
    // tight — buffer becomes GC-eligible as soon as the level's uploads finish).
    const uploadTasks = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x * effTileSize;
        const top = y * effTileSize;
        const tileKey = `${pid}/tiles/${drawingId}/page-${pageNumber}/level-${levelIdx}/${x}-${y}.webp`;
        uploadTasks.push(async () => {
          const sharpInst = sharp(padded, { raw: { width: padW, height: padH, channels: 4 } })
            .extract({ left, top, width: effTileSize, height: effTileSize });
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

    // CRITICAL: upload THIS level's tiles before moving to the next level.
    // S87 behavior accumulated all levels' tasks then uploaded at end — with L5
    // that would hold ALL padded buffers (up to ~4 GB total) in memory at once.
    // Per-level uploads cap peak memory at ~one level's padded buffer.
    await uploadAll(uploadTasks, log);

    // Free padded buffer before next level's render allocates
    padded = null;
    if (global.gc) global.gc();

    pageInfo.levels.push({
      level: levelIdx,
      tileSize: effTileSize,
      cols,
      rows,
      width: actualW,
      height: actualH,
    });
  }

  return pageInfo;
}

// ---- Main HTTP handler ----------------------------------------------------

app.http('render', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    const t0 = Date.now();
    const log = (msg) => context.log(msg);

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
    }

    const { pid, drawingId, r2Key } = body || {};
    if (!pid || !drawingId || !r2Key) {
      return { status: 400, jsonBody: { error: 'Missing pid, drawingId, or r2Key' } };
    }
    if (/\.\./.test(pid) || /\.\./.test(drawingId) || /\.\./.test(r2Key)) {
      return { status: 400, jsonBody: { error: 'Invalid characters in identifiers' } };
    }

    log(`=== render start pid=${pid} drawingId=${drawingId} r2Key=${r2Key} ===`);
    log(`Renderer: pdfium (WASM) | Levels: ${LEVEL_WIDTHS.join(',')} | Lossless: L${[...LOSSLESS_LEVELS].join(',L')}`);

    let pdfDoc = null;
    try {
      const pdfBuf = await downloadPdf(r2Key, log);

      const library = await getPdfium();
      pdfDoc = await library.loadDocument(pdfBuf);
      const pageCount = pdfDoc.getPageCount();
      log(`PDF loaded — ${pageCount} page(s)`);

      const manifest = {
        version: 1,
        drawingId,
        pid,
        tileSize: TILE_SIZE,
        renderedAt: new Date().toISOString(),
        pageCount,
        pages: [],
      };

      let totalTiles = 0;
      const manifestKey = `${pid}/tiles/${drawingId}/manifest.json`;
      for (let p = 1; p <= pageCount; p++) {
        const pageInfo = await renderPage(pdfDoc, p, pid, drawingId, log);
        manifest.pages.push(pageInfo);
        totalTiles += pageInfo.levels.reduce((s, l) => s + l.cols * l.rows, 0);

        // Progressive manifest: write after each page so partial results survive
        // OOM kills. Viewer can load pages 1–N even if process dies on page N+1.
        await putManifest(manifestKey, manifest);
        log(`Manifest updated: ${p}/${pageCount} pages, ${totalTiles} tiles so far`);

        // Hint GC between pages — pdfium WASM heap and Node JS heap both benefit
        if (global.gc) global.gc();
      }

      pdfDoc.destroy();
      pdfDoc = null;

      log(`Final manifest written: ${manifestKey}`);

      const durationMs = Date.now() - t0;
      log(`=== render done in ${(durationMs / 1000).toFixed(1)}s — ${totalTiles} tiles ===`);

      return {
        status: 200,
        jsonBody: {
          success: true,
          pid,
          drawingId,
          pageCount,
          totalTiles,
          manifestKey,
          durationMs,
          renderer: 'pdfium',
          levels: LEVEL_WIDTHS.length,
        },
      };
    } catch (err) {
      context.error(`render failed: ${err.stack || err.message}`);
      // Best-effort cleanup on error path
      try { if (pdfDoc) pdfDoc.destroy(); } catch {}
      return {
        status: 500,
        jsonBody: { error: err.message, type: err.name || 'RenderError' },
      };
    }
  },
});

// ---- Health check (no auth) -----------------------------------------------

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => ({
    status: 200,
    jsonBody: {
      ok: true,
      service: 'arencon-pdf-render',
      version: '2.1.0',
      renderer: 'pdfium',
      levels: LEVEL_WIDTHS.length,
      losslessLevels: [...LOSSLESS_LEVELS],
      time: new Date().toISOString(),
    },
  }),
});
