#!/usr/bin/env python3
"""ARENCON precache generator — sw.js APP_FILES is MACHINE-OWNED (S497).

WHY THIS EXISTS
  sw.js is a shared file every lane bumps on every push. Twice in two days a
  lane rebuilt it from a stale copy and silently reverted another lane's
  precache lines (13867ce5 lost a line to d788f76b; d507996c's three lines were
  lost to 12a2da49). The size-ratio guard (push_guard.py, S391) cannot catch an
  8-line clobber in a 374-line file. The fix is to stop hand-editing the list:
  the precache is DERIVED from what the tools actually import, so there is
  nothing to clobber and nothing to forget.

WHAT IT DOES
  1. Walks each entry file in ENTRIES (the deployed tool shells).
  2. Collects <script src>, import-from, export-from and dynamic import()
     specifiers; resolves them; recurses through .js files.
  3. Unions the result with tools/precache_extra.txt (things static analysis
     cannot see — worker scripts fetched by URL string, the auth gate, shells).
  4. Drops any path that does not exist in the repo (deleted features leave the
     list automatically — the sealDetect case) and reports the drop loudly.
  5. Rewrites sw.js between the GENERATED markers and stamps CACHE_NAME with
     the current UTC minute (the S495 collision-proof scheme).

USAGE
  python3 tools/gen_precache.py --check   # exit 1 if sw.js list != derived list
  python3 tools/gen_precache.py --write   # rewrite list + stamp CACHE_NAME

  Run from the repo root. gate.py runs --check automatically whenever the file
  being gated is sw.js, so a hand-edited or stale-rebuilt list cannot pass any
  lane's gate.

ADDING A FILE THAT ANALYSIS CANNOT SEE
  Put its repo path in tools/precache_extra.txt (one per line, # comments ok).
  Do NOT edit the generated block by hand — the next --write discards it.
"""
import os, re, sys, datetime, posixpath

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Deployed tool shells whose module graphs define the precache.
# frt-next/ is a BETA lane — deliberately not precached.
#
# S499: diesel-app/ MOVED FROM BETA TO PRODUCTION. The Hub's diesel pointer now
# targets diesel-app/index.html, so this is the build the field actually opens.
# While it was excluded, NONE of its 21 files were precached: a device that had
# opened Diesel before still worked offline (same-origin fetches are
# network-first and populate the runtime cache), but a COLD device — new tablet,
# cleared storage, or a first open on site — had nothing to fall back on and
# would fail with no signal. Offline is the whole point of a field tool, so the
# shell that ships to the field must be precached, not the one that no longer
# does. The monolith stays listed below as the direct-URL fallback.
ENTRIES = [
    'frt/index.html',
    'diesel-app/index.html',
    'ARENCON_Diesel_Fire_Pump_Commissioning.html',
    'ARENCON_Electric_Fire_Pump_Commissioning.html',
    'ARENCON_Project_Hub.html',
    'index.html',
]

EXTRA_FILE = os.path.join(ROOT, 'tools', 'precache_extra.txt')
SW = os.path.join(ROOT, 'sw.js')
BEGIN = '  /* ═══ BEGIN GENERATED PRECACHE — tools/gen_precache.py owns this block.'
BEGIN2 = '     Hand edits are discarded on the next --write. Add unscannable files'
BEGIN3 = '     to tools/precache_extra.txt instead. ═══ */'
END = '  /* ═══ END GENERATED PRECACHE ═══ */'

IMPORT_RE = re.compile(
    r"""(?:^|[\s;])(?:import(?:[^'"]*?from)?|export[^'"]*?from)\s*\(?\s*['"]([^'"]+)['"]""")
DYNIMPORT_RE = re.compile(r"""import\s*\(\s*['"]([^'"]+)['"]""")
SCRIPTSRC_RE = re.compile(r"""<script[^>]*\ssrc=["']([^"']+)["']""")
CSSHREF_RE = re.compile(r"""<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"'?]+)""")


def norm(base_dir, spec):
    spec = spec.split('?')[0]
    if spec.startswith(('http:', 'https:', 'data:')):
        return None
    if spec.startswith('/'):
        return spec.lstrip('/')
    return posixpath.normpath(posixpath.join(base_dir, spec))


def scan_file(repo_path, seen, order):
    """Collect repo_path and everything it references, depth-first, stable order."""
    if repo_path in seen:
        return
    seen.add(repo_path)
    full = os.path.join(ROOT, repo_path)
    if not os.path.exists(full):
        return
    if repo_path not in ENTRIES:          # shells are listed via extras, not here
        order.append(repo_path)
    try:
        src = open(full, encoding='utf-8', errors='replace').read()
    except OSError:
        return
    base = posixpath.dirname(repo_path)
    specs = []
    if repo_path.endswith('.html'):
        specs += SCRIPTSRC_RE.findall(src)
        specs += CSSHREF_RE.findall(src)
        # inline module blocks import too
        specs += IMPORT_RE.findall(src)
        specs += DYNIMPORT_RE.findall(src)
    elif repo_path.endswith(('.js', '.mjs')):
        specs += IMPORT_RE.findall(src)
        specs += DYNIMPORT_RE.findall(src)
    for s in specs:
        p = norm(base, s)
        if p and p.endswith(('.js', '.mjs', '.css')):
            scan_file(p, seen, order)


def derive():
    seen, order = set(), []
    for e in ENTRIES:
        scan_file(e, seen, order)
    extras, dropped = [], []
    if os.path.exists(EXTRA_FILE):
        for line in open(EXTRA_FILE, encoding='utf-8'):
            line = line.split('#')[0].strip()
            if not line:
                continue
            if line != './' and not os.path.exists(os.path.join(ROOT, line)):
                dropped.append(line)
                continue
            extras.append(line)
    final, have = [], set()
    for p in extras + sorted(order):       # extras first (shells, './'), then graph
        if p not in have:
            have.add(p)
            final.append(p)
    # Existence sweep over the whole list — deleted features fall out here.
    kept = []
    for p in final:
        if p == './' or os.path.exists(os.path.join(ROOT, p)):
            kept.append(p)
        else:
            dropped.append(p)
    return kept, dropped


def current_list(sw_src):
    m = re.search(re.escape(BEGIN) + r'.*?' + re.escape(END), sw_src, re.S)
    if not m:
        return None
    return [mm.group(1) for mm in re.finditer(r"^\s*'([^']+)',?\s*$", m.group(0), re.M)]


def render(paths):
    body = '\n'.join("  '%s'," % p for p in paths)
    return BEGIN + '\n' + BEGIN2 + '\n' + BEGIN3 + '\n' + body + '\n' + END


def live_missing(sw_path):
    """S679c — THE HOLE THE LOCAL CHECK CANNOT SEE.

    --check derives the list from THIS checkout. A lane whose checkout predates
    another lane's push therefore derives a list that is legitimately correct
    for the tree it can see, passes every gate, and silently drops the other
    lane's files out of the precache. That has now happened three times
    (13867ce5, 12a2da49, and 679-A dropping the Phase 2 files) — and the third
    was the dangerous one: the tool had already been changed to REQUIRE those
    files, so a tablet that had not fetched them would have had a save path
    calling a function that does not exist. Offline, that is a report that
    cannot be saved.

    Re-asserting HEAD before pushing does not help, because the staleness is in
    the pusher's own working tree, not in the ref. The only thing that catches
    it is asking LIVE what the tools currently load. So: fetch each deployed
    shell from live main, collect what it references, and require every one of
    those paths to be present in the sw.js about to be pushed.

    Read-only, and skipped with a loud notice when no token is available —
    never a silent pass.
    """
    import json, urllib.request
    tok = os.environ.get('PAT') or os.environ.get('GITHUB_TOKEN') or ''
    if not tok:
        print('[gen_precache] live check SKIPPED — no PAT in environment.')
        print('               A stale checkout cannot be detected without it.')
        return None
    api = 'https://api.github.com/repos/hezhendong999-bot/ARENCON-Toolkit/contents/%s?ref=main'

    def fetch(p):
        req = urllib.request.Request(api % p, headers={
            'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.github+json'})
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                import base64
                return base64.b64decode(json.load(r)['content']).decode('utf-8', 'replace')
        except Exception:
            return None

    sw_src = open(sw_path, encoding='utf-8').read()
    listed = set(current_list(sw_src) or [])
    required = set()
    for e in ENTRIES:
        src = fetch(e)
        if src is None:
            continue
        base = posixpath.dirname(e)
        specs = (SCRIPTSRC_RE.findall(src) + CSSHREF_RE.findall(src) +
                 IMPORT_RE.findall(src) + DYNIMPORT_RE.findall(src))
        for s in specs:
            p = norm(base, s)
            if p and p.endswith(('.js', '.mjs', '.css')):
                required.add(p)
    missing = sorted(p for p in required if p not in listed)
    if missing:
        print('[gen_precache] BLOCKED BY LIVE CHECK — the tools at live main load')
        print('               files this sw.js does not cache. Your checkout is')
        print('               behind another lane. Pull, re-run --write, re-gate:')
        for p in missing:
            print('  loaded live, absent from your precache : %s' % p)
        return missing
    print('[gen_precache] live check OK — %d referenced path(s) at live main all covered.'
          % len(required))
    return []


def main():
    args = sys.argv[1:]
    mode = '--check'
    sw_path = SW
    live = False
    while args:
        a = args.pop(0)
        if a in ('--check', '--write'):
            mode = a
        elif a == '--live':
            live = True
        elif a == '--sw':
            # The gate passes the lane's WORKING COPY here, so the check runs
            # against the exact bytes about to be pushed — not the repo's copy,
            # which may be older or newer than what the lane edited.
            sw_path = args.pop(0)
    derived, dropped = derive()
    sw_src = open(sw_path, encoding='utf-8').read()
    cur = current_list(sw_src)

    for d in dropped:
        print('[gen_precache] DROPPED (file no longer exists): %s' % d)

    if mode == '--check':
        if cur is None:
            print('[gen_precache] BLOCKED: sw.js has no GENERATED markers. Run --write once.')
            return 1
        if cur != derived:
            print('[gen_precache] BLOCKED: sw.js precache does not match the derived list.')
            for p in sorted(set(derived) - set(cur)):
                print('  missing from sw.js : %s' % p)
            for p in sorted(set(cur) - set(derived)):
                print('  stale in sw.js     : %s' % p)
            if set(cur) == set(derived):
                print('  (same set, different order — run --write to normalise)')
            print('[gen_precache] Run: python3 tools/gen_precache.py --write')
            return 1
        print('[gen_precache] OK — %d entries, sw.js matches derived list.' % len(derived))
        if live and live_missing(sw_path):
            return 1
        return 0

    if mode == '--write':
        block = render(derived)
        if cur is None:
            # First adoption: replace the legacy hand-written APP_FILES body.
            m = re.search(r'(var APP_FILES = \[\n)(.*?)(\n\];)', sw_src, re.S)
            if not m:
                print('[gen_precache] ERROR: APP_FILES array not found in sw.js.')
                return 1
            sw_src = sw_src[:m.start(2)] + block + sw_src[m.end(2):]
        else:
            sw_src = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END), block, sw_src,
                            count=1, flags=re.S)
        stamp = datetime.datetime.now(datetime.UTC).strftime('%Y%m%d%H%M')
        sw_src, n = re.subn(r"var CACHE_NAME = 'arencon-frt-\d+';",
                            "var CACHE_NAME = 'arencon-frt-%s';" % stamp, sw_src, count=1)
        if n != 1:
            print('[gen_precache] ERROR: CACHE_NAME line not found.')
            return 1
        open(sw_path, 'w', encoding='utf-8').write(sw_src)
        print('[gen_precache] wrote %d entries, CACHE_NAME -> arencon-frt-%s'
              % (len(derived), stamp))
        return 0

    print('usage: gen_precache.py [--check|--write]')
    return 2


if __name__ == '__main__':
    sys.exit(main())
