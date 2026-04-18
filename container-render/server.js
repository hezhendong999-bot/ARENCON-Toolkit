// ARENCON PDF Tile Render — Container Edition v5.0.0
// Session 90 — Native pdfium via pypdfium2 Python subprocess.
//
// POST /api/render
// Headers: x-functions-key: <api key>
// Body: { pid, drawingId, r2Key }
//
// 1. Download PDF from R2 (direct S3 API, no Worker hop).
// 2. Python subprocess (render.py info) → per-page widthPt/heightPt.
// 3. For each page, for each level: Python subprocess (render.py render)
//    writes packed RGBA bytes to tmp file. Node reads, tiles with sharp,
//    uploads tiles in parallel, deletes raw file.
// 4. Progressive manifest: rewritten after each page (not just at end).
//    Partial results survive crashes — viewer can use pages 1..N even
//    if the process dies on page N+1.
//
// Architecture notes (vs S88 Azure Function WASM pdfium):
//   - Python subprocess replaces the `@hyzyla/pdfium` + `bgraToRgbaRender`
//     pair. pypdfium2 emits RGBA directly when rev_byteorder=true.
//   - No WASM heap cap. Container has 8 GB RAM; L4 (12288px) bitmap is
//     ~400 MB → no MAX_LEVEL_BYTES gate needed at our level set.
//   - Per-level upload pattern preserved (bound peak memory).
//   - One subprocess per (page, level). Python dies between renders, so
//     the OS reclaims all pdfium memory automatically. ~45 spawns for the
//     128 MB AutoSPRINK test PDF; ~1-2 s spawn overhead each is dwarfed
//     by the render itself.
//   - Everything downstream of the raw buffer is identical to S88:
//     sharp.extend() to pad to tile grid, tile, WebP encode, R2 put.

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const fsWriteFile = promisify(fs.writeFile);
const fsUnlink = promisify(fs.unlink);
const fsMkdir = promisify(fs.mkdir);
const fsRm = promisify(fs.rm);

// ---- Constants ---------------------------------------------------------------

const TILE_SIZE = 512;
const THUMB_QUALITY = 75;              // L0 (thumbnail) — lossy, small
const STD_QUALITY = 92;                // L1/L2 — lossy, imperceptible
const MAX_PARALLEL_UPLOADS = 12;
const BUCKET = 'arencon-files';
// Longest dimension targets per level (portrait/landscape both scaled
// so max(w,h) hits the target).
const LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288];
// L3 + L4: WebP lossless (pixel-perfect for engineering text crispness).
const LOSSLESS_LEVELS = new Set([3, 4]);
const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.API_KEY || '';

// Python interpreter + script — /app is the WORKDIR in the container.
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const RENDER_PY = path.join(__dirname, 'render.py');

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
  if (errors.length) {
    throw new Error(`${errors.length} upload(s) failed. First: ${errors[0].err}`);
  }
}

// ---- Python subprocess bridge -------------------------------------------------
//
// runPython(args, log) → { stdout, stderr, code }
// Streams stderr to log() in real time; captures stdout for the caller.
// Rejects on non-zero exit.

function runPython(args, log) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [RENDER_PY, ...args], {
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
        if (line) log(`  py: ${line}`);
      }
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (stderrBuf) log(`  py: ${stderrBuf}`);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      if (code === 0) resolve({ stdout, code });
      else reject(new Error(`render.py exited ${code}: ${stderrBuf || '(no stderr)'}`));
    });
  });
}

async function pythonPageInfo(pdfPath, log) {
  const { stdout } = await runPython(['info', pdfPath], log);
  let data;
  try { data = JSON.parse(stdout); }
  catch (e) { throw new Error(`render.py info: bad JSON: ${stdout.slice(0, 200)}`); }
  if (!Array.isArray(data.pages)) throw new Error('render.py info: missing pages[]');
  return data.pages;  // [{page, widthPt, heightPt}, ...]
}

async function pythonRender(pdfPath, pageNum, scale, outRawPath, log) {
  const { stdout } = await runPython(
    ['render', pdfPath, String(pageNum), scale.toFixed(6), outRawPath],
    log,
  );
  const m = stdout.trim().match(/^(\d+)\s+(\d+)$/);
  if (!m) throw new Error(`render.py render: unexpected stdout: ${stdout.slice(0, 200)}`);
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

// ---- Per-page render + tile ---------------------------------------------------

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
    // Scale so the LONGEST dimension hits the target width. Portrait and
    // landscape drawings both land at consistent DPI for each level.
    const scale = target / longestDim;
    const estW = Math.round(nativeWpt * scale);
    const estH = Math.round(nativeHpt * scale);
    const useLossless = LOSSLESS_LEVELS.has(levelIdx);
    const qTag = useLossless ? 'lossless'
      : (levelIdx === 0 ? `q=${THUMB_QUALITY}` : `q=${STD_QUALITY}`);

    log(`  L${levelIdx}: render ~${estW}x${estH} via native pdfium [${qTag}]`);

    const rawPath = path.join(tmpDir, `p${pageNumber}_l${levelIdx}.rgba`);
    let actualW, actualH;
    try {
      const res = await pythonRender(pdfPath, pageNumber, scale, rawPath, log);
      actualW = res.width;
      actualH = res.height;
    } catch (err) {
      log(`  L${levelIdx}: RENDER FAILED — ${err.message}; skipping`);
      try { await fsUnlink(rawPath); } catch {}
      continue;
    }

    // sharp needs exactly width * height * 4 bytes — render.py writes that.
    const cols = Math.ceil(actualW / TILE_SIZE);
    const rows = Math.ceil(actualH / TILE_SIZE);
    const padW = cols * TILE_SIZE;
    const padH = rows * TILE_SIZE;

    log(`  L${levelIdx}: ${actualW}x${actualH} → ${cols}x${rows} tiles (${padW}x${padH} padded)`);

    // Pad the raw bitmap to a multiple of TILE_SIZE so every tile is the
    // full 512x512. Stream through sharp once for the pad, then slice
    // individual tiles from the in-memory padded buffer.
    let padded;
    try {
      padded = await sharp(rawPath, {
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
      try { await fsUnlink(rawPath); } catch {}
      continue;
    }

    // Raw bitmap on disk is no longer needed — release disk pressure.
    try { await fsUnlink(rawPath); } catch {}

    // Tile + upload in parallel (bounded concurrency).
    const uploadTasks = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x * TILE_SIZE;
        const top = y * TILE_SIZE;
        const tileKey = `${pid}/tiles/${drawingId}/page-${pageNumber}/level-${levelIdx}/${x}-${y}.webp`;
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
      level: levelIdx, tileSize: TILE_SIZE,
      cols, rows, width: actualW, height: actualH,
    });
  }

  return pageInfo;
}

// ---- Main render handler ------------------------------------------------------

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
  log(`Renderer: native pdfium (pypdfium2) | Levels: ${LEVEL_WIDTHS.join(',')} `
    + `| Lossless: L${[...LOSSLESS_LEVELS].join(',L')}`);

  const tmpDir = path.join(os.tmpdir(), `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fsMkdir(tmpDir, { recursive: true });
  const pdfPath = path.join(tmpDir, 'input.pdf');

  try {
    const pdfBuf = await downloadPdf(r2Key, log);
    await fsWriteFile(pdfPath, pdfBuf);
    log(`PDF saved to ${pdfPath} (${(pdfBuf.length / 1024 / 1024).toFixed(1)} MB)`);

    // One pypdfium2 invocation for the whole doc's metadata.
    const pages = await pythonPageInfo(pdfPath, log);
    log(`pypdfium2 info: ${pages.length} page(s)`);

    const manifest = {
      version: 1,
      drawingId,
      pid,
      tileSize: TILE_SIZE,
      renderedAt: new Date().toISOString(),
      renderer: 'native-pdfium-pypdfium2',
      pageCount: pages.length,
      pages: [],
    };

    let totalTiles = 0;
    const manifestKey = `${pid}/tiles/${drawingId}/manifest.json`;

    for (let idx = 0; idx < pages.length; idx++) {
      const { page: pnum, widthPt, heightPt } = pages[idx];
      const pageInfo = await renderPage(pdfPath, pnum, widthPt, heightPt, pid, drawingId, tmpDir, log);
      manifest.pages.push(pageInfo);
      totalTiles += pageInfo.levels.reduce((s, l) => s + l.cols * l.rows, 0);

      // Progressive manifest — write after every page. If the process
      // dies on a later page the viewer can still use pages 1..idx+1.
      await putManifest(manifestKey, manifest);
      log(`Manifest updated: ${idx + 1}/${pages.length} pages, ${totalTiles} tiles so far`);
      if (global.gc) global.gc();
    }

    const durationMs = Date.now() - t0;
    log(`=== render done in ${(durationMs / 1000).toFixed(1)}s — ${totalTiles} tiles ===`);

    res.json({
      success: true,
      pid, drawingId,
      pageCount: pages.length,
      totalTiles,
      manifestKey,
      durationMs,
      renderer: 'native-pdfium-pypdfium2',
      levels: LEVEL_WIDTHS.length,
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
    ok: true,
    service: 'arencon-pdf-render',
    version: '5.0.0',
    renderer: 'native-pdfium-pypdfium2',
    levels: LEVEL_WIDTHS.length,
    losslessLevels: [...LOSSLESS_LEVELS],
    time: new Date().toISOString(),
  });
});

app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`arencon-pdf-render v5.0.0 (native-pdfium-pypdfium2) listening on :${PORT}`);
});
