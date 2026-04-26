// ARENCON PDF Tile Render Function
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

// Levels using lossless WebP encoding (pixel-perfect engineering line work).
// L3 (6144px) and L4 (12288px) are the zoom tiers where users read text —
// lossless eliminates any encoder-introduced edge artifacts.
// L0/L1/L2 stay lossy (thumbs, far-zoom, imperceptible).
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

// ---- pdfium render callback: pass-through (channel swap moved to sharp) ----
//
// pdfium delivers BGRA. Sharp wants RGBA. Previously we swapped R↔B inside
// this callback by mutating pdfium's Uint8Array in place. That worked at
// L0–L3 but produced ~4% R↔B-inverted L4 tiles in non-deterministic regions.
//
// Root cause (S103 diagnosis): pdfium's WASM module delivers large bitmaps
// (L4 = 12288×8192×4 ≈ 403 MB) in chunked buffer windows when the buffer
// exceeds an internal threshold. Each chunk fires the render callback. Our
// in-callback swap iterated `data` from offset 0 to data.length each time,
// so chunks delivered first got swapped multiple times (net no-swap on even
// iterations) while later chunks got swapped once. Result: scattered tiles
// with the wrong channel order. Detected with L3-vs-L4 ground-truth scan:
// 139 inverted L4 tiles across 9 pages (S99e baseline).
//
// Fix: do nothing in the callback. Let sharp pull the BGRA buffer once
// pdfium has fully delivered all chunks, then sharp.recomb() does the swap
// atomically on its own internal copy in libvips memory. Single deterministic
// transform per level regardless of chunk count.
//
// See sharp pipeline below (`.recomb([[0,0,1],[0,1,0],[1,0,0]])`).

// S106 (post-S105 diagnostic): no-op callback. Sharp.recomb does the swap
// downstream. S105 confirmed pdfium-WASM corrupts bytes for ~1% of L4 tiles
// before the .slice() copy returns to us — a real internal bug at the
// (REVERSE_BYTE_ORDER + ≥400 MB bitmap) intersection that no swap-location
// change can fix. Bug A is now closed via L3-upscale fallback in the L4 tile
// loop below: every L4 tile is verified against its L3 parent's R-B sign;
// inverted tiles are replaced with upscaled L3 content (L3 is empirically
// always clean — content-dependent corruption only manifests at L4 scale).
function bgraToRgbaRender({ data }) {
  return Promise.resolve(data);
}

// ---- L3-vs-L4 inversion guard (S106) --------------------------------------
//
// Computes mean(R-B) over chromatic pixels in a raw RGBA buffer region.
// Used to detect L4 tiles where pdfium-WASM emitted R↔B-swapped bytes —
// such tiles have opposing-sign mean(R-B) compared to their L3 parent.
//
// Returns { mean, count } — count is the number of chromatic pixels considered.
// A tile with count < 100 has too little color content to judge reliably.
function computeMeanRB(buffer, bufW, bufH, srcX, srcY, srcW, srcH, threshold) {
  let sum = 0;
  let count = 0;
  const xEnd = Math.min(srcX + srcW, bufW);
  const yEnd = Math.min(srcY + srcH, bufH);
  for (let y = srcY; y < yEnd; y++) {
    const rowStart = y * bufW * 4;
    for (let x = srcX; x < xEnd; x++) {
      const i = rowStart + x * 4;
      const diff = buffer[i] - buffer[i + 2];  // R - B
      if (Math.abs(diff) > threshold) {
        sum += diff;
        count++;
      }
    }
  }
  return { mean: count ? sum / count : 0, count };
}

// Returns true if the L4 tile bytes appear R↔B-swapped relative to its L3
// parent region. Conservative: only flags when both regions have substantial
// chromatic content AND signs oppose AND magnitudes exceed threshold.
//
// IMPORTANT: samples the FULL L3 parent tile (512×512), not the 256×256
// quadrant matching the L4 tile. This matches the browser detector's logic
// exactly. Sampling only the quadrant produces false negatives because the
// quadrant often lacks enough chromatic pixels to pass the MIN_COUNT/MAGNITUDE
// thresholds — even when the L4 tile is clearly inverted relative to the
// surrounding content. (S106-fix: previous version sampled the quadrant and
// missed all 46 inversions.)
function isL4TileInverted(l4Raw, l4TileSize, x, y, l3Buffer, l3PadW, l3PadH, l3TileSize) {
  const CHROMA = 20;       // pixel-level: |R-B| > this counts as chromatic
  const MAGNITUDE = 20;    // tile-level: |mean(R-B)| > this required to flag
  const MIN_COUNT = 100;   // tile must have at least this many chromatic pixels

  const l4Stat = computeMeanRB(l4Raw, l4TileSize, l4TileSize, 0, 0, l4TileSize, l4TileSize, CHROMA);
  if (l4Stat.count < MIN_COUNT || Math.abs(l4Stat.mean) < MAGNITUDE) return false;

  // L4 tile (x,y) → L3 parent tile (floor(x/2), floor(y/2)). Sample the full
  // 512×512 L3 parent tile, not the 256×256 quadrant — matches detector logic.
  const l3ParentX = Math.floor(x / 2) * l3TileSize;
  const l3ParentY = Math.floor(y / 2) * l3TileSize;
  const l3Stat = computeMeanRB(l3Buffer, l3PadW, l3PadH, l3ParentX, l3ParentY, l3TileSize, l3TileSize, CHROMA);
  if (l3Stat.count < MIN_COUNT || Math.abs(l3Stat.mean) < MAGNITUDE) return false;

  // Both have meaningful chromatic content. If signs oppose, L4 is inverted.
  return Math.sign(l4Stat.mean) !== Math.sign(l3Stat.mean);
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

  // S106: retain L3's padded buffer + dimensions through L4 processing so the
  // L4 tile loop can substitute inverted L4 tiles with upscaled L3 content.
  // Released after the level loop completes. Adds ~100 MB peak memory during
  // L4 (server-side only — does not affect tiles delivered to clients).
  let l3State = null;

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

    // Tile the level into TILE_SIZE x TILE_SIZE WebP tiles
    const cols = Math.ceil(actualW / TILE_SIZE);
    const rows = Math.ceil(actualH / TILE_SIZE);
    const padW = cols * TILE_SIZE;
    const padH = rows * TILE_SIZE;
    const useLossless = LOSSLESS_LEVELS.has(levelIdx);
    const qTag = useLossless ? 'lossless' : (levelIdx === 0 ? `q=${THUMB_QUALITY}` : `q=${STD_QUALITY}`);
    log(`  L${levelIdx}: ${cols}x${rows} tiles [${qTag}]`);

    // Pre-pad to multiple of TILE_SIZE so every tile is the full TILE_SIZE.
    // Sharp does this efficiently — streaming to .raw().toBuffer() once.
    //
    // .recomb([[0,0,1],[0,1,0],[1,0,0]]) — atomic R↔B swap (BGRA → RGBA) on
    // sharp's own libvips buffer copy. Replaces the previous in-callback swap
    // (see bgraToRgbaRender comment block). Alpha channel passes through
    // unchanged because recomb only operates on RGB.
    //   new_R = 0·R + 0·G + 1·B  ← was-B
    //   new_G = 0·R + 1·G + 0·B  ← unchanged
    //   new_B = 1·R + 0·G + 0·B  ← was-R
    let padded;
    try {
      // S106: sharp.recomb path restored. This is the best baseline (39
      // residual inverted L4 tiles vs 46 with manual-on-slice swap from S105
      // diagnostic). Residual is fixed by L3-upscale fallback in the L4 tile
      // loop below — no further swap-location work to do.
      padded = await sharp(rgba, { raw: { width: actualW, height: actualH, channels: 4 } })
        .recomb([[0, 0, 1], [0, 1, 0], [1, 0, 0]])
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
    //
    // S106: For L4 specifically, each tile is verified against its L3 parent
    // before WebP-encoding. If the L4 tile shows R/B-sign inversion (the
    // pdfium-WASM corruption signature), it's replaced by an upscaled L3
    // region. L0/L1/L2/L3 paths unchanged.
    const uploadTasks = [];
    const stats = { l4Substituted: 0 };  // shared counter across parallel tasks
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        const tileKey = `${pid}/tiles/${drawingId}/page-${pageNumber}/level-${levelIdx}/${x}-${y}.webp`;
        uploadTasks.push(async () => {
          let tileBuf;

          if (levelIdx === 4 && l3State) {
            // S106 verification path: extract raw bytes, check vs L3 parent,
            // substitute from L3 if inverted, then encode.
            let tileRaw = await sharp(padded, { raw: { width: padW, height: padH, channels: 4 } })
              .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE })
              .raw()
              .toBuffer();

            const inverted = isL4TileInverted(
              tileRaw, TILE_SIZE, x, y,
              l3State.buffer, l3State.padW, l3State.padH, TILE_SIZE
            );

            if (inverted) {
              // Substitute: extract corresponding L3 region (256×256 source pixels)
              // and upscale 2× to 512×512. L3 is empirically always clean.
              const half = TILE_SIZE / 2;
              const l3SrcLeft = Math.floor(x / 2) * TILE_SIZE + (x % 2) * half;
              const l3SrcTop = Math.floor(y / 2) * TILE_SIZE + (y % 2) * half;
              tileRaw = await sharp(l3State.buffer, { raw: { width: l3State.padW, height: l3State.padH, channels: 4 } })
                .extract({ left: l3SrcLeft, top: l3SrcTop, width: half, height: half })
                .resize(TILE_SIZE, TILE_SIZE, { kernel: 'lanczos3' })
                .raw()
                .toBuffer();
              stats.l4Substituted++;
            }

            // Encode the (possibly substituted) raw bytes. L4 is always lossless.
            tileBuf = await sharp(tileRaw, { raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 } })
              .webp({ lossless: true, effort: 4 })
              .toBuffer();

          } else {
            // L0/L1/L2/L3 path: chain extract → webp directly (no verification).
            const sharpInst = sharp(padded, { raw: { width: padW, height: padH, channels: 4 } })
              .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE });
            if (useLossless) {
              tileBuf = await sharpInst.webp({ lossless: true, effort: 4 }).toBuffer();
            } else {
              const q = levelIdx === 0 ? THUMB_QUALITY : STD_QUALITY;
              tileBuf = await sharpInst.webp({ quality: q, effort: 4, alphaQuality: 100 }).toBuffer();
            }
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

    if (levelIdx === 4 && stats.l4Substituted > 0) {
      log(`  L4: ${stats.l4Substituted} tile(s) substituted from L3 (pdfium-WASM corruption guard)`);
    }

    // S106: At end of L3, retain padded buffer for L4's verification path.
    // Released after L4 (or end of loop) to keep memory bounded.
    if (levelIdx === 3) {
      l3State = { buffer: padded, padW, padH };
    }

    // Free padded buffer before next level's render allocates.
    // Note: when levelIdx === 3, `padded` local goes out of scope at next iter
    // but `l3State.buffer` still holds the reference — so the buffer survives
    // into L4. After L4 completes, `l3State = null` (post-loop) releases it.
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

  // S106: release retained L3 buffer (held through L4 for verification).
  l3State = null;
  if (global.gc) global.gc();

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
      version: '2.2.1',
      bgraSwap: 'sharp.recomb + L3-upscale guard (full-parent sample)',  // S106 — fix: sample full L3 parent tile
      renderer: 'pdfium',
      levels: LEVEL_WIDTHS.length,
      losslessLevels: [...LOSSLESS_LEVELS],
      time: new Date().toISOString(),
    },
  }),
});
