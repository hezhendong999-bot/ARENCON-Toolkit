# Session 114 Handoff — Phase 2 Foundation: `user_profiles`, soft-delete columns, DIY backup Worker

**Read this entire document before writing any code.** Then state your plan and wait for Mark's approval before pushing.

**Date:** 2026-05-02 (written at end of S113)
**Previous session:** S113 (aggressive iOS removal + Android production-grade tuning, shipped clean across two pushes — `7805a1f9`, `37e72d48`)
**Current state:** Stable at commit `37e72d48`, SW cache `arencon-frt-v247`
**This session's scope:** Build the security foundation that Phases 3–4 (RLS) depend on. NO backend platform changes — still on Free-tier Supabase. Three deliverables: (1) `user_profiles` table + role enum, (2) soft-delete columns + UI rewiring, (3) DIY backup Worker. Strategic Roadmap Phase 2.

---

## Why this session matters

Phase 3 (Sessions 116–118) writes the RLS policies that make this a multi-user system safe to scale. RLS policies need to read the user's role somewhere, and that "somewhere" is the table built in Session 114. Without `user_profiles`, every RLS policy degenerates into "is this user logged in?" — which doesn't differentiate admins from staff, and gives every staff user the same access level as Mark.

Soft-delete columns (Session 115 will finish wiring the UI; this session adds the columns and updates the read paths) are also a Phase-3 dependency. RLS for the trash view ("admins can see soft-deleted rows; staff can't") requires the `deleted_at` column to exist before any policy can reference it.

The DIY backup Worker is independent of RLS but belongs in this phase because Free-tier Supabase has no automated backups, and once we start writing migrations that change schema or wire up RLS, having a recent snapshot of every table on R2 is non-negotiable.

---

## Decisions locked

These are decided — do not re-debate during S114:

1. **Free-tier Supabase stays.** Pro upgrade is gated on RLS production cutover (~S119). Free tier does what we need for Phase 2.
2. **Role enum is exactly four values:** `admin`, `interim_admin`, `staff`, `read_only`. Default for new signups: `staff`. `interim_admin` exists so Mark can grant temporary admin powers to Leslie or Shaun without committing them to permanent admin. `read_only` is for clients/AHJs who should be able to view but not edit.
4. **Soft-delete is per-row `deleted_at TIMESTAMPTZ NULL`.** Not a separate audit table. Restoring is `UPDATE … SET deleted_at = NULL`. Hard delete (Trash → Empty) is a separate admin-only action that runs `DELETE`.
5. **Backup Worker uses cron triggers + R2 Object Storage**, not Supabase's pg_dump endpoint (Free tier doesn't expose it). The Worker queries each table via the REST API with the service_role key, serializes to JSON, and uploads to a date-keyed prefix. Weekly cadence to start; can move to nightly later if needed.
6. **Soft-deleted rows still count toward Free-tier row caps.** Acceptable for the foreseeable future. If counts ever pressure the cap, a later session adds a "permanent purge after N days" cron.

---

## State at start of session

### Live commit
```
37e72d48  Session 113 Push 2: Android production-grade tile pool + markup canvas
SW cache: arencon-frt-v247
```

### What's working (post-S113)

- Canvas-per-level tile compositor as unconditional default — no L2 fit-zoom seam
- Markup canvas at 25 Mpx on desktop AND Android tablets — crisp pen strokes at every zoom
- Tile pool at 800 / 6 concurrent — no platform branches
- All iOS-specific code stripped; supported toggles down to `?dbg=1`, `?s99test=img`, `?webgl=0/1`, `localStorage.ARENCON_NoWebGL`
- Pin renderer reads from `dv-img-wrap` on tile drawings (S112b fix preserved)
- Markup canvases at z-index:5 (S112 hotfix preserved)

### What's not in scope this session (deferred)

- Markup eraser hit-test miss on text/shapes
- Selection rotation pivot wrong
- Selection box doesn't follow rotated objects
- Edge-tile 404s at L3 on `dwg_1776631552442_pg2_yy4m`
- L2 tile grid (likely already gone with canvas mode — verify casually but don't open the box)
- Hub→FRT v2 link wiring

### Rollback target
If anything in this session goes catastrophically wrong, safe revert is **commit `37e72d48`** (current S113 final state). DB-level rollback is per-migration: keep each `apply_migration` reversible, and prepare a paired DOWN migration before applying the UP.

---

## What this session must accomplish

### A. `user_profiles` table + role enum + admin UI

#### A1. Migration: create role enum + table + auth-trigger

Migration name suggestion: `s114_user_profiles`. Apply via Supabase MCP `apply_migration`.

```sql
-- Role enum
CREATE TYPE user_role AS ENUM ('admin', 'interim_admin', 'staff', 'read_only');

-- Profiles table (1:1 with auth.users)
CREATE TABLE public.user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        user_role NOT NULL DEFAULT 'staff',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_profiles_updated
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile row on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'staff');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

After migration, **manually backfill** Mark's row with `role = 'admin'`. Other existing users default to `staff` (run a single UPDATE if any need elevation).

#### A2. Hub admin UI

In `ARENCON_Project_Hub.html`, add an admin-only modal (gated by the user's `role === 'admin'`) accessible from the existing `👤 Admin` button (currently shows the existing supabase-admin tools page).

Minimal scope for S114:
- Read all rows from `user_profiles` joined with `auth.users.email`
- Show table: email · full_name · role (dropdown) · created_at
- Save button per row writes back to `user_profiles`
- "Reset password" button per row triggers Supabase password-reset email
- Search/filter input

Defer to a later session: bulk role changes, role audit log, last-login column.

#### A3. Role gating on existing Hub buttons

Three buttons in the Hub header currently use `display:none` toggles based on session-only logic. Wire them to `user_profiles.role`:
- `btn-admin` — visible for `admin` and `interim_admin`
- `btn-aiusage` — visible for `admin` and `interim_admin` (ARENCON spend visibility)
- `btn-profile` — visible for everyone (so users can edit their own `full_name`)

Add a small `_loadCurrentProfile()` function that runs after `tryRestoreSession()` succeeds, fetches the row, caches it, and exposes `_currentRole` to the UI gates.

### B. Soft-delete columns + read-path filter

#### B1. Migration: add `deleted_at` columns

Migration name: `s114_soft_delete_columns`. Add `deleted_at TIMESTAMPTZ NULL` to:
- `projects`
- `drawings`
- `deficiencies`
- `photos`
- `tool_data`

```sql
ALTER TABLE public.projects     ADD COLUMN deleted_at TIMESTAMPTZ NULL;
ALTER TABLE public.drawings     ADD COLUMN deleted_at TIMESTAMPTZ NULL;
ALTER TABLE public.deficiencies ADD COLUMN deleted_at TIMESTAMPTZ NULL;
ALTER TABLE public.photos       ADD COLUMN deleted_at TIMESTAMPTZ NULL;
ALTER TABLE public.tool_data    ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Indexes for the WHERE deleted_at IS NULL hot path
CREATE INDEX idx_projects_active     ON public.projects     (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_drawings_active     ON public.drawings     (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_deficiencies_active ON public.deficiencies (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_active       ON public.photos       (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tool_data_active    ON public.tool_data    (deleted_at) WHERE deleted_at IS NULL;
```

#### B2. Update read paths

Every existing client query against the five tables above must filter `WHERE deleted_at IS NULL`. Touch points:
- `ARENCON_Project_Hub.html` — project list, project detail load, photo gallery
- `ARENCON_Field_Review_Tool.html` — `loadFullProject()`, `_csCloudSyncPull()`
- `ARENCON_Diesel_Fire_Pump_Commissioning.html` — `loadFullProject()`
- `ARENCON_Electric_Fire_Pump_Commissioning.html` — `loadFullProject()`

Use grep for `.from('projects').select`, `.from('drawings').select`, etc. and add the filter to each. Any query that doesn't filter is a bug (it leaks soft-deleted rows into the active view).

#### B3. UI rewiring (delete buttons → soft delete)

Repurpose the existing delete buttons to set `deleted_at = NOW()` instead of running `DELETE`. The Hub's existing "Trash" UI is built but currently uses a `trashed = true` boolean — migrate that to `deleted_at IS NOT NULL` semantics.

Hard delete (`DELETE FROM …`) becomes admin-only, surfaced via a new "Empty Trash" button in the Trash view. Hard delete also needs to clean up R2 — keep that orchestration in the existing `_csCloudSync*` paths.

**This is a lot.** S115 was the original scope for this rewiring. If A and C land cleanly in S114 and B1 lands as a migration only, defer B2 + B3 to S115. Note this as a fork point in your plan when you state it.

### C. DIY backup Worker

#### C1. Worker source

New Cloudflare Worker, separate from `arencon-r2-worker` and `arencon-ai-worker`. Suggested name: `arencon-backup-worker`. Triggered by Cron (Cloudflare Workers scheduled events), weekly Sunday 06:00 UTC.

```js
// arencon-backup-worker — weekly Supabase → R2 snapshot
// Tables: projects, drawings, deficiencies, photos, tool_data, user_profiles
// Output:  arencon-files/backups/YYYY-MM-DD/{table}.json
// Auth:    SUPABASE_SERVICE_ROLE_KEY env var (set in Worker dashboard, NOT in source)

const TABLES = ['projects','drawings','deficiencies','photos','tool_data','user_profiles'];

export default {
  async scheduled(event, env, ctx) {
    const date = new Date().toISOString().slice(0, 10);
    const errors = [];

    for (const tbl of TABLES) {
      try {
        const rows = await fetchAll(env, tbl);
        const key = `backups/${date}/${tbl}.json`;
        await env.BUCKET.put(key, JSON.stringify({
          table: tbl,
          capturedAt: new Date().toISOString(),
          rowCount: rows.length,
          rows
        }), { httpMetadata: { contentType: 'application/json' } });
      } catch (err) {
        errors.push(`${tbl}: ${err.message}`);
      }
    }

    if (errors.length) {
      // Optional: post to a Slack webhook so Mark sees backup failures
      console.error('Backup errors:', errors);
    }
  }
};

async function fetchAll(env, tbl) {
  // Paginate at 1000 rows/page — Supabase REST limit.
  let all = [], from = 0, page = 1000;
  while (true) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${tbl}?select=*`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${from}-${from + page - 1}`,
        'Range-Unit': 'items',
      }
    });
    if (!res.ok) throw new Error(`${tbl} fetch ${res.status}`);
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < page) break;
    from += page;
  }
  return all;
}
```

#### C2. Wrangler config

```toml
# wrangler.toml — arencon-backup-worker
name = "arencon-backup-worker"
main = "worker.js"
compatibility_date = "2026-04-01"

[triggers]
crons = ["0 6 * * 0"]  # Sundays 06:00 UTC

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "arencon-files"

[vars]
SUPABASE_URL = "https://xsemvinxsyphjiaqgywv.supabase.co"
# SUPABASE_SERVICE_ROLE_KEY set as a SECRET via the Cloudflare dashboard,
# NOT in this file or in source control.
```

#### C3. Manual deploy

Cloudflare Workers don't auto-deploy from GitHub. Mark deploys via the Workers dashboard:
1. Create the new Worker named `arencon-backup-worker`
2. Paste the `worker.js` source
3. Set `SUPABASE_SERVICE_ROLE_KEY` as a Secret (NOT a plain env var)
4. Bind R2 bucket `arencon-files`
5. Add cron trigger `0 6 * * 0`
6. Manually trigger once via the dashboard's "Send test event" to verify it produces `backups/YYYY-MM-DD/projects.json` etc. on R2

#### C4. Verification

After first manual run, list R2 contents under `backups/` to confirm all six JSON files exist and contain plausible row counts. Open one with `jq '.rowCount'` to sanity-check.

---

## Critical patterns to preserve (from earlier sessions)

These are NOT scope for this session — leave them alone:
- `?s99test=img` escape hatch
- `_dbgLife()` LIFE ring buffer + `?dbg=1`
- Recursive `go(pg)` PDF upload pattern
- `_createDeficPhotoFromSource()` R2 upload pattern
- WebGL pin renderer's `dv-img-wrap` rect lookup in `viewer.js`
- z-index:5 on `#markup-canvas` / `#markup-overlay` / `#markup-webgl-canvas`
- Canvas-per-level tile compositor as default

## Hard rules (from project knowledge)

- Never replace `.main-wrap` innerHTML with a loading spinner
- Never convert drawing/photo blobs at `loadFullProject()` time — always lazy
- Never use `quadraticCurveTo` in pen/highlight strokes
- Never use `OffscreenCanvas`
- Never stack highlighter opacity
- Never auto-select a shape after drawing it
- PDF upload handlers (recursive `go(pg)`) — NEVER rewrite
- Escape in drawing viewer cancels tool/copy mode ONLY — never closes viewer
- `beforeunload` in Hub mode: suppress via URL param check, not `_csHubMode` flag
- One `ask_user_input` widget per turn, max 1 question — NO EXCEPTIONS
- Hover-reveal buttons MUST include `@media(pointer:coarse)`

## Tone & workflow

- Mark wants direct, concise responses. No filler.
- Read all uploaded files completely before any code work.
- State a plan and wait for approval before writing.
- Surgical `str_replace` edits only, never full-file rewrites mid-session.
- After every JS change: extract scripts → `node --check` → exit 0 required.
- After every CSS change: count `{` vs `}` — must balance.
- Push to GitHub via API at end of session. Cloudflare Worker deploys are manual via dashboard.

---

## Recommended push order

1. **Push 1 — `user_profiles` migration + auth trigger.** Apply via Supabase MCP. Verify Mark's row exists with `role='admin'` (manual UPDATE if needed). No client code changes yet — just schema.
2. **Verification stop:** Mark logs out and back in to Hub. Confirm session restore still works (the auth trigger fires on signup, not on login, so existing users need a manual backfill).
3. **Push 2 — Hub admin UI + role gating on header buttons.** Single Hub commit. SW bump.
4. **Verification stop:** Mark confirms admin modal lists users, role dropdown saves cleanly, header buttons toggle correctly when he flips his own role to `staff` and back.
5. **Push 3 — Soft-delete migration (B1).** Schema only — adds `deleted_at` columns + indexes. No client changes. Defer B2/B3 to S115 unless time permits.
6. **Push 4 (optional, if time) — B2 read-path filter.** Add `WHERE deleted_at IS NULL` to every client query against the five tables.
7. **Cloudflare Worker deploy (out-of-band):** Mark deploys `arencon-backup-worker` via dashboard. Verify cron output on R2.
8. **Final:** Session 115 handoff written for next session (defaults to "complete soft-delete UI rewiring + Trash view if S114 didn't get to B2/B3, otherwise start RLS Phase 3").

---

## Files to upload to S114 chat

When Mark starts the new session, he uploads:
- `HANDOFF_SESSION_114.md` (this file)
- `ARENCON_Strategic_Roadmap.md`
- `ARENCON_Project_Knowledge.md` (the merged-S112+S113 version)
- `ARENCON_Style_Guide_v120.css`
- `ARENCON_Project_Hub.html` (current state — for the admin UI work)
- `ARENCON_Field_Review_Tool.html`, `ARENCON_Diesel_Fire_Pump_Commissioning.html`, `ARENCON_Electric_Fire_Pump_Commissioning.html` (only needed if doing B2 read-path filter)

Claude can pull current versions from GitHub at HEAD if any are missing or stale.

---

## What success looks like at end of S114

- `user_profiles` table exists in Supabase with role enum, created_at/updated_at, and the auth.users → user_profiles auto-create trigger active
- Mark's row in `user_profiles` has `role='admin'`
- Hub admin modal lists all users + lets Mark change roles
- `btn-admin`, `btn-aiusage`, `btn-profile` in Hub header gate on `role`
- `deleted_at` columns exist on the 5 tables with proper indexes
- (Stretch) Read paths in Hub + 3 tools filter `WHERE deleted_at IS NULL`
- `arencon-backup-worker` deployed and verified producing weekly snapshots on R2
- S115 handoff written

---

## End of handoff

Read this. State your plan. Wait for Mark's approval. Then push.
