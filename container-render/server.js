// ARENCON PDF Tile Render — Container Edition v4.0.0
// Session 89 — Chrome headless (native pdfium) for Fieldwire-quality text
//
// POST /api/render
// Headers: x-functions-key: <api key>
// Body: { pid, drawingId, r2Key }
//
// Downloads PDF from R2, renders each page using headless Chromium's built-in
// pdfium (with full FreeType font hinting + subpixel rendering), slices into
// 512×512 WebP tiles, uploads tiles + manifest back to R2.

const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const puppeteer = require('puppeteer-core');

const execFileAsync = promisify(execFile);
const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);
const fsUnlink = promisify(fs.unlink);
const fsMkdir = promisify(fs.mkdir);
const fsRm = promisify(fs.rm);

// ---- Constants ---------------------------------------------------------------

const TILE_SIZE = 512;
const THUMB_QUALITY = 75;
const STD_QUALITY = 92;
const MAX_PARALLEL_UPLOADS = 12;
const BUCKET = 'arencon-files';
const LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288];
const LOSSLESS_LEVELS = new Set([3, 4]);
const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.API_KEY || '';

// ---- R2 / S3 client ----------------------------------------------------------

let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 env vars');
  }
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return s3Client;
}

// ---- R2 helpers ---------------------------------------------------------------

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
  if (errors.length) throw new Error(`${errors.length} upload(s) failed. First: ${errors[0].err}`);
}

// ---- PDF metadata via pdfinfo -------------------------------------------------

async function getPdfPageCount(pdfPath, log) {
  const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error('Could not get page count');
  const count = parseInt(match[1], 10);
  log(`pdfinfo: ${count} page(s)`);
  return count;
}

async function getPdfPageSizes(pdfPath, pageCount, log) {
  const { stdout } = await execFileAsync('pdfinfo', ['-f', '1', '-l', String(pageCount), pdfPath]);
  const pages = {};
  const re = /^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/gm;
  let m;
  while ((m = re.exec(stdout)) !== null) {
    pages[parseInt(m[1], 10)] = { width: parseFloat(m[2]), height: parseFloat(m[3]) };
  }
  if (Object.keys(pages).length === 0) {
    const single = stdout.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)/m);
    if (single) pages[1] = { width: parseFloat(single[1]), height: parseFloat(single[2]) };
  }
  log(`pdfinfo: got dimensions for ${Object.keys(pages).length} page(s)`);
  return pages;
}

// ---- Chrome/Puppeteer renderer ------------------------------------------------

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--font-render-hinting=medium',
    ],
    protocolTimeout: 300_000,
  });
  return browserInstance;
}

async function renderPageAtLevel(pdfPath, pageNum, targetWidth, nativeW, nativeH, tmpDir, log) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const longestDim = Math.max(nativeW, nativeH);
    const scale = targetWidth / longestDim;
    const w = Math.round(nativeW * scale);
    const h = Math.round(nativeH * scale);

    // Chrome PDF viewer at 96 DPI renders 1pt = 96/72 = 1.333 px
    // We set viewport to a manageable size and use deviceScaleFactor for resolution
    // Max practical viewport ~4096px; use scale factor for larger targets
    const maxViewport = 4096;
    let vpWidth, vpHeight, dpr;

    if (w <= maxViewport && h <= maxViewport) {
      vpWidth = w;
      vpHeight = h;
      dpr = 1;
    } else {
      // Scale down viewport, use deviceScaleFactor to get target resolution
      const ratio = Math.max(w, h) / maxViewport;
      vpWidth = Math.ceil(w / ratio);
      vpHeight = Math.ceil(h / ratio);
      dpr = ratio;
    }

    log(`  Chrome: viewport ${vpWidth}x${vpHeight} @ ${dpr.toFixed(2)}x DPR → ${Math.round(vpWidth * dpr)}x${Math.round(vpHeight * dpr)} output`);

    await page.setViewport({ width: vpWidth, height: vpHeight, deviceScaleFactor: dpr });

    // Navigate to PDF page with toolbar hidden
    const fileUrl = `file://${pdfPath}#page=${pageNum}&toolbar=0&navpanes=0&view=FitH,0`;
    await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 120_000 });

    // Wait for Chrome's pdfium to finish rendering
    await new Promise(r => setTimeout(r, 4000));

    const outPath = path.join(tmpDir, `p${pageNum}_w${targetWidth}.png`);
    await page.screenshot({ path: outPath, type: 'png', fullPage: false });

    // Trim gray background (Chrome PDF viewer uses #525659 or similar gray)
    // Extract just the white page content
    const trimmed = await sharp(outPath)
      .trim({ background: '#525659', threshold: 30 })
      .toBuffer();

    // Resize to exact target dimensions (trim may leave slightly different size)
    await sharp(trimmed)
      .resize(w, h, { fit: 'fill' })
      .toFile(outPath);

    return outPath;
  } finally {
    await page.close().catch(() => {});
  }
}

// ---- Per-page render + tile ---------------------------------------------------

async function renderPage(pdfPath, pageNumber, nativeW, nativeH, pid, drawingId, tmpDir, log) {
  const longestDim = Math.max(nativeW, nativeH);
  const pageInfo = { pageNumber, nativeWidth: nativeW, nativeHeight: nativeH, levels: [] };

  log(`Page ${pageNumber}: native ${nativeW}x${nativeH} pt (${(nativeW / 72).toFixed(1)}" x ${(nativeH / 72).toFixed(1)}")`);

  for (let levelIdx = 0; levelIdx < LEVEL_WIDTHS.length; levelIdx++) {
    const target = LEVEL_WIDTHS[levelIdx];
    const scale = target / longestDim;
    const estW = Math.round(nativeW * scale);
    const estH = Math.round(nativeH * scale);

    log(`  L${levelIdx}: rendering ${estW}x${estH} via Chrome headless`);

    let pngPath;
    try {
      pngPath = await renderPageAtLevel(pdfPath, pageNumber, target, nativeW, nativeH, tmpDir, log);
    } catch (err) {
      log(`  L${levelIdx}: RENDER FAILED — ${err.message}; skipping`);
      continue;
    }

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
    const cols = Math.ceil(actualW / TILE_SIZE);
    const rows = Math.ceil(actualH / TILE_SIZE);
    const padW = cols * TILE_SIZE;
    const padH = rows * TILE_SIZE;
    const useLossless = LOSSLESS_LEVELS.has(levelIdx);
    const qTag = useLossless ? 'lossless' : (levelIdx === 0 ? `q=${THUMB_QUALITY}` : `q=${STD_QUALITY}`);
    log(`  L${levelIdx}: ${actualW}x${actualH} → ${cols}x${rows} tiles [${qTag}]`);

    let padded;
    try {
      padded = await sharp(pngPath)
        .ensureAlpha()
        .extend({
          right: padW - actualW, bottom: padH - actualH,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .raw()
        .toBuffer();
    } catch (err) {
      log(`  L${levelIdx}: PAD FAILED — ${err.message}; skipping`);
      try { await fsUnlink(pngPath); } catch {}
      continue;
    }

    try { await fsUnlink(pngPath); } catch {}

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

    await uploadAll(uploadTasks, log);
    padded = null;
    if (global.gc) global.gc();

    pageInfo.levels.push({
      level: levelIdx, tileSize: TILE_SIZE, cols, rows, width: actualW, height: actualH,
    });
  }

  return pageInfo;
}

// ---- Main render handler ------------------------------------------------------

async function handleRender(req, res) {
  const t0 = Date.now();
  const log = (msg) => console.log(msg);

  const { pid, drawingId, r2Key } = req.body || {};
  if (!pid || !drawingId || !r2Key) return res.status(400).json({ error: 'Missing pid, drawingId, or r2Key' });
  if (/\.\./.test(pid) || /\.\./.test(drawingId) || /\.\./.test(r2Key)) return res.status(400).json({ error: 'Invalid characters' });

  log(`=== render start pid=${pid} drawingId=${drawingId} ===`);
  log(`Renderer: Chrome headless (native pdfium) | Levels: ${LEVEL_WIDTHS.join(',')}`);

  const tmpDir = path.join(os.tmpdir(), `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fsMkdir(tmpDir, { recursive: true });
  const pdfPath = path.join(tmpDir, 'input.pdf');

  try {
    const pdfBuf = await downloadPdf(r2Key, log);
    await fsWriteFile(pdfPath, pdfBuf);
    log(`PDF saved (${(pdfBuf.length / 1024 / 1024).toFixed(1)} MB)`);

    const pageCount = await getPdfPageCount(pdfPath, log);
    const pageSizes = await getPdfPageSizes(pdfPath, pageCount, log);

    const manifest = {
      version: 1, drawingId, pid, tileSize: TILE_SIZE,
      renderedAt: new Date().toISOString(), renderer: 'chrome-pdfium',
      pageCount, pages: [],
    };

    let totalTiles = 0;
    const manifestKey = `${pid}/tiles/${drawingId}/manifest.json`;

    for (let p = 1; p <= pageCount; p++) {
      const sz = pageSizes[p] || pageSizes[1] || { width: 792, height: 612 };
      const pageInfo = await renderPage(pdfPath, p, sz.width, sz.height, pid, drawingId, tmpDir, log);
      manifest.pages.push(pageInfo);
      totalTiles += pageInfo.levels.reduce((s, l) => s + l.cols * l.rows, 0);
      await putManifest(manifestKey, manifest);
      log(`Manifest updated: ${p}/${pageCount} pages, ${totalTiles} tiles so far`);
      if (global.gc) { global.gc(); log(`  GC after page ${p}`); }
    }

    // Close browser to free memory
    try { if (browserInstance) { await browserInstance.close(); browserInstance = null; } } catch {}

    const durationMs = Date.now() - t0;
    log(`=== render done in ${(durationMs / 1000).toFixed(1)}s — ${totalTiles} tiles ===`);

    res.json({
      success: true, pid, drawingId, pageCount, totalTiles,
      manifestKey, durationMs, renderer: 'chrome-pdfium', levels: LEVEL_WIDTHS.length,
    });
  } catch (err) {
    console.error(`render failed: ${err.stack || err.message}`);
    res.status(500).json({ error: err.message, type: err.name || 'RenderError' });
  } finally {
    try { await fsRm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ---- Express app --------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '1mb' }));

function checkApiKey(req, res, next) {
  if (!API_KEY) return res.status(500).json({ error: 'API_KEY not configured' });
  const provided = req.headers['x-functions-key'] || req.headers['x-api-key'] || '';
  if (provided !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
  next();
}

app.post('/api/render', checkApiKey, (req, res) => { handleRender(req, res); });

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true, service: 'arencon-pdf-render', version: '4.0.0',
    renderer: 'chrome-pdfium', levels: LEVEL_WIDTHS.length,
    losslessLevels: [...LOSSLESS_LEVELS], time: new Date().toISOString(),
  });
});

app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`arencon-pdf-render v4.0.0 (chrome-pdfium) listening on :${PORT}`);
});
