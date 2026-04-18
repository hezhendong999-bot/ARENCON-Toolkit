#!/usr/bin/env python3
"""
ARENCON PDF renderer — native pdfium via pypdfium2.

Uses `bitmap.to_pil()` + `.tobytes()` — the well-documented idiomatic
pypdfium2 path for extracting raw pixels from a rendered page. Requires
Pillow (PIL).

Commands
--------
  info <pdf_path>
    → stdout: {"pages":[{"page":1,"widthPt":W,"heightPt":H},...]}

  render <pdf_path> <page_num> <scale> <output_raw_path>
    Writes exactly w*h*4 bytes of packed RGBA to output_raw_path.
    → stdout: "<W> <H>"
"""
import json
import sys
import traceback

import pypdfium2 as pdfium


def cmd_info(pdf_path):
    pdf = pdfium.PdfDocument(pdf_path)
    pages = []
    try:
        for i in range(len(pdf)):
            page = pdf[i]
            try:
                w_pt, h_pt = page.get_size()
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
            # rev_byteorder=True  → RGBA byte order (vs native BGRA)
            # prefer_bgrx=False   → full 4-channel RGBA, not 3-channel BGR + pad
            # draw_annots=True    → render any embedded PDF annotations
            # optimize_mode="lcd" → FPDF_LCD_TEXT: subpixel text rendering.
            #                      Without this, small text uses grayscale
            #                      antialiasing only. With it, pdfium uses
            #                      RGB subpixel positioning (same technique
            #                      Chromium uses) for sharper small glyphs.
            #                      Does NOT affect bitmap size or memory.
            # Native FreeType bytecode hinting + native text AA are already
            # baked into libpdfium.so at compile time (unlike the WASM build).
            bitmap = page.render(
                scale=scale,
                rev_byteorder=True,
                prefer_bgrx=False,
                draw_annots=True,
                optimize_mode="lcd",
            )
            try:
                # to_pil() is pypdfium2's documented bridge to Pillow.
                # Returns a PIL.Image in the appropriate mode given the
                # render flags above ("RGBA" here).
                pil_image = bitmap.to_pil()
                w, h = pil_image.size
                mode = pil_image.mode

                # Defensive: ensure RGBA. If pypdfium2 ever returns RGB for
                # some doc we force the 4-channel layout sharp expects.
                if mode != "RGBA":
                    pil_image = pil_image.convert("RGBA")
                    mode = "RGBA"

                sys.stderr.write(
                    f"render p{page_num} scale={scale:.4f} {w}x{h} mode={mode}\n"
                )

                # tobytes() returns packed bytes in the image's mode order.
                # RGBA = 4 bytes/pixel, no row padding — exactly what sharp
                # wants from its `{raw:{width,height,channels:4}}` input.
                raw_bytes = pil_image.tobytes()
                expected = w * h * 4
                if len(raw_bytes) != expected:
                    raise RuntimeError(
                        f"raw byte size mismatch: got {len(raw_bytes)}, "
                        f"expected {expected}"
                    )
                with open(out_path, "wb") as f:
                    f.write(raw_bytes)
            finally:
                bitmap.close()
        finally:
            page.close()
    finally:
        pdf.close()

    sys.stdout.write(f"{w} {h}")
    sys.stdout.flush()


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
        # Full traceback to stderr so Node's runPython() surfaces it in logs.
        sys.stderr.write(f"render.py error: {type(e).__name__}: {e}\n")
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
