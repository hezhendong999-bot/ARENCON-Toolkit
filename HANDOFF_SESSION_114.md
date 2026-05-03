# Session 113 Handoff — Markup engine + v2 polish + chrome consistency

**Read this first. Then read the project knowledge file. Then state your plan and wait for Mark's approval.**

**Date:** 2026-05-02 (end of S113)
**Final commit:** `0728c62c`
**SW cache:** `arencon-frt-v266`
**CSS cache:** `?v=227`
**Number of pushes this session:** 24
**Rollback target if anything regresses on first refresh:** `f297e957` (Push 22 — the Azure restore)

---

## What S113 actually was

This session started as iOS removal + Android production grade (Pushes 1-3) and grew into the most extensive single-session FRT v2 polish to date. 24 pushes across:

- iOS code removal (Pushes 1-2)
- Documentation merge (Push 3)
- Markup engine bug-fix sprint (Pushes 4-5): rotation pivot, eraser hit-tests, segment-vs-bbox, IAR stack
- Chrome consistency (Pushes 6-12): cloud dot glow, bottombar layout, debug toggle, board view, muted button family, drawing pill dark mode, contractor color palette, kanban photo thumbs
- Pen-blur architectural fix (Pushes 13-14): viewer-zoom-aware markup canvas resolution
- PDF export polish (Pushes 12, 15, 23): teardrop pin matching viewer, font sizes, IAR alignment in appendix
- Modal styling consistency (Pushes 17, 20, 24): Cancel-on-right, muted Yes/Cancel, Report Status redesign with .btn-muted-warn / .btn-muted-neutral, status/priority chip borders, view-pill redesign
- Hub infrastructure (Push 16): Board view in Summary tab — full kanban with drag-drop ported from v1
- IAR auto-priority promote (Push 20)
- Selection box L4 click-target enlargement (Push 24)
- Thumbnail crispness (Push 24)
- Fly.io / mupdf removal (Pushes 21-22 — Fly.io fully gone, Azure mupdf preserved)

---

## State at start of next session

### Live commits

```
0728c62c  Push 24: selection handles + thumb crispness + IAR stack + status borders + view-pill
c315d280  Push 23: PDF appendix IAR badge alignment
f297e957  Push 22: restore Azure container source
0728c62c is HEAD on main.
```

### What's working (verified by Mark this session)

- iOS code fully removed; toolkit supports desktop + Android only
- Markup canvas resolution adapts to viewer zoom; pen strokes crisp at fit-zoom; broken-line artifacts gone
- Selection box (corners + rotation) and Jump button readable + clickable at L4
- Eraser works on highlighter, pen, and shapes (including rotated shapes — Bug B from S112 fixed)
- Text rotation pivot + selection box + data persistence all correct
- IAR auto-promotes to high priority (matches v1 behavior); IAR shows below Outstanding in table; pink fill on activated IAR badge in deficiency cards
- Reports menu opens Issue/Revise/Revert flow; revisions update filename and DRAFT/ISSUED badge
- Board view (kanban) working with drag-drop priority changes and photo thumbnails on cards
- Cancel button is on the right side in every modal
- Yes/OK/Apply/Generate buttons all use `.btn-muted-ok` (muted green); Cancel uses `.btn-muted-cancel` (muted red)
- Contractor color palette (8-slot deterministic hash) applied to chips, group headers, kanban cards, table cells
- Drawing thumbnails crisp at 400 px / 0.85 quality

### What's confirmed deferred

- **Cloud sync work** — Mark wants this in a dedicated session
- **Phase A: v2 launcher in Project Hub + side-by-side capability with v1** — confirmed for next session
- **PDF column alignment question** — open multi-choice question, Mark hasn't answered yet
- **Hub → v2 migration of existing v1 project data** — Phase B (after Phase A)

### What's deferred (no urgency)

- Markup eraser hit-test miss on text/shapes was finally fixed in S113 — verify on first opportunity
- Selection box doesn't follow rotated objects — fixed in S113 (Push 4-5)
- Hub→FRT v2 link wiring — Phase A scope
- Edge-tile 404s at L3 on `dwg_1776631552442_pg2_yy4m` — pre-S99 finding, R2 vs Worker path translation issue. Stale.
- L2 tile grid bug from S99 — likely already gone with canvas-mode default; verify casually.

---

## Hard rules (carry forward)

- **Never replace `.main-wrap` innerHTML with a loading spinner**
- **Never convert drawing/photo blobs at `loadFullProject()` time** — always lazy
- **Never use `quadraticCurveTo` in pen/highlight strokes** — `lineTo` only
- **Never use `OffscreenCanvas`** — no Safari/iOS support (irrelevant now since iOS gone, but keep the rule for future)
- **Never stack highlighter opacity** — offscreen composite pattern only
- **Never auto-select a shape after drawing it** — tool stays active
- **PDF upload handlers (recursive `go(pg)`)** — NEVER rewrite
- **Escape in drawing viewer** — cancels tool/copy mode ONLY, never closes viewer
- **`beforeunload` in Hub mode** — suppress via URL param check, not `_csHubMode` flag
- **One `ask_user_input` widget per turn, max 1 question** — no exceptions
- **Hover-reveal buttons** must include `@media(pointer:coarse)` for touch devices
- **Cancel button always on the right** in Yes/Cancel pairs
- **Use `.btn-muted-ok` / `.btn-muted-cancel` / `.btn-muted-warn` / `.btn-muted-neutral` classes** for all modal action buttons. No more inline button styling.

---

## Architecture notes added in S113

### Markup canvas viewer-zoom-aware (Push 13-14)

`Markup.setRenderScale(s)` (markup.js) is called from `viewer.js _applyTransform` on every zoom change. Resizes canvas internal pixels to displayed pixels, capped at memory budget (Android phone 10 Mpx, everything else 25 Mpx). Critical: `mc.style.width` and `mc._logicalW` stay at drawing dimensions so coordinate translation, pin positions, eraser hit-tests are unaffected. WebGL renderer (`webglMarkup.js`) `resize(w, h, dpr)` accepts new dpr explicitly to preserve drawing-coord space across resizes.

### Contractor color palette (Push 19)

`ctrColorClass(name)` exported from `deficiencies.js`. 8-slot deterministic hash (`ctr-c0`..`ctr-c7`). "Site General" pinned to `ctr-c3` (green). Used in: contractor chips, group headers (left-border accent + tinted name), All-Deficiencies table cells, kanban cards.

### Muted button family

CSS classes in `frt.css`:
- `.btn-muted-ok` (green) — Yes / OK / Apply / Generate / Save / Add / primary affirmative
- `.btn-muted-cancel` (red) — Cancel / No / Dismiss / Close / Back
- `.btn-muted-warn` (orange) — Revise (alternative warn-tone action)
- `.btn-muted-neutral` (slate) — Revert / Leave-without-saving / benign-tertiary action

All 4 have light + dark mode variants matching the `.defic-act-btn` family.

### Diagnostic panels gated behind `?dbg=1`

`#dbg-overlay` (LIFE buffer green panel), `#s97-recorder-panel`, `#arencon-frt-progress`, `#arencon-frt-anomaly` are all hidden by default. Surfaced via the floating 🔍 button (`#diag-toggle`) at top-right which toggles `body.diag-show`. The toggle button itself only renders when `?dbg=1` URL param OR `localStorage._frtDbg='1'`. To remove panels entirely from your view: `_frtDbgOff()` in console.

S97 DIAG burgundy banner deleted permanently in Push 9. Won't reappear.

### Tile renderer

**Single source: Azure Container App `arencon-pdf-render-v3`** running mupdf via mutool draw (post-S107). Source in `container-render/`. Build pipeline `.github/workflows/build-container.yml` deploys on push to `container-render/**`.

**Fly.io fully removed** (Push 21-22). The orphan deployment `arencon-render-staging.fly.dev` exists in Mark's Fly.io account but has no GitHub connection. Mark to delete via Fly dashboard.

CORS on Azure must be manually re-added after every deploy (`https://hezhendong999-bot.github.io`).

---

## Open question for Mark — needs answer at session start

**PDF report "second page is centered" — which one matches what he saw?**

1. The whole content block on later pages is centered horizontally (margins look bigger)
2. The Description column in the appendix tables is too narrow — short text looks centered because the cell is wide
3. The header / page chrome on later pages looks centered vs left-aligned on page 1
4. Skip — it's not actually a problem, he was confused

Re-asked at end of S113. Mark hasn't responded yet. Re-ask at start of next session.

---

## Phase A — v2 launcher in Hub (next session)

Mark confirmed at end of S113: "Yes proceed with phase A next session."

### Goal

Add side-by-side capability so Mark can launch any project in v1 (current default) OR v2 (frt/) without committing to v2 globally. Hub gets a "Launch in v2 (beta)" button next to the existing Launch button.

### Concrete deliverables

1. **Hub-side: dual launcher**
   - In `ARENCON_Project_Hub.html`, find the project tile launch button
   - Add adjacent "Launch in v2 (beta)" button
   - v1 button: existing URL pattern (no change)
   - v2 button: `frt/index.html?project=<uuid>&pn=...&pname=...&client=...&addr=...&sfn=...#proj_<id>`

2. **v2-side: query-param handler**
   - `frt/index.html` already accepts `?project=<uuid>` — verify it pulls from Supabase `tool_data` correctly
   - Test the auth handoff (Hub session → v2 session via shared Supabase auth)
   - Verify `_hubMode` flag activates correctly (already wired in `app.js`)

3. **CloudSync schema verification**
   - Load a real v1 project in v2; confirm `Model.setProject()` accepts the schema
   - Document any field mismatches (likely few — v2 was designed compatible)
   - Defer migration (Phase B) until verified

4. **Verification stop**
   - Mark loads a real v1 project in v2 alongside v1 in another browser tab
   - Confirms parity on display, no data loss on save
   - Reports any issues; fix before considering Phase A complete

### Time estimate

30-60 minutes focused. Single push if no surprises; can split if CloudSync schema needs migration code.

### Risks

- v2's Supabase auth flow may differ from v1's — auth handoff might need a session-bridge
- v1's `_csCloudSyncPull` may stamp drawings differently than v2's `SyncEngine.pull` expects
- The `tile_status` / `tileManifestUrl` field handling in v2 needs to match what v1 wrote

---

## Recommended push order for next session

1. **Push A1** — Hub dual launcher button (HTML + click handler). Simple deliverable, immediate visible result.
2. **Verification stop** — Mark clicks v2 button, sees v2 load with project data.
3. **Push A2** — fix any discovered schema/auth issues (probably zero, possibly small).
4. **Push A3** (only if needed) — CloudSync compatibility shim if Mark reports any data loss.
5. **Final** — Update `ARENCON_Project_Knowledge.md` with Phase A completion + scope of Phase B.
6. Write session 114 handoff.

---

## Files to upload to next session

When Mark starts S114, he uploads:
- `HANDOFF_SESSION_114.md` (this file — once committed, can be pulled fresh from GitHub)
- `ARENCON_Project_Knowledge.md`
- `ARENCON_Style_Guide_v120.css` (or current style guide version)
- `ARENCON_Project_Hub.html` (Phase A primary target)
- `frt/index.html` if needed (mostly read-only)

Claude can pull current versions from GitHub at HEAD if any are missing.

---

## Tone & workflow reminders for next session

- **Read this whole document AND the project knowledge file before any code work**
- **State a plan and wait for Mark's approval before pushing**
- Direct, concise responses. No filler. Mark wants efficiency.
- One `ask_user_input` widget per turn, MAXIMUM 1 question.
- Surgical `str_replace` edits only — never full-file rewrites mid-session.
- After every JS change: extract scripts → `node --check` → exit 0 required.
- After every CSS change: count `{` vs `}` — must balance.
- Push to GitHub via API at end of session.

---

## What success looks like at end of S114

- Mark can click "Launch in v2 (beta)" on any project in the Hub
- v2 loads with the project's drawings, deficiencies, photos
- Mark works in v2 for a real session; CloudSync persists changes
- v1 still launches normally (default button)
- Mark has confidence to migrate full-time when ready
- Phase B (data migration audit + execution) scoped clearly in S115 handoff

---

## End of S113 handoff

Read this. Read the Project Knowledge. State your plan. Wait for approval. Then push.
