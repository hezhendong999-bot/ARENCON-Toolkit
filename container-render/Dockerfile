# ARENCON PDF Tile Renderer — Poppler Edition (Session 94)
#
# Replaces pypdfium2 after pdfium in node:22-slim was observed silently
# dropping lines of paragraph text on AutoSPRINK-emitted engineering PDFs.
# Session 94 verified that:
#   - Same pypdfium2 5.6.0 wheel + pdfium 147.0.7713 bundled binary
#   - Same render.py kwargs (LCD on/off tested, both affected)
#   - Fontconfig + liberation + dejavu fonts installed (tested both with
#     and without — no effect)
# ...still dropped text lines inside the container, while producing full
# correct output on an Ubuntu host with the exact same wheel. The root
# cause was never pinned down to a single env variable or system library,
# so rather than continue debugging pdfium-in-node:22-slim we switched
# to poppler, which has handled this class of PDF reliably for 20+ years.
#
# The render.py / server.js I/O contract is unchanged:
#   render.py info <pdf>                        → JSON page sizes
#   render.py render <pdf> <page> <scale> <out> → raw RGBA bytes + "W H"

FROM node:22-slim

# poppler-utils provides pdftoppm (renderer) and pdfinfo (page size probe).
# fontconfig + liberation + dejavu give pdftoppm a fallback font stack
# for PDFs that reference fonts by name without embedding them.
# Pillow bridges PNG output → raw RGBA bytes for sharp downstream.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      ca-certificates \
      poppler-utils \
      fontconfig \
      fonts-dejavu-core \
      fonts-liberation \
      fonts-liberation2 \
    && rm -rf /var/lib/apt/lists/* && \
    fc-cache -f

# --break-system-packages required on bookworm (PEP 668). Pillow only —
# pypdfium2 is gone.
RUN pip3 install --no-cache-dir --break-system-packages Pillow==10.4.0

# Build-time smoke test: pdftoppm, pdfinfo, and Pillow all usable.
RUN pdftoppm -v 2>&1 | head -1 && \
    pdfinfo -v 2>&1 | head -1 && \
    python3 -c "from PIL import Image; print('Pillow', Image.__version__)"

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js render.py ./
RUN node --check server.js
RUN python3 -c "import ast; ast.parse(open('render.py').read()); print('render.py syntax OK')"

ENV PORT=8080
EXPOSE 8080

# Non-root. /home/appuser exists for any stray cache files.
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# --expose-gc lets server.js free padded tile buffers between levels.
# max-old-space-size guards against runaway V8 heap on L4 pads.
CMD ["node", "--expose-gc", "--max-old-space-size=6144", "server.js"]
