#!/usr/bin/env python3
"""S611 — coverage audit: every collectState key must be in the merge spec or
on the ACCEPTED list below. New uncovered keys FAIL the build (exit 1)."""
import re, sys, os
R=os.path.dirname(__file__)+'/../..'
src=open(R+'/diesel-app/js/part06c.js').read()
seg=src[src.find('function collectState()'):][:9000]
ret=seg[seg.find('return {'):]
keys=set(re.findall(r'^\s{4}(\w+)[,:]', ret, re.M))
spec=open(R+'/lib/data/sync.js').read()
dseg=spec[spec.find("diesel: {"):spec.find("electric:")]
covered=set(re.findall(r'^\s+(\w+):\s*\{\s*key:', dseg, re.M))
for grp in ('valueSets','statusMaps','fieldMaps','scalars'):
    m=re.search(grp+r":\s*\[([^\]]*)\]",dseg)
    if m: covered|=set(x.strip(" '") for x in m.group(1).split(',') if x.strip())
# ACCEPTED: metadata/versioning (harmless last-save-wins) — reviewed 04-Aug
ACCEPTED_META={'clSchemaVer','formDateModified','formRevision','deletedItems','ttChosen'}
# KNOWN GAPS: real per-field state still on last-save-wins. Named follow-up
# S612+: scalar/map arbitration for these. List may SHRINK only.
# S616 — 10 -> 3. Seven closed: npshPsi, npshPsiPld and testType through the
# new `scalars` family; contractorTrades, smCapVis, smState and annDsForce as
# fieldMaps. Every closure is walked by tools/sim/converge.mjs (doors B and
# B2), not merely declared here.
# The three that remain are NOT a spec problem. They record answers by
# CHECKBOX POSITION, so there is nothing stable to pair across devices:
# pairing by position is forbidden doctrine, and a union would make an
# unchecked box impossible to uncheck anywhere. Closing them means giving the
# answers identities at the host — the clState shape — which is a data-shape
# change with a field-verification gate, not a line in this file.
KNOWN_GAPS={'appendixExcluded','equipChecked','equipChecked4b'}
unc=keys-covered-ACCEPTED_META-KNOWN_GAPS
print(f"collectState keys={len(keys)} covered={len(keys&covered)} accepted-meta={len(keys&ACCEPTED_META)} known-gaps={len(keys&KNOWN_GAPS)}")
if unc:
    print("FAIL — NEW UNCOVERED KEYS (add to spec or classify):",sorted(unc)); sys.exit(1)
print("OK — no unclassified keys. Known gaps (shrink-only):",sorted(KNOWN_GAPS&keys))
