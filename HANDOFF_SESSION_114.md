# Session 114 Handoff — Phase A: Hub dual launcher + new UX rules

**Read this entire document AND the project knowledge file before any code work.** Then state your plan and wait for Mark's approval before pushing.

**Date written:** 2026-05-02 (end of S113)
**Last commit:** `12b350bd` (S113 closeout — docs)
**SW cache:** `arencon-frt-v266`
**CSS cache:** `?v=227`
**Number of pushes in S113:** 24 + 2 docs
**Rollback target if anything regresses on first refresh:** `f297e957` (Push 22 — Azure restore)

---

## Status at start of S114

S113 closed clean. 24 production pushes covering iOS removal, markup engine fixes, modal styling, contractor color palette, board view, viewer-zoom-aware markup canvas, Fly.io removal. Plus comprehensive end-of-session strategic conversation that produced clear decisions on every open feature gap.

**Project Knowledge updated** in `12b350bd` with full S112+S113 section + S113 closeout addendum (lines 2010-2217). Read that for context on every decision I reference here.

---

## S114 primary scope — Phase A: Hub dual launcher

Approved at end of S113: "Yes proceed with phase A next session."

### Goal

Side-by-side capability so Mark can launch any project in v1 (current default) OR v2 (frt/) without committing to v2 globally. Hub gets a "Launch in v2 (beta)" button next to existing Launch button on each project tile.

### Concrete deliverables

**1. Hub-side dual launcher**
- Find the project tile launch button in `ARENCON_Project_Hub.html`
- Add adjacent "Launch in v2 (beta)" button (probably with a beta badge)
- v1 button: existing URL pattern (no change)
- v2 button: `frt/index.html?project=<uuid>&pn=<projectNumber>&pname=<projectName>&client=<client>&addr=<address>&sfn=<smartFilename>#proj_<id>`

**2. v2-side query-param handler**
- `frt/index.html` already accepts `?project=<uuid>` — verify it pulls from Supabase `tool_data` correctly
- Test the auth handoff (Hub session → v2 session via shared Supabase auth)
- Verify `_hubMode` flag activates correctly (already wired in `app.js`)

**3. CloudSync schema verification**
- Load a real v1 project in v2; confirm `Model.setProject()` accepts the schema
- Document any field mismatches (likely few — v2 was designed compatible)
- Defer migration (Phase B) until verified

**4. "Last cloud sync: X ago" indicator** (replaces v1's `_checkBackupReminder`)
- Small text near the cloud dot
- Color-coded freshness: green <1min, amber 1-5min, red >5min
- Updates every 30s
- Replaces the anachronistic 30-day backup banner from v1

**5. Verification stop**
- Mark loads a real v1 project in v2 alongside v1 in another browser tab
- Confirms parity on display, no data loss on save
- Reports any issues; fix before considering Phase A complete

### Time estimate

30-60 minutes focused. Single push if no surprises; can split if CloudSync schema needs migration code.

### Risks

- v2's Supabase auth flow may differ from v1's — auth handoff might need a session-bridge
- v1's `_csCloudSyncPull` may stamp drawings differently than v2's `SyncEngine.pull` expects
- The `tile_status` / `tileManifestUrl` field handling in v2 needs to match what v1 wrote
- v2 may not handle v1's `_localModifiedAt` / `_cloudSyncedAt` fields correctly

---

## S114 light additions (if Phase A finishes early, otherwise S115 batch)

Three small UX rules from Mark's S113-end conversation. ~100 lines combined. If Phase A goes smoothly with time to spare, fold these into S114. Otherwise punt to S115.

### A. Escape key behavior

**Implement throughout v2.** Three rules:

1. **Escape closes popup modals.** Pin editor (when ported in S115), Issue/Revise/Revert modal, AI Review modal, Add Activity modal, Reassign modals, Inspector picker, etc. Each modal needs a `keydown` listener that fires close() on Escape.
2. **Escape NEVER closes the drawing viewer.** The drawing viewer is treated as a navigation tab, not a popup. Only the back button closes it. There may be existing code attempting to close it on Escape — REMOVE that.
3. **Escape in drawing viewer cancels active markup state:**
   - Clears the active markup tool (returns to pan/select mode — `_setActiveTool(null)`)
   - Deselects any selected markup objects (`_selectedIds = []`)
   - **Does NOT delete the selected markups** — only deselects
   - Existing rule preserved: Escape cancels copy mode if active

Check `viewer.js` and `markup.js` for existing keydown handlers — augment, don't break.

### B. Text markup workflow fix

Current bug: clicking once to drop text, typing, then clicking elsewhere both confirms the text AND immediately starts a new text box. Should be a two-step flow:

- Click → place caret, enter text-input mode
- Type → text appears
- Click elsewhere → **confirms text only**, returns to text-tool-active-but-no-active-input state
- Click again (fresh click) → start a new text box

Find the text-tool click handler in `markup.js`. Currently it's likely doing `commitText() → newTextBox()` in one event. Split it: clicking outside the active text input should commit only. The next click is what creates a new text box.

### C. "Last cloud sync: X ago" indicator

Already covered in primary scope (item 4 above).

---

## Phase A ordering recommendation

1. **Verification first** — load a real project, see what breaks. ~10 minutes.
2. **Hub button add** — small HTML/JS change. ~10 minutes.
3. **Fix any schema gaps** — depends on what verification finds. 0-30 minutes.
4. **Last-sync indicator** — clean ~30-line addition. 15 minutes.
5. **Verification stop** — Mark tests side-by-side. Report.
6. **If time remains:** fold in escape key + text markup fixes.

---

## Critical context — recent strategic decisions

The S113-end conversation produced clear directions on every open feature. The Project Knowledge file (lines 2010-2217) captures all of them. Highlights:

### v1 features being ported

| Feature | Session | Reason |
|---|---|---|
| Pin editor modal (open on top of drawing) | S115 | Mark explicitly prefers in-context modal vs jump-to-tab |
| `_autoDedup` | S115 | Migration safety from v1→v2 |
| `openProjectQuickEdit` | S115 | Right-click rename — saves clicks |
| `_buildDeficDescSuggestions` | S116 | Autocomplete past descriptions |
| ZIP bulk photo download | S116 | Photo gallery export — JSZip lazy-load |
| Voice-to-text (browser native) | S116 | 🎤 button on description fields |
| Voice + AI Quick Fix cleanup | S117 | Side-by-side raw/cleaned UI |

### v1 features being REPLACED (not ported)

| v1 feature | v2 replacement | Why |
|---|---|---|
| `softLock` 20-min lockout overlay | Presence heartbeat indicator (S115) | Modern collab pattern; no lockouts |
| `_checkBackupReminder` 30-day banner | "Last sync: X ago" indicator (S114) | Cloud is the backup; no need for separate banner |

### v1 features being SKIPPED permanently

- `showDeficTemplates` (NFPA library) — descSuggestions + AI Quick Fix cover the workflow
- `showWipeConfirmation` type-to-confirm — standard confirm is fine; cloud is backup
- v2's "click pin → jump to deficiency tab" UX — Mark explicitly prefers in-context modal

### Future major features (sessions S118+)

| Feature | Session | Notes |
|---|---|---|
| Drawing revision tracking | S118-S119 | Replace drawing → auto-migrate pins → diff view |
| AI chatbot in Hub | S120-S122 | Cross-project search, summary reports + charts (Chart.js), voice input integrated |
| Symbol stamps in markup | S123+ | Standard fire protection symbols |
| Offline-first UX clarity polish | S123+ | Banner indicators, sync queue display |

### Backlog (not scheduled — explicitly nice-to-have)

- Contractor portal (separate Hub view for contractors to mark addressed + upload evidence) — Phase 5+
- Photo tags ("before/after/evidence" labels) — defer until multi-visit commissioning becomes a pain point
- NFPA Link integration — only if NFPA Link exposes a public URL pattern; otherwise dropped

### Decided against — never build

- Sub-deficiencies / parent-child structure (observations cover this)
- AHJ / OBC / NFPA code text database (NFPA Link is canonical paid resource)

---

## Phase 2 (separate from Phase A)

Phase 2 of the Strategic Roadmap covers **Supabase schema work** that's independent from Phase A:

- `user_profiles` table + role enum (`admin`, `interim_admin`, `staff`, `read_only`)
- Soft-delete columns on `projects`, `drawings`, `deficiencies`, `photos`, `tool_data`
- Daily R2 backup Worker (cron-triggered)
- `deletion_log` audit trail
- 90-day auto-purge of soft-deleted rows

This is the foundation for the deletion + restore model Mark approved (admin-only restore, vindictive-deletion protection via 3 layers: 90-day Trash + audit log + daily R2 backup).

**Phase 2 is its own track.** Don't conflate with Phase A. See `ARENCON_Strategic_Roadmap.md` for the full plan. Likely S116-S118 timeline depending on Phase A complexity.

---

## Hard rules (carry forward + S113 additions)

### CSS / UI patterns

- **Use `.btn-muted-ok` / `-cancel` / `-warn` / `-neutral`** for all modal action buttons. NO inline button styling in modals.
- **Cancel button always on the right** in flex pairs. Audit all new modals.
- **Every new style needs a dark mode variant.** Match the `.defic-act-btn` family palette.
- **Use `ctrColorClass(name)` from `deficiencies.js`** for contractor color hatches. "Site General" pinned to `.ctr-c3`.
- **IAR cannot coexist with low/general priority** — `Model.toggleIAR` enforces this.
- **Drawing viewer = navigation tab, not popup.** No Escape-to-close. No close-on-outside-click.

### Markup engine

- Never use `quadraticCurveTo` in pen/highlight strokes — `lineTo` only
- Never use `OffscreenCanvas` (no Safari/iOS support — kept for future-proofing)
- Never stack highlighter opacity — offscreen composite pattern only
- Never auto-select a shape after drawing it — tool stays active
- Selection handles must match hit-test radii

### Architecture

- `Markup.setRenderScale(s)` must be called from `viewer.js _applyTransform` on every zoom change
- `WebGLMarkupRenderer.resize(w, h, dpr)` requires `dpr` param to preserve drawing-coord space
- PDF upload handlers (recursive `go(pg)` pattern) — NEVER rewrite

### Workflow

- One `ask_user_input` widget per turn, max 1 question — NO EXCEPTIONS
- Surgical `str_replace` edits only — never full-file rewrites mid-session
- After every JS change: extract scripts → `node --check` → exit 0 required
- After every CSS change: count `{` vs `}` — must balance
- Push to GitHub via API (multi-file blob+tree+commit) at end of session
- Hover-reveal buttons must include `@media(pointer:coarse)`

### iOS

- iOS is not supported. Don't add iOS branches. iOS code permanently removed.

---

## Files to upload at S114 start

When Mark starts S114, he uploads:
- `HANDOFF_SESSION_114.md` (this file)
- `ARENCON_Project_Knowledge.md` (current master with S113 closeout)
- `ARENCON_Style_Guide_v120.css` (current master with S113 additions)
- `ARENCON_Project_Hub.html` (Phase A primary target)
- `frt/index.html` (read-only — for verification)

Claude can pull current versions from GitHub at HEAD if any are missing.

---

## What success looks like at end of S114

- Mark can click "Launch in v2 (beta)" on any project tile in the Hub
- v2 loads with the project's drawings, deficiencies, photos, contractors intact
- Cloud sync round-trips work end-to-end (push from v2 → see in v1 / vice versa)
- v1 still launches normally (default button)
- "Last sync: X ago" indicator shows freshness near the cloud dot
- Mark works in v2 for a real session and reports comfort/discomfort
- Phase B (data migration audit + execution) scoped clearly in S115 handoff

If escape key + text markup fixes also got in: bonus.

---

## Recommended push order for S114

1. **Push 1** — Hub dual launcher button. Single HTML/JS change. Verify Mark sees the button.
2. **Verification stop** — Mark clicks v2 button. Sees v2 load with project data. Reports any issues.
3. **Push 2** — Fix any discovered schema/auth issues (probably zero, possibly small).
4. **Push 3** — "Last sync: X ago" indicator. Small clean addition.
5. **Verification stop** — Mark observes the freshness indicator update through normal use.
6. **Push 4 (optional)** — Escape key behavior + text markup workflow fix. Only if Phase A is solid.
7. **Final** — Update `ARENCON_Project_Knowledge.md` with Phase A completion notes. Write S115 handoff.

---

## Tone & workflow reminders

- Read this whole document AND the project knowledge file (especially lines 2010-2217 — S113 closeout) before any code work
- State a plan and wait for Mark's approval before pushing
- Direct, concise responses. No filler.
- Mark wants efficiency. 24 pushes in S113 is the cadence model.
- Surgical edits, validate before push, multi-file commit pattern
- Test before claiming done
- Don't be afraid to delete dead code permanently — version control is the just-in-case
- When user says "match v1", read v1 source first; don't assume parity

---

## End of S114 handoff

Read this. Read the Project Knowledge (especially the S113 closeout addendum). State your plan. Wait for approval. Then push.
