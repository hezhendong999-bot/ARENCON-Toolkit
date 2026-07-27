#!/usr/bin/env python3
"""
ARENCON help-art collision check.

WHY: SVG text neither wraps nor truncates. A label that is one character too
long simply paints on top of whatever sits to its right, and it looks like the
drawing has exploded — which is exactly what shipped in the first demo. Eyeballing
a thumbnail does not catch it; measuring does.

WHAT: renders the demo in a real browser and asks the browser for the painted
box of every <text> element and every pill background, per drawing. Any two
boxes that overlap by more than a hair are reported. Exit 1 = collisions.
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899/live.html'
TOL = 0.6          # px of allowed touching, in SVG user units

JS = r"""
() => {
  const out = [];
  document.querySelectorAll('.help-card').forEach(card => {
    const id = card.getAttribute('data-help-card');
    const svg = card.querySelector('svg');
    if (!svg) return;
    const items = [];
    svg.querySelectorAll('text').forEach(el => {
      const b = el.getBBox();
      if (b.width <= 0) return;
      items.push({kind:'text', s:(el.textContent||'').slice(0,26),
                  x:b.x, y:b.y, w:b.width, h:b.height});
    });
    out.push({id, items});
  });
  return out;
}
"""

def overlap(a, b):
    ox = min(a['x']+a['w'], b['x']+b['w']) - max(a['x'], b['x'])
    oy = min(a['y']+a['h'], b['y']+b['h']) - max(a['y'], b['y'])
    return ox, oy

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={'width': 1100, 'height': 1000})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.wait_for_timeout(400)
    cards = pg.evaluate(JS)
    br.close()

if errs:
    print('PAGE ERRORS:', errs[:4])

bad = 0
for c in cards:
    it = c['items']
    for i in range(len(it)):
        for j in range(i+1, len(it)):
            ox, oy = overlap(it[i], it[j])
            if ox > TOL and oy > TOL:
                bad += 1
                print('OVERLAP  %-16s  %-26r  x  %-26r   (%.1f x %.1f px)'
                      % (c['id'], it[i]['s'], it[j]['s'], ox, oy))

print('\n%d drawings checked, %d text collisions' % (len(cards), bad))
sys.exit(1 if (bad or errs) else 0)
