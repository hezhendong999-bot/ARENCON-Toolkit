# Auth Overhaul — Spec & Open Questions

**Prepared:** Session 155 (2026-05-20)
**Author:** Claude
**For:** Mark's review on next sign-in
**Status:** Decisions owed before any auth code ships

---

## TL;DR

The auth overhaul roadmap in `BUG_LOG_AND_ROADMAP_S154.md` lists six pieces. Reading the live Project Hub source, **two are already done, two are policy/no-code, and only two need real building.** The "self-serve password reset" item that S154 flagged as "smallest piece, ship first" is fully shipped already — `_sb.auth.resetPasswordForEmail()` with a working Forgot Password UI, success/error states, the whole flow.

The remaining real work is:

1. **Admin password reset backend** (Mark resets staff). The Hub has an `adminCreateUser` method that's a stub — it falls back to `signUp` and notes a Cloudflare Worker or Supabase Edge Function is needed for real admin auth ops. This is the actual unfinished work.
2. **Recovery email** — needs your interpretation call before any code.

Everything else is either shipped, requires no code, or is a policy decision.

---

## What's actually in place today

I went through `ARENCON_Project_Hub.html` end to end. Current state:

| Piece | Status | Where |
|---|---|---|
| Mandatory PIN gate | **Shipped S154** (`5a5635c2`) — forced overlay on every sign-in if `!_pinHash` | `ARENCON_Project_Hub.html` |
| Self-serve password reset | **Shipped** — `resetPasswordForEmail(email)` shim + Forgot Password link + success/error UI + button spinner | `ARENCON_Project_Hub.html` ~pos 149094 (shim), ~pos 156545 (UI handler) |
| Admin password reset | **Stub only** — `adminCreateUser` falls back to `signUp`; comment explicitly notes service_role+Edge Function is needed | `ARENCON_Project_Hub.html` ~pos 149548 |
| Password visibility (plaintext) | **Already safe** — Supabase bcrypts; dashboard never shows it. No code work | n/a |
| Recovery email | **Not built** — interpretation owed first (see open question 1) | n/a |
| Account sharing prevention | **Mostly policy** — Mandatory PIN + 8h logout makes shared accounts impractical. One-active-session enforcement is heavyweight | n/a |

**Net implication:** The roadmap's "ship self-serve password reset first" item is moot. Skip it. The real auth work is admin reset + recovery email interpretation.

---

## Open question 1 — Recovery email interpretation

**The S154 handoff flagged this exact question.** Two readings:

- **Interpretation A — Reset-via-login-email.** When someone forgets their password, Supabase emails a reset link to their account email. That's literally `resetPasswordForEmail()`, already shipped. Nothing new to build.
- **Interpretation B — Secondary recovery email, Google-style.** User registers a backup email distinct from their login email. If they lose access to login email, the recovery email gets a reset link. **Supabase does not ship this.** Would need a custom flow: new column in `profiles`, custom email send via Edge Function, custom reset-token generation, custom verify UI.

My read on what you actually want: **Interpretation A.** Self-serve reset to the user's own email covers 95% of real-world "I forgot my password" cases. Interpretation B is mostly for "I lost access to the email account itself" which for ARENCON inspectors using a company email shouldn't happen — if someone loses access to their company email, IT (Mark) needs to be involved anyway, and that's the admin reset path.

**If you confirm Interpretation A**: this item is closed, no work needed.
**If you want Interpretation B**: 2–3 sessions of work (schema migration, Edge Function for custom email, UI for setup + verify + use). I'd push back on this one — admin reset covers the lost-email-account case more reliably.

---

## Open question 2 — Admin password reset backend choice

The admin reset flow needs a backend because `service_role` cannot be in frontend code (project rule, non-negotiable). Three options:

### Option A — Cloudflare Worker proxy (matches existing AI Worker pattern)
- Reuses the pattern from `arencon-ai-worker.hezhendong999.workers.dev`
- Single Worker deployment, similar shape: receive admin user's JWT, verify it server-side, call Supabase admin API with `service_role`
- Pros: consistent stack, you already know how to manage Workers
- Cons: secret sprawl — `service_role` lives in CF Workers config (same risk profile as anon key on R2 worker, already accepted)

### Option B — Supabase Edge Function
- Closer to the data, less secret routing
- Same shape as `training-quiz-edge.ts`, `training-clean-edge.ts` already deployed
- Pros: no separate Worker to manage, `service_role` stays in Supabase project
- Cons: tied to Supabase tier limits on Edge Function invocations

### Option C — Skip the backend entirely
- For ARENCON's 20-inspector scale, "admin resets password" could be: Mark opens Supabase dashboard → Authentication → finds user → Reset password
- Pros: zero code, zero risk surface
- Cons: requires Mark to log into Supabase dashboard each time. Friction. Doesn't scale to 50 inspectors with churn.

My recommendation: **Option B (Edge Function).** The training-edge-functions pattern is already proven in the codebase. Adding `admin-reset-edge.ts` follows the exact same shape. `service_role` stays in one place (Supabase), no CF Worker config to maintain.

The fallback to Option C (use Supabase dashboard) is fine for the next 6 months — solo dev phase doesn't have enough churn to justify the work. I'd defer the build until you have ≥5 active inspectors and at least one real "I forgot my password and the email isn't getting through" incident.

---

## Open question 3 — Account sharing / one-active-session

The roadmap calls this "mostly policy." I agree. One-active-session enforcement is real work:
- Server-side session tracking (Supabase doesn't ship this; need a `user_sessions` table + cleanup logic)
- Heartbeat handshake every N seconds to detect duplicate sessions
- Force-logout UX when a duplicate is detected

For ARENCON's scale and threat model, **I'd skip it.** Mandatory PIN (just shipped S154) + 8h logout makes shared accounts annoying enough that they won't happen by accident. Deliberate sharing (Inspector A says "use my login") is a personnel issue, not a code issue.

If you want to ship this anyway, ~2–3 sessions of work. Recommend deferring until there's a concrete incident.

---

## Revised S155+ auth queue (post-spec)

Reflecting the actual state:

| # | Item | Status | Effort |
|---|---|---|---|
| 1 | Mandatory PIN gate | ✅ Shipped S154 | — |
| 2 | Self-serve password reset | ✅ Already shipped | — |
| 3 | Recovery email interpretation A (confirm only) | Decision owed | 0 sessions if A |
| 3' | Recovery email interpretation B (custom flow) | Decision owed | 2–3 sessions if B (not recommended) |
| 4 | Admin password reset backend (Edge Function recommended) | Decision owed | 1–2 sessions |
| 5 | Password visibility | ✅ Already safe | — |
| 6 | Account sharing prevention | Recommend skip | 0 sessions if skip, 2–3 if build |

**Net work if you take all my recommendations**: 1–2 sessions (just admin reset Edge Function), and that can wait until inspector count climbs. Auth is essentially done for the current scale.

---

## What I need from you before any code ships

Three yes/no calls, in order of importance:

1. **Recovery email** → confirm Interpretation A (already covered by shipped reset) OR explicitly want Interpretation B (custom secondary-email flow). A is my recommendation.
2. **Admin reset backend** → Edge Function (Option B) OR Cloudflare Worker (Option A) OR defer / use Supabase dashboard (Option C). Edge Function is my recommendation when you're ready to ship; Option C is fine for now.
3. **Account sharing prevention** → skip (my recommendation) OR plan it for a future session.

Once you've answered, the actual code work for ARENCON's current scale is either zero (if you take all three recommendations) or one Edge Function (admin reset, when you're ready).

---

## Honest engineering note

The S154 roadmap framing made auth feel like a bigger pile of owed work than it actually is. After reading the live code, the picture is much more cheerful: most of the security perimeter is already in place. The remaining unknowns are decisions, not code. The next session can either pick this back up if you want to ship admin reset, or skip it entirely and move to the next priority (Bug #5 multi-obs lane move dispatcher, or Board Rework §2.4).

— Claude
