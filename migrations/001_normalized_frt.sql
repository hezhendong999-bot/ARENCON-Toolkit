-- ═════════════════════════════════════════════════════════════════════════
-- ARENCON FRT — Normalized schema migration
-- File: migrations/001_normalized_frt.sql
-- Phase: S126 Phase E pre-flight
-- ═════════════════════════════════════════════════════════════════════════
--
-- Purpose: introduce normalized backend tables for FRT data. Coexist with
-- the existing `tool_data` table — DO NOT modify or migrate `tool_data`
-- here. This migration is additive only.
--
-- Apply: Supabase Dashboard → SQL Editor → paste this whole file → Run.
--
-- Rollback (any time before code starts reading these tables):
--   DROP TABLE IF EXISTS frt_general_deficiencies CASCADE;
--   DROP TABLE IF EXISTS frt_contractors CASCADE;
--   DROP TABLE IF EXISTS frt_photos CASCADE;
--   DROP TABLE IF EXISTS frt_drawings CASCADE;
--   DROP TABLE IF EXISTS frt_projects CASCADE;
--
-- ───────────────────────────────────────────────────────────────────────
-- DEFAULT DECISIONS LOCKED IN HERE (questions you can revisit by editing
-- this file BEFORE applying):
--
--   Q1 Multi-tenant SaaS?         → No. RLS scoped to project members.
--   Q2 Photo cross-project query? → Yes. frt_photos has taken_at column.
--   Q3 Activity log size?         → Inline in scalar_fields JSONB.
--   Q4 Report instances?          → Inline in scalar_fields JSONB.
--   Q5 When does 7-C fire?        → Not decided in schema; runtime flag.
--
-- If any of these are wrong, edit BEFORE applying. After applying, schema
-- changes require a follow-up migration.
-- ───────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════
-- TABLE 1: frt_projects
-- ═════════════════════════════════════════════════════════════════════════
-- One row per FRT instance per project. Replaces the top-level fields of
-- a `tool_data` row where tool_key='frt'. Multi-instance projects
-- (currentFrtInstance > 1) get multiple rows, one per instance_number.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS frt_projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL,                  -- references projects(id)
  instance_number int  NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'draft',  -- draft | review | revision_required | issued
  label           text,                           -- human-readable instance label
  project_info    jsonb,                          -- projectInfo {...} (small)
  signatures      jsonb,                          -- signatures {...} (small)
  scalar_fields   jsonb,                          -- {projectNumber, projectName, client, address,
                                                  --  currentFrtInstance, frtInstances, reportInstances,
                                                  --  activityLog, ...} (everything else top-level)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  UNIQUE (project_id, instance_number)
);

CREATE INDEX IF NOT EXISTS frt_projects_project_id_idx ON frt_projects (project_id);
CREATE INDEX IF NOT EXISTS frt_projects_updated_at_idx ON frt_projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS frt_projects_status_idx     ON frt_projects (status);

-- ═════════════════════════════════════════════════════════════════════════
-- TABLE 2: frt_drawings
-- ═════════════════════════════════════════════════════════════════════════
-- One row per drawing. Drawing identity is a text id ("dwg_..._pgN_xxxx")
-- matching the existing client-side drawing.id, NOT a uuid — preserves
-- back-compat with stored references in markup, pins, photo metadata.
-- Cascade on frt_project delete = drawings auto-cleaned.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS frt_drawings (
  id                text PRIMARY KEY,             -- existing drawing.id ("dwg_..._pgN_xxxx")
  frt_project_id    uuid NOT NULL REFERENCES frt_projects(id) ON DELETE CASCADE,
  name              text,
  fname             text,                          -- original filename (drives scale-guess in S126)
  sort_index        int  NOT NULL DEFAULT 0,
  r2_key            text,                          -- existing drawing.r2Key (JPEG fallback)
  r2_url            text,
  pdf_buf_key       text,                          -- shared across multi-page PDFs
  manifest_url      text,                          -- tile manifest from Azure renderer
  tile_server       text,                          -- redundant for diagnostic
  pdf_tiled         boolean DEFAULT false,
  server_rendered   boolean DEFAULT false,
  -- S126 Phase B markup reference
  markup_r2_key     text,
  markup_r2_url     text,
  markup_count      int  NOT NULL DEFAULT 0,
  markup_bytes      int  NOT NULL DEFAULT 0,
  markup_updated_at timestamptz,
  markup_inspector_id uuid,
  -- Per-drawing inline JSONB. Pins are small (<1KB typically), keep inline.
  calibration       jsonb,
  pins              jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- catchall for unforeseen fields
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frt_drawings_project_idx ON frt_drawings (frt_project_id);
CREATE INDEX IF NOT EXISTS frt_drawings_sort_idx    ON frt_drawings (frt_project_id, sort_index);

-- ═════════════════════════════════════════════════════════════════════════
-- TABLE 3: frt_photos
-- ═════════════════════════════════════════════════════════════════════════
-- One row per photo. Covers both site photos (scope='site') and
-- deficiency photos (scope='deficiency'). defic_id is nullable for site
-- photos. taken_at is a hoisted column (vs JSONB) so cross-project queries
-- like "all photos in March" don't require full-row scans.
--
-- Big design call: photos.id is text (matches client-side photo.id) NOT
-- uuid. Same back-compat reasoning as drawings.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS frt_photos (
  id              text PRIMARY KEY,                          -- existing photo.id
  frt_project_id  uuid NOT NULL REFERENCES frt_projects(id) ON DELETE CASCADE,
  scope           text NOT NULL CHECK (scope IN ('site', 'deficiency', 'response')),
  defic_id        text,                                      -- nullable for site photos
  obs_id          text,                                      -- which observation owns it (deficiency scope)
  drawing_id      text REFERENCES frt_drawings(id) ON DELETE SET NULL,  -- if photo is pinned to drawing
  r2_key          text NOT NULL,
  r2_url          text,
  marked_r2_key   text,                                      -- annotated copy (S25 original/marked rule)
  marked_r2_url   text,
  caption         text,
  taken_at        timestamptz,                               -- EXIF/metadata extracted; nullable
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,        -- catchall: filename, mime, exif, dimensions
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frt_photos_project_idx       ON frt_photos (frt_project_id);
CREATE INDEX IF NOT EXISTS frt_photos_scope_idx         ON frt_photos (frt_project_id, scope);
CREATE INDEX IF NOT EXISTS frt_photos_defic_idx         ON frt_photos (defic_id) WHERE defic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS frt_photos_taken_at_idx      ON frt_photos (taken_at DESC) WHERE taken_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS frt_photos_drawing_idx       ON frt_photos (drawing_id) WHERE drawing_id IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════════
-- TABLE 4: frt_contractors
-- ═════════════════════════════════════════════════════════════════════════
-- One row per contractor on a project. Deficiencies and their nested
-- observations stay inline as JSONB — they're deeply nested and almost
-- always read together with the contractor. Breaking them out would
-- require multi-table joins for every defic render.
--
-- If deficiency-level cross-project queries become a use case ("all
-- outstanding deficiencies across all my projects by code reference"),
-- a future migration can promote deficiencies to their own table.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS frt_contractors (
  id              text PRIMARY KEY,                          -- existing contractor.id
  frt_project_id  uuid NOT NULL REFERENCES frt_projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text,
  sort_index      int  NOT NULL DEFAULT 0,
  deficiencies    jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS frt_contractors_project_idx ON frt_contractors (frt_project_id);

-- ═════════════════════════════════════════════════════════════════════════
-- TABLE 5: frt_general_deficiencies
-- ═════════════════════════════════════════════════════════════════════════
-- General defics (not assigned to a specific contractor). Similar to
-- frt_contractors: observations stay inline.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS frt_general_deficiencies (
  id              text PRIMARY KEY,
  frt_project_id  uuid NOT NULL REFERENCES frt_projects(id) ON DELETE CASCADE,
  observations    jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos          jsonb NOT NULL DEFAULT '[]'::jsonb,       -- pool-style attached photos
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS frt_general_deficiencies_project_idx ON frt_general_deficiencies (frt_project_id);

-- ═════════════════════════════════════════════════════════════════════════
-- updated_at triggers
-- ═════════════════════════════════════════════════════════════════════════
-- Auto-touch updated_at on every UPDATE so Hub/FRT can compare against a
-- per-row timestamp for "is cloud newer than my local copy?" checks.
-- Matches the tool_data table's existing behavior.
-- ═════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION frt_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS frt_projects_touch ON frt_projects;
CREATE TRIGGER frt_projects_touch
  BEFORE UPDATE ON frt_projects
  FOR EACH ROW EXECUTE FUNCTION frt_touch_updated_at();

DROP TRIGGER IF EXISTS frt_drawings_touch ON frt_drawings;
CREATE TRIGGER frt_drawings_touch
  BEFORE UPDATE ON frt_drawings
  FOR EACH ROW EXECUTE FUNCTION frt_touch_updated_at();

-- frt_photos has no updated_at (photos are immutable post-creation; marked
-- copies are separate r2 keys, not updates).

-- ═════════════════════════════════════════════════════════════════════════
-- Row Level Security policies
-- ═════════════════════════════════════════════════════════════════════════
-- Scoping model: a user can read/write FRT rows if they're a member of
-- the parent project. Membership lookup uses the existing project_members
-- table (assumed already present and used by tool_data RLS).
--
-- If the project_members table is named differently in your Supabase or
-- the column names don't match, edit BEFORE applying.
--
-- These policies match the pattern of existing tool_data policies in
-- spirit (project-scoped read/write) without copying them verbatim — your
-- actual tool_data policies should be inspected with `\d+ tool_data` in
-- the SQL editor before assuming this is right for your setup.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE frt_projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE frt_drawings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE frt_photos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE frt_contractors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE frt_general_deficiencies ENABLE ROW LEVEL SECURITY;

-- Helper view: a user_id has access to a project if they're in
-- project_members. Adjust table/column names if your schema differs.
--
-- TEMPORARY conservative policies: only the row creator AND
-- project_members can access. If your project_members table is named
-- differently, replace `project_members` and `user_id` accordingly.

-- frt_projects
DROP POLICY IF EXISTS frt_projects_member_read  ON frt_projects;
DROP POLICY IF EXISTS frt_projects_member_write ON frt_projects;

CREATE POLICY frt_projects_member_read ON frt_projects
  FOR SELECT
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = frt_projects.project_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY frt_projects_member_write ON frt_projects
  FOR ALL
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = frt_projects.project_id
      AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = frt_projects.project_id
      AND pm.user_id = auth.uid()
    )
  );

-- frt_drawings: inherit access from parent frt_project
DROP POLICY IF EXISTS frt_drawings_parent_access ON frt_drawings;
CREATE POLICY frt_drawings_parent_access ON frt_drawings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_drawings.frt_project_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_drawings.frt_project_id
    )
  );
-- Note: the frt_projects existence check transitively enforces RLS
-- because the user must be able to see the parent row for the EXISTS to
-- return true. Cleaner than re-implementing the membership check here.

-- frt_photos
DROP POLICY IF EXISTS frt_photos_parent_access ON frt_photos;
CREATE POLICY frt_photos_parent_access ON frt_photos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_photos.frt_project_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_photos.frt_project_id
    )
  );

-- frt_contractors
DROP POLICY IF EXISTS frt_contractors_parent_access ON frt_contractors;
CREATE POLICY frt_contractors_parent_access ON frt_contractors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_contractors.frt_project_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_contractors.frt_project_id
    )
  );

-- frt_general_deficiencies
DROP POLICY IF EXISTS frt_general_deficiencies_parent_access ON frt_general_deficiencies;
CREATE POLICY frt_general_deficiencies_parent_access ON frt_general_deficiencies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_general_deficiencies.frt_project_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM frt_projects p
      WHERE p.id = frt_general_deficiencies.frt_project_id
    )
  );

-- ═════════════════════════════════════════════════════════════════════════
-- POST-APPLY VERIFICATION
-- ═════════════════════════════════════════════════════════════════════════
-- After running this migration, the validation HTML page
-- (validate_normalized_schema.html) connects to Supabase and confirms:
--   - All 5 tables exist
--   - All expected columns are present with correct types
--   - All foreign keys are wired
--   - RLS is enabled on each table
-- ═════════════════════════════════════════════════════════════════════════

-- END migration 001_normalized_frt.sql
