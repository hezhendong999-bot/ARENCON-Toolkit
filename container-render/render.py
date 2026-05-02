#!/usr/bin/env python3
"""
ARENCON PDF renderer — poppler edition (Session 94).

Replaces the pypdfium2 + native libpdfium.so pipeline because pdfium
silently drops lines of paragraph text on engineering PDFs emitted by
AutoSPRINK. Poppler (pdftoppm / pdfinfo) has been handling this class
of PDF reliably for 20+ years and was verified on the problem PDF to
render every text line correctly at all five pyramid scales.

Commands (unchanged contract — server.js calls these identically)
-----------------------------------------------------------------
  info <pdf_path>
    → stdout: {"pages":[{"page":1,"widthPt":W,"heightPt":H},...]}

  render <pdf_path> <page_num> <scale> <output_raw_path>
    Writes exactly w*h*4 bytes of packed RGBA to output_raw_path.
    → stdout: "<W> <H>"

Pipeline
--------
  pdfinfo → per-page size in points
  pdftoppm -png -scale-to-x W -scale-to-y H → PNG at exact pixel dims
  PIL.Image.open().convert('RGBA').tobytes() → raw RGBA bytes for sharp
"""
import json
import os
import subprocess
import sys
import tempfile
import traceback

from PIL import Image


# -------- helpers ------------------------------------------------------------


def _parse_pdfinfo_sizes(output):
    """pdfinfo -f N -l M output includes one 'Page N size: W x H pts' line
    per page. Return list of (page, widthPt, heightPt)."""
    pages = []
    for line in output.splitlines():
        # "Page 1 size: 2592 x 1728 pts (letter)"
        if line.startswith("Page ") and " size:" in line:
            try:
                rest = line.split("size:", 1)[1].strip()
                # "2592 x 1728 pts (letter)" → want first and third tokens
                parts = rest.split()
                w_pt = float(parts[0])
                h_pt = float(parts[2])
                pnum = int(line.split()[1])
                pages.append((pnum, w_pt, h_pt))
            except (ValueError, IndexError):
                pass
    return pages


def _pdfinfo_all_pages(pdf_path):
    """Get every page's size. Runs pdfinfo once covering all pages."""
    # -l 99999 is the stock way to say 'up to last page'.
    result = subprocess.run(
        ["pdfinfo", "-f", "1", "-l", "99999", pdf_path],
        capture_output=True, text=True, check=True,
    )
    return _parse_pdfinfo_sizes(result.stdout)


def _pdfinfo_page(pdf_path, page_num):
    """Get a single page's size (points). Returns (w_pt, h_pt)."""
    result = subprocess.run(
        ["pdfinfo", "-f", str(page_num), "-l", str(page_num), pdf_path],
        capture_output=True, text=True, check=True,
    )
    pages = _parse_pdfinfo_sizes(result.stdout)
    for p, w, h in pages:
        if p == page_num:
            return w, h
    # Fallback: pdfinfo without per-page range prints just 'Page size:'
    for line in result.stdout.splitlines():
        if line.startswith("Page size:"):
            parts = line.split()
            return float(parts[2]), float(parts[4])
    raise RuntimeError(
        f"pdfinfo did not return a size for page {page_num}:\n"
        f"{result.stdout[:400]}"
    )


# -------- commands -----------------------------------------------------------


def cmd_info(pdf_path):
    raw_pages = _pdfinfo_all_pages(pdf_path)
    pages = [{"page": p, "widthPt": w, "heightPt": h} for (p, w, h) in raw_pages]
    sys.stdout.write(json.dumps({"pages": pages}))
    sys.stdout.flush()


def cmd_render(pdf_path, page_num, scale, out_path):
    w_pt, h_pt = _pdfinfo_page(pdf_path, page_num)
    target_w = int(round(w_pt * scale))
    target_h = int(round(h_pt * scale))
    sys.stderr.write(
        f"render p{page_num} {w_pt}x{h_pt}pt * {scale:.4f} "
        f"→ target {target_w}x{target_h}px\n"
    )

    # pdftoppm writes a PNG to <prefix>.png. -singlefile means the prefix IS the
    # path (no -NN suffix). -scale-to-x AND -scale-to-y together force exact
    # output dimensions (tested against poppler 22.12 on debian bookworm).
    # Fallback if pdftoppm's "aspect-ratio cap" kicks in: we verify dims after
    # and log a warning — server.js accepts whatever (actualW, actualH) we
    # report back on stdout.
    with tempfile.TemporaryDirectory(prefix="render_") as tmpdir:
        prefix = os.path.join(tmpdir, "out")
        cmd = [
            "pdftoppm",
            "-f", str(page_num),
            "-l", str(page_num),
            "-singlefile",
            "-scale-to-x", str(target_w),
            "-scale-to-y", str(target_h),
            "-aa", "yes",          # text antialiasing on
            "-aaVector", "yes",    # vector antialiasing on
            "-png",                # lossless intermediate; sharp re-encodes downstream
            pdf_path,
            prefix,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(
                f"pdftoppm failed (exit {proc.returncode}):\n"
                f"stderr: {proc.stderr[:500]}"
            )

        png_path = prefix + ".png"
        if not os.path.exists(png_path):
            raise RuntimeError(
                f"pdftoppm produced no output at {png_path}. Dir: "
                f"{os.listdir(tmpdir)}"
            )

        img = Image.open(png_path).convert("RGBA")
        w, h = img.size
        if (w, h) != (target_w, target_h):
            sys.stderr.write(
                f"WARN: requested {target_w}x{target_h}, got {w}x{h}\n"
            )

        raw_bytes = img.tobytes()
        expected = w * h * 4
        if len(raw_bytes) != expected:
            raise RuntimeError(
                f"raw byte size mismatch: got {len(raw_bytes)}, expected {expected}"
            )
        with open(out_path, "wb") as f:
            f.write(raw_bytes)

    sys.stdout.write(f"{w} {h}")
    sys.stdout.flush()


# -------- entrypoint ---------------------------------------------------------


def main():
    if len(sys.argv) < 2:
        sys.stderr.write(
            "Usage:\n"
            "  render.py info <pdf>\n"
            "  render.py render <pdf> <page> <scale> <out_raw>\n"
        )
        sys.exit(2)

    cmd = sys.argv[1]
    try:
        if cmd == "info":
            if len(sys.argv) != 3:
                sys.stderr.write("info requires <pdf>\n")
                sys.exit(2)
            cmd_info(sys.argv[2])
        elif cmd == "render":
            if len(sys.argv) != 6:
                sys.stderr.write("render requires <pdf> <page> <scale> <out_raw>\n")
                sys.exit(2)
            cmd_render(
                sys.argv[2],
                int(sys.argv[3]),
                float(sys.argv[4]),
                sys.argv[5],
            )
        else:
            sys.stderr.write(f"Unknown command: {cmd}\n")
            sys.exit(2)
    except Exception as e:
        sys.stderr.write(f"render.py error: {type(e).__name__}: {e}\n")
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
