# ARENCON PDF Tile Renderer (Azure Function)

Server-side PDF → tile pyramid renderer for the Field Review Tool.
Deployed to Azure Functions (FlexConsumption, Linux, Node 22, 4 GB).

**Not served by GitHub Pages.** These files live here purely so Claude can fetch them via GitHub API across sessions.

## Live endpoint

`https://arencon-pdf-render.azurewebsites.net`

## API contract

### POST /api/render
Renders a PDF already in R2 into a tile pyramid.

**Headers:**
- `x-functions-key: <function key>` (or `?code=<key>` query param)
- `Content-Type: application/json`

**Body:**
```json
{
  "pid": "6338d5af-fbb0-4e30-9a8e-65f1c7dd3efb",
  "drawingId": "drw_1776140182835",
  "r2Key": "6338d5af-fbb0-4e30-9a8e-65f1c7dd3efb/photos/frt/pdfbufs/pdfbuf_xxx.pdf"
}
```

**Response (success):**
```json
{
  "success": true,
  "pid": "...",
  "drawingId": "...",
  "pageCount": 9,
  "totalTiles": 4545,
  "manifestKey": "{pid}/tiles/{drawingId}/manifest.json",
  "durationMs": 127000
}
```

**Response (error):**
```json
{ "error": "...", "type": "..." }
```

**IMPORTANT — 504 on large PDFs is expected.** Azure's HTTP gateway cuts responses at ~230s; the Function keeps running in the background and completes successfully. FRT must use fire-and-forget + poll pattern (poll `manifest.json` at the Worker endpoint every 5–10s).

### GET /api/health
Unauthenticated health check. Returns `{ok:true, service, version, time}`.

## Output structure

```
{pid}/tiles/{drawingId}/
  manifest.json
  page-N/level-L/x-y.jpg
```

5 levels per page: L0=256px wide thumbnail, L1=1024, L2=2560, L3=6144, L4=12288.
All tiles are 512×512 JPEG. Edge tiles white-padded. Immutable cache headers.

## Worker tile access

Tiles served (unauthenticated) via `arencon-r2-worker`:
```
https://arencon-r2-worker.hezhendong999.workers.dev/{pid}/tiles/{drawingId}/...
```

## Environment (Azure App Settings, encrypted)

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Deploy (when code changes)

In Azure Cloud Shell:
```bash
# Clone + install + deploy
git clone https://github.com/hezhendong999-bot/ARENCON-Toolkit.git
cd ARENCON-Toolkit/azure-function
npm install --platform=linux --arch=x64 --omit=dev
zip -r deploy.zip . -x "*.git*" "node_modules/.cache/*"
az functionapp deployment source config-zip \
  --resource-group arencon-rg \
  --name arencon-pdf-render \
  --src deploy.zip \
  --build-remote false
```

## Sessions

- **S84:** Azure infrastructure provisioned (empty Function App)
- **S85:** Function code written, deployed, tested on 128 MB AutoSPRINK PDF (9 pages, 4546 tiles, 72 MB)
- **S86 (planned):** FRT integration — fire-and-forget POST + poll manifest, progress badges
- **S87 (planned):** FRT viewer tile fetch, revive tiledPdf.js for new manifest format
