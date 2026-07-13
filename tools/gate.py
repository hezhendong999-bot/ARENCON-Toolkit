#!/usr/bin/env python3
"""
ARENCON PRE-PUSH GATE  —  symbol-diff, not byte-count.

WHY THIS EXISTS
───────────────
S478c dropped `.obs-drop-btn.is-upload` from frt.css. Upload went white-on-white
— an invisible button, live, on Mark's tablet. Nothing caught it:

    syntax check   → passes fine with a rule missing
    brace balance  → passes fine with a rule missing
    shrink guard   → I ADDED 2KB of comments while deleting the rule.
                     Net growth. The guard said OK.
    post-push grep → I grepped for what I just ADDED, never for what
                     should still BE there.

Every gate was a PRESENCE check on new work. Nothing was an ABSENCE check on old
work. That is the hole, and no amount of care closes it — care is exactly what
kept failing.

The mechanism behind it, every time: WHOLE-BLOCK REWRITES. Find start, find end,
substitute a new string written from memory. The block had five things in it; I
remembered four. Deleting content IS the operation, so it has no failure mode —
it just quietly succeeds at removing something needed.

WHAT THIS DOES
──────────────
Extracts every SYMBOL from the live (pre-edit) file and the new file:
  .css → every selector
  .js  → every function/const/let/var/export/method name
Anything present BEFORE and absent AFTER is a REMOVAL. Removals are not
forbidden — they are forbidden SILENTLY. Each one must be named on the kill
list, or the push is blocked.

USAGE
─────
  python3 gate.py --old live/frt.css --new work/frt.css
  python3 gate.py --old live/x.js  --new work/x.js  --kill "_oldFn,legacyThing"

Exit 0 = safe to push.  Exit 1 = BLOCKED.
"""

import argparse
import re
import sys


def css_symbols(text):
    """Every selector in the file. Comments stripped first — a rule commented
    out is a rule deleted, and must be declared like any other deletion."""
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    syms = set()
    # selector list is everything before a { that isn't inside a block
    for m in re.finditer(r'(^|[};])\s*([^{};@][^{}]*?)\{', text):
        sel_list = m.group(2)
        for sel in sel_list.split(','):
            sel = ' '.join(sel.split())          # normalise whitespace
            if sel and not sel.startswith('@'):
                syms.add(sel)
    return syms


def js_symbols(text):
    """Every named binding. Deliberately greedy: a false positive costs one line
    on the kill list; a false NEGATIVE costs a live bug on a tablet."""
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    text = re.sub(r'^\s*//.*$', '', text, flags=re.M)
    syms = set()
    pats = [
        r'function\s+([A-Za-z_$][\w$]*)',            # function foo()
        r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)',   # const foo =
        r'export\s+(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)',
        r'^\s*([A-Za-z_$][\w$]*)\s*:\s*function',    # foo: function()  (methods)
        r'^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{',  # foo() {  (shorthand)
    ]
    for p in pats:
        for m in re.finditer(p, text, flags=re.M):
            syms.add(m.group(1))
    # noise that is never a real symbol
    noise = {'if', 'for', 'while', 'switch', 'catch', 'return', 'function',
             'typeof', 'else', 'do', 'try'}
    return {s for s in syms if s not in noise}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--old', required=True, help='live file (pre-edit)')
    ap.add_argument('--new', required=True, help='edited file')
    ap.add_argument('--kill', default='',
                    help='comma-separated symbols INTENTIONALLY removed')
    a = ap.parse_args()

    old = open(a.old, encoding='utf-8', errors='replace').read()
    new = open(a.new, encoding='utf-8', errors='replace').read()

    is_css = a.new.endswith('.css')
    extract = css_symbols if is_css else js_symbols

    o, n = extract(old), extract(new)
    kill = {k.strip() for k in a.kill.split(',') if k.strip()}

    removed = o - n
    added = n - o
    unnamed = {r for r in removed if r not in kill}

    label = 'SELECTORS' if is_css else 'SYMBOLS'
    print(f"── {a.new}")
    print(f"   {label:9s} before={len(o)}  after={len(n)}  "
          f"added={len(added)}  removed={len(removed)}")

    # A kill-list entry that wasn't actually removed means the edit didn't do
    # what was claimed — just as suspicious as an unnamed removal.
    phantom = kill - removed
    if phantom:
        print(f"\n   ⚠ declared removed but STILL PRESENT ({len(phantom)}):")
        for p in sorted(phantom):
            print(f"       {p}")

    if kill & removed:
        print(f"\n   ✓ intentional removals ({len(kill & removed)}):")
        for k in sorted(kill & removed):
            print(f"       {k}")

    if unnamed:
        print(f"\n   ✗ BLOCKED — {len(unnamed)} SILENT DELETION(S):")
        for u in sorted(unnamed):
            print(f"       {u}")
        print("\n   These existed before the edit and are gone after it, and")
        print("   were not declared. Either restore them, or name them with")
        print("   --kill to confirm the removal is deliberate.")
        print("\n   (This is exactly how `.obs-drop-btn.is-upload` disappeared.)")
        return 1

    print("   ✓ no silent deletions")
    return 0


if __name__ == '__main__':
    sys.exit(main())
