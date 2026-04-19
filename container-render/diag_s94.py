"""S94 diagnostic — render page 2 of the test PDF with LCD on and off,
report dark-pixel count per row of the troublesome text block.

Usage (inside container):
  curl -s https://raw.githubusercontent.com/hezhendong999-bot/ARENCON-Toolkit/main/container-render/diag_s94.py | python3
"""
import pypdfium2, urllib.request

PDF_URL = 'https://arencon-r2-worker.hezhendong999.workers.dev/photos/6338d5af-fbb0-4e30-9a8e-65f1c7dd3efb/frt/pdfbufs/pdfbuf_1776302138120_dbhkcb.pdf'

print('fetching PDF...')
req = urllib.request.Request(PDF_URL, headers={'User-Agent':'x'})
with urllib.request.urlopen(req) as r:
    open('/tmp/p.pdf','wb').write(r.read())

pdf = pypdfium2.PdfDocument('/tmp/p.pdf')
page = pdf[1]                  # page 2 (zero-indexed)
w_pt, h_pt = page.get_size()
scale = 2560.0 / w_pt          # L2 scale
print('scale=%.4f  target=%dx%d' % (scale, int(w_pt*scale), int(h_pt*scale)))

MODES = [
    ('LCD_ON',  dict(scale=scale, rev_byteorder=True, prefer_bgrx=True, draw_annots=True, optimize_mode='lcd')),
    ('NO_LCD',  dict(scale=scale, rev_byteorder=True, prefer_bgrx=True, draw_annots=True)),
    ('NO_BGRX', dict(scale=scale, rev_byteorder=True, draw_annots=True)),
]

for tag, kw in MODES:
    bm = page.render(**kw)
    img = bm.to_pil().convert('RGB')
    px = img.load()
    print('')
    print('=== %s ===  fmt=%d  size=%s' % (tag, bm.format, img.size))
    # Scan the text block Y range and find dark-pixel peaks per row
    peaks = []
    for y in range(1195, 1320):
        d = sum(1 for x in range(290, 1050) if max(px[x, y]) < 80)
        if d > 15:
            peaks.append((y, d))
    # Group into clusters so each text line = one cluster
    if not peaks:
        print('  no text rows detected')
    else:
        clusters = []
        cur = [peaks[0]]
        for y, d in peaks[1:]:
            if y - cur[-1][0] <= 3:
                cur.append((y, d))
            else:
                clusters.append(cur); cur = [(y, d)]
        clusters.append(cur)
        print('  %d text line(s) detected:' % len(clusters))
        for c in clusters:
            ys = [y for y,_ in c]
            max_d = max(d for _,d in c)
            print('    y=%d-%d  peak_dark=%d' % (ys[0], ys[-1], max_d))
    bm.close()

page.close()
pdf.close()
print('')
print('done')
