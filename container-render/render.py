#!/usr/bin/env python3
"""
ARENCON PDF renderer — native pdfium via pypdfium2.

pypdfium2 bundles the native libpdfium.so built by Google for Chromium.
Unlike the WASM build, this has full FreeType with bytecode hinting and
native text antialiasing — the two things WASM pdfium cannot provide.

Why Python for the render step:
  - @hyzyla/pdfium (Node) is WASM-only and was the S88 baseline.
  - No maintained Node wrapper for native pdfium exists (node-pdfium et al
    are all abandoned circa 2015-2020). pypdfium2 is the only actively
    maintained, production-ready native pdfium binding. Calling it from
    Node via a short-lived subprocess is cleaner than writing a custom
    N-API addon against bblanchon binaries.

Commands
--------
  info <pdf_path>
    Prints JSON to stdout: {"pages":[{"page":1,"widthPt":W,"heightPt":H},...]}

  render <pdf_path> <page_num> <scale> <output_raw_path>
    Renders one page at the given scale to packed RGBA raw bytes.
    Writes bytes to output_raw_path (exactly 4*W*H bytes, no stride).
    Prints "<W> <H>" to stdout for the caller to pick up.

Env vars
--------
  None required. libpdfium.so travels with the pypdfium2 wheel.
"""
import json
import sys

import pypdfium2 as pdfium


# ---- commands ---------------------------------------------------------------


def cmd_info(pdf_path):
    pdf = pdfium.PdfDocument(pdf_path)
    pages = []
    try:
        for i in range(len(pdf)):
            page = pdf[i]
            try:
                w_pt, h_pt = page.get_size()  # in PDF points (1/72 inch)
                pages.append({"page": i + 1, "widthPt": w_pt, "heightPt": h_pt})
            finally:
                page.close()
    finally:
        pdf.close()
    sys.stdout.write(json.dumps({"pages": pages}))
    sys.stdout.flush()


def cmd_render(pdf_path, page_num, scale, out_path):
    pdf = pdfium.PdfDocument(pdf_path)
    try:
        page = pdf[page_num - 1]
        try:
            # rev_byteorder=True → output in RGBA byte order (not native BGRA).
            # prefer_bgrx=False → full 4-channel RGBA, not 3-channel BGR + X pad.
            # draw_annots=True → render PDF annotations/markups.
            # Default smoothing flags (antialiasing on) — full native FreeType
            # hinting is already enabled at the libpdfium compile level.
            bitmap = page.render(
                scale=scale,
                rev_byteorder=True,
                prefer_bgrx=False,
                draw_annots=True,
            )
            try:
                w = bitmap.width
                h = bitmap.height
                stride = bitmap.stride

                # Sanity-check byte order. pypdfium2 exposes this for debug.
                mode = getattr(bitmap, "mode", "?")
                sys.stderr.write(f"render p{page_num} scale={scale:.4f} "
                                 f"{w}x{h} mode={mode} stride={stride}\n")

                # Write packed RGBA, no stride padding. pypdfium2 usually
                # emits contiguous rows (stride == 4*w), but if a platform
                # ever pads rows we slice row-by-row to keep the output
                # sharp-friendly (sharp expects exactly w*h*4 bytes).
                row_bytes = w * 4
                mv = memoryview(bitmap.buffer)
                with open(out_path, "wb") as f:
                    if stride == row_bytes:
                        f.write(bytes(mv))
                    else:
                        for y in range(h):
                            s = y * stride
                            f.write(bytes(mv[s:s + row_bytes]))
            finally:
                bitmap.close()
        finally:
            page.close()
    finally:
        pdf.close()

    sys.stdout.write(f"{w} {h}")
    sys.stdout.flush()


# ---- main -------------------------------------------------------------------


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
        sys.exit(1)


if __name__ == "__main__":
    main()
