#!/usr/bin/env python3
"""S611 — coverage audit: every collectState key must be in the merge spec or
on the ACCEPTED list below. New uncovered keys FAIL the build (exit 1)."""
import re, sys, os
R=os.path.dirname(__file__)+'/../..'
# S721 — collectState no longer returns an inline object: since the manifest
# conversion it returns dieselCollectViaManifest(). The old scan matched a later
# function's `return {` and found ZERO keys, so this audit had been passing while
# checking nothing. The declared list of report keys now lives in
# diesel-app/js/reportManifest.js (`key: '...'`), and that is what is read.
# It fails loudly on an empty read rather than quietly auditing nothing.
man=open(R+'/diesel-app/js/reportManifest.js').read()
keys=set(re.findall(r"\bkey:\s*'(\w+)'", man))
if len(keys)<20: sys.exit('coverage_audit: manifest read returned %d keys — refusing to audit nothing' % len(keys))
spec=open(R+'/lib/data/sync.js').read()
dseg=spec[spec.find("diesel: {"):spec.find("electric:")]
covered=set(re.findall(r'^\s+(\w+):\s*\{\s*key:', dseg, re.M))
for grp in ('valueSets','statusMaps','fieldMaps','scalars'):
    m=re.search(grp+r":\s*\[([^\]]*)\]",dseg)
    if m: covered|=set(x.strip(" '") for x in m.group(1).split(',') if x.strip())
# ACCEPTED: metadata/versioning (harmless last-save-wins) — reviewed 04-Aug
# S616c — plus three DERIVED back-compat keys. equipChecked/equipChecked4b are
# still written as position lists, and appendixExcluded as a one-way exclusion
# list, purely so a tablet on a cached older build can still read a report
# somebody else filled in. This build never reads them back when the stamped
# maps are present (equipState, equipState4b, appendixState), so a stale copy
# cannot fight the merged answer. Remove all three once every device is
# confirmed current.
ACCEPTED_META={'clSchemaVer','formDateModified','formRevision','deletedItems','ttChosen',
               'equipChecked','equipChecked4b','appendixExcluded'}
# KNOWN GAPS: real per-field state still on last-save-wins. List may SHRINK only.
# S616  — 10 -> 3 (scalars family + four fieldMaps).
# S616c — 3 -> 0. The equipment answers were stored by CHECKBOX POSITION, with
# no record of which equipment a tick referred to: unreconcilable between two
# devices, and silently wrong the day the list is ever edited. Each answer is
# now its own record, keyed to a permanent id on the input.
# The appendix note written at S616 was WRONG and is corrected here: those
# exclusions were ALWAYS keyed to the photo's own id, never to a position. The
# real fault was direction — only "excluded" was recorded, so re-including a
# photo was indistinguishable from never touching it and lost every merge.
# Both answers now carry their own entry time.
KNOWN_GAPS=set()
unc=keys-covered-ACCEPTED_META-KNOWN_GAPS
print(f"collectState keys={len(keys)} covered={len(keys&covered)} accepted-meta={len(keys&ACCEPTED_META)} known-gaps={len(keys&KNOWN_GAPS)}")
if unc:
    print("FAIL — NEW UNCOVERED KEYS (add to spec or classify):",sorted(unc)); sys.exit(1)
print("OK — no unclassified keys. Known gaps (shrink-only):",sorted(KNOWN_GAPS&keys))
