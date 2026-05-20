# Project Knowledge Delta — Session 155

**Folds into:** `ARENCON_Project_Knowledge.md` (S154 canon pass).
**HEAD at S155 close:** `6967e1e17e44a4d51b3552662697ea5a745e9c32` (plus docs commit)
**SW at S155 close:** `arencon-frt-v476`
**CSS at S155 close:** `frt.css?v=354` (unchanged — no CSS this session)

This delta updates the canonical PK with five pieces of information from S155:
1. The new sync-optimization architecture (`_pushDirty` gate + `document.hidden` pause).
2. The actual state of the auth subsystem (correcting the S154 roadmap's outdated picture).
3. The auth-decisions resolution (recovery=A, admin reset=defer, account sharing=skip).
4. The Closed Items Summary recommendation-row exclusion.
5. The idle-based lock semantics correction (4h PIN-lock / 8h sign-out are BOTH idle-driven).

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

Per S154 estimate, refined for Micro compute (Pro tier's included upgrade — **now active per Mark's S155 dashboard action**):
- **Idle foreground:** ~10 req/min → ~7 req/min (30% cut from skip-if-unchanged alone).
- **Idle background (tab hidden):** ~10 req/min → ~4 req/min (60% cut — only presence still firing).
- **Active editing:** unchanged.

---

## §2 — Auth subsystem actual state (NEW, supersedes S154 bug log queue)

The S154 `BUG_LOG_AND_ROADMAP_S154.md` listed six auth-overhaul pieces. Reading the live `ARENCON_Project_Hub.html` at HEAD `6967e1e1` reveals the following actual state:

| Piece | Roadmap status | Live state at S155 close |
|---|---|---|
| Mandatory PIN gate | "Owed S155" | **Already shipped S154** (`5a5635c2`) |
| Self-serve password reset | "Smallest piece — ship first" | **Already shipped** — `_sb.auth.resetPasswordForEmail()` shim + Forgot Password link + success/error UI + spinner. Code at ~pos 149094 (shim) and ~pos 156545 (UI handler) |
| Admin password reset | "Needs backend; service_role NEVER in frontend" | **Stub** — `adminCreateUser` falls back to `signUp`. Comment notes Edge Function needed. Mark chose **defer (use Supabase dashboard)** at S155 |
| Password visibility (plaintext) | "Already safe" | **Confirmed safe** — Supabase bcrypts; dashboard never shows plaintext |
| Recovery email | "Clarify interpretation A vs B" | **Resolved: A** (already covered by shipped reset). No new work |
| Account sharing prevention | "Mostly policy" | **Resolved: skip.** Mandatory PIN + idle-based locks are sufficient deterrent |

### Implication for the auth queue

**Net new auth code work outstanding: zero.** When inspector count or password-incident frequency climbs, the next item to consider is admin reset (Edge Function recommended) — until then, Supabase dashboard handles admin operations.

Self-serve password reset MUST NOT be re-built — it's already done. Any session that re-opens the auth queue should read this PK delta + `AUTH_OVERHAUL_SPEC_S155.md` first to avoid duplicating shipped work.

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
| `adminCreateUser(email, pw, metadata)` | Falls back to `signUp` | **Stub — Edge Function needed when admin reset is built; deferred per S155** |

Any future auth work should extend this shim rather than introducing supabase-js. Keep dependency surface minimal.

---

## §4 — Closed Items Summary excludes recommendations (NEW, S155 shipped)

**Location:** `frt/js/export/pdf.js` line 502 (post-fix line 507).

**Rule (canon):** The deficiency "Previously Closed Items" appendix table (`closedSummaryDefs`) MUST exclude `isRecommendation` entries. Recommendations have their own dedicated "Previously Closed Recommendations" section (built from `_prevClosedRecs` at line ~852, rendered via `_recPrevClosedHtml` at line ~917). The two tables are disjoint by design.

**Symmetry:** the title-page `summaryDefs` filter at line 577 already applied this exclusion. The Closed Summary filter now matches.

**Why:** without the exclusion, closed recs render in BOTH tables — visible duplication that confused Shaun-Kelly-review readers. Single source of truth is the dedicated rec section.

---

## §5 — Appendix status-cell colours (CONFIRMED, no change S155)

S154 commit `46c6c44c` already replaced the forbidden hex codes in `pdf.js` appendix status cells:
- Outstanding: `#A85959` muted maroon (was forbidden `#C0392B`)
- Closed: `#5F8068` muted sage (was forbidden `#1A7A4A`)

The S154 handoff carried this item as "outstanding polish" by mistake. **Closed at S155.**

The two remaining `#1A7A4A` references in `pdf.js` (lines 961 and 1199) are the **Export PDF button** and **progress bar** in the print preview window — both UI in the export popup, NOT in the PDF content. These are **explicitly allowed by Style Guide §PDF standards** (the "📄 Export PDF (#1A7A4A, w.print())" rule). Do not "fix" these — they are canon.

---

## §6 — Idle-based session lock semantics (NEW, corrects S154 phrasing)

**Source-of-truth constants in `ARENCON_Project_Hub.html` (~pos 286310):**

```js
var SOFT_LOCK_MS  = 4 * 60 * 60 * 1000;  // 4 hours → PIN lock
var HARD_LOCK_MS  = 8 * 60 * 60 * 1000;  // 8 hours → full sign-out
var CHECK_INTERVAL_MS = 60 * 1000;       // check every 60s
var LS_ACTIVITY_KEY = 'ARENCON_lastActivity';
```

**Semantics:** both timers are **idle-based**, not wall-clock. The activity timestamp (`ARENCON_lastActivity` in localStorage) is bumped on every user interaction via passive event listeners (set up in `startInactivityChecker`). The checker fires every 60s + on `visibilitychange` to "visible" and computes `elapsed = Date.now() - getLastActivity()`:
- `elapsed >= HARD_LOCK_MS` → full sign-out
- `elapsed >= SOFT_LOCK_MS` → PIN lock

**A user actively working for 12+ hours straight never gets logged out — only idle time counts.**

This corrects S154/S155 spec doc shorthand "8h logout" which elided the idle distinction. The actual behaviour is "8h IDLE logout" / "4h IDLE PIN-lock."

---

## §7 — Carry-forward rules touched this session

- **Push helper re-parent pattern**: `/home/claude/work/push_s155_*.py` succeeded on attempt 1 in all three pushes. The 5-retry re-parent loop is the canonical shape for any GitHub API push when the Training-Center concurrent writer is active on `main`.
- **Post-push verification**: read back via contents API (not raw.githubusercontent.com — that lags ~10 min). S155 confirmed S155 markers in live `app.js` and SW v475/v476 in `sw.js` within seconds of each PATCH ref.

---

## §8 — Live triad snapshot at S155 close

- **HEAD:** `6967e1e17e44a4d51b3552662697ea5a745e9c32` (plus docs commit landing after this writeup)
- **SW:** `arencon-frt-v476`
- **CSS:** `frt.css?v=354` (no CSS change S155)

This delta is ready to fold into the canonical PK on the next canon pass. No information in S154's canon pass is invalidated except the auth-overhaul status table in §AUTH OVERHAUL, which is now superseded by §2 above, and any "8h logout" phrasing which is corrected by §6.
