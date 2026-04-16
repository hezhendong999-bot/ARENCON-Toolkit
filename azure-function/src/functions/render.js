// ARENCON PDF Tile Render Function
// Session 85 — Azure Functions Node.js v4 programming model
//
// POST /api/render
// Headers: x-functions-key: <function key>
// Body: { pid, drawingId, r2Key }
//
// Downloads PDF from R2, renders each page at multiple zoom levels,
// slices into 512x512 JPEG tiles, uploads tiles + manifest back to R2.

const { app } = require('@azure/functions');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');

// ---- Constants ------------------------------------------------------------

const TILE_SIZE = 512;
const JPEG_QUALITY = 95;          // S88: bumped from 82 — engineering line work needs high quality
const THUMB_QUALITY = 70;
const MAX_PARALLEL_UPLOADS = 12;
const BUCKET = 'arencon-files';   // R2 bucket name (matches Worker BUCKET binding)

// Level widths in pixels (page rendered at this width, height proportional).
// L0 = thumbnail, L4 = max zoom (~12k px wide engineering drawing).
const LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288];

// ---- Lazy-loaded PDF.js (legacy build, Node-friendly) ---------------------

let pdfjsLib = null;
async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // In Node, pdfjs uses a "fake worker" (main-thread) but still dynamically
  // imports the worker module — workerSrc MUST point at the real file path.
  const _wPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = require('url').pathToFileURL(_wPath).href;
  return pdfjsLib;
}

// ---- Canvas factory for PDF.js (uses @napi-rs/canvas) ---------------------

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = Math.ceil(width);
    canvasAndContext.canvas.height = Math.ceil(height);
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
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
    // R2 prefers path-style; SDK v3 default is virtual-hosted, override:
    forcePathStyle: false,
  });
  return s3Client;
}

// ---- R2 helpers -----------------------------------------------------------

async function downloadPdf(r2Key, log) {
  log(`R2 GET ${r2Key}`);
  const resp = await getS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: r2Key }));
  // Stream to buffer
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
    CacheControl: 'public, max-age=60',     // short — viewer may refresh
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
      if (done % 50 === 0 || done === total) log(`  uploaded ${done}/${total}`);
    }
  }
  const workers = Array.from({ length: Math.min(MAX_PARALLEL_UPLOADS, tasks.length) }, worker);
  await Promise.all(workers);
  if (errors.length) {
    throw new Error(`${errors.length} tile upload(s) failed. First: ${errors[0].err}`);
  }
}

// ---- Per-page render + tile -----------------------------------------------

async function renderPage(pdfDoc, pageNumber, pid, drawingId, log) {
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1.0 });
  const aspectRatio = baseViewport.height / baseViewport.width;
  log(`Page ${pageNumber}: native ${Math.round(baseViewport.width)}x${Math.round(baseViewport.height)}`);

  const pageInfo = {
    pageNumber,
    nativeWidth: baseViewport.width,
    nativeHeight: baseViewport.height,
    levels: [],
  };

  const canvasFactory = new NodeCanvasFactory();
  const uploadTasks = [];

  for (let levelIdx = 0; levelIdx < LEVEL_WIDTHS.length; levelIdx++) {
    const targetWidth = LEVEL_WIDTHS[levelIdx];
    const targetHeight = Math.round(targetWidth * aspectRatio);
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const w = Math.ceil(viewport.width);
    const h = Math.ceil(viewport.height);

    log(`  L${levelIdx}: rendering ${w}x${h}`);

    // Render PDF page to canvas at this scale
    const cc = canvasFactory.create(w, h);
    // White background — PDF pages are transparent by default
    cc.context.fillStyle = '#FFFFFF';
    cc.context.fillRect(0, 0, w, h);
    await page.render({ canvasContext: cc.context, viewport, canvasFactory }).promise;

    // Get raw RGBA buffer from canvas → feed sharp
    const rgba = cc.canvas.data();   // @napi-rs/canvas method, returns Buffer
    const sharpBase = sharp(rgba, {
      raw: { width: w, height: h, channels: 4 },
    });

    // Tile the level into TILE_SIZE x TILE_SIZE JPEG tiles
    const cols = Math.ceil(w / TILE_SIZE);
    const rows = Math.ceil(h / TILE_SIZE);
    const quality = levelIdx === 0 ? THUMB_QUALITY : JPEG_QUALITY;

    log(`  L${levelIdx}: slicing into ${cols}x${rows} tiles`);

    // Pre-pad to multiple of TILE_SIZE so all tiles are the full size
    const padW = cols * TILE_SIZE;
    const padH = rows * TILE_SIZE;
    const padded = await sharpBase
      .extend({
        right: padW - w,
        bottom: padH - h,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .raw()
      .toBuffer();

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        // Defer extraction + encoding into the upload task itself so
        // memory peaks per-tile, not whole-grid.
        const tileKey = `${pid}/tiles/${drawingId}/page-${pageNumber}/level-${levelIdx}/${x}-${y}.jpg`;
        uploadTasks.push(async () => {
          const tileBuf = await sharp(padded, { raw: { width: padW, height: padH, channels: 4 } })
            .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
          await putTile(tileKey, tileBuf, 'image/jpeg');
        });
      }
    }

    pageInfo.levels.push({
      level: levelIdx,
      tileSize: TILE_SIZE,
      cols,
      rows,
      width: w,
      height: h,
    });

    // Free canvas before next level
    canvasFactory.destroy(cc);
  }

  // Cleanup PDF.js page resources
  page.cleanup();

  // Upload all tiles for this page
  log(`Page ${pageNumber}: uploading ${uploadTasks.length} tiles`);
  await uploadAll(uploadTasks, log);

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
    // Basic sanity — block path traversal in keys
    if (/\.\./.test(pid) || /\.\./.test(drawingId) || /\.\./.test(r2Key)) {
      return { status: 400, jsonBody: { error: 'Invalid characters in identifiers' } };
    }

    log(`=== render start pid=${pid} drawingId=${drawingId} r2Key=${r2Key} ===`);

    try {
      const pdfBuf = await downloadPdf(r2Key, log);

      const pdfjs = await getPdfjs();
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuf),
        canvasFactory: new NodeCanvasFactory(),
        // Disable system font + range requests in serverless context
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
      });
      const pdfDoc = await loadingTask.promise;
      log(`PDF loaded — ${pdfDoc.numPages} page(s)`);

      const manifest = {
        version: 1,
        drawingId,
        pid,
        tileSize: TILE_SIZE,
        renderedAt: new Date().toISOString(),
        pageCount: pdfDoc.numPages,
        pages: [],
      };

      let totalTiles = 0;
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const pageInfo = await renderPage(pdfDoc, p, pid, drawingId, log);
        manifest.pages.push(pageInfo);
        totalTiles += pageInfo.levels.reduce((s, l) => s + l.cols * l.rows, 0);
        // Hint GC between pages
        if (global.gc) global.gc();
      }

      await pdfDoc.cleanup();
      await pdfDoc.destroy();

      const manifestKey = `${pid}/tiles/${drawingId}/manifest.json`;
      await putManifest(manifestKey, manifest);
      log(`Manifest written: ${manifestKey}`);

      const durationMs = Date.now() - t0;
      log(`=== render done in ${(durationMs / 1000).toFixed(1)}s — ${totalTiles} tiles ===`);

      return {
        status: 200,
        jsonBody: {
          success: true,
          pid,
          drawingId,
          pageCount: pdfDoc.numPages,
          totalTiles,
          manifestKey,
          durationMs,
        },
      };
    } catch (err) {
      context.error(`render failed: ${err.stack || err.message}`);
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
      version: '1.0.0',
      time: new Date().toISOString(),
    },
  }),
});
