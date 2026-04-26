# ARENCON PDF Tile Renderer — mupdf Edition (S107 architectural commit)
#
# Replaces the poppler+PIL+Python pipeline (S94) with mupdf via `mutool draw`.
# mupdf is a different rendering engine entirely from pdfium — by switching
# engines, Bug A's failure mechanism (R/B byte corruption at L4 from
# pdfium-WASM / pdftoppm-PIL pipelines) cannot recur in this codebase.
#
# Output is PAM (Portable Arbitrary Map) with RGBA tuple type. Sharp consumes
# the bytes after the ASCII header directly with raw: { channels: 4 }. There
# is NO byte-order conversion step at any layer of the pipeline.
#
# I/O contract is UNCHANGED from S94→S106:
#   POST /api/render  body: { pid, drawingId, r2Key }  header: x-functions-key
#   GET  /api/health
# Manifest schema and R2 tile paths are UNCHANGED — the FRT viewer reads
# new tiles without any client-side modification.

FROM node:22-slim

# mupdf-tools provides the `mutool` binary (Debian package; ships full mupdf).
# fontconfig + liberation + dejavu give mupdf a fallback font stack for PDFs
# that reference fonts by name without embedding them (AutoSPRINK does this).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      mupdf-tools \
      fontconfig \
      fonts-dejavu-core \
      fonts-liberation \
      fonts-liberation2 \
    && rm -rf /var/lib/apt/lists/* && \
    fc-cache -f

# Build-time smoke test: verify mutool runs and reports a sane version.
RUN mutool -v 2>&1 | head -1

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
RUN node --check server.js

ENV PORT=8080
EXPOSE 8080

# Non-root user. /home/appuser exists for any stray cache files.
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# --expose-gc lets server.js free padded tile buffers between levels.
# max-old-space-size: 3500 MB cap on V8 heap leaves ~500 MB for sharp/mupdf
# native buffers and Linux overhead on a 4 GB Fly machine.
CMD ["node", "--expose-gc", "--max-old-space-size=3500", "server.js"]
