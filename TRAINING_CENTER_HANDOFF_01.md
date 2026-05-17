# TRAINING CENTER — SESSION HANDOFF 01

**⚠ THIS IS THE TRAINING CENTER PROJECT — NOT FRT.**
Different repo area, different Supabase tables (tc_*), different deploy
target. Do not confuse with any HANDOFF_SESSION_NNN (those are FRT).

**Date:** 2026-05-17
**Project:** ARENCON Training Center (new build, separate Claude project)
**Session scope:** Roadmap → Phase 1 build → FRT-family re-skin → AI quiz wired
**Status:** Phase 1 foundation COMPLETE and live. AI authoring loop working.

---

## 1. What this is

A Supabase-backed training/LMS system for ARENCON, separate from FRT.
Built clean (not reused from Training_Center_v5) as two independent files
plus a Supabase Edge Function. Foundation is proven end-to-end:
Hub login → Training Center → DB read/write → AI quiz draft.

## 2. Deployed artifacts (all LIVE)

| File | Repo path | Purpose |
|---|---|---|
| `ARENCON_Training_Center.html` | repo root | LEARNER app — browse, watch/read, take quizzes |
| `ARENCON_Training_Admin.html` | repo root | ADMIN app — create courses/modules, AI quiz draft |
| `training-quiz-edge.ts` | repo root | Edge Function source (version control copy) |
| `PHASE1_SCHEMA.sql` | repo root | DB schema (already run in Supabase) |

URLs (GitHub Pages, hard-refresh to update):
- Learner: `https://hezhendong999-bot.github.io/ARENCON-Toolkit/ARENCON_Training_Center.html`
- Admin:   `https://hezhendong999-bot.github.io/ARENCON-Toolkit/ARENCON_Training_Admin.html`

Edge Function (live, v6, ACTIVE): `https://xsemvinxsyphjiaqgywv.supabase.co/functions/v1/training-quiz`

## 3. Architecture decisions LOCKED this session (do not relitigate)

- **Modular, never one file.** Learner + Admin are independent HTML files.
  No cross-imports. Auth snippet inlined per file deliberately (FRT V1
  lesson: duplicate small+stable, never share+fragile).
- **Auth = borrow the Hub's real session (Path B).** The Intranet Portal
  login is a NON-FUNCTIONAL MOCKUP. Training Center reads the Hub's real
  session token at `localStorage['sb-access-token']` (NOT the Supabase
  SDK key format — that was the original auth bug). No session → redirect
  to `ARENCON_Project_Hub.html` (where real login is). Portal-as-real-
  front-door is deferred ("Path A", future work).
- **AI on Supabase Edge Function, NOT the Cloudflare Worker.** Deliberate:
  keeps Training Center AI fully independent of the Worker that FRT/pumps
  depend on (one breaking can't cascade). Edge Function is also auto-
  deployable from Claude via the Supabase connector — Cloudflare is not.
- **Design = ARENCON family, not FRT clone.** Navy gradient header, white
  logo chip, burgundy accent, `--ts` text-scaling, Hub card/button/input
  system. Tokens lifted from ARENCON_Project_Hub.html :root.

## 4. Supabase state

Project `xsemvinxsyphjiaqgywv` (arencon-toolkit, shared with Hub/FRT).
- Tables created & RLS active: `tc_courses`, `tc_modules`, `tc_progress`.
- `profiles` roles confirmed: `admin`, `super_admin`, `inspector`
  (no `viewer` — schema tolerates its absence).
- `tc_is_admin()` SECURITY DEFINER helper gates writes to admins.
- **KNOWN: client must NOT send `created_by`** on inserts — FK/RLS
  rejection. Removed this session. Column exists, stays null, fine.
- Edge Function `training-quiz` v6, verify_jwt=FALSE (intentional — JWT
  validated in-code so browser CORS preflight passes; same security).
- **Secret set by Mark:** `ANTHROPIC_API_KEY` in Supabase → Edge
  Functions → Manage secrets. Confirmed working.

## 5. What works (verified by Mark this session)

- Hub-session auth bridge — admin recognized as super_admin
- Create course / drill into course / create module — DB write+read OK
- FRT-family re-skin on both files — approved ("Love it")
- AI quiz draft from an uploaded photo — WORKING (4 reasoning-style
  Q's, editable, saveable)
- Client auto-downscales images to 1568px before AI send (Anthropic
  5MB per-image limit; field photos are routinely larger)

## 6. Bugs fixed this session (do NOT reintroduce)

1. Auth read wrong key format → now reads `sb-access-token` (Hub's key)
2. Redirect went to mockup Portal → now redirects to Hub (real login)
3. Duplicate element id `mST` (select+textarea collision) → `mSTYPE`/`mTXT`
4. Client sent `created_by:ME.id` → removed (FK/RLS reject)
5. Generic "Save failed" swallowed errors → all errors now surface real msg
6. Edge Function CORS missing `apikey` header → added
7. Photo >5MB rejected by Anthropic → client downscales to 1568px first

## 7. KNOWN LIMITATIONS — not bugs, scoped future work

- **AI quiz from VIDEO does not work and is NOT Phase 1.** Anthropic has
  no video input. Requires transcript pipeline (video→audio→STT→text→AI).
  This is roadmap Phase 3 (RAG/transcript), a planned build.
- **AI quiz from DOCUMENTS (PDF/deck/Word) not built.** Needs server-side
  text extraction first. Roadmap Phase 2 gap. Not a cap problem — text is
  cheap; just unbuilt.
- **Many-photos (e.g. 30) not supported.** Vision degrades with many
  images. Practical ceiling ~4/request; batch+merge is the future design.
- **Portal is a mockup.** Real auth front door = deferred Path A.
- Phases 2–6 (reasoning-dialogue assessment, RAG chat, gap dashboard,
  Ask-Mark-Once, performance/progression) — all UNBUILT. See roadmap.

## 8. Recommended next session start

1. Read this handoff + `ARENCON_Training_Center_Roadmap.md` first.
2. Ground-truth: confirm the 3 tc_* tables, Edge Function v-number,
   and the two deployed HTML files match this doc before treating
   anything as open.
3. Decide ONE next thing (don't sprawl): most logical is either
   (a) document text-extraction → quiz (Phase 2 authoring), or
   (b) start the learner-side path/competency structure, or
   (c) the transcript pipeline if video is the priority.
4. The roadmap §6 phase order is the reference; Phase 1 is now done.

## 9. Files delivered this session

- `ARENCON_Training_Center_Roadmap.md` (v2, aligned)
- `ARENCON_Training_Center.html` (learner, live)
- `ARENCON_Training_Admin.html` (admin, live)
- `training-quiz-edge.ts` (Edge Function source, live as v6)
- `PHASE1_SCHEMA.sql` (run in Supabase)
- `TRAINING_CENTER_HANDOFF_01.md` (this file)

---
*Naming note: every Training Center deliverable is prefixed/suffixed to
be visually distinct from FRT. FRT handoffs are HANDOFF_SESSION_NNN;
Training Center handoffs are TRAINING_CENTER_HANDOFF_NN. Do not mix.*
