# Project Knowledge Delta — Session 155

**Folds into:** `ARENCON_Project_Knowledge.md` (S154 canon pass).
**HEAD at S155 close:** `800b996ecce4883235f28305f1d01bd8b6d2f6b5`
**SW at S155 close:** `arencon-frt-v475`
**CSS at S155 close:** `frt.css?v=354` (unchanged — no CSS this session)

This delta updates the canonical PK with two pieces of information from S155:
1. The new sync-optimization architecture (`_pushDirty` gate + `document.hidden` pause).
2. The actual state of the auth subsystem (correcting the S154 roadmap's outdated picture).

---

## §1 — Sync optimization architecture (NEW, supersedes any sync description from S82)

### `_pushDirty` flag — skip-if-unchanged push gate

**Location:** `frt/js/app.js`, module-scope variable declared near the existing `_cloudPullTimer` block.

**Semantics:** "the model has been mutated since the last successful push to cloud."

**Lifecycle:**

| Event | `_pushDirty` |
|---|---|
| Module init | `false` |
| `Model.onChange('saved')` fires | `true` — only real local mutations that successfully wrote to IDB |
| `_startCloudSync` runs | `true` once — session-start safety push covering tab-killed-mid-debounce reload |
| `_pushToCloud` starts network request | `false` — optimistic clear |
| `SyncEngine.push` resolves with row | stays `false` — push succeeded |
| `SyncEngine.push` resolves `null` (offline-queued) | restored to `wasDirty` |
| `SyncEngine.push` rejects | restored to `wasDirty` |

**Race-safety:** the optimistic clear at push start means a concurrent `'saved'` fired during the network round-trip re-sets `_pushDirty=true`, and the next 15s tick picks it up. No edit can be lost.

### `document.hidden` pause on push and pull

Added as early-returns at the top of `_pushToCloud()` and `_checkRemoteForChanges()`:
```js
if (typeof document !== 'undefined' && document.hidden) return;
```

**Scope:**
- ✅ Pushes paused while tab hidden.
- ✅ Pulls paused while tab hidden.
- ❌ Presence heartbeat NOT paused (per Mark — keeps the "user X active on project Y" indicator live for multi-inspector visibility).

**Implementation:** no `visibilitychange` listener. Timers keep ticking but work is gated. Resume happens naturally on the next interval tick after `document.hidden` flips. **No flush-on-visible** — Mark's scope-minimal call.

### What was deliberately preserved

- Push interval: still 15s.
- Pull interval: still 30s.
- Debounced 5s `setTimeout` on `Model.onChange('saved')`: untouched. Coalesces burst saves.
- `SyncEngine.push()` internals: untouched.
- Presence heartbeat: `frt/js/data/presence.js` not modified.

### Expected impact on disk IO budget

Per S154 estimate, refined for Micro compute (Pro tier's included upgrade):
- **Idle foreground:** ~10 req/min → ~7 req/min (30% cut from skip-if-unchanged alone).
- **Idle background (tab hidden):** ~10 req/min → ~4 req/min (60% cut — only presence still firing).
- **Active editing:** unchanged.

This pushes back the day Mark needs to step up from Micro to Small compute.

---

## §2 — Auth subsystem actual state (NEW, supersedes S154 bug log queue)

The S154 `BUG_LOG_AND_ROADMAP_S154.md` listed six auth-overhaul pieces. Reading the live `ARENCON_Project_Hub.html` at HEAD `800b996e` reveals the following actual state:

| Piece | Roadmap status | Live state |
|---|---|---|
| Mandatory PIN gate | "Owed S155" | **Already shipped S154** (`5a5635c2`) |
| Self-serve password reset | "Smallest piece — ship first" | **Already shipped** — `_sb.auth.resetPasswordForEmail()` shim + Forgot Password link + success/error UI + spinner. Code at ~pos 149094 (shim) and ~pos 156545 (UI handler) |
| Admin password reset | "Needs backend; service_role NEVER in frontend" | **Stub** — `adminCreateUser` falls back to `signUp`. Comment notes Edge Function needed. ~pos 149548 |
| Password visibility | "Already safe" | **Confirmed safe** — Supabase bcrypts; never plaintext in dashboard |
| Recovery email | "Clarify interpretation A vs B" | **Decision owed; no code** |
| Account sharing prevention | "Mostly policy" | **Confirmed policy-only** at ARENCON's scale |

### Implication for the auth queue

The remaining real code work is **one Edge Function** for admin reset, and only if Mark green-lights it. At solo-dev / 1-inspector phase, Option C (use Supabase dashboard for admin reset) is the right call.

Self-serve password reset MUST NOT be re-built — it's already done. Any session that re-opens the auth queue should read this PK delta and `AUTH_OVERHAUL_SPEC_S155.md` first to avoid duplicating shipped work.

---

## §3 — `_sb.auth` shim methods inventory (NEW canon reference)

The Hub's Supabase client is a custom shim (not the official supabase-js library). Live methods exposed on `_sb.auth`:

| Method | Endpoint | Status |
|---|---|---|
| `signInWithPassword(email, pw)` | `/auth/v1/token?grant_type=password` | Working |
| `signUp(email, pw, metadata)` | `/auth/v1/signup` | Working |
| `signOut()` | clears localStorage tokens | Working |
| `getSession()` | reads localStorage | Working |
| `refreshSession(refreshToken)` | `/auth/v1/token?grant_type=refresh_token` | Working |
| `resetPasswordForEmail(email)` | `/auth/v1/recover` | Working |
| `adminCreateUser(email, pw, metadata)` | Falls back to `signUp` | **Stub — needs Edge Function** |

Any future auth work should extend this shim rather than introducing supabase-js. Keep dependency surface minimal.

---

## §4 — Carry-forward rules touched this session

- **Push helper re-parent pattern**: `/home/claude/work/push_s155_1.py` succeeded on attempt 1. The 5-retry re-parent loop is the canonical shape for any GitHub API push when the Training-Center concurrent writer is active on `main`.
- **Post-push verification**: read back via contents API (not raw.githubusercontent.com — that lags ~10 min). S155 confirmed 7 S155 markers in live `app.js` and SW v475 in `sw.js` within seconds of the PATCH ref.

---

## §5 — Live triad snapshot at S155 close

- **HEAD:** `800b996ecce4883235f28305f1d01bd8b6d2f6b5`
- **SW:** `arencon-frt-v475`
- **CSS:** `frt.css?v=354` (no CSS change S155)

This delta is ready to fold into the canonical PK on the next canon pass. No information in S154's canon pass is invalidated except the auth-overhaul status table in §AUTH OVERHAUL, which is now superseded by §2 above.
