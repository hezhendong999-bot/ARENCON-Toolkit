
---

# PART S492 — STATE CORRECTION (SUPERSEDES ALL EARLIER SECTIONS OF THIS FILE)

> **Convention:** a later PART supersedes an earlier one. Where this PART and
> anything above it disagree, **this PART wins.** The "CURRENT OPEN QUEUE
> (S440)" section above is **STALE AND DEAD** — do not work from it.
>
> **Why this PART exists.** Four consecutive sessions re-derived the same state
> from live HEAD, reported it to Mark as a finding, asked Mark the same four
> questions, and then closed without writing any of it down. Mark answered the
> same questions four times. That is a recording failure, not a discovery
> problem. The corrections below are written so that no session ever asks them
> again.

---

## 1. THE SWITCHOVER IS DONE. IT HAPPENED AT S490.

**`frt-next` → live FRT is NOT pending. It is COMPLETE.**

Verified against live HEAD (GitHub Trees/Blobs API, not documentation prose):
`frt/js/viewer/` holds the complete viewer stack. 5 of 7 files are **byte-identical**
to their `frt-next` counterparts (`dimensionTool.js`, `markupEngine.js`,
`markupSelBridge.js`, `tiledPdf.js`, `webglMarkup.js`).

The two that differ — `viewer.js` and `markup.js` — differ because **LIVE IS AHEAD**:

| Fix | In live `frt/` | In `frt-next/` |
|---|---|---|
| Footer ⋯ More relocation | ✅ | ❌ |
| S479e dead-code removal | ✅ | ❌ |
| S491 WebGL teardown fix (tablets silently downgraded to slow rendering after a page switch) | ✅ | ❌ |

**CONSEQUENCE — HARD RULE:** copying `frt-next` over live is a **REGRESSION**.
`frt-next/` is now a **BETA LANE**, not a staging area. It is not "ahead."
Nothing is waiting to be merged from it.

**Do not propose, plan, schedule, or ask about "the switchover." It is finished.**

## 2. THE F1–F10 VIEWER BUG QUEUE IS CLOSED.

All triaged and resolved. F3 (lightbox resize losing zoom) and F10 (menu on a
narrow tablet) were fixed **at root** in S490 — not patched around. No open
viewer bug queue exists.

## 3. LIBRARY MIGRATION — STEP 1 IS COMPLETE (14/14 PAIRS).

**Do not re-plan, re-audit, or re-propose step 1.** It is done.

What step 1 was: `/lib/` and FRT each held the same 16 modules by name, but only
2 were the same file. FRT's copies were consistently newer — every fix since the
original extraction had landed in FRT's private fork while the shared copy went
stale. Now: one implementation each, FRT consuming all of them.

**What it uncovered (the reason it mattered):** Electric was running on ALL of
those weakened copies. Four real data-safety holes were closed as a result,
including a photo-pointer guard whose absence silently reverted a photo-loss
protection on every sync.

**Step 1 ≠ the whole migration.** Still outstanding: Diesel (in progress),
Electric (not started; its photo-architecture port is the top field-safety item),
Electric on header v1 while FRT is on v2, two competing sign-in implementations
to reconcile. Hub was migrated to the shared header and its last 6 native popups
were converted in S492.

## 4. LIVE TRIAD — CORRECTED.

| | Stale value in this file above | **ACTUAL (verified live)** |
|---|---|---|
| FRT build | S440 | **S491j** |
| SW `CACHE_NAME` | v1026 | **v1154** |

(SW has since advanced through v1155–v1158 during S492 Diesel/Electric work.
Always read the live value before bumping — never trust a number in a document.)

## 5. BETA SANDBOX PROJECT UUID — DEFERRED BY MARK. NOT A BLOCKER.

`frt-next`'s allowlist is empty, so the beta lane opens no cloud project.
**Mark deferred this explicitly (S492).** It is not blocking anything and is not
an open question. Do not raise it again unless Mark raises it.

## 6. SEAL REDACTION — DECIDED: **WARN**. NOT OPEN. (Mark, repeatedly.)

**Mark has answered this many times: WARN, not block.** It was recorded as
"open" anyway — including, absurdly, in the first cut of THIS PART, whose entire
purpose is to stop losing Mark's decisions. It is not open. Do not ask again.

**The decision:** the export screen lists any appendix drawing with no redaction
box as a **WARNING**. It does **NOT** hard-block issuance. Many drawings
legitimately carry no seal; a block that fires on those trains inspectors to
click through the gate, which destroys the value of the gate.

`LOCKED_SEAL_REDACTION.md` §8 still reads "OPEN — Mark to confirm" — that line is
**STALE AND WRONG**; this PART supersedes it. Build to WARN.

## 7. PHOTO INPUT — CANON FOR EVERY TOOL, CURRENT AND FUTURE (Mark, S492).

**`lib/ui/photoInput.js` IS the photo input surface for every ARENCON tool.
No tool draws its own photo zone. Ever. Including tools that do not exist yet.**

The standard, three ways in, always:
**Drag & Drop (the zone itself) + 📷 Camera + 📎 Upload + 🖼 Gallery.**
Never a click-only zone. Never a subset.

**THE TEST (mechanical, not a matter of opinion):** grep the tool for photo-button
markup (`pz-camera`, `pz-upload`, `pz-gallery`, `pm-b cam`, `pm-b gal`).
**If the tool draws even one photo button itself, it has NOT adopted the engine —
it is a copy, and it will drift.** A conversion that leaves the host drawing
buttons is fake.

**Storage stays per-tool — deliberately, and this is load-bearing.** The engine
hands back `File` objects and NOTHING else. Each tool routes them into its own
field-proven pipeline (Diesel: `handleFiles` → EXIF date capture → compression →
`ArcPhoto.mint` → R2 own-key upload → IDB). An engine that saved photos for its
hosts would have to know all of them, and the first time one changed, a photo
would vanish untraceably.

**CSS is ported VERBATIM from FRT's live `frt.css`, never re-derived.** A
"matching" copy is how the previous cut drifted (hint 12px vs 11px, gap 5px vs
6px, wrong padding — Mark spotted it instantly). `.obs-drop-btn.is-upload` MUST
be present: it is the one genuinely new rule the engine adds, and its absence in
S478e made Upload white-on-white — an invisible live button on Mark's tablet.

**Status as of S492:** `lib/ui/checklist.js` converted — it draws zero photo
buttons and renders the engine. Diesel + Electric both adopted (Electric's two
flow-test zones converted too). Electric's Gallery is currently rendered-but-
unwired pending its gallery-pick path; **Mark's standing instruction is that
everything renders now** — the wiring follows, the button does not get hidden.

## 8. RULE EARNED THE HARD WAY (S492) — DELETION vs. SHARED HOST CONTRACTS.

**Before deleting ANY function from a tool that consumes `/lib/`, grep EVERY lib
module too.**

A shared engine calls host functions **by name**, from HTML it generates as
strings, in a **different file**. Those call sites are **invisible** to a
single-file reference scan. The S492 dead-code sweep counted references inside
the Diesel file only, declared 22 functions orphaned, and deleted five that were
load-bearing:

| Deleted | Called by | Broke |
|---|---|---|
| `triggerPhoto` | `lib/ui/checklist.js` | click-to-upload |
| `handleDrop` | `lib/ui/checklist.js` | drag-and-drop |
| `_galleryReuseChecklist` | `lib/ui/checklist.js` | Gallery button |
| `removePhoto` | `lib/ui/checklist.js` | thumbnail ✕ |
| `_dslMarkupRevert` | `lib/ui/lightbox.js` | **photo markup revert** |

The checklist photo zone went completely inert in the field. `node --check`
passed the whole time — syntax validity proves nothing about a late-bound global.

## 9. PROCESS RULE — WRITE THE DECISION IN THE SESSION IT IS MADE.

**Deliverable files are updated BEFORE wrapping, as part of finishing the work —
never "on request."** Treating the PK/handoff update as an optional deliverable
is what produced the four-times-repeated question this PART exists to end.

Corollary, already canon and repeatedly violated: **do not trust a handoff
document's own claims.** Verify against live HEAD (Blobs/Trees API) plus a
past-session search before telling Mark something is done, undone, or agreed.

---

## CURRENT OPEN QUEUE (S492 — SUPERSEDES THE S440 QUEUE ABOVE)

**FRT — what is actually left:**

1. **Field-verify S490–S490d** (needs Mark on a device): trade write-back "No"
   path · ⋯ More in the footer · F10 menu on a narrow tablet · F3 lightbox
   resize keeping zoom.
2. That is all. **There is no switchover. There is no F1–F10 queue. Seal
   redaction is DECIDED (warn) and needs building, not deciding.**

**Deferred by Mark (do not re-raise):** beta sandbox project UUID · Hub client
suggestion · AI agents (training + site-review copilot; knowledge-boundary
question unanswered).

**Specced, ready, deliberately deferred until library work settles:** trash mode
(`LOCKED_TRASH_MODE.md`) · seal redaction (`LOCKED_SEAL_REDACTION.md` — **decided:
WARN**; build it, do not re-ask) · HD photo
tiers — **root-cause check owed FIRST:** does export render drawings from full
source or a cached preview bitmap? If the latter, that is the real blur cause and
DPI tuning will appear not to work.

**CRB:** Phase 1 shipped. Phase 2 (Pending/Confirm, issue-gate, round math,
carry-forward) is owned by a DIFFERENT session under the lane rule — this file
does not move it. Phases 3–4 (purge, tombstones, photo cleanup) after.

**Platform / cross-tool (not FRT-blocking):** Diesel SYNC-NEXT field-verify
(tests 1–3 passed S492; test 4 retestable after the restoration fix) · Diesel
onto shared `/lib/` · Electric photo-architecture port (**top field-safety
item**) · Electric Gallery wiring · header v1→v2 drift · two sign-in
implementations · Export Project Docs · Photo Gallery standalone · M365
migration.

**Housekeeping:** **PAT is burned — rotate** (flagged since S336, still open).
