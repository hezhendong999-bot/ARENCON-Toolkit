#!/usr/bin/env python3
"""
ARENCON safe-push guard.
Prevents the recurring "feature silently deleted" regression by:
  1. Re-asserting LIVE HEAD immediately before building the tree.
  2. Building base_tree FROM live HEAD (never a stale snapshot).
  3. Refusing the push if the new file would DELETE any registered
     feature-sentinel that exists in the current live copy of that file.
  4. Re-checking HEAD right before PATCH; aborting on any race.
  5. Post-verifying via Blobs API (not CDN).

Usage:
  python3 arencon_safe_push.py <local_file> <repo_path> "<commit message>"

Feature sentinels are short, unique strings that MUST persist in a file.
If live HEAD has a sentinel and the file being pushed does not, the push
is a regression and is BLOCKED. This catches stale-base overwrites
regardless of which workstream introduced them.
"""
import sys, json, base64, subprocess, time, os

REPO = "hezhendong999-bot/ARENCON-Toolkit"
API = f"https://api.github.com/repos/{REPO}"
PAT = os.environ.get("ARENCON_PAT", "")

# ── Feature sentinels per file: strings that must never silently vanish ──
# Add to this registry whenever a feature is restored/added that has been
# (or could be) clobbered by a stale-base push.
SENTINELS = {
    "aiusage_panel.js": [
        "billStatus",             # snapshot-aware billed/unbilled/added_after
        "markHasLateActivity",    # stale-mark detection
        "rangeTotals",            # snapshot-at-marking totals
        "exportInvoiceBackup",    # per-period invoice backup export
        "clientRollup",           # per-client unbilled roll-up
        "untaggedTotal",          # untagged usage callout
        "_whoMarked",             # who-marked-it in ledger
        "ledgerUnmark",           # un-mark (billed->unbilled)
        "sortRows",               # in-group sort
    ],
    "ARENCON_Diesel_Fire_Pump_Commissioning.html": [
        "aiusage_panel.js",       # shared usage panel include
        "thin Diesel host for the SHARED panel",  # host IIFE marker
    ],
    "ARENCON_Project_Hub.html": [
        "edit-name-modal",        # Admin: Edit Name modal
        "saveUserName",           # Admin: name save fn
        "edit-num-modal",         # Admin: Set User # modal
        "edit-init-modal",        # Admin: Set Initials modal
        "openEditNum",            # Admin: User # edit fn
        "saveUserInit",           # Admin: Initials save fn
        "new-user-num",           # Create User: User # field
        "new-user-init",          # Create User: Initials field
        "owner-track-modal",      # S335 owner-track picker
        "reset-pw-modal",         # Admin reset password
        "usage-panel",            # AI Usage & Costs view
        "showUsage",              # Usage view-switch fn
        "AIUsage",                # Usage module
        "ai_invoice_marks",       # billing marks table ref
        "aiu-mark-modal",         # mark-billed modal
        "exportPDF",              # usage PDF export
    ],
}

def gh(method, url, payload=None):
    cmd = ["curl", "-s", "-H", f"Authorization: Bearer {PAT}", "-X", method, url]
    if payload is not None:
        cmd += ["-d", json.dumps(payload)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return json.loads(out)

def gh_blob_post(payload_path):
    cmd = ["curl", "-s", "-H", f"Authorization: Bearer {PAT}",
           "-X", "POST", f"{API}/git/blobs", "-d", f"@{payload_path}"]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)

def live_head():
    return gh("GET", f"{API}/git/refs/heads/main")["object"]["sha"]

def blob_sha_for(commit, repo_path):
    tree = gh("GET", f"{API}/git/trees/{commit}")["tree"]
    for t in tree:
        if t["path"] == repo_path:
            return t["sha"]
    return None

def fetch_blob_text(blob_sha):
    d = gh("GET", f"{API}/git/blobs/{blob_sha}")
    return base64.b64decode(d["content"]).decode("utf-8", errors="replace")

def main():
    if len(sys.argv) != 4:
        print("usage: safe_push.py <local_file> <repo_path> <message>"); sys.exit(2)
    local, repo_path, message = sys.argv[1], sys.argv[2], sys.argv[3]
    if not PAT:
        print("ABORT: ARENCON_PAT env var not set"); sys.exit(2)

    new_text = open(local).read()

    # ── Regression guard ──────────────────────────────────────────────
    head = live_head()
    print(f"[guard] live HEAD: {head}")
    live_blob = blob_sha_for(head, repo_path)
    if live_blob:
        live_text = fetch_blob_text(live_blob)
        registered = SENTINELS.get(repo_path, [])
        deleted = [s for s in registered if s in live_text and s not in new_text]
        if deleted:
            print("╔═══════════════════════════════════════════════════════╗")
            print("║  PUSH BLOCKED — would DELETE live features:            ║")
            for s in deleted:
                print(f"║    ✗ {s}")
            print("║  This is a stale-base regression. Push aborted.       ║")
            print("╚═══════════════════════════════════════════════════════╝")
            sys.exit(1)
        print(f"[guard] sentinel check OK ({len(registered)} checked, 0 deletions)")
    else:
        print(f"[guard] note: {repo_path} not yet in tree (new file) — skipping sentinel check")

    # ── Build blob/tree/commit re-parented on live HEAD ───────────────
    json.dump({"content": new_text, "encoding": "utf-8"}, open("_blob.json", "w"))
    blob = gh_blob_post("_blob.json")["sha"]
    print(f"[push] blob: {blob}")
    tree = gh("POST", f"{API}/git/trees", {
        "base_tree": head,
        "tree": [{"path": repo_path, "mode": "100644", "type": "blob", "sha": blob}]
    })["sha"]
    print(f"[push] tree: {tree}")
    commit = gh("POST", f"{API}/git/commits",
                {"message": message, "tree": tree, "parents": [head]})["sha"]
    print(f"[push] commit: {commit}")

    # ── Race re-check then PATCH ──────────────────────────────────────
    now = live_head()
    if now != head:
        print(f"[push] ABORT: HEAD moved {head} -> {now} during build. Re-run to re-parent.")
        sys.exit(1)
    res = gh("PATCH", f"{API}/git/refs/heads/main", {"sha": commit, "force": False})
    landed = res.get("object", {}).get("sha")
    if landed != commit:
        print(f"[push] PATCH did not land cleanly: {res.get('message','?')}"); sys.exit(1)
    print(f"[push] ref now at: {landed}")

    # ── Post-verify via Blobs API ─────────────────────────────────────
    time.sleep(2)
    vblob = blob_sha_for(commit, repo_path)
    vtext = fetch_blob_text(vblob)
    missing = [s for s in SENTINELS.get(repo_path, []) if s not in vtext]
    if missing:
        print(f"[verify] WARNING — sentinels missing post-push: {missing}"); sys.exit(1)
    print(f"[verify] OK — all sentinels present, {len(vtext)} bytes deployed at {commit}")

if __name__ == "__main__":
    main()
