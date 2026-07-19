# LIBRARY AUDIT — S490 (2026-07-18, rev B per Mark: FRT · Diesel · Electric · Hub only, with share verdicts)

**What this is:** a live-HEAD audit (`5bdef941`) of what actually lives in `/lib/`, what each
tool really consumes from it, what is duplicated, and what that means for Mark's goal:
**cut Diesel (~18k lines) and Electric (~8.5k) down hard by sharing everything shareable,
with FRT properly consuming `/lib/` instead of carrying its own copies.**

Everything below was measured from the repo at HEAD — file-by-file blob comparison and
content scans — not from handoff prose or memory.

---

## 1. The four surfaces, at a glance

| Surface | Total lines | of which JS | Loads from `/lib/` | Plain-language state |
|---|---|---|---|---|
| **FRT** | ~54 modules | — | 7 ES imports + 5 markup script tags | Ahead of everyone — but carries private forks of 14 modules that also exist in `/lib/` |
| **Diesel** | 18,115 | 15,134 | 11 modules | Half-converted. Photos/markup/lightbox/camera/checklist/signature shared; entire data layer + small utilities still local |
| **Electric** | 8,492 | 6,894 | 2 (header only — and the OLD v1 engine) | Barely started. Everything else local, including its photo path — the outstanding field-safety port |
| **Hub / Dashboard** | 5,097 | 3,999 | 0 | Uses NOTHING shared. Own toast, 7 native browser popups (a standing violation of the custom-modal rule), 2 embedded logo copies, own R2 calls, own lightbox-ish photo viewing |

(The index portal is 59 lines of redirect — nothing to share; excluded.)

---

## 2. Concern-by-concern: who has it, and SHOULD it be shared?

Verdicts: **SHARE** = one lib implementation, tools import as-is · **SHARE+CONFIG** = one
engine, per-tool personality via a config object (the header-engine pattern) · **KEEP
PER-TOOL** = deliberately not shared · **N/A** = tool doesn't have the concern.

| Concern | FRT | Diesel | Electric | Hub | Verdict | Why, plainly |
|---|---|---|---|---|---|---|
| **Data layer** (sync · merge · R2 · outbox · IDB) | local fork (canonical) | local | local | own R2 calls | **SHARE** — after `/lib/data/` is refreshed FROM FRT | One sync brain for the whole firm. FRT's is the field-proven one; today's lib copy is stale. Biggest single line-count win in Diesel/Electric (~3.5–5k lines each) |
| **Dialogs / confirms / leave dialog** | local (2.5× lib) | local | local | **7 native popups** | **SHARE+CONFIG** — via `dialogEngine.js` (approved S488, unbuilt) | One dialog engine, per-tool icon/accent config. Hub's native popups violate the standing custom-modal rule and go first. Tools configure, never restyle |
| **Toast** | local fork | local | local | local | **SHARE** | Four copies of a 60-line utility. Zero per-tool personality needed |
| **Photo input surface** (drag/upload/camera) | lib ✓ | local | local | N/A | **SHARE** — `photoInput.js`, proven in FRT since S478 | The mandatory 3-way standard should exist exactly once |
| **Camera burst** | stub→lib ✓ | lib ✓ | N/A | N/A | **SHARE** (done where it applies) | Diesel's remaining inline cameras still carry the 12MP crash FRT shed — finish the port |
| **Lightbox** | local (11KB ahead) | lib ✓ | local | own viewer | **SHARE+CONFIG** — after lib copy is refreshed from FRT's | FRT's is newer (S487 fixes). Refresh lib from FRT, then Diesel re-verifies, Electric+Hub adopt. Per-tool config: which action buttons show |
| **Markup engine family** | lib ✓ | lib ✓ | local | N/A | **SHARE** (Electric adopts at photo port) | Already the proven model. Electric gets it when its photo path converts |
| **Header** | lib v2 ✓ | config (re-land owed) | **lib v1 (old)** | none | **SHARE+CONFIG** — v2 everywhere | The engine exists precisely for this. Electric moves v1→v2; Hub gets a config; v1 retires after |
| **Checklist engine** | N/A | lib ✓ | local | N/A | **SHARE** | Electric adopts Diesel's proven module |
| **Signature pad** | N/A | lib ✓ | local | minor | **SHARE** | Same |
| **Logo** | unused lib copy | **4 embedded copies** | embedded | **2 embedded** | **SHARE** — `lib/assets/logo.js` already exists, nobody uses it | Eight embedded base64 blobs firm-wide for one PNG. Pure deletion, zero risk |
| **Auth** | local fork | auth-gate | auth-gate | auth-gate | **SHARE** — reconcile `lib/shared/auth.js` with `shared/auth-gate.js` into one | Two auth implementations is one too many; decide the survivor at re-sync |
| **Scroll lock** | lib-identical ✓ | partial | none | none | **SHARE** | Already identical; finish the rollout |
| **Export Project Docs** | lib ✓ | lib ✓ | pending | pending (whole-project mode) | **SHARE+CONFIG** (already the plan) | Per-tool mode + Hub whole-project mode per the S483 plan |
| **PDF report generation** | own `pdf.js` | own | own | N/A | **KEEP PER-TOOL** (engine parts only shared) | Report LAYOUT is each tool's personality — an FRT deficiency report and a Diesel commissioning report are different documents. Share only neutral machinery (exportPreview, zoomMath, tile rendering); never a common "report writer" |
| **Photo/data SAVE paths** | own | own | own | own | **KEEP PER-TOOL** — locked canon | S393/S481: engines hand back File objects; each host keeps its field-proven save path. Sharing the save path is how a regression reaches every tool at once |
| **Tool data model** (deficiencies vs pump tests vs projects) | own | own | own | own | **KEEP PER-TOOL** | This IS each tool. A pump test is not a pin. Only the storage/sync machinery beneath it is shared |
| **Tool-specific UI** (pin editor, placard scan, test tables, Hub cards) | own | own | own | own | **KEEP PER-TOOL** | Personality, not engine |
| **Boot / mode detection** (`?project=` Hub-mode) | own | own | own | own | **KEEP PER-TOOL** (pattern shared, code small) | ~30 lines each; a shared bootstrapper would couple every tool's startup to one file — highest blast radius for the smallest saving |

**The dividing line, in one sentence:** if two tools would ever want the code to behave
*differently*, it's personality and stays per-tool; if a difference between tools could only
ever be a bug (sync logic, merge rules, a toast, the logo), it's engine and gets shared.

---

## 3. The uncomfortable finding, in plain language

**`/lib/` and FRT have the same 16 modules by name, and only 2 are actually the same file.**
For the other 14, FRT's copy is almost always the bigger, newer one. Which means: when the
data layer was "extracted" to `/lib/`, FRT kept living in its own copies, and every fix since
(including photo-loss protections) landed in FRT's fork while the lib copy quietly went stale.

By the codebase's own rule — *"shared engine" means ONE implementation; if the host still
implements what the engine owns, the conversion is fake* — most of `/lib/data/` and
`/lib/shared/` is currently a **stale fork wearing a shared-module name**. That is the worst
of both worlds: it looks converted in a directory listing, but a fix in one place silently
misses the other, and a future Diesel conversion that imports the lib copy would inherit
**old, unprotected data-path code**.

The two proofs the pattern CAN work are already live: `frt/js/…/cameraBurst.js` is a 581-byte
stub re-exporting the lib engine, and `scrollLock.js`/`uploadQueue.js` are byte-identical.
That's the target shape for everything else.

**A second drift, inside the "shared" layer itself:** three header generations coexist
(`header.js`, `headerEngine.js`, `headerEngine2.js`). FRT runs v2; Electric still imports v1;
two are dead weight. Shared modules can rot too if old generations are never retired.

---

## 4. What this means for the Diesel goal

Diesel is 15,134 lines of JS. Rough shareable share, by concern (estimates from content
scans — treat as sizing, not a quote):

| Concern still local in Diesel | Est. lines | Ready to delegate? |
|---|---|---|
| Cloud sync + merge + R2 + outbox + IDB (the data layer) | ~3,500–5,000 | **Only after `/lib/data/` is refreshed from FRT** — importing today's stale lib copies would be a regression |
| Dialogs + leave dialog + toast | ~300–500 | After Modal Unification Wave 0 ships `dialogEngine.js` (approved S488, not built) |
| Photo input surface | ~200–400 | Yes — `photoInput.js` is live and proven in FRT (S478) |
| 4 embedded logo copies | small in lines, huge in bytes | Yes — `lib/assets/logo.js` exists and nobody uses it |
| Header wiring (Wave 2 re-land) | ~100 | Yes — engine ready, wiring was clobbered |
| Scroll lock (full) | ~50 | Yes — identical module exists |
| **Realistic total reduction** | **~4,000–6,000 lines (25–35%)** | plus every future fix lands once |

**Electric follows Diesel**, as Mark stated — and Electric's photo-architecture port stays the
highest field-safety priority: it currently runs a local, unprotected photo path.

---

## 5. The right order (recommendation)

The order matters more than the speed. Wrong order = converting tools onto stale code.

1. **Re-sync `/lib/` FROM FRT** — for each forked pair, diff, take FRT's (newer) version into
   `/lib/`, preserving anything genuinely lib-only. This is the step everything else waits on.
   FRT's data layer is the canonical one per the standing architecture decision.
2. **Convert FRT to consume `/lib/`** — each `frt/js/` fork becomes a stub or the import flips.
   FRT is the riskiest and best-tested consumer; if the shared copy survives FRT in the field,
   it's safe for everyone. (This is the "FRT→/lib/ import migration LAST" item from S440 —
   "last" meant after extraction, and extraction now means the re-sync above.)
3. **Modal Unification Wave 0** (`lib/ui/dialogEngine.js`, plan approved S488) — it's queued,
   it's a dependency of the Diesel dialog reduction, and it should exist before Diesel converts
   so Diesel converts ONCE.
4. **Diesel conversion** — data layer, dialogs, photoInput, logo, header re-land, scrollLock.
   Field-verify-gated; Mark present for the data-path flip.
5. **Electric** — follows Diesel's proven recipe; photo port first.
6. **Hub** — dialogEngine adoption (kills the 7 native popups), header config, logo module,
   shared lightbox for its photo viewing, toast. Hub is the lowest-risk consumer — no field
   data path of its own beyond R2 reads.
7. **Retire dead generations** — `header.js`, `headerEngine.js` (after Electric moves to v2),
   `photoEngine.js` if truly unused — with Mark's OK, as with all repo cleanup.

**Hard rules carried from canon:** storage stays per-host where the spec says so (S393/S481
photo protections never route through shared code paths that could regress them) · engine
hands back data, host keeps its field-proven save path · one implementation, host deletes its
own copy · verify a surface is LIVE before converting it.

---

## 6. Already-queued items this audit connects to

| Queued item | Status | Where it fits above |
|---|---|---|
| Modal Unification (`dialogEngine.js`) | Design approved S488, Wave 0 not built | Step 3 |
| Diesel header Wave 2 re-land | Owed (clobbered) | Step 4 |
| Photo Input rollout (Gallery page, Diesel, Electric, IST, OBC, DD) | Pending | Steps 4–5 |
| Electric photo-architecture port | Highest field-safety priority | Step 5 (or earlier if field risk demands) |
| scrollLock part C (Electric/IST/OBC/DD) | Pending | Steps 4–5 |
| Diesel inline cameras → `cameraBurst.js` | Pending (12MP crash exposure) | Step 4 |
| Export Project Docs rollout | In progress elsewhere | Independent |

---

*Measured from HEAD `5bdef941`, 2026-07-18. Verify against live HEAD before executing any
step — concurrent writers moved `main` seven times during this session alone.*
