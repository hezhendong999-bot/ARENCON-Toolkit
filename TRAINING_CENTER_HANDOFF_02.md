# ARENCON Training Center — Session 02 Handoff

Continues HANDOFF_01. Scope this session: **Admin authoring v2** — reduce
typing, larger image review, cost visibility, document ingestion.
All work is deployed, validated, and pushed to `main`.

---

## 1. What shipped (5 batches, all live)

| # | Feature | Commit |
|---|---------|--------|
| 1 | **doc→quiz**: drop a PDF/DOCX/PPTX on the admin → text extracted server-side → fills the lesson box → draft quiz as normal | `6c021520` |
| 2 | **AI usage panel** (admin home): Today / This-month / All-time spend, by-tool, recent — account-scoped | `7dfc99e7` |
| 3 | **Two-pane review**: source image shown large beside the questions, click-to-zoom, stacks on narrow screens | `d9676a9a` |
| 4 | **Read-only draft cards**: scan-and-save by default; click any text to edit; per-question ↻ Regenerate / ✕ Delete / ＋ Add-one; tighter quiz prompt | `9df4e46f` + EF `785a76b0` |
| 5 | **Lesson-text helpers**: autogrow textarea, char/word count, ⤢ Expand, ✨ Tidy-into-lesson (AI, facts preserved) | `3fd0cc92` |

EF source version-control copies added to repo (closes the
source-not-in-repo gap): `9c9a5e97`, `59fc4f8f`, `1e95b124`.

---

## 2. Edge Function inventory (all `verify_jwt=false`)

JWT is validated **in-code** in every function (against
`${SUPABASE_URL}/auth/v1/user`). `verify_jwt=false` is deliberate and
**must stay** — it lets the browser CORS preflight (no Authorization
header) return 204 instead of being rejected by the platform gate.
Security is unchanged: a real request still needs a valid session JWT.

| Function | Ver | Purpose | Repo source copy |
|----------|-----|---------|------------------|
| `training-quiz`    | v7 | Quiz drafting (Sonnet 4). Now accepts `count` (1–8, def 4) + `avoid[]` for single-question regen. Logs `ai_usage_log` action `quiz_draft`. | `training-quiz-edge.ts` |
| `training-extract` | v1 | PDF/DOCX/PPTX → text. No AI call → **zero cost**, logs nothing. | `training-extract-edge.ts` |
| `training-usage`   | v1 | Read-only spend aggregates for the calling user. No AI. | `training-usage-edge.ts` |
| `training-clean`   | v1 | Tidy rough notes → lesson text (Sonnet 4). Logs action `lesson_clean`. | `training-clean-edge.ts` |

Project ref `xsemvinxsyphjiaqgywv`. None of these touch the Cloudflare
Worker (`arencon-ai-worker.js`) that FRT / pump tools depend on.

---

## 3. Cost logging — `ai_usage_log` reuse

All AI functions write to the **existing shared** `ai_usage_log` table
(same one the FRT Worker uses), with `tool="training"`,
`project_number=null`, `project_name=null`. This was already true for
`training-quiz` before this session — only the **display** (Batch 2) was
missing. The schema (`user_id, user_email, tool, action, model,
input_tokens, output_tokens, cost_usd, field_count, accepted_count,
created_at`) is FRT-consistent. Service-role key is auto-injected — **no
secret to add**. `ANTHROPIC_API_KEY` must remain set in Supabase → Edge
Functions secrets (used by `training-quiz` and `training-clean`).

`training-usage` aggregates by scanning the caller's rows (cap 10 000,
returns `capped:true` if hit). Fine for single-admin volume for years;
if it ever caps, add a Postgres aggregate view/RPC rather than raising
the cap.

---

## 4. GitHub deploy access model (IMPORTANT — future sessions inherit this)

- **No GitHub MCP connector exists** in the registry (verified). No env
  token. GitHub Pages serves the repo HTML.
- Deploys are done via the **GitHub Contents API** (PUT) using Mark's
  **fine-grained PAT** ("Claude Push" style token): repo-scoped to
  `hezhendong999-bot/ARENCON-Toolkit`, Contents: read+write. Verified
  this session: repo `push:true`, round-trip confirmed.
- Mechanism per file: GET current `sha` → base64 content → PUT
  `{message, content, sha, branch:"main"}`. Verify by re-fetching with
  `Accept: application/vnd.github.raw` and `cmp -s` vs the validated
  local copy. Commit message format: `Training 02: <desc>`.
- The shell is **`/bin/sh` (dash)** — no bash substring (`${v:0:8}`) etc.
- **Mark must regenerate/rotate this token after the session** — its
  value appears in the session transcript. A fresh token is pasted at
  the start of each session.

---

## 5. Local Edge Function typecheck (sandbox quirk)

```
export PATH="/home/claude/.deno/bin:$PATH"
export DENO_TLS_CA_STORE=system          # sandbox proxy intercepts TLS
# stub the type-only jsr import for local check:
{ echo 'declare const EdgeRuntime: { waitUntil:(p:Promise<unknown>)=>void }|undefined;'
  grep -v 'jsr:@supabase/functions-js/edge-runtime.d.ts' FILE.ts; } > chk.ts
deno check chk.ts        # expect exit 0
```
HTML validation gates before every push: extract `<script>` →
`node --check` (exit 0); count `{` vs `}` in `<style>` (must be equal).

---

## 6. Known housekeeping gaps (non-functional)

- **`PHASE1_SCHEMA.sql` is 404 in the repo.** The schema is applied and
  correct in Supabase; only the version-control `.sql` copy is missing.
  Recommend exporting current schema to that path in a future session.
- `profiles` role check allows `super_admin, admin, inspector, viewer`
  (HANDOFF_01 omitted `viewer` — minor doc drift, now noted).

---

## 7. Test recipes (hard-refresh the admin page first)

1. **doc→quiz**: open course → Add module → drop a text PDF on 📄 →
   lesson box fills + "Extracted N chars…" → Draft quiz. Try .docx /
   .pptx. Scanned/image PDF → clean "no text layer" message, no crash.
2. **usage panel**: admin home shows "AI usage — your account" with
   Today / This month / All time, by-tool, recent.
3. **two-pane**: draft from a photo → image large at left, questions at
   right, click image to zoom in/out; narrow window stacks them.
4. **draft cards**: draft renders read-only; click text or ✎ to edit
   one; ↻ regenerates just that question (no duplicates); ✕ deletes;
   ＋ adds one. Save module still works.
5. **lesson-text**: textarea grows as you type; counter updates;
   ⤢ Expand → tall canvas; ✨ Tidy → readable rewrite, facts/codes
   intact, toast shows cost.

---

## 8. Next-session candidates (not started)

- Export `PHASE1_SCHEMA.sql` to repo (close §6 gap).
- Learner-side surfacing of `tc_modules.quiz` (learner HTML unchanged
  this session).
- Optional: persist accepted/edited counts to `ai_usage_log.accepted_count`.
