# SPEC — PDF Export Quality & Report Size (FRT)

**Status:** LOCKED — design agreed S461 (2026-07-15), reconfirmed S477 (2026-07-16). **Not built.**
**Owner at build time:** the session holding the `frt/**` code lane. Build lives in `frt/js/export/pdf.js`.
**Written:** S489 (2026-07-18). This file is the reconstruction of a design that was agreed twice and never
written down — which is why it repeatedly resurfaced as "is this done?". Treat this file as the source of
truth, not conversation memory.

---

## ▶ PROMPT OPENER

Building this? Read this file top to bottom first, then verify `pdf.js` at live GitHub HEAD before
proposing anything. Do **not** re-litigate the design below — Mark agreed it twice and re-opening it
wastes a session. If something here genuinely cannot be built as written, say so explicitly and ask;
do not silently substitute a different design.

**Standing command meanings:** "give me handoffs" = handoff doc + PK delta + Style delta (deltas only).
"give me FULL handoffs" = handoff + complete regenerated PK + complete regenerated Style Guide.
"Proceed with handoff XXX" = read that tool's latest handoff plus every delta layered on top, then
report the to-do list. Never means "write a handoff."

---

## 1. Why this exists

Two separate field complaints, one feature:

1. **Reports are too big to email.** Contractors and AHJs receive FRT reports by email. Over ~25 MB the
   message bounces or gets stripped by M365/Outlook. When that happens the recipient compresses it
   themselves with whatever tool they have — and third-party compressors re-encode the embedded JPEGs,
   which destroys quality *and* can break the PDF hyperlinks. **Our job is to ship it emailable so
   nobody downstream ever touches it.**
2. **Appendix drawings are unreadably blurry when zoomed.** On a 24×36" sheet this is a *resolution*
   problem, not a compression problem — the fix is DPI, not quality.

These are different axes and the spec keeps them separate.

---

## 2. Hard guardrails (non-negotiable)

- **Export quality NEVER modifies the stored photo.** All tiering happens at export time against the
  original. The photo record, IDB bytes, and R2 objects are untouched. This is what keeps the feature
  off the photo-loss path — the same discipline as S393/S481.
- **Never silently downgrade.** No automatic tier reduction, ever, for any reason. The inspector is
  told the size and decides.
- **No hard size cap.** Rejected explicitly: forcing 100 photos under 25 MB turns every one to mush.
- **No post-generation "compress this PDF."** Rejected: re-encoding already-encoded JPEGs is quality
  loss squared.

---

## 3. Global photo tier

Three tiers. Default **Balanced**. Numbers below are per-photo and for a ~40-photo report.

| Tier | Setting | ~per photo | ~40 photos | Feel |
|---|---|---|---|---|
| **Balanced** *(default)* | 1400 px · q0.70 | ~320 KB | ~13 MB | clearly better than today; prints fine |
| **High** | 1800 px · q0.78 | ~560 KB | ~22 MB | zoom-in sharp |
| **Original** | no re-encode — photo as captured | 3–6 MB | ~150 MB+ | pristine; only sane for small reports |

Notes:
- A middle "Standard" tier (1600 px · q0.72) was considered and **deliberately dropped** — the gap
  between Balanced and High is small enough that a third choice is one more decision than an inspector
  needs. Do not re-add it.
- **Original** exists for Mark's stated case: a short report of ~5 photos where size is irrelevant and
  everything, drawings included, should stay pristine. The live estimate makes its cost obvious the
  moment anyone selects it on a 40-photo report.

---

## 4. Global drawing DPI

Separate selector, separate axis from photos.

**150 / 200 / 300 — default 200.**

- Drawings are mostly white space and compress cheaply; 5 drawings at 200 DPI ≈ 4 MB.
- 200 is a deliberate raise from the current 150, which is the cause of the reported blur.
- A drawing-dense project can dial down; a detail-critical one can dial up.
- Covered by the same live size estimate.

**Root-cause check required at build time:** verify whether the export renders drawings from the full
source or grabs a small cached preview bitmap. If it is the latter, *that* is the real cause of the
blur and fixing it is nearly free — do this before tuning DPI, or the DPI selector will appear not to
work.

---

## 5. Per-photo override

**Where it lives:** the export modal, not the lightbox and not the photo gallery.

Rationale (this was the key design insight and must not be reversed): **quality is an export decision,
not a photo property.** The same photo may be Balanced in a distribution report and HD in a final
commissioning package. Attaching it to the photo record would freeze a choice that depends on which
report is being produced.

**Entry point:** a button under the tier selector — **"Review photo quality (N photos)."**

**The modal:**
- Grid of every photo in the report as thumbnails.
- Each thumbnail carries a **quality badge** in its corner — a dropdown defaulting to the current
  global tier (all badges read "Bal" when global is Balanced until individually changed).
- Badge options: **Balanced / High / HD / Original.**
  - **HD** = 2200 px · q0.82, ~850 KB. It exists *only* as a per-photo promotion — there is no global
    HD tier. It is the placard/nameplate close-up setting.
- **The badge displays the source photo's actual pixel dimensions.** A photo captured small cannot be
  made sharp — promoting it spends size for nothing, and the badge must make that visible by showing
  it is already at its ceiling.
- **Running total at the top, live:** e.g. *"38 at Balanced, 2 at HD · ≈ 15 MB."*
- **"Preview report" button** in the modal — generates a quick preview so the promoted photos can be
  seen in context before committing to a full export. Demo-first, applied to the inspector's own
  decision.

**Scope of the override: the current export session only. It is NOT persisted onto the photo record.**

Rationale: if it persisted, next month's report on the same project would silently inherit last
month's HD flags and bloat with no visible cause. Export-scoped means every report starts clean at the
global tier and the inspector promotes what matters *for that report*.

> Open item, deliberately not built: if in practice the same photos get promoted every time, that is
> the signal to discuss a persistent per-photo "always HD" flag. Do not build it speculatively.

---

## 6. Live size estimate

- Shown in the export modal **before Generate**, because every photo's dimensions are known up front.
- Recomputes on every change to tier, drawing DPI, per-photo override, or photo count.
- The **real** size is shown after generation.

---

## 7. Soft ceiling — 24 MB

- **Under ~24 MB:** green. Go.
- **Over ~24 MB:** the line turns **amber** — *"≈ 31 MB, larger than most email limits"* — and offers
  options. It **never** downgrades anything on its own.

24 MB is chosen to sit safely under the 25 MB Outlook/M365 limit with headroom for encoding overhead.

**Offered options when amber (in priority order):**
1. **Split by trade** — the primary path. Produces one PDF per trade, each independently emailable, and
   is what a contractor actually wants anyway.
2. **Drop a tier** — presented as a suggestion with the resulting estimate shown.
3. **Send as a link** — R2-hosted, when available.

---

## 8. Settings persistence

Tier and drawing DPI persist **per project**, so a project that has settled on High doesn't reset every
export. Per-photo overrides do **not** persist (§5).

---

## 9. Build order note

This is a self-contained `pdf.js` build. It touches neither CRB nor the viewer, so it is not blocked by
the `frt-next` switchover — but it is `pdf.js` code and therefore subject to the single-code-lane rule.
It must not be built in parallel by a non-code-lane session.

---

## 10. Explicitly rejected

| Idea | Why rejected |
|---|---|
| Hard 25 MB cap | Forces 100 photos into mush; worse than a big file |
| Silent auto-downgrade when over limit | Removes the inspector's control over their own report |
| Post-generation "compress this PDF" | Re-encoding encoded JPEGs = quality loss squared |
| Middle "Standard" tier (1600·q0.72) | Marginal gain; one more decision than needed |
| Per-photo flag stored on the photo record | Stale HD flags silently bloat future reports |
| Quality control in lightbox or photo gallery | Quality is an export decision, not a photo property |
