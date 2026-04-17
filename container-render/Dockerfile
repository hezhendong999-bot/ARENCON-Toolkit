# ARENCON PDF Tile Renderer — Native Poppler
# Session 89 — replaces WASM pdfium with native pdftocairo for font-hinted text
#
# Base: Node.js 22 slim (Debian Bookworm)
# Added: poppler-utils (pdftocairo, pdfinfo), Liberation + DejaVu fonts
#
# Why Liberation fonts: engineering PDFs often reference Arial, Times New Roman,
# Courier New. Liberation fonts are metric-compatible substitutes. Without them,
# pdftocairo falls back to generic sans-serif → text reflows and overlaps.

FROM node:22-slim

# Install poppler-utils + comprehensive font library.
# Engineering PDFs reference many Windows fonts (Arial, Arial Narrow, Times,
# Courier, Calibri, Helvetica). Without metric-compatible substitutes,
# pdftocairo garbles text via bad fontconfig fallbacks.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      poppler-utils \
      mupdf-tools \
      fontconfig \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-urw-base35 \
      fonts-freefont-ttf \
      fonts-croscore \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
      wget cabextract \
    && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
    && apt-get install -y ttf-mscorefonts-installer \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Verify pdftocairo is available
RUN pdftocairo -v 2>&1 | head -1

WORKDIR /app

# Install deps first (Docker layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy server code
COPY server.js ./

# Verify JS syntax
RUN node --check server.js

# Container Apps sets PORT env var; default to 8080
ENV PORT=8080
EXPOSE 8080

# Non-root for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser
RUN chown -R appuser:appuser /app
USER appuser

CMD ["node", "--expose-gc", "--max-old-space-size=6144", "server.js"]
