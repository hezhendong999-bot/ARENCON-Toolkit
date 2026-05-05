-- ════════════════════════════════════════════════════════════════════════
-- ARENCON FRT — Presence Heartbeat (S117-A)
-- ════════════════════════════════════════════════════════════════════════
--
-- Deploy via Supabase dashboard → SQL editor → Run.
--
-- After running this once, the FRT client will start emitting heartbeats
-- automatically (already shipped in Session 117). No client code change
-- needed once the table exists.
--
-- Replaces v1's softLock (which silently disabled UI for 20-min idle).
-- Presence is informational ONLY — does not block writes. Last-write-wins
-- still governs concurrent edits via the existing _cloudSyncedAt mechanism.
--
-- Cleanup of stale rows: handled implicitly by the client query, which
-- filters last_seen > NOW() - INTERVAL '90 seconds'. No cron needed.
-- Old rows stay in the table but never appear in presence chips.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_presence (
  user_id    UUID NOT NULL,
  project_id UUID NOT NULL,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  full_name  TEXT,
  PRIMARY KEY (user_id, project_id)
);

-- Index for fast "who's in this project" lookups
CREATE INDEX IF NOT EXISTS idx_project_presence_project_lastseen
  ON project_presence (project_id, last_seen DESC);

ALTER TABLE project_presence ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can SEE who else is in a project
DROP POLICY IF EXISTS "presence_select_all" ON project_presence;
CREATE POLICY "presence_select_all"
  ON project_presence FOR SELECT
  USING (auth.role() = 'authenticated');

-- Each user can ONLY upsert their own row
DROP POLICY IF EXISTS "presence_insert_own" ON project_presence;
CREATE POLICY "presence_insert_own"
  ON project_presence FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "presence_update_own" ON project_presence;
CREATE POLICY "presence_update_own"
  ON project_presence FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Each user can clear their own presence on sign-out
DROP POLICY IF EXISTS "presence_delete_own" ON project_presence;
CREATE POLICY "presence_delete_own"
  ON project_presence FOR DELETE
  USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════
-- Verify the deploy:
--
--   SELECT * FROM project_presence ORDER BY last_seen DESC LIMIT 10;
--
-- Should return 0 rows immediately, then start populating once a Hub-mode
-- FRT session begins emitting heartbeats.
-- ════════════════════════════════════════════════════════════════════════
