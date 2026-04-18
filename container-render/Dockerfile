# ARENCON PDF Tile Renderer — Native pdfium Edition
# Session 90 — pypdfium2 bundles Google's native libpdfium.so with full
# FreeType bytecode hinting and native text antialiasing. This is the
# same binary that ships inside Chrome/Chromium's PDF viewer.
#
# No Chromium, no poppler, no mutool, no custom font packages. pypdfium2
# handles AutoCAD/SHX font encodings correctly because it IS pdfium.

FROM node:22-slim

# Python 3 + pip. libpdfium.so travels with the pypdfium2 wheel (manylinux).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pypdfium2 5.6.0 bundles pdfium 147.0.7713 (as of this build date).
# --break-system-packages is required on Debian bookworm (PEP 668).
RUN pip3 install --no-cache-dir --break-system-packages pypdfium2==5.6.0

# Smoke-test native pdfium load at build time. Importing pypdfium2
# triggers the ctypes load of the bundled libpdfium.so — if that binary
# is ABI-incompatible with this base image we crash here, not at first
# request. Also prints the pdfium version for the CI log.
RUN python3 -c "import pypdfium2 as p, pypdfium2_raw as r; \
  print('pypdfium2:', p.__version__); \
  print('pdfium at:', r.__file__)"

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js render.py ./
RUN node --check server.js
RUN python3 -c "import ast; ast.parse(open('render.py').read()); print('render.py syntax OK')"

ENV PORT=8080
EXPOSE 8080

# Run as non-root. /home/appuser is needed for any stray cache files.
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# --expose-gc lets server.js free padded tile buffers between levels.
# max-old-space-size guards against runaway V8 heap on L4 pads.
CMD ["node", "--expose-gc", "--max-old-space-size=6144", "server.js"]
