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
from PIL import Image


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
            # Supersampling: render at 2x the requested scale, then downscale
            # via Lanczos. Produces noticeably sharper vector strokes than
            # native pdfium AGG antialiasing, because we're averaging 4 pixels
            # per output pixel instead of 1. Critical for engineering PDFs
            # like AutoSPRINK that draw text as vector strokes (no font
            # glyphs → LCD subpixel rendering does nothing → only path left
            # to sharpen pipe dimensions, etc.).
            #
            # Memory guard: at L4 target=12288, 2x would produce a ~25k×16k
            # bitmap (1.6 GB per page). Container has 8 GB, sequential
            # rendering, so this fits — but tight. If native size * 2 would
            # exceed ~1.5 GB bitmap, fall back to 1.5x supersampling. Still
            # sharper than native, safe headroom.
            w_pt, h_pt = page.get_size()
            max_safe_bytes = 1_500_000_000  # 1.5 GB
            for ss_factor in (2.0, 1.5, 1.0):
                ss_scale = scale * ss_factor
                ss_w = int(round(w_pt * ss_scale))
                ss_h = int(round(h_pt * ss_scale))
                if ss_w * ss_h * 4 <= max_safe_bytes:
                    break
            sys.stderr.write(
                f"ss_factor={ss_factor} (render {ss_w}x{ss_h}, "
                f"{ss_w*ss_h*4/1e6:.0f} MB)\n"
            )

            # rev_byteorder=True  → RGBA byte order (vs native BGRA)
            # prefer_bgrx=True    → force opaque 4-byte BGRx bitmap regardless
            #                      of page transparency. REQUIRED for LCD.
            #                      pdfium's FPDF_LCD_TEXT path only engages
            #                      on opaque bitmaps — if pypdfium2 auto-picks
            #                      BGRA (which it does for any page with
            #                      transparency, e.g. highlights/overlays in
            #                      engineering PDFs), LCD is silently ignored.
            # draw_annots=True    → render embedded PDF annotations
            # optimize_mode="lcd" → FPDF_LCD_TEXT: subpixel text rendering
            #                      (sharper small glyphs, same bitmap size).
            # Native FreeType bytecode hinting + native text AA are already
            # baked into libpdfium.so at compile time (unlike the WASM build).
            bitmap = page.render(
                scale=ss_scale,
                rev_byteorder=True,
                prefer_bgrx=True,
                draw_annots=True,
                optimize_mode="lcd",
            )
            try:
                # Log the raw pdfium format actually chosen — critical for
                # verifying LCD is engaging. BGR / BGRx = LCD can work,
                # BGRA = LCD silently ignored. mode after rev_byteorder:
                # RGB / RGBX / RGBA respectively.
                try:
                    from pypdfium2 import raw as _raw
                    bm_format = bitmap.format
                    fmt_name = {
                        _raw.FPDFBitmap_Gray: "Gray",
                        _raw.FPDFBitmap_BGR: "BGR",
                        _raw.FPDFBitmap_BGRx: "BGRx",
                        _raw.FPDFBitmap_BGRA: "BGRA",
                    }.get(bm_format, f"unknown({bm_format})")
                    sys.stderr.write(f"bitmap pdfium format: {fmt_name} "
                                     f"{'(LCD OK)' if fmt_name in ('BGR','BGRx') else '(LCD IGNORED!)'}\n")
                except Exception as _e:
                    sys.stderr.write(f"format probe failed: {_e}\n")

                # to_pil() is pypdfium2's documented bridge to Pillow.
                # Returns a PIL.Image in the appropriate mode given the
                # render flags above ("RGBX" here with prefer_bgrx=True
                # + rev_byteorder).
                pil_image = bitmap.to_pil()

                # Supersample downscale: if we rendered bigger than the
                # requested target, downscale via Lanczos. Final dimensions
                # must match what native scale would have produced so
                # server.js sharp tile math stays correct.
                if ss_factor > 1.0:
                    target_w = int(round(w_pt * scale))
                    target_h = int(round(h_pt * scale))
                    sys.stderr.write(
                        f"downscaling {pil_image.size} → ({target_w}, {target_h}) "
                        f"via Lanczos\n"
                    )
                    pil_image = pil_image.resize(
                        (target_w, target_h), Image.LANCZOS
                    )

                w, h = pil_image.size
                mode = pil_image.mode

                # Accept RGBA OR RGBX — both are 4 channels, 4 bytes/pixel,
                # exactly what sharp's raw:{channels:4} consumes. RGBX is
                # what prefer_bgrx=True + rev_byteorder=True produces (the
                # X byte is unused padding, safe to pass through). We only
                # force a conversion if we somehow get an unexpected mode.
                if mode not in ("RGBA", "RGBX"):
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
