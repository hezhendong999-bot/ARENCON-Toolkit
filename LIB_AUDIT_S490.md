# LIBRARY AUDIT — S490 (2026-07-18)

**What this is:** a live-HEAD audit (`5bdef941`) of what actually lives in `/lib/`, what each
tool really consumes from it, what is duplicated, and what that means for Mark's goal:
**cut Diesel (~18k lines) and Electric (~8.5k) down hard by sharing everything shareable,
with FRT properly consuming `/lib/` instead of carrying its own copies.**

Everything below was measured from the repo at HEAD — file-by-file blob comparison and
content scans — not from handoff prose or memory.

---

## 1. The tools today, at a glance

| Tool | Total lines | of which JS | Loads from `/lib/` | Plain-language state |
|---|---|---|---|---|
| **FRT** | ~54 modules | — | 7 ES imports + 5 markup script tags | Ahead of everyone — but carries private forks of 14 modules that also exist in `/lib/` |
| **Diesel** | 18,115 | 15,134 | 11 modules | Half-converted. Photos/markup/lightbox/camera/checklist/signature are shared; the entire data layer and small utilities are still local |
| **Electric** | 8,492 | 6,894 | 2 modules (header only — and the OLD v1 engine) | Barely started. Everything except the header is local, including its photo handling — the outstanding field-safety port |
| **IST** | 2,365 | — | 0 | Fully standalone; no cloud, no lib |
| **OBC** | 3,144 | — | 0 | Fully standalone |
| **DD** | 2,212 | — | 0 | Fully standalone; has local photo input + lightbox |

---

## 2. What `/lib/` contains vs who actually uses it

YES = consumes the lib copy · **local** = implements its own · stub = thin re-export of lib (the correct pattern) · – = doesn't have the concern at all

| `/lib/` module | What it does, plainly | FRT | Diesel | Electric | IST | OBC | DD |
|---|---|---|---|---|---|---|---|
| `ui/markupSelection/Tools/Eraser/Text/Polyline` | Drawing-markup family | YES | YES (no Polyline) | local | – | – | – |
| `ui/photoInput.js` | The 3-way photo surface (drag/upload/camera) | YES | local | local | – | – | local |
| `ui/cameraBurst.js` | In-app camera (12MP-crash-safe) | **stub ✓** | YES | – | – | – | – |
| `ui/lightbox.js` | Photo lightbox | **local (11KB bigger)** | YES | local | – | – | local |
| `ui/checklist.js` | Checklist engine | – | YES | local | local | – | local |
| `ui/signaturePad.js` | Signature capture | – | YES | local | local | local | local |
| `ui/headerEngine2.js` + `headerConfigs` | Sealed Shadow-DOM header | YES | config only¹ | **old v1 engine** | – | – | – |
| `export/projectDocs.js` | Export Project Docs ZIP | YES | YES | – | – | – | – |
| `export/exportPreview.js` | Export preview | YES | – | – | – | – | – |
| `data/photoMint.js` | Photo record minting | – | YES | – | – | – | – |
| `data/sync.js` | Cloud sync engine | **local fork** | local | local | – | – | – |
| `data/merge.js` | 3-way merge | **local fork** | local | local | – | – | – |
| `data/r2.js` | R2 photo client | **local fork** | local | local | – | – | – |
| `data/photoOutbox.js` | Durable upload outbox | **local fork** | local | local | – | – | – |
| `data/idb.js` | IndexedDB layer | **local fork** | local | local | – | – | local |
| `data/uploadQueue.js` | Upload queue | **identical ✓** | – | – | – | – | – |
| `shared/dialogs.js` | Confirm/prompt dialogs | **local fork (2.5×)** | local | local | native | native | native |
| `shared/toast.js` | Toasts | **local fork** | local | local | local | local | local |
| `shared/auth.js` | Auth | **local fork** | (auth-gate) | (auth-gate) | (auth-gate) | (auth-gate) | (auth-gate) |
| `shared/scrollLock.js` | Scroll lock | **identical ✓** | partial | – | – | – | – |
| `assets/logo.js` | The ARENCON logo, once | unused | **4 embedded base64 copies** | embedded | embedded | embedded | embedded |
| `workers/imageWorker(+Host)` | Image resize worker | **local fork** | – | – | – | – | – |
| `ui/photoEngine.js` | Photo engine | unused by anyone | | | | | |
| `ui/header.js` / `ui/headerEngine.js` | Header generations 1 & 2 | unused / unused | – | v1 | – | – | – |

¹ Diesel's header wiring was clobbered by a concurrent session — the Wave 2 re-land is still owed.

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
6. **Retire dead generations** — `header.js`, `headerEngine.js` (after Electric moves to v2),
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
