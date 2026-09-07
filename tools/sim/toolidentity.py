#!/usr/bin/env python3
"""
tools/sim/toolidentity.py  —  does this tool ever call itself by another tool's name?

WHY THIS EXISTS (S724)
----------------------
electric-app/ is a byte copy of diesel-app/. The copy left Diesel's name in the
header, the tab strip, the build banner, the instance badge, the help text, the
project-export readme and — worst — the DOWNLOADED REPORT FILENAME, where an
Electric report and a Diesel report on the same project produced the identical
name and silently overwrote each other in the inspector's downloads folder.

bootprobe.py already asserted "0 visible 'Diesel'" and passed anyway, because
the header is a SEALED (shadow-DOM) component and document.body.innerText cannot
see inside it. That is the same class of miss as the S723 donut bug: the check
was real, it just read the wrong surface.

So this probe:
  1. opens the page in a real browser (same engine as bootprobe),
  2. walks the light DOM *and every shadow root, recursively*,
  3. fails if the tool names a DIFFERENT tool anywhere a human can read,
  4. separately checks the two places that are not screen text at all —
     the report filename builder and the build banner,
  5. checks the tab strip agrees with the panel headings it navigates to,
     which is how "Pre-Commissioning" survived next to "Pre-Test".

Run:
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tools/sim/toolidentity.py
    ... [app ...]        default: diesel-app electric-app

Exit 0 = clean. Exit 1 = a tool is wearing another tool's name.
"""

import asyncio
import os
import subprocess
import sys
import time

PORT = 8899

# Each tool: the name it MAY use, and the names that must never appear.
# Keep FOREIGN as whole words a reader would recognise, not internal identifiers
# (DieselMarkup, _dsl*, pldData are deliberate shared-code names and are fine).
TOOLS = {
    'diesel-app': {
        'own': 'Diesel',
        'foreign': ['Electric Fire Pump', 'EFP #', ' EFP#'],
        'filecode': 'DFP',
        'banner': 'DIESEL',
    },
    'electric-app': {
        'own': 'Electric',
        'foreign': ['Diesel Fire Pump', 'Diesel Pump Report', 'DFP #', ' DFP#'],
        'filecode': 'EFP',
        'banner': 'ELECTRIC',
    },
}

WALK_JS = r"""(() => {
  function walk(root, out) {
    out.push(root === document ? (document.body ? document.body.innerText : '') : root.textContent);
    const scope = root === document ? document : root;
    scope.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) walk(el.shadowRoot, out);
      const t = el.getAttribute && el.getAttribute('title');
      if (t) out.push(t);
      const a = el.getAttribute && el.getAttribute('aria-label');
      if (a) out.push(a);
    });
    return out;
  }
  const text = walk(document, []).join('\n');
  let fname = '';
  try { if (typeof _dslReportFilename === 'function') fname = _dslReportFilename(); } catch (e) { fname = 'ERR:' + e; }
  const tabs = Array.from(document.querySelectorAll('[class*=tab]'))
    .map(e => e.textContent.trim()).filter(Boolean);
  const headers = Array.from(document.querySelectorAll('.card-header'))
    .map(e => e.textContent.trim()).filter(Boolean);
  return { text, fname, tabs, headers };
})()"""


async def check(app, spec, repo_root):
    from playwright.async_api import async_playwright

    failures = []
    notes = []
    banner_lines = []

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context()).new_page()
        page.on('console', lambda m: banner_lines.append(m.text))
        await page.goto(f'http://localhost:{PORT}/{app}/index.html', wait_until='load')
        await page.wait_for_timeout(3500)
        r = await page.evaluate(WALK_JS)
        await browser.close()

    # 1. no foreign tool name anywhere a human can read (light DOM + every shadow root)
    for bad in spec['foreign']:
        if bad in r['text']:
            line = next((l.strip() for l in r['text'].splitlines() if bad in l), bad)
            failures.append(f"names another tool on screen: {bad!r}  in: {line[:90]!r}")

    # 2. the downloaded report filename must carry THIS tool's code
    fn = r['fname']
    if not fn:
        notes.append('report filename builder not reachable (skipped)')
    elif fn.startswith('ERR:'):
        failures.append(f'report filename builder threw: {fn[:120]}')
    else:
        if spec['filecode'] not in fn:
            failures.append(f"report filename missing {spec['filecode']}: {fn!r}")
        for other, ospec in TOOLS.items():
            if other != app and ospec['filecode'] in fn:
                failures.append(
                    f"report filename carries {other}'s code {ospec['filecode']}: {fn!r} "
                    f"-- both tools would download the SAME filename and overwrite each other")

    # 3. build banner must announce this tool
    banner = next((l for l in banner_lines if 'build' in l), '')
    if banner and spec['banner'] not in banner:
        failures.append(f'build banner names the wrong tool: {banner[:90]!r}')

    # 4. every numbered tab must match the numbered panel heading it navigates to
    def numbered(seq):
        out = {}
        for s in seq:
            s = s.strip()
            if len(s) > 2 and s[0].isdigit() and s[1] == '.':
                out.setdefault(s[0], set()).add(s.split('\n')[0].strip())
        return out

    tabs, heads = numbered(r['tabs']), numbered(r['headers'])
    for n, tlabels in sorted(tabs.items()):
        if n not in heads:
            continue
        if not (tlabels & heads[n]):
            failures.append(
                f'section {n}: tab says {sorted(tlabels)} but the panel heading says '
                f'{sorted(heads[n])} -- the tool disagrees with itself between screens')

    return failures, notes


async def main(apps):
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)],
                           cwd=repo_root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    total = 0
    try:
        for app in apps:
            spec = TOOLS.get(app)
            if not spec:
                print(f'?? {app}: not a known tool, skipped')
                continue
            failures, notes = await check(app, spec, repo_root)
            total += len(failures)
            if failures:
                print(f'FAIL  {app}')
                for f in failures:
                    print(f'        {f}')
            else:
                print(f'ok    {app}: names only itself'
                      + (f"  ({'; '.join(notes)})" if notes else ''))
    finally:
        srv.terminate()

    print()
    if total:
        print(f'TOOL IDENTITY: {total} problem(s) -- a tool is wearing another tool\'s name.')
        return 1
    print('TOOL IDENTITY: clean.')
    return 0


if __name__ == '__main__':
    os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
    args = sys.argv[1:] or ['diesel-app', 'electric-app']
    sys.exit(asyncio.run(main(args)))
