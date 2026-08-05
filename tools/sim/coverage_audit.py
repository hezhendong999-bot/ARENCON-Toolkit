#!/usr/bin/env python3
"""S611 — coverage audit: every collectState key must be in the merge spec or
on the ACCEPTED list below. New uncovered keys FAIL the build (exit 1)."""
import re, sys, os
R=os.path.dirname(__file__)+'/../..'
src=open(R+'/diesel-app/js/part06c.js').read()
# S616c — the window used to be a flat src[i:][:9000]. collectState's return
# block had already grown past that, so the audit was reading PART of the
# report and reporting full coverage on the rest — the same fault as a test
# that passes because it never reaches the code it claims to check. It is now
# bounded by matching the return block's own braces, and it FAILS LOUDLY if it
# cannot find the end rather than quietly auditing a fragment.
_i=src.find('function collectState()')
_j=src.find('return {', _i)
if _i<0 or _j<0: sys.exit('coverage_audit: collectState return block not found')
_d=0; _k=_j+len('return ')
while _k<len(src):
    if src[_k]=='{': _d+=1
    elif src[_k]=='}':
        _d-=1
        if _d==0: break
    _k+=1
else: sys.exit('coverage_audit: unbalanced braces in collectState return block')
ret=src[_j:_k+1]
keys=set(re.findall(r'^\s{4}(\w+)[,:]', ret, re.M))
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
