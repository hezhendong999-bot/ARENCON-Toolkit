# ARENCON PDF Tile Renderer — Chrome Headless (native pdfium)
# Session 89 — Chrome's built-in pdfium with full FreeType font hinting
#
# This is the same renderer Fieldwire uses. Chrome's pdfium handles
# AutoCAD/SHX font encodings correctly AND has native font hinting.

FROM node:22-slim

# Install Chromium + poppler-utils (metadata) + fonts
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
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

# Verify tools
RUN chromium --version
RUN pdfinfo -v 2>&1 | head -1 || true

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
RUN node --check server.js

ENV PORT=8080
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
EXPOSE 8080

# Non-root user (Chromium needs writable home for profile)
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

CMD ["node", "--expose-gc", "--max-old-space-size=6144", "server.js"]
