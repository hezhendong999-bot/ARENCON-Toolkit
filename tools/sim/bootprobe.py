#!/usr/bin/env python3
"""
BOOT PROBE — load a pump tool in real headless Chromium and fail on any runtime error.
                                                                tools/sim/bootprobe.py
Why this exists (S723): every other probe reads source. None of them ever OPENED the page.
The Electric rebuild was verified by syntax check and source-level probes and could still
have thrown on line one in a browser. This runs the tool the way a tablet does and asserts:
  - no page errors / console errors, except the known EXTERNAL set (CDN scripts the sandbox
    cannot fetch — Chart.js and its datalabels plugin — listed in EXTERNAL_OK below)
  - the checklist engine is bound and the checklist walk is non-zero (the S723 zero-donut class)
  - the build stamp is the expected one
Usage:  python3 tools/sim/bootprobe.py electric-app  [--expect-build E001]
        python3 tools/sim/bootprobe.py diesel-app    [--expect-build S723]
Needs: pip playwright + a chromium (PLAYWRIGHT_BROWSERS_PATH honoured).
"""
import os, sys, threading, http.server, socketserver, json, argparse
ap=argparse.ArgumentParser(); ap.add_argument('app'); ap.add_argument('--expect-build',default=None); ap.add_argument('--root',default=os.path.join(os.path.dirname(__file__),'..','..'))
a=ap.parse_args()
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH','/opt/pw-browsers')
from playwright.sync_api import sync_playwright
EXTERNAL_OK=('cdn.jsdelivr.net','cdnjs.cloudflare.com','Chart is not defined')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*x): pass
os.chdir(os.path.abspath(a.root))
srv=socketserver.TCPServer(('127.0.0.1',0),Q); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
errs=[]; badurls=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1024,'height':1366})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
    pg.on('console', lambda m: errs.append('console.error: '+m.text) if m.type=='error' else None)
    pg.on('requestfailed', lambda r: badurls.append(r.url))
    pg.on('response', lambda r: badurls.append(r.url) if r.status>=400 else None)
    pg.goto(f'http://127.0.0.1:{port}/{a.app}/index.html', wait_until='load', timeout=60000)
    pg.wait_for_timeout(3500)
    st=pg.evaluate("""() => ({
      build: typeof ELECTRIC_BUILD!=='undefined'?ELECTRIC_BUILD:(typeof DIESEL_BUILD!=='undefined'?DIESEL_BUILD:null),
      engineBound: typeof _CLENG==='object',
      engineHasSectionItems: typeof _CLENG==='object' && typeof _CLENG.sectionItems==='function',
      walk: typeof clChecklistItems==='function'?clChecklistItems().length:-1,
      title: document.title })""")
    b.close()
# 'Failed to load resource' carries no URL; it is external only if EVERY failed URL is on the external list
local_bad=[u for u in badurls if not any(h in u for h in EXTERNAL_OK)]
def is_external(e):
    if any(k in e for k in EXTERNAL_OK): return True
    if 'Failed to load resource' in e: return not local_bad
    return False
real=[e for e in errs if not is_external(e)]
if local_bad: real+=['local resource failed: '+u.split(str(port))[-1] for u in local_bad]
ext=len(errs)-len(real)
print(f"\n═══ BOOT PROBE — {a.app} ═══")
print(f"  title              : {st['title']}")
print(f"  build              : {st['build']}" + (f"  (expected {a.expect_build})" if a.expect_build else ''))
print(f"  engine bound       : {st['engineBound']}   sectionItems exposed: {st['engineHasSectionItems']}")
print(f"  checklist walk     : {st['walk']}")
print(f"  runtime errors     : {len(real)} real, {ext} external-CDN (ignored)")
fails=[]
if real: fails+=['runtime error: '+e[:200] for e in real]
if not st['engineBound']: fails.append('checklist engine not bound')
if not st['engineHasSectionItems']: fails.append('engine does not expose sectionItems (S723 zero-donut class)')
if st['walk']<=0: fails.append(f'checklist walk returned {st["walk"]} — donut would read 0')
if a.expect_build and st['build']!=a.expect_build: fails.append(f'build {st["build"]} != expected {a.expect_build}')
if fails:
    print('\nFAIL'); [print('  ✗',f) for f in fails]; sys.exit(1)
print('\nPASS — the tool boots in a real browser with no errors of its own'); sys.exit(0)
