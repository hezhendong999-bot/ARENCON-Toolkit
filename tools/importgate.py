#!/usr/bin/env python3
"""
importgate.py - S479c. Blocks the failure that blanked frt-next tonight.

A JS file was blob-copied from frt/js/ui/ into frt-next/js/ui/. It imported
./crbThread.js, which exists in frt/ but not frt-next/. One unresolvable
import kills the ENTIRE ES module graph at boot: blank app, dead logo.
Nothing checked this - gate.py guards deletions WITHIN a file, not whether a
file's imports resolve WHERE IT IS GOING.

Usage:
  python3 tools/importgate.py --file <local.js> --dest <repo/path/of/file.js> \
      --tree <tree-listing.txt>

  <tree-listing.txt> = one repo path per line (from the Trees API, recursive).
  Exit 0 = every relative import resolves in the destination tree.
  Exit 1 = BLOCKED, with the missing paths named.

Run this before ANY push that places a JS file at a path it did not come
from - blob copies between frt/ and frt-next/, /lib/ extractions, tool ports.
"""
import argparse, posixpath, re, sys

IMPORT_RE = re.compile(
    r"""(?:^|\n)\s*(?:import(?:[^'"]*?from)?|export[^'"]*?from)\s*['"]([^'"]+)['"]""")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', required=True, help='local path of the JS content being pushed')
    ap.add_argument('--dest', required=True, help='repo path the file will live at')
    ap.add_argument('--tree', required=True, help='file listing repo paths, one per line')
    a = ap.parse_args()

    src = open(a.file, encoding='utf-8', errors='replace').read()
    tree = set(l.strip() for l in open(a.tree, encoding='utf-8') if l.strip())
    base = posixpath.dirname(a.dest)

    missing, checked = [], 0
    for spec in IMPORT_RE.findall(src):
        if not spec.startswith('.'):
            continue                       # bare/URL imports are not tree files
        checked += 1
        resolved = posixpath.normpath(posixpath.join(base, spec))
        if resolved not in tree and resolved + '/index.js' not in tree:
            missing.append((spec, resolved))

    print('-- importgate: %s -> %s' % (a.file, a.dest))
    print('   relative imports checked: %d' % checked)
    if missing:
        print('   X BLOCKED - %d import(s) do NOT resolve in the destination tree:' % len(missing))
        for spec, resolved in missing:
            print('       %-40s -> %s (MISSING)' % (spec, resolved))
        print('   (This is exactly how the frt-next blank-app happened: one')
        print('    missing module kills the whole ES graph at boot.)')
        sys.exit(1)
    print('   OK - all relative imports resolve')

if __name__ == '__main__':
    main()
