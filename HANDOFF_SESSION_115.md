# Session 115 Handoff — Light-mode polish + multi-user safety + v1 port-overs

**Read this entire document AND the Project Knowledge S114 closeout section before any code work.** Then state your plan and wait for Mark's approval before pushing.

**Date written:** 2026-05-03 (end of S114)
**Last commit:** Push 5 docs (this commit)
**Phase A status:** Complete. v2 is the default for FRT; v1 archived to `legacy/`.
**Rollback target if S115 breaks v2 boot:** `f62a7fe6` (Push 4 — last green Phase-A commit)

---

## Status at start of S115

S114 shipped 14 commits across Phase A + 10 incremental UI/UX/AI pushes. v1 is retired. v2 handles real projects (Sprucewood, Sun Pharma, Caplink verified). Schema migration is provably lossless against real data. Pin editor displays photos correctly. AI scratchpad with multi-photo accumulation works. `+ Gallery` picker attaches site photos to pins. Hub flips to v2 by default.

Project Knowledge updated with full S114 section (lines 2218-end). Read those before touching any v2 code.

---

## S115 primary scope

### A. Light-mode color overhaul (FIRST — blocks other work that touches CSS)

Mark flagged in P1.9: *"I think you should redesign the colour style overall in day mode, as they look really odd."*

Not addressed in S114. The deficiency-tab buttons + 3-column layout are now muted-correct. The rest of the page in light mode is inconsistent — page header bar, modal action buttons, status badges, dialogs, project info chips, the Photos tab toolbar, drawings tab, contractors-on-site row.

**Approach:** systematic pass through `frt.css` plus the page-shell HTML inline styles. Identify any remaining bright-saturated colors (`#1A7A4A`, `#3F6E9C`, `#C0392B`, `#2196F3`, `#E67E22`, etc.) and replace with muted equivalents. Audit modal action buttons — the `btn-muted-ok` / `btn-muted-cancel` / `btn-muted-warn` / `btn-muted-neutral` family should be the standard; replace inline button styling with these classes.

The muted palette baseline (per Memory rule #30):
- Green: `#5C7A65` / `#5F8068`
- Slate-blue: `#5A6E80`
- Burgundy: `#7D3F4F`  (brand `#9C2742` for primary CTAs only)
- Amber: `#B07F5A`
- Red: `#A85959`
- Purple: `#7B2D8E`
- Dark blue: `#2C4770`

**Stop after this push.** Mark walks through every tab in light mode and reports anything still odd. Don't combine with other items.

### B. Presence heartbeat (replaces v1 softLock)

Per S113 closeout — kept in v2 but not yet built:
- Every 30s send a "user X active on project Y" ping to a new `project_presence` Supabase table
- Header shows `👤 Mark · 👤 Leslie editing now` when more than one user has heartbeated in the last 60s
- No lockout. No overlay. Modern collab pattern.

Schema for `project_presence`:
```sql
CREATE TABLE project_presence (
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);
```

Worker reads + writes via Supabase REST. UI element near the cloud dot.

### C. `_autoDedup` port

Content-hash-based dedup of drawings on import. v1 has it. v2 doesn't. Critical for v1→v2 migration safety when projects with duplicate uploads get re-loaded. Hash by drawing file content (or PDF page content) — if a hash exists, point new entry at existing rather than re-upload.

### D. `openProjectQuickEdit` port

Right-click (or long-press) project tile in Hub → small popup to edit name/number/client/address inline. ~80 lines. Saves a click trip through "Edit Project" modal for trivial typo fixes.

### E. Port v1 pin editor modal additions

S114 fixed v2's pin editor to render photos (P1.1). But v1 has more in its pin editor that v2 still doesn't:
- Activity log inline below observations
- Linked-finding cross-references
- Better photo carousel inside the modal (not just a thumbnail strip)

Diff v1's `openPinEditor` against v2's `_openPinEditor` and port the gaps.

---

## S115 secondary / opportunistic scope

### Site photo markup original-preservation flow

**Recorded in S114 P1.10.** Mark explicitly asked to defer but wants it back. When site photo gets marked up: keep original untouched as backup, save markup as separate marked-up photo. When user reverts (clears all markups), the duplicated marked-up photo gets auto-deleted, leaving only the original. Reference v1's `_origBackupId` field on photo records and the revert flow. Copy v1 logic exactly.

This belongs in S116 ideally (alongside other photo-pipeline work) but if there's time in S115 after the overhaul, fold it in.

### Worker-side `mode='shorten'`

P1.6 added a Shorten button inside the AI scratchpad. The client sends `mode='shorten'` to the Worker. **If the Worker doesn't recognize this mode yet, Shorten will return a 400.** Patch needed:

```js
// In the Worker request handler, alongside existing 'rewrite' / 'quickfix' modes:
if (mode === 'shorten') {
  systemPrompt = "You are an editor. Shorten the user's text by 30-50% while preserving every fact, measurement, code reference, and meaning. Do not add commentary. Return only the shortened text.";
  model = "claude-haiku-4-5-20251001"; // cheaper, fast
}
```

Mark deploys this manually via Cloudflare Dashboard. Verify Shorten works after deployment.

---

## Deferred / S116+ (don't touch in S115 unless time allows)

| Feature | Session | Notes |
|---|---|---|
| `_buildDeficDescSuggestions` | S116 | Autocomplete past descriptions on textarea focus |
| ZIP bulk photo download | S116 | JSZip lazy-load, photo gallery "Export selected" |
| Voice-to-text (browser native) | S116 | 🎤 button on description fields |
| Voice + AI Quick Fix cleanup | S117 | Side-by-side raw/cleaned UI |
| Drawing revision tracking | S118-S119 | Replace drawing → auto-migrate pins → diff view |
| AI chatbot in Hub | S120-S122 | Cross-project search, charts, voice-input |
| Symbol stamps | S123+ | Standard fire-protection symbols |

---

## Recommended push order for S115

1. **Push 1** — Light-mode color overhaul (audit + replace bright saturated colors with muted equivalents). One large CSS-focused commit.
2. **Verification stop** — Mark walks every tab in light mode + dark mode. Reports anything still odd.
3. **Push 2** — Presence heartbeat (Supabase table + Worker integration + UI indicator).
4. **Push 3** — `_autoDedup` port from v1.
5. **Push 4** — `openProjectQuickEdit` port from v1.
6. **Push 5** — Pin editor v1 feature port-over (activity log inline, linked findings, photo carousel).
7. **Verification stop** — full v2 sanity check.
8. **Push 6 (stretch)** — Site photo markup original-preservation flow per Mark's S114 ask.
9. **Closeout** — PK update + S116 handoff.

---

## Hard rules (carry forward from S113/S114)

### CSS / UI patterns

- **Muted colors only.** Never bright saturated tones (#1A7A4A, #3F6E9C, #C0392B, #2196F3, #E67E22, etc.). Brand burgundy `#9C2742` for primary CTAs only.
- **Use `.btn-muted-ok` / `-cancel` / `-warn` / `-neutral`** for all modal action buttons. NO inline button styling in modals.
- **Cancel button always on the right** in flex pairs.
- **Every new style needs a dark mode variant.**
- **Use `ctrColorClass(name)` from `deficiencies.js`** for contractor color hatches. "Site General" pinned to `.ctr-c3`. Sequential assignment now (P1.10) — no two non-general contractors collide.
- **IAR cannot coexist with low/general priority** — `Model.toggleIAR` enforces this.
- **Drawing viewer = navigation tab, not popup.** No Escape-to-close. No close-on-outside-click. Confirmed by P4 global Escape handler.

### Markup engine

- Never use `quadraticCurveTo` in pen/highlight strokes — `lineTo` only
- Never use `OffscreenCanvas` (no Safari/iOS support)
- Never stack highlighter opacity — offscreen composite pattern only
- Never auto-select a shape after drawing it — tool stays active
- Selection handles must match hit-test radii
- Lightbox `<img>` element MUST set `crossOrigin='anonymous'` BEFORE `src=` (P1.4 fix). R2 worker sends `Access-Control-Allow-Origin: https://hezhendong999-bot.github.io`.

### AI Scratchpad

- One scratchpad per observation (`<deficId>:<obsIdx>` key)
- Multi-photo accumulation: each ✨ click appends; whole-obs button replaces
- Three merge actions use `document.execCommand('insertText')` — Ctrl+Z reverts natively
- State persists across deficiency-tab re-renders via `AIAssist.repopulateAllScratchpads()` hook in `initDeficiencies.render()`

### Architecture

- `Markup.setRenderScale(s)` must be called from `viewer.js _applyTransform` on every zoom change
- `WebGLMarkupRenderer.resize(w, h, dpr)` requires `dpr` param
- PDF upload handlers (recursive `go(pg)` pattern) — NEVER rewrite
- Schema migration in `model.js setProject()` is idempotent — runs on every project load. Don't disable it; it's defensive for legacy v1 data.
- `sync.js push()` strips `signatures.sigInspectorData` / `sigWitnessData` before sending. Don't re-include them.

### Workflow

- One `ask_user_input` widget per turn, max 1 question — NO EXCEPTIONS
- Surgical `str_replace` edits only — never full-file rewrites mid-session
- After every JS change: extract scripts → `node --check` → exit 0 required
- After every CSS change: count `{` vs `}` — must balance
- Push to GitHub via API (multi-file blob+tree+commit pattern) at end of session
- Hover-reveal buttons must include `@media(pointer:coarse)`

---

## Files to upload at S115 start

When Mark starts S115, he uploads:
- `HANDOFF_SESSION_115.md` (this file)
- `ARENCON_Project_Knowledge.md` (current master with S114 closeout)
- `ARENCON_Style_Guide_v120.css` (or v121 if updated this session — check)
- `frt/css/frt.css` (light-mode overhaul primary target)

Claude pulls current versions from GitHub at HEAD if any are missing. Per the project rule: ALWAYS compare uploaded file line counts against GitHub to make sure project copy isn't stale.

---

## What success looks like at end of S115

- v2 light mode reads as a single coherent muted palette throughout — no remaining bright-saturated buttons or accent colors
- Two inspectors on the same project see each other in a header indicator (`👤 Mark · 👤 Leslie editing now`)
- Re-uploading a duplicate drawing into a project deduplicates by content hash instead of creating a second drawing entry
- Right-click on Hub project tile → quick-edit popup for name/number/client/address
- Pin editor modal feels feature-complete vs v1 (activity log inline, linked findings)
- Mark uses v2 for a real session and reports comfort

---

## Tone & workflow reminders

- Read this whole document AND the Project Knowledge S114 closeout (lines 2218-end) before any code work
- State a plan and wait for Mark's approval before pushing
- Direct, concise responses. No filler.
- Mark wants efficiency. 14 pushes in S114 is the cadence model.
- Surgical edits, validate before push, multi-file commit pattern
- Test before claiming done
- When user says "match v1", read v1 source first; don't assume parity (v1 lives at `legacy/ARENCON_Field_Review_Tool_v1.html` now)

---

## End of S115 handoff

Read this. Read the Project Knowledge S114 section. State your plan. Wait for approval. Then push.
