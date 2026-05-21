# Project Knowledge Delta — Session 155 (final)

**Folds into:** `ARENCON_Project_Knowledge.md` (S154 canon pass).
**HEAD at S155 close:** `761985b3` (plus this docs commit)
**SW at S155 close:** `arencon-frt-v476`
**CSS at S155 close:** `frt.css?v=354` (unchanged — no CSS this session)

This delta is folded from a long four-act session: sync optimization, auth resolution, polish, and a field-day disaster triage. Captures architecture findings, behavioral commitments, and the 4380.24 incident state.

---

## §1 — Sync optimization architecture (S155 shipped; under suspicion post-incident)

### `_pushDirty` skip-if-unchanged push gate

Module-scope flag in `frt/js/app.js` ~line 736. Lifecycle:

| Event | `_pushDirty` |
|---|---|
| Module init | `false` |
| `Model.onChange('saved')` fires | `true` |
| `_startCloudSync` runs | `true` once (safety) |
| `_pushToCloud` network request start | `false` (optimistic clear) |
| Push resolves with row | stays `false` |
| Push resolves `null` (offline-queued) | restored to `wasDirty` |
| Push rejects | restored to `wasDirty` |

### `document.hidden` pause

Early-return at top of `_pushToCloud()` and `_checkRemoteForChanges()`. Pause push and pull while tab hidden. Presence heartbeat NOT paused.

### CRITICAL CAVEAT — S155 under suspicion

The S155 4380.24 incident has a non-zero probability of being caused by `_pushDirty` latching stuck in `false` state. **Tomorrow's diagnostic must explicitly probe `window._pushDirty` and the most recent push outcome on the tablet.** If confirmed as the cause, the fix is to replace boolean with a counter (push captures-then-decrements rather than clears).

### Idle IO budget impact estimate (Micro compute now active)

- Idle foreground: ~10 → ~7 req/min (30% cut)
- Idle background (tab hidden): ~10 → ~4 req/min (60% cut)
- Active editing: unchanged

---

## §2 — Auth subsystem actual state at S155 close

| Piece | State |
|---|---|
| Mandatory PIN gate | Shipped S154 |
| Self-serve password reset | Already shipped (`_sb.auth.resetPasswordForEmail()`) |
| Idle-based locks (4h PIN / 8h sign-out) | Already shipped |
| Admin password reset | Stub. Mark's call S155: **defer**, use Supabase dashboard |
| Recovery email interpretation | Mark's call S155: **A** (= shipped) |
| Account sharing prevention | Mark's call S155: **skip** |
| Password plaintext | Already safe (Supabase bcrypt) |

**Net new auth code outstanding: zero at current scale.**

Self-serve password reset MUST NOT be rebuilt — already done. Any session that re-opens auth queue should read PK §2 + `AUTH_OVERHAUL_SPEC_S155.md` first.

---

## §3 — Closed Items Summary excludes recommendations (S155 shipped)

`frt/js/export/pdf.js` ~line 502. Rule: `closedSummaryDefs` filter MUST exclude `isRecommendation` entries. Recommendations have their own dedicated "Previously Closed Recommendations" section (built from `_prevClosedRecs`, rendered via `_recPrevClosedHtml`). The two tables are disjoint by design. Title-page `summaryDefs` filter at line 577 already had this exclusion.

---

## §4 — Appendix status-cell colours (confirmed S155, no change)

S154 commit `46c6c44c` already replaced forbidden hex codes:
- Outstanding: `#A85959` muted maroon (was `#C0392B`)
- Closed: `#5F8068` muted sage (was `#1A7A4A`)

The two remaining `#1A7A4A` references in `pdf.js` (lines 961, 1199) are the Export PDF button and progress bar in the print preview window. **Explicitly allowed by Style Guide §PDF standards.** Do not "fix" these — they are canon.

---

## §5 — Idle-based session lock semantics (corrects all prior "8h logout" phrasing)

`ARENCON_Project_Hub.html ~pos 286310`:

```js
var SOFT_LOCK_MS  = 4 * 60 * 60 * 1000;  // 4 hours idle → PIN lock
var HARD_LOCK_MS  = 8 * 60 * 60 * 1000;  // 8 hours idle → full sign-out
var CHECK_INTERVAL_MS = 60 * 1000;       // checker fires every 60s + on visibilitychange
var LS_ACTIVITY_KEY = 'ARENCON_lastActivity';
```

Both timers are idle-based, not wall-clock. Activity timestamp is bumped on every user interaction via passive event listeners. `checkInactivity` computes `elapsed = Date.now() - getLastActivity()` and triggers based on thresholds.

**A user actively working for 12+ straight hours never gets logged out** — only idle time counts.

---

## §6 — Photo and drawing R2 storage architecture (canon reference)

### Bucket key pattern

```
<projectUUID>/photos/frt/<type>/<filename>
```

Where `<type>` ∈ `original`, `marked`, `drawings`, `markup`.

### Filename conventions

- **Photos**: `defic_<deficiency-uuid>.jpg` — filename encodes the deficiency it belongs to. **Critical recovery property:** even if cloud loses the metadata for a deficiency, the photo blob in R2 is identifiable by its filename, allowing reconstruction.
- **Drawings**: `dwg_<drawing-id>_pg<N>_<random>.jpg` — drawing ID and page number embedded.

### Auth model

- R2 GET requests: **unauthenticated** by Worker policy
- R2 PUT/DELETE: require auth (via Cloudflare Worker)
- R2 LIST: at `https://arencon-r2-worker.hezhendong999.workers.dev/list/{pid}/{tool}/{type}/`

**Important:** R2 uploads use a separate Cloudflare Worker that does NOT require Supabase authentication. This means R2 uploads can succeed even when Supabase pushes are failing (e.g., expired auth token). This asymmetry is exactly what caused 4380.24's silent sync failure to appear successful to the user — every photo upload returned 200 OK from R2, but Supabase metadata pushes were silently failing.

### Recovery property (NEW CANON insight from S155 incident)

When tablet IDB has unpushed deficiency metadata and R2 has the photo blobs uploaded against those deficiency UUIDs, the recovery is trivial: one manual metadata push to Supabase, and photos auto-reattach via the existing `r2Key` lookup in the model. **Photo blobs never need to be re-uploaded.** The R2-with-deficiency-UUID-filenames pattern is the recovery oracle for any future similar incident.

---

## §7 — 4380.24 incident state (referenced as canon for tomorrow's rescue)

**Project:** 4380.24 Sun Pharma 114 East Dr Ph2
**UUID:** `ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0`
**Instance ID:** `cb856f4b-b361-43d3-8605-44fd910bd735` (FRT, instance #1)

**State at S155 close:**

| Where | What | Status |
|---|---|---|
| Cloud `tool_data.data.generalDeficiencies` | 9 pre-today deficiencies | Safe |
| Cloud `tool_data.data.drawings` | 8 drawings (5 pre-today + 3 from today before failure) | Safe |
| Cloud `tool_data.updated_at` | 2026-05-21T00:30:57 UTC | Recent push happened but didn't include today's 30 |
| R2 `<pid>/photos/frt/original/` | 30 photos from 2026-05-20, defic_<uuid>.jpg | Safe |
| R2 `<pid>/photos/frt/drawings/` | 13 drawings (8 pre-today + 5 today) | Safe |
| Tablet IDB | Today's 30 deficiencies + pin positions + obs text + contractor assignments | Unconfirmed (~95% likely intact) |

**Snapshots saved:**
- Full cloud row → `/home/claude/work/output/cloud_row_full_4380_24.json` (rollback)
- R2 inventory → `/home/claude/work/output/R2_INVENTORY_4380_24.json`
- Recovery walkthrough → `R2_RECOVERY_REPORT_4380_24.md`

**Recovery sequence (canon for tomorrow's Claude):**

1. Mark pings new session before opening tablet FRT
2. Read-only IDB diagnostic (no sync trigger)
3. Confirm 30 deficiencies intact
4. One manual push
5. Photos auto-reattach via existing `r2Key` lookup
6. Verify on PC FRT before declaring rescue complete

---

## §8 — Behavioral commitments (NEW canon — from pattern-of-failures conversation)

Captured because Mark explicitly raised these as the structural problem and Claude committed to them:

1. **Default to fewer commits per session, not more.** Stop reaching for "yes" on "any budget for more pushes?" The bias toward shipping is wrong for a single-developer, no-test codebase running on field-critical hardware.

2. **No commits to sync engine, merge engine, IDB save path, or upload pipeline** without Mark actively watching when next in the field. Off-limits except in named "harden-the-foundation" sessions.

3. **Stop calling sync-engine commits "scope-minimal."** They're never that. The framing itself was wrong in S155 and likely contributed to today's incident.

4. **Honor hard rules from Mark** if he sets them (e.g., "no sync-engine commits without a tablet in hand").

5. **Push back harder when proposing to ship**, especially before Mark goes into the field next day.

6. **Don't claim "syntax OK" or "node --check passed" as validation.** Those only catch typos. They are not quality gates for behavior.

7. **Honest disagreement with Mark is expected and welcomed; sycophancy is not.** Also: don't defensively distinguish "I caused this" from "this happened on my watch" — both carry responsibility.

---

## §9 — Staging environment proposal (referenced — see HANDOFF for full spec)

Mark raised the question "why no test environment?" Claude acknowledged: because Claude never proposed one as a priority. **This is a S156-S158 priority** if Mark green-lights:

1. Staging GitHub Pages deploy (separate URL, separate SW cache namespace)
2. Staging Supabase project OR staging-flagged rows
3. Staging R2 prefix (`staging/<pid>/...`)
4. Pre-flight checklist for sync/merge/IDB/upload commits
5. End-of-session smoke test list

Estimated 2-3 sessions. Mark's expressed view: this is the next priority above feature work.

---

## §10 — Live triad snapshot at S155 close

- **HEAD:** `761985b3` (plus this docs commit landing immediately after)
- **SW:** `arencon-frt-v476`
- **CSS:** `frt.css?v=354` (no CSS change S155)

Folds cleanly into S154 canon pass. Sections that supersede S154:
- §AUTH OVERHAUL → replaced by §2 above
- Any "8h logout" phrasing → corrected by §5
- New §6 (R2 architecture) and §7 (4380.24 incident) are net-new canon
- §8 behavioral commitments are net-new (and important enough to warrant memory updates)

