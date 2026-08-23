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

  Working on a scratch copy outside the checkout (the normal pattern)? Name the
  file so the gate can prove your base is live:

  python3 gate.py --old live/part14.js --new work/part14.js \
                  --path diesel-app/js/part14.js

THE BASE MUST BE LIVE (S622c)
─────────────────────────────
Every protected-symbol check below reads --old. Point it at a stale copy and
protection inherits that staleness — a symbol missing from the base was never in
the diff, so nothing fires. That is not theory: S610 rebuilt lib/data/sync.js
from a pre-push copy, silently dropped Lane A's S608 work, and reported ZERO
removals. The gate now fetches the file from live HEAD and refuses to run if
--old does not match it, byte for byte. PAT (or GITHUB_TOKEN) in the
environment. --no-live skips the check and says so in the transcript.

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


def _code_only(text):
    """Blank out comments and string bodies with a character scan.

    S509b — WHY THIS EXISTS. js_symbols used to strip block comments with
    `re.sub(r'/\\*[\\s\\S]*?\\*/', '', text)`. That regex has no idea what a string
    is, and this codebase is full of HTML built in JS:

        inp.accept = 'image/*';

    The `/*` inside that string opens a comment as far as the regex is concerned,
    and everything up to the next real `*/` is deleted. Measured on the live
    diesel-app/js/part06.js: two such strings swallowed spans of 64,341 and 40,119
    characters. Roughly 125 real symbols — including ones on the protected
    manifest — were invisible to the extractor, so their removal could never have
    been caught. The gate reported "no silent deletions" over code it could not see.

    This scanner tracks the states that actually matter (line comment, block
    comment, and the three string kinds, with escapes) and blanks everything that
    is not code, preserving offsets and newlines so the ^-anchored patterns still
    line up. Regex literals are NOT parsed — a regex containing a quote could still
    desync this scan, which is exactly why js_symbols also runs its patterns over
    the RAW text and unions the two results. A false positive costs one line on a
    kill list. A false negative costs a live bug on a tablet.
    """
    out = []
    i, n = 0, len(text)
    state = None          # None | 'line' | 'block' | "'" | '"' | '`'
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ''
        if state is None:
            if c == '/' and nxt == '/':
                state = 'line'; out.append('  '); i += 2; continue
            if c == '/' and nxt == '*':
                state = 'block'; out.append('  '); i += 2; continue
            if c in ('"', "'", '`'):
                state = c; out.append(' '); i += 1; continue
            out.append(c); i += 1; continue
        if state == 'line':
            if c == '\n': state = None; out.append('\n')
            else: out.append(' ')
            i += 1; continue
        if state == 'block':
            if c == '*' and nxt == '/':
                state = None; out.append('  '); i += 2; continue
            out.append('\n' if c == '\n' else ' '); i += 1; continue
        # inside a string
        if c == '\\':
            out.append('  '); i += 2; continue
        if c == state:
            state = None; out.append(' '); i += 1; continue
        out.append('\n' if c == '\n' else ' '); i += 1
    return ''.join(out)


def js_symbols(text):
    """Every named binding. Deliberately greedy: a false positive costs one line
    on the kill list; a false NEGATIVE costs a live bug on a tablet."""
    syms = set()
    pats = [
        r'function\s+([A-Za-z_$][\w$]*)',            # function foo()
        r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)',   # const foo =
        r'export\s+(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)',
        r'^\s*([A-Za-z_$][\w$]*)\s*:\s*function',    # foo: function()  (methods)
        r'^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{',  # foo() {  (shorthand)
        # S493: async methods — `async foo(args) {` — were invisible to the
        # extractor, which made manifest protection for them an illusion.
        r'^\s*async\s+([A-Za-z_$][\w$]*)\s*\(',
    ]
    # S509b: scan the code with strings/comments blanked, AND the raw text, and
    # union. Either pass alone can be blinded by input it does not model; the
    # union cannot lose a symbol that either pass can see. The cost is phantom
    # symbols from commented-out code, which surface only as a kill-list line.
    for source in (_code_only(text), text):
        for p in pats:
            for m in re.finditer(p, source, flags=re.M):
                syms.add(m.group(1))
    # noise that is never a real symbol
    noise = {'if', 'for', 'while', 'switch', 'catch', 'return', 'function',
             'typeof', 'else', 'do', 'try'}
    return {s for s in syms if s not in noise}


_IDENT_CH = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
                '0123456789_$')


def load_protected():
    """tools/protected_symbols.txt — Mark-specified features. Symbols listed
    there cannot be removed by ANY session; --kill does not apply. The only
    way past is Mark editing the manifest himself. Searched next to this
    script first, then the working directory, so it works from any cwd."""
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    protected = {}          # symbol -> feature label
    feature = '(unlabelled)'
    for cand in (os.path.join(here, 'protected_symbols.txt'),
                 'protected_symbols.txt',
                 os.path.join('tools', 'protected_symbols.txt')):
        if os.path.exists(cand):
            for line in open(cand, encoding='utf-8'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if line.startswith('@'):
                    feature = line[1:].strip()
                    continue
                protected[line] = feature
            return protected, cand
    return protected, None


def literal_present(entry, text):
    """Is this manifest entry ACTUALLY in the text — as itself, not as a
    fragment of an unrelated word?

    S565 — WHY THIS EXISTS. The literal fallback (S510) tested plain `entry in
    text`. Four manifest entries are ordinary English words — mint, leave, form,
    progress — so `form` matched inside `format`, and deleting a file whose only
    sin was the word "format" in a comment reported the shared dialog engine as
    about to be destroyed. A gate that blocks on a comment is a gate people
    learn to argue with, and an argued-with gate protects nothing.

    Accepted as present when an occurrence is either:
      • a COMPLETE identifier — nothing identifier-ish on either side, so
        `form` matches 'form' and kind:form but never format/perform, and
        `crbt-unlock` still matches inside id="crbt-unlock"; or
      • a deliberate PREFIX — entries ending in _ - or : (arencon_rpt_) are
        written to match the start of longer names, so only the LEFT side is
        required to be clean.

    This is strictly STRICTER than `entry in text`: every match it accepts, the
    old test also accepted. No protection is weakened — only accidental matches
    inside unrelated words stop firing.
    """
    if not entry:
        return False
    prefixish = entry.endswith(('_', '-', ':'))
    at = text.find(entry)
    while at >= 0:
        before = text[at - 1] if at else ''
        after_i = at + len(entry)
        after = text[after_i] if after_i < len(text) else ''
        if before not in _IDENT_CH and (prefixish or after not in _IDENT_CH):
            return True
        at = text.find(entry, at + 1)
    return False


def _git_root(start):
    """Nearest ancestor directory containing .git, or None."""
    import os
    d = os.path.abspath(start if os.path.isdir(start) else os.path.dirname(start) or '.')
    while True:
        if os.path.isdir(os.path.join(d, '.git')):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def _repo_rel(path):
    """Repo-relative POSIX path for a file inside the working tree, else None."""
    import os
    root = _git_root(path)
    if not root:
        return None
    ap = os.path.abspath(path)
    if not ap.startswith(root + os.sep):
        return None
    return os.path.relpath(ap, root).replace(os.sep, '/')


def fetch_live(repo_path, ref='main',
               repo='hezhendong999-bot/ARENCON-Toolkit'):
    """The file as it exists at live HEAD, as text.

    Returns (text, status) where status is one of:
      'ok'        — fetched
      'absent'    — 404: the file does not exist at HEAD (a genuinely new file)
      'nopat'     — no PAT in the environment
      'neterr:…'  — anything else
    """
    import os
    pat = os.environ.get('PAT') or os.environ.get('GITHUB_TOKEN')
    if not pat:
        return None, 'nopat'
    import urllib.request, urllib.error
    url = f'https://api.github.com/repos/{repo}/contents/{repo_path}?ref={ref}'
    rq = urllib.request.Request(url)
    rq.add_header('Authorization', 'Bearer ' + pat)
    rq.add_header('Accept', 'application/vnd.github.raw')
    try:
        return urllib.request.urlopen(rq, timeout=30).read().decode('utf-8', 'replace'), 'ok'
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None, 'absent'
        return None, f'neterr:HTTP {e.code}'
    except Exception as e:                                   # noqa: BLE001
        return None, 'neterr:' + str(e)[:80]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--old', required=True, help='live file (pre-edit)')
    ap.add_argument('--new', required=True, help='edited file')
    ap.add_argument('--kill', default='',
                    help='comma-separated symbols INTENTIONALLY removed '
                         '(does NOT work on protected symbols)')
    ap.add_argument('--moved-to', dest='moved_to', default='',
                    help='comma-separated DESTINATION files a symbol moved INTO. '
                         'A removal is excused only if the symbol is actually '
                         'FOUND in one of them — presence is proved, not asserted.')
    ap.add_argument('--htmlold', default='',
                    help='frt.css only: LIVE frt/index.html (proves ?v= state)')
    ap.add_argument('--htmlnew', default='',
                    help='frt.css only: EDITED frt/index.html (proves ?v= bump)')
    ap.add_argument('--no-live', dest='no_live', action='store_true',
                    help='GATE HOLE #3 ESCAPE HATCH. Skip verifying --old against '
                         'live HEAD. Every protected-symbol check reads --old, so '
                         'skipping this makes protection inherit whatever staleness '
                         '--old carries. Visible in the transcript on purpose.')
    ap.add_argument('--drop', default='',
                    help='S687: comma-separated repo paths this push deliberately '
                         'stops loading, so they leave the offline precache on '
                         'purpose. Forwarded to gen_precache. Same law as --kill: '
                         'removals are allowed, silent removals are not. A path '
                         'that is absent from your checkout can never be declared '
                         'here — that is being behind, and it always blocks.')
    ap.add_argument('--ref', default='main', help='ref to verify --old against')
    ap.add_argument('--path', default='',
                    help='repo-relative path of the file being gated, e.g. '
                         'diesel-app/js/part14.js. Needed when --new is a scratch '
                         'copy outside the checkout (the normal working pattern) — '
                         'it is what lets the gate prove --old is live.')
    a = ap.parse_args()

    old = open(a.old, encoding='utf-8', errors='replace').read()
    new = open(a.new, encoding='utf-8', errors='replace').read()

    # ── GATE HOLE #3 (S610 → found S612 → closed S622c) ──────────────────────
    # S610 rebuilt lib/data/sync.js from a copy taken BEFORE the S608 push and
    # gated against that copy. Lane A's work was silently dropped and the gate
    # reported ZERO removals — correctly, by its own lights: every protected
    # check below reads --old, so a symbol missing from a stale base was never
    # in the diff, and protection never fired. PROTECTION INHERITS THE STALENESS
    # OF WHATEVER BASE YOU POINT AT.
    #
    # The handoff called for an absolute presence check on the file being
    # pushed. That needs to know which file owns each manifest entry, and the
    # manifest is global — so it either needs a schema change Mark owns, or an
    # ownership guess. Both patch the symptom. The cause is simpler and has one
    # cure: THE BASE MUST BE PROVED LIVE. With --old byte-identical to HEAD,
    # every existing check — the diff path AND the literal fallback — becomes
    # sound with no new logic and no manifest change.
    #
    # "A paragraph in a handoff is not a mechanism." Neither is a warning:
    # people learn to scroll past those. This BLOCKS, and the only way past is
    # --no-live, which lands in the transcript where Mark can see it.
    if not a.no_live:
        _rel = a.path.strip().lstrip('./') or _repo_rel(a.new)
        if _rel is None:
            print(f"── {a.new}")
            print("\n   ✗✗ BLOCKED — cannot verify the base against live HEAD.")
            print(f"   --new ({a.new}) is a scratch copy outside the checkout, so the")
            print("   gate has no repo path to compare --old against. That is fine and")
            print("   normal — just name the file:")
            print(f"\n       --path <repo/relative/path>   e.g. --path frt/js/app.js")
            print("\n   Or pass --no-live and say why in the transcript. Do not skip it")
            print("   quietly: every protected-symbol check below reads --old.")
            return 1
        _live, _st = fetch_live(_rel, a.ref)
        if _st == 'ok':
            if _live != old:
                print(f"── {a.new}")
                print("\n   ✗✗ BLOCKED — --old IS NOT LIVE HEAD.")
                print(f"   {a.old}")
                print(f"   differs from {_rel} at {a.ref}. Every protected-symbol check")
                print("   below reads --old, so gating against this base would inherit")
                print("   its staleness and silently pass a revert of someone else's")
                print("   work. This is exactly how S610 dropped Lane A's S608 engine")
                print("   work with a clean 'zero removals' report.")
                print("\n   Re-fetch the file from live HEAD, re-apply your edits on top")
                print("   of it, and run again. Do not force, and do not --no-live your")
                print("   way past a base you know is behind.")
                return 1
            print(f"   base verified against live {a.ref} ✓")
        elif _st == 'absent':
            print(f"   note: {_rel} does not exist at live {a.ref} — treating as a NEW file.")
        else:
            print(f"── {a.new}")
            print(f"\n   ✗✗ BLOCKED — could not reach live HEAD to verify the base ({_st}).")
            if _st == 'nopat':
                print("   Set PAT in the environment, or pass --no-live and say why.")
            else:
                print("   Retry, or pass --no-live and say why in the transcript.")
            print("   An unverified base is the S610 failure waiting to happen; the")
            print("   gate refuses rather than reporting a confidence it does not have.")
            return 1

    # ── frt.css ?v= GATE (S497) ──
    # S496 pushed frt.css three times with CACHE_NAME bumped but frt.css?v=
    # never touched. Devices served stale CSS all night; two "bugs" were
    # chased and one working element deleted before the cause was found.
    # A paragraph in a handoff is not a mechanism; this is. Any diff that
    # changes frt.css must PROVE, in the same gate run, that the ?v= query
    # in frt/index.html was bumped: pass --htmlold (live) and --htmlnew
    # (edited). No proof, no push.
    import os as _os
    if _os.path.basename(a.new) == 'frt.css' and old != new:
        _vre = re.compile(r'frt\.css\?v=(\d+)')
        if not (a.htmlold and a.htmlnew):
            print('── frt.css ?v= gate')
            print('   ✗ BLOCKED — frt.css changed but no --htmlold/--htmlnew given.')
            print('     Pass the LIVE and EDITED frt/index.html so the gate can')
            print('     verify the frt.css?v= bump shipped in the same push.')
            print('     (S496: three frt.css pushes without a ?v= bump cost a night.)')
            return 1
        _ho = open(a.htmlold, encoding='utf-8', errors='replace').read()
        _hn = open(a.htmlnew, encoding='utf-8', errors='replace').read()
        _mo, _mn = _vre.search(_ho), _vre.search(_hn)
        if not _mo or not _mn:
            print('── frt.css ?v= gate')
            print('   ✗ BLOCKED — frt.css?v= tag not found in '
                  + ('the LIVE' if not _mo else 'the EDITED') + ' index.html.')
            return 1
        _vo, _vn = int(_mo.group(1)), int(_mn.group(1))
        if _vn <= _vo:
            print('── frt.css ?v= gate')
            print(f'   ✗ BLOCKED — frt.css changed but ?v= not bumped '
                  f'(live v={_vo}, edited v={_vn}).')
            print('     Bump frt.css?v= in frt/index.html in the SAME push.')
            return 1
        print(f'── frt.css ?v= gate: ✓ bumped v={_vo} → v={_vn}')

    # ── PHOTO LIGHTBOX CONVERGENCE GATE (S665, Mark) ────────────────────────
    # ONE photo lightbox: lib/ui/lightbox.js. Every tool consumes it.
    #
    # WHY A GATE AND NOT A DOCUMENT: the locked spec has said "port like-for-
    # like, do not reinvent per tool" since S344, and Electric grew its own
    # photo lightbox anyway — not by decision, but because nothing stopped it.
    # Nobody chose to drift. Drift is what happens by default when the cheapest
    # path is to write a new one. So the cheapest path has to be blocked.
    # A rule enforced by prose is a rule enforced by whoever remembers it.
    #
    # WHAT IT CATCHES: a file that DECLARES its own photo-lightbox entry point
    # (window.*Lightbox = / function openLightbox). Calling one is fine and is
    # the entire point — consumers must be free to open the shared shell.
    #
    # GRANDFATHERED, DELIBERATELY: FRT and Electric already own private photo
    # lightboxes. A blanket rule would block every push to them from today,
    # which turns the gate into an obstacle to be bypassed rather than a floor.
    # These two paths are KNOWN DEBT: they may keep their existing declaration
    # and shrink toward the shared shell, but the count may never GROW, and no
    # file outside this list may declare one at all. Removing a path from this
    # list when its tool converges is part of shipping that conversion.
    _LB_GRANDFATHERED = {
        'frt/js/ui/lightbox.js',                          # FRT — converge last (largest consumer)
        'ARENCON_Electric_Fire_Pump_Commissioning.html',  # Electric — Lane C owns this
    }
    # Matches a DECLARATION of a lightbox entry point, in the shapes that
    # actually occur in this codebase — verified against Electric's inline
    # lightbox, which the first draft of this pattern scored as ZERO because
    # `function open[A-Z]\w*[Ll]ightbox` cannot match `function openLightbox(`
    # (it demands a second "lightbox" after the capital). Written from the real
    # file, not from imagination: openLightbox, _pgOpenLightbox,
    # _enhancedOpenLightbox, window.*Lightbox =.
    # Deliberately NOT matched: closeLightbox / lightboxNav — helpers of an
    # existing lightbox, not a new one; and any CALL of the shared shell.
    _LB_DECL = re.compile(
        r'window\.\w*[Ll]ightbox\w*\s*=\s*(?!=)'
        r'|function\s+\w*[Oo]pen\w*[Ll]ightbox\w*\s*\('
        r'|\w*[Oo]pen\w*[Ll]ightbox\w*\s*=\s*function',
    )
    # Counted on RAW text, NOT _code_only. Verified: the comment/string scanner
    # desyncs on frt/js/ui/lightbox.js (regex literals containing quotes — the
    # exact hazard its own docstring names) and reported ZERO declarations in a
    # file that visibly declares one, so a grandfathered file could have grown a
    # second lightbox with the gate reporting clean. js_symbols handles this by
    # unioning raw and stripped; a growth-only counter can simply read raw.
    # The residual false positive — a COMMENT that adds a line looking like a
    # declaration — costs one conversation. The false negative costs the drift
    # this gate exists to stop.
    def _lb_count(t):
        return len(_LB_DECL.findall(t))
    _lbrel = (a.path.strip().lstrip('./') or _repo_rel(a.new) or a.new)
    # Only JS/HTML can declare a JS lightbox. Scoping matters: the first draft
    # ran on every file type and BLOCKED ITS OWN PUSH, because the comment above
    # quotes `function openLightbox(` while explaining the pattern. That is the
    # same cry-wolf failure the S511 note records — a gate that fires on prose
    # is a gate people start bypassing, and a bypassed gate protects nothing.
    _lb_scoped = _lbrel.lower().endswith(('.js', '.html', '.htm'))
    if _lb_scoped and _lbrel not in _LB_GRANDFATHERED \
            and _lbrel != 'lib/ui/lightbox.js':
        _lb_old = _lb_count(old)
        _lb_new = _lb_count(new)
        if _lb_new > _lb_old:
            print('── photo lightbox convergence gate')
            print(f'   ✗ BLOCKED — {_lbrel} declares its own photo lightbox '
                  f'({_lb_old} → {_lb_new}).')
            print('     There is ONE photo lightbox: lib/ui/lightbox.js.')
            print('     Consume it — window.LightboxShell.build() — instead of')
            print('     growing a private copy. Electric drifted exactly this way.')
            print('     If this is genuinely a new consumer of the shared shell,')
            print('     it should be CALLING the shell, not declaring a lightbox.')
            return 1
    elif _lb_scoped and _lbrel in _LB_GRANDFATHERED:
        _lb_old = _lb_count(old)
        _lb_new = _lb_count(new)
        if _lb_new > _lb_old:
            print('── photo lightbox convergence gate')
            print(f'   ✗ BLOCKED — {_lbrel} is GRANDFATHERED known debt '
                  f'({_lb_old} → {_lb_new}).')
            print('     Its private photo lightbox may shrink toward')
            print('     lib/ui/lightbox.js. It may not grow.')
            return 1
        if _lb_new < _lb_old:
            print(f'── photo lightbox convergence gate: ✓ {_lbrel} '
                  f'shed a private lightbox declaration ({_lb_old} → {_lb_new})')

    # S510 — an .html tool carries BOTH: script blocks and a large inline <style>.
    # Selecting one extractor by extension meant every .html file was scanned with
    # js_symbols alone, so protected CSS selectors living inside a tool's <style>
    # block — .band-header, .epd-pick, .hub-view-toggle and ~60 more on the manifest
    # — could be deleted with the gate reporting "no silent deletions". This is the
    # same class of hole as the S509b comment stripper, and the same class of loss
    # the manifest's own `.obs-drop-btn.is-upload` note records. Union both readers
    # for HTML: a false positive costs one kill-list line, a false negative costs a
    # control that vanishes off a tablet.
    low = a.new.lower()
    is_css = low.endswith('.css')
    if is_css:
        extract = css_symbols
    elif low.endswith(('.html', '.htm')):
        # S511 — scan the <style> BLOCKS for selectors, not the whole document. The
        # S510 fix unioned css_symbols over the entire HTML file, which made prose
        # inside comments look like selectors: relocating one <script> tag produced
        # two "silent deletions" whose names were sentence fragments. A gate that
        # cries wolf on a comment edit is a gate people start bypassing, and a
        # bypassed gate protects nothing. Selectors are only ever declared inside
        # <style>, so that is the only place worth reading them from.
        def extract(t):
            styles = ''.join(re.findall(r'<style[^>]*>(.*?)</style>', t,
                                        flags=re.S | re.I))
            return js_symbols(t) | (css_symbols(styles) if styles else set())
    else:
        extract = js_symbols

    o, n = extract(old), extract(new)
    kill = {k.strip() for k in a.kill.split(',') if k.strip()}

    removed = o - n
    added = n - o

    # ── MOVED SYMBOLS (S564) ──────────────────────────────────────────────
    # WHY THIS EXISTS. The gate compares ONE file to ITSELF. It has no concept
    # of code going next door, so splitting a file reads as mass deletion —
    # and on a protected symbol that is an unconditional block with no switch.
    # frt/js/ui/deficiencies.js (8,397 lines) holds 6 protected declarations
    # and 20 protected literals, which is precisely why it has never been
    # split: the safest available operation was also the one the gate refused.
    #
    # This does NOT weaken the protection. --kill remains powerless on
    # protected symbols, and --moved-to is not an assertion — the destination
    # file is READ FROM DISK and the symbol must actually BE there. A symbol
    # that falls between two files during a split is still missing, still
    # unnamed, still blocks. What changes is only this: a symbol proved to
    # exist in a declared sibling has not been deleted, so it is not reported
    # as one.
    #
    # Deliberately strict:
    #   • a destination path that does not exist    → BLOCKED (typo ≠ proof)
    #   • a destination that is the file under gate → BLOCKED (circular proof)
    #   • --moved-to given but nothing moved        → warned as a phantom
    moved = {}                      # symbol -> destination path it was found in
    dests = [p.strip() for p in a.moved_to.split(',') if p.strip()]
    if dests:
        import os as _os2
        _dst_syms, _dst_text = {}, {}
        for dp in dests:
            if not _os2.path.exists(dp):
                print(f"── {a.new}")
                print(f"\n   ✗ BLOCKED — declared destination does not exist: {dp}")
                print("     --moved-to must point at the REAL edited files the")
                print("     symbols landed in. A path that isn't there proves nothing.")
                return 1
            if _os2.path.abspath(dp) in (_os2.path.abspath(a.new),
                                         _os2.path.abspath(a.old)):
                print(f"── {a.new}")
                print(f"\n   ✗ BLOCKED — destination is the file under the gate: {dp}")
                print("     A file cannot be its own proof of a move.")
                return 1
            _t = open(dp, encoding='utf-8', errors='replace').read()
            _dst_text[dp] = _t
            _dst_syms[dp] = extract(_t)
        for r in sorted(removed):
            for dp in dests:
                # Same two-tier test the protected check uses: a declaration if
                # the extractor sees one, otherwise plain presence in the text.
                if r in _dst_syms[dp] or literal_present(r, _dst_text[dp]):
                    moved[r] = dp
                    break
        removed = removed - set(moved)

    # ── S686: THE MANIFEST STALENESS CHECK ───────────────────────────────
    # WHAT HAPPENED. On 23 Aug a push whose checkout was ONE MINUTE older than
    # the previous one appended its own block to tools/protected_symbols.txt
    # and, in doing so, dropped Lane A's entire U1 block. For eleven hours the
    # pin-drag law sat in the repo unprotected: capture, restore, refusal —
    # all deletable with a clean "zero removals" report. The same push also
    # dropped a precache line from sw.js. One stale checkout, two silent
    # losses, in the two files whose only job is preventing silent losses.
    #
    # WHY THE EXISTING CHECKS DID NOT CATCH IT. They are sound — the live-base
    # check above would have blocked it outright. It never ran, because the
    # gate is invoked per FILE and nobody invoked it on the manifest. A
    # protection that depends on remembering to ask for it is not a mechanism.
    #
    # SO THIS RUNS ON EVERY INVOCATION, whatever file is under the gate. Every
    # push gates something; this rides along. If the checkout's manifest is
    # missing anything live has, the lane is one append away from erasing it,
    # and that is worth a block BEFORE the append rather than a forensic
    # afterwards. A checkout that is AHEAD of live is not flagged — that is
    # just an unpushed edit, and an approved removal legitimately shrinks the
    # file. Only BEHIND is dangerous.
    if not a.no_live:
        import os
        _mf_rel = 'tools/protected_symbols.txt'
        _mf_local = None
        for _c in (os.path.join(os.path.dirname(os.path.abspath(__file__)), 'protected_symbols.txt'),
                   _mf_rel, 'protected_symbols.txt'):
            if os.path.exists(_c):
                _mf_local = _c
                break
        # Skip when the manifest IS the file under the gate: the live-base
        # check above already proved that case, and re-reading the checkout
        # copy here would compare it against itself.
        _gated_rel = (a.path.strip().lstrip('./') or _repo_rel(a.new) or '')
        if _mf_local and not _gated_rel.endswith('protected_symbols.txt'):
            _mf_live, _mf_st = fetch_live(_mf_rel, a.ref)
            if _mf_st == 'ok':
                _live_lines = {l.strip() for l in _mf_live.split('\n') if l.strip()}
                _local_txt = open(_mf_local, encoding='utf-8', errors='replace').read()
                _local_lines = {l.strip() for l in _local_txt.split('\n') if l.strip()}
                _behind = sorted(_live_lines - _local_lines)
                if _behind:
                    print(f"── {a.new}")
                    print("\n   ✗✗ BLOCKED — your tools/protected_symbols.txt is BEHIND live.")
                    print(f"   {len(_behind)} line(s) exist at live {a.ref} and are missing from")
                    print(f"   {_mf_local}. Appending to this copy would delete them, and")
                    print("   the features behind them would lose their protection silently.")
                    print("\n   Missing (first 8):")
                    for _b in _behind[:8]:
                        print("     " + (_b[:88] + ('…' if len(_b) > 88 else '')))
                    print("\n   Pull tools/protected_symbols.txt from live HEAD, re-apply your")
                    print("   own additions on top of it, and run again.")
                    return 1


    # Checked BEFORE the kill list is honoured: --kill has no power here.
    # A protected symbol present in the live file and absent from the edit is
    # an unconditional block, whatever the session believes about cleanup.
    protected, manifest_path = load_protected()
    prot_hit = {r: protected[r] for r in removed if r in protected}

    # S510 — LITERAL FALLBACK. The extractors only recognise DECLARATIONS. Thirty
    # manifest entries are not declarations at all: element ids the shared engines
    # look up by name (np-client-suggest, notif-stack), storage-key prefixes
    # (arencon_rpt_), and data fields carried through cloud sync (isRecommendation,
    # amendedAfterIssue). Every one of those sat on the manifest fully unenforced —
    # deleting the markup or the field would have passed the gate clean. If an entry
    # is not a symbol the extractors know, fall back to plain presence: it was in the
    # live file, it must still be in the edited one.
    _sym_space = o | n
    for entry, feat in protected.items():
        if entry in _sym_space:
            continue                      # already covered by the symbol comparison
        if literal_present(entry, old) and not literal_present(entry, new):
            # S564: a literal that moved into a declared destination is present
            # in the codebase, so it was not deleted. Same proof standard as
            # above — the destination file is read, not taken on trust.
            _landed = None
            for dp in dests:
                if literal_present(entry, _dst_text[dp]):
                    _landed = dp
                    break
            if _landed:
                moved[entry] = _landed
                continue
            prot_hit[entry] = feat

    if prot_hit:
        print(f"── {a.new}")
        print(f"\n   ✗✗ BLOCKED — {len(prot_hit)} PROTECTED SYMBOL(S) WOULD BE DELETED:")
        by_feat = {}
        for sym, feat in prot_hit.items():
            by_feat.setdefault(feat, []).append(sym)
        for feat in sorted(by_feat):
            print(f"\n       FEATURE: {feat}")
            for sym in sorted(by_feat[feat]):
                print(f"         {sym}")
        print("\n   These carry features Mark specified. --kill does not apply.")
        print("   Reverts and cleanups are NOT authorization. STOP and ask Mark;")
        print(f"   only he may remove entries from {manifest_path}.")
        print("\n   (S493: the 1000-series band grouping died exactly this way.)")
        return 1
    if manifest_path is None:
        print("   ⚠ protected_symbols.txt NOT FOUND — feature protection is OFF.")
        print("     Fetch tools/protected_symbols.txt from the repo before pushing.")

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

    if dests and not moved:
        print(f"\n   ⚠ --moved-to given but NOTHING moved. Destinations declared:")
        for dp in dests:
            print(f"       {dp}")
        print("     Either the cut didn't happen, or the wrong files were named.")

    if moved:
        _mprot = {s: protected[s] for s in moved if s in protected}
        print(f"\n   ✓ moved, and PROVED present in the destination ({len(moved)}):")
        _by_dest = {}
        for sym, dp in moved.items():
            _by_dest.setdefault(dp, []).append(sym)
        for dp in sorted(_by_dest):
            print(f"       → {dp}")
            for sym in sorted(_by_dest[dp]):
                print(f"           {sym}" + ("   [PROTECTED]" if sym in protected else ""))
        if _mprot:
            print(f"\n   ⚠ {len(_mprot)} of those carry PROTECTED features. They were")
            print("     allowed only because they were found in the destination file.")
            print("     Field-verify these before the session ends:")
            for feat in sorted({protected[s] for s in _mprot}):
                print(f"       · {feat[:96]}")

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

    # ── S497: sw.js is MACHINE-OWNED. Whenever the file under the gate is
    # sw.js, the precache list must match what tools/gen_precache.py derives
    # from the tools' real imports. A hand edit or a stale-base rebuild fails
    # HERE, in every lane, before any push — this is what makes the two S497
    # clobber incidents mechanically impossible rather than merely unlikely.
    import os, subprocess
    # Content-based detection, NOT filename-based: lanes name working copies
    # freely (sw_push2.js, sw_fix.js, /tmp/anything). If the file being gated
    # IS the service worker — identified by its CACHE_NAME signature — the
    # precache check runs, whatever the file is called.
    # S547: identify the ROOT worker specifically, by its cache namespace
    # declaration. gen_precache derives the list for the site-root sw.js only.
    # The old signature ("var CACHE_NAME = 'arencon-frt-") also matched
    # frt/sw.js, whose precache list is FRT-specific and legitimately different —
    # gating it from a full checkout produced a FALSE block, which is why it was
    # only ever gated from copies where gen_precache.py was absent and the check
    # silently skipped. Matching on CACHE_PREFIX makes the two workers
    # distinguishable by content, whatever the working copy is called.
    # Built by concatenation so this file does not contain the signature and
    # therefore does not match itself when it is the file under the gate.
    _sw_sig = "var CACHE_" + "PREFIX = 'arencon-frt-'"
    if _sw_sig in new:
        gen = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           'gen_precache.py')
        if os.path.exists(gen):
            _pc_args = [sys.executable, gen, '--check', '--live',
                        '--sw', os.path.abspath(a.new)]
            if a.drop:
                _pc_args += ['--drop', a.drop]
            r = subprocess.run(_pc_args,
                               capture_output=True, text=True,
                               cwd=os.path.dirname(os.path.dirname(gen)))
            print('   ── precache check (gen_precache --check --live) ──')
            for ln in (r.stdout + r.stderr).strip().splitlines():
                print('   ' + ln)
            if r.returncode != 0:
                print('   ✗ BLOCKED — sw.js precache does not match the derived list.')
                print('   Run: python3 tools/gen_precache.py --write   (from repo root,')
                print('   with the CURRENT live sw.js in place) and re-gate.')
                return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
