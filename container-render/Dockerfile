# ARENCON PDF Tile Renderer — MuPDF (mutool draw)
# Session 89 — native MuPDF replacing WASM pdfium for font-hinted text
#
# Base: Node.js 22 slim (Debian Bookworm)
# Renderer: mutool draw (MuPDF) — handles AutoCAD/SHX font encodings,
#   has built-in CJK/standard fallback fonts, uses FreeType for hinting
# Metadata: pdfinfo (poppler-utils) — page count + dimensions

FROM node:22-slim

# Install mupdf-tools (renderer) + poppler-utils (metadata) + fonts
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      mupdf-tools \
      poppler-utils \
      fontconfig \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-urw-base35 \
      fonts-freefont-ttf \
      fonts-croscore \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Verify mutool and pdfinfo are available
RUN mutool -v 2>&1 | head -1
RUN pdfinfo -v 2>&1 | head -1 || true

WORKDIR /app

# Install deps first (Docker layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy server code
COPY server.js ./

# Verify JS syntax
RUN node --check server.js

ENV PORT=8080
EXPOSE 8080

# Non-root for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser
RUN chown -R appuser:appuser /app
USER appuser

CMD ["node", "--expose-gc", "--max-old-space-size=6144", "server.js"]
