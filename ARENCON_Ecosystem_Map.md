# ARENCON ECOSYSTEM MAP

**This file belongs in BOTH the FRT Claude project AND the Training
Center Claude project.** It is the single shared reference that keeps
two independent workstreams aligned to one end goal. It is small and
changes rarely. When it changes, update the copy in both projects.

The Claude projects do NOT talk to each other and do NOT merge. There
is ONE system (GitHub + Supabase). The projects are just two places
Mark works on it. Consistency comes from both projects reading this
map and the live code — never from project-to-project linkage.

---

## The one system

- **Code:** GitHub repo `hezhendong999-bot/ARENCON-Toolkit` (GitHub Pages,
  main branch). Single source of truth for all tool code.
- **Backend:** Supabase project `xsemvinxsyphjiaqgywv` (one DB shared by
  everything; tables namespaced — `tc_*` = Training Center).
- **Storage:** Cloudflare R2 via Worker `arencon-r2-worker`.
- **AI:** Cloudflare Worker `arencon-ai-worker` (FRT, pumps, writing
  assistant) AND Supabase Edge Functions (Training Center — deliberately
  separate so one can't break the other).

## The intended hierarchy (the end goal)

```
ARENCON Intranet Portal   ← company front door (currently a MOCKUP;
   │                         making it the real auth gate = future work)
   ├─► Project Hub          → engineering tools (FRT, pumps, OBC, IST, DD)
   ├─► Tool Page (index)    → tools launcher (to be folded into Portal)
   └─► Training Center      → all training + admin videos/quizzes
```

- Auth model: every page independently checks the Supabase session;
  no session → redirect to where real login lives. Same-origin means
  one login covers all surfaces. Currently the Hub holds the only real
  login; Training Center borrows it. Portal-as-real-front-door is the
  deferred "Path A".
- The tools, Hub, and Training Center are SIBLINGS that link via URL.
  None is nested inside another. A break in one must not cascade.

## Workstream split (which project owns what)

| Project | Owns | Handoff naming |
|---|---|---|
| FRT Claude project | Field Review Tool, Hub, pump tools, OBC, IST, DD, index, Portal, Strategic Roadmap | `HANDOFF_SESSION_NNN.md` |
| Training Center project | Training Center learner + admin, training Edge Functions, LMS schema (`tc_*`) | `TRAINING_CENTER_HANDOFF_NN.md` |

Shared, touched by either project as needed (it's one repo/DB):
the GitHub repo, the Supabase instance, and the eventual cross-links
(when tools link to the Portal, that edit happens in the repo from
whichever project is active — no coordination ritual needed).

## Consistency mechanisms (how the two stay aligned WITHOUT talking)

1. **This map** — both projects read it; it states the shared end goal.
2. **Live code is truth** — both projects fetch code from GitHub /
   state from Supabase every session. Never trust uploaded snapshots.
3. **Design tokens** — visual consistency comes from matching the live
   Hub `:root` tokens (Calibri, navy header, burgundy #9C2742 CTA-only,
   muted palette, `--ts` scaling). RECOMMENDED future task: a single
   canonical `ARENCON_Design_Tokens.css` in the repo that every tool
   copies from — the only durable style-sync guarantee. Until then,
   match by reading the Hub's actual code.
4. **Capacity discipline** — project knowledge = handoffs + roadmaps +
   this map only. No code in knowledge bases (it rots, causes overwrites).

## End-state vision (the "why")

New-hire onboarding goes from ~1 year of Mark being the bottleneck to
weeks-to-useful-under-supervision, by: a reasoning-first training system
(how they think, not just right/wrong), Mark answers once and the system
repeats it forever, a corpus-grounded AI chat, all under one auth-gated
Portal. Training Center roadmap has the phase detail; FRT Strategic
Roadmap has the engineering-tool detail. This map is the bridge.

---
*Update discipline: when the hierarchy, ownership, or backend identity
changes, edit this file and replace it in BOTH projects the same day.*
