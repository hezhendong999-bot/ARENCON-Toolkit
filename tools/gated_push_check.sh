#!/bin/sh
# tools/gated_push_check.sh — S512 (Mark). MECHANICAL gate enforcement.
#
# Born from a real failure: in S511 a drawings.js copy that gate.py had
# BLOCKED (89 reported deletions) was pushed anyway, because the session's
# ad-hoc push script ran the gate but never looked at its exit code. Per the
# standing principle — "when something breaks twice, ask what stops this
# mechanically; a gate, not a paragraph" — this script IS the mechanism.
#
# Usage:  sh tools/gated_push_check.sh pairs.txt
#   pairs.txt lines:  <old_file> <new_file> [htmlold htmlnew]
#   (3rd/4th columns only for frt.css lines, per gate.py's ?v= check)
#
# Exit 0  = every gate passed; proceed to blob/tree/commit.
# Exit 1  = at least one gate BLOCKED; DO NOT PUSH ANYTHING. No partial
#           pushes: one blocked file invalidates the whole batch, because a
#           batch is reviewed as a unit.
#
# Sessions MUST route every push through this. A push whose transcript does
# not show this script exiting 0 is invalid, same as a push with no gate
# output at all.
set -u
[ $# -ge 1 ] || { echo "usage: $0 pairs.txt"; exit 1; }
FAIL=0
while read -r OLD NEW H1 H2; do
  [ -n "${OLD:-}" ] || continue
  case "$OLD" in \#*) continue;; esac
  if [ -n "${H1:-}" ] && [ -n "${H2:-}" ]; then
    python3 "$(dirname "$0")/gate.py" --old "$OLD" --new "$NEW" --htmlold "$H1" --htmlnew "$H2"
  else
    python3 "$(dirname "$0")/gate.py" --old "$OLD" --new "$NEW"
  fi
  RC=$?
  if [ $RC -ne 0 ]; then
    echo ">>> GATE BLOCKED: $NEW (exit $RC) — THE ENTIRE PUSH IS OFF."
    FAIL=1
  fi
done < "$1"
if [ $FAIL -ne 0 ]; then
  echo "═══ gated_push_check: BLOCKED — do not create blobs, do not push. ═══"
  exit 1
fi
echo "═══ gated_push_check: all gates passed — push may proceed. ═══"
exit 0
