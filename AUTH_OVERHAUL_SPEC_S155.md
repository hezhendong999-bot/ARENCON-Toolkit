# Auth Overhaul — Spec & Decision Record

**Prepared:** Session 155 (2026-05-20)
**Author:** Claude
**Status:** **CLOSED at S155.** Three decisions resolved by Mark.

---

## OUTCOME (read first)

All three open questions resolved by Mark on session-155 wake.

| Q | Decision | New work owed |
|---|----------|---------------|
| Recovery email interpretation | **A — Reset-via-login-email** | Zero (already shipped) |
| Admin password reset backend | **Defer — Supabase dashboard until inspector count climbs** | Zero |
| Account sharing / one-active-session | **Skip — idle PIN+sign-out lock is sufficient deterrent** | Zero |

**Net new auth code outstanding at current scale: zero.**

The original audit + recommendations are preserved below for future reference. This doc is now a decision record, not an open spec.

---

## What's in place today (verified S155)

| Piece | Status | Where |
|---|---|---|
| Mandatory PIN gate | **Shipped S154** (`5a5635c2`) — forced overlay on every sign-in if `!_pinHash` | `ARENCON_Project_Hub.html` |
| Self-serve password reset | **Shipped** — `resetPasswordForEmail(email)` shim + Forgot Password link + success/error UI + button spinner | `ARENCON_Project_Hub.html` ~pos 149094 (shim), ~pos 156545 (UI handler) |
| Idle-based session locks (4h PIN-lock / 8h sign-out) | **Shipped** — `SOFT_LOCK_MS` and `HARD_LOCK_MS` constants; bumped on every user interaction | `ARENCON_Project_Hub.html` ~pos 286310 |
| Admin password reset | **Stub** — `adminCreateUser` falls back to `signUp`. Mark's S155 call: defer; use Supabase dashboard. | `ARENCON_Project_Hub.html` ~pos 149548 |
| Password visibility (plaintext) | **Already safe** — Supabase bcrypts; dashboard never shows it | n/a |
| Recovery email | **Resolved A** — covered by shipped reset-via-login-email | n/a |
| Account sharing prevention | **Skipped** — Mark's S155 call: PIN + idle lock is deterrent enough | n/a |

---

## Decision 1 — Recovery email = Interpretation A

**Resolved: A — Reset-via-login-email.** Already shipped via `_sb.auth.resetPasswordForEmail()`. No new work.

Interpretation B (custom secondary recovery email, Google-style) was rejected. Rationale at S155: inspectors use company email; if a company email is lost the admin reset path handles it more reliably than a custom secondary-email flow.

---

## Decision 2 — Admin password reset = Defer

**Resolved: Defer.** Use Supabase dashboard manually until inspector count climbs.

When the time comes to build the backend, recommendation stands: **Option B (Supabase Edge Function)** matching the existing `training-*-edge.ts` pattern. `service_role` stays in Supabase project; no separate Cloudflare Worker config to maintain. Estimated ~1 session to build `admin-reset-edge.ts` + wire up Hub UI.

Trigger to revisit: either ≥5 active inspectors with churn, OR one real "I forgot my password and the email isn't reaching me" incident.

---

## Decision 3 — Account sharing / one-active-session = Skip

**Resolved: Skip.** Mandatory PIN + idle PIN-lock (4h) + idle sign-out (8h) is the deterrent.

**Important nuance captured during S155 (Mark's correction to my sloppy phrasing):** the locks are **idle-based**, not wall-clock. A user actively working for 12 straight hours never gets logged out — only idle time counts toward both thresholds. See PK delta §6 for the source-of-truth constants.

One-active-session enforcement is real work (`user_sessions` table + heartbeat handshake + force-logout UX, ~2-3 sessions). Mark's call: don't build it unless a concrete sharing incident occurs.

---

## Constraints that stay canon

- `service_role` key, R2 admin key, and any Supabase admin API MUST NEVER appear in frontend code. All admin operations route through a backend proxy when they're built.
- Self-serve password reset MUST NOT be rebuilt — already done. Any future session that re-opens the auth queue should read this doc + PK delta §2 first.
- The Hub's `_sb.auth` is a **custom shim**, not supabase-js. Extend the shim rather than introducing supabase-js.

---

## Closing note

This spec doc was originally intended to surface decision points before any auth code shipped. All three points are now resolved with the lightest-touch answers, leaving the auth subsystem complete at current scale. Next time auth comes up, the trigger should be a concrete operational need (inspector churn, incident), not a roadmap item — at which point the deferred items in this doc can be revisited with current data.

— Claude
