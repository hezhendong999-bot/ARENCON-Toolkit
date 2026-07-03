#!/usr/bin/env python3
"""ARENCON push guard — prevents stale-base wipes (the S391 Diesel incident).

Usage:  python3 push_guard.py <repo_path> <local_file> [--min-ratio 0.98] [--build-re REGEX]

Checks, in order (any failure = exit 1, DO NOT PUSH):
  1. Fetches the file's blob at LIVE HEAD (Blobs API — safe for >1MB files).
  2. SIZE GATE: new file must be >= min-ratio x live size (default 0.98).
     A stale base shows up as a large shrink — the S391 wipe was -41%.
  3. BUILD GATE (if --build-re given): build string must exist in the new file
     and must not be LOWER than the live one (SNNN numeric compare).
  4. Prints live HEAD sha to use as base_tree/parents for the push.

Env: GH_PAT must hold the PAT. Repo is fixed to hezhendong999-bot/ARENCON-Toolkit.
"""
import json, os, re, sys, base64, urllib.request

API = "https://api.github.com/repos/hezhendong999-bot/ARENCON-Toolkit"

def gh(url):
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + os.environ["GH_PAT"],
        "Accept": "application/vnd.github+json"})
    return json.load(urllib.request.urlopen(req))

def main():
    repo_path, local_file = sys.argv[1], sys.argv[2]
    min_ratio = 0.98
    build_re = None
    args = sys.argv[3:]
    while args:
        a = args.pop(0)
        if a == "--min-ratio": min_ratio = float(args.pop(0))
        elif a == "--build-re": build_re = args.pop(0)

    head = gh(API + "/git/refs/heads/main")["object"]["sha"]
    tree = gh(API + f"/git/trees/{head}?recursive=1")["tree"]
    entry = next((e for e in tree if e["path"] == repo_path), None)
    if entry is None:
        print(f"[GUARD] NOTE: {repo_path} not at HEAD (new file). Size gate skipped.")
        print(f"[GUARD] HEAD={head}")
        return 0
    live_size = entry["size"]
    blob = gh(API + f"/git/blobs/{entry['sha']}")
    live = base64.b64decode(blob["content"]).decode("utf-8", errors="replace")

    new = open(local_file, encoding="utf-8", errors="replace").read()
    ratio = len(new) / max(live_size, 1)
    print(f"[GUARD] live={live_size}B new={len(new)}B ratio={ratio:.3f} (min {min_ratio})")
    if ratio < min_ratio:
        print(f"[GUARD] ABORT: new file is {(1-ratio)*100:.1f}% smaller than LIVE HEAD.")
        print("[GUARD] This is the stale-base signature (S391 wipe was -41%).")
        print("[GUARD] Re-fetch live HEAD as your edit base. DO NOT PUSH.")
        return 1

    if build_re:
        lm = re.search(build_re, live)
        nm = re.search(build_re, new)
        if not nm:
            print(f"[GUARD] ABORT: build string /{build_re}/ missing from new file.")
            return 1
        if lm:
            ln = int(re.sub(r"\D", "", lm.group(1)) or 0)
            nn = int(re.sub(r"\D", "", nm.group(1)) or 0)
            print(f"[GUARD] build live={lm.group(1)} new={nm.group(1)}")
            if nn < ln:
                print("[GUARD] ABORT: new build is LOWER than live — stale base.")
                return 1
    print(f"[GUARD] PASS. Use HEAD={head} as base_tree/parents. Post-verify blob SHA after push.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
