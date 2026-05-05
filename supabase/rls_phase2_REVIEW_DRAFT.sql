-- ════════════════════════════════════════════════════════════════════════
-- ARENCON — Row-Level Security Phase 2 (S117-D)
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️  REVIEW DRAFT — NOT FOR PRODUCTION DEPLOY YET
--
-- This file contains the proposed RLS policies for ALL non-presence tables.
-- It is checked in for review + staging-environment testing. Do NOT run
-- against production until the staged plan below has been worked through
-- with Mark.
--
-- Why this is multi-session work:
--   1. Every table currently has RLS DISABLED — anon key has full access.
--      Flipping RLS on without policies = total lockout.
--   2. The frontend reads + writes via the user's JWT. Some queries that
--      "happen to work" today rely on no row filtering. We need to prove
--      each one still works under policy enforcement before flipping a
--      table.
--   3. We have no staging Supabase project yet. Mark must either spin one
--      up or accept the risk of test → fix → test against production
--      during a low-traffic window.
--
-- Recommended rollout order:
--   1. profiles               (lowest risk — already has email constraint)
--   2. project_presence       (already deployed in S117-A with policies)
--   3. ai_usage_log           (per-user reads; admin reads all)
--   4. project_members        (membership check is the foundation)
--   5. projects               (depends on project_members)
--   6. tool_data              (heaviest table — depends on projects)
--
-- After each table flip:
--   ✓ Mark exercises FRT and Hub end-to-end
--   ✓ Cross-device sync still works
--   ✓ AI usage log still records
--   ✓ No 401/403 in console
--   If anything breaks: ALTER TABLE <name> DISABLE ROW LEVEL SECURITY;
--   then revisit the failing policy.
--
-- ════════════════════════════════════════════════════════════════════════
-- Helper: is_project_member(p_id) — used by multiple policies
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_project_member(p_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. profiles — every signed-in user can read every profile;
--    each user can only update their own row;
--    only admins can change `role`.
-- ════════════════════════════════════════════════════════════════════════

-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
CREATE POLICY "profiles_update_own_or_admin"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

-- ════════════════════════════════════════════════════════════════════════
-- 2. project_members — read your own memberships + memberships of any
--    project you belong to; admins see all.
-- ════════════════════════════════════════════════════════════════════════

-- ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_visible" ON project_members;
CREATE POLICY "members_select_visible"
  ON project_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_project_member(project_id)
    OR is_admin()
  );

DROP POLICY IF EXISTS "members_insert_admin_or_self" ON project_members;
CREATE POLICY "members_insert_admin_or_self"
  ON project_members FOR INSERT
  WITH CHECK (
    is_admin()
    OR (user_id = auth.uid())  -- allow user to add themselves (rare path; tighten later)
  );

DROP POLICY IF EXISTS "members_update_admin" ON project_members;
CREATE POLICY "members_update_admin"
  ON project_members FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "members_delete_admin_or_self" ON project_members;
CREATE POLICY "members_delete_admin_or_self"
  ON project_members FOR DELETE
  USING (is_admin() OR user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════
-- 3. projects — read any project you're a member of; admins read all.
--    Write requires membership; project deletion admin-only.
-- ════════════════════════════════════════════════════════════════════════

-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_member" ON projects;
CREATE POLICY "projects_select_member"
  ON projects FOR SELECT
  USING (is_project_member(id) OR is_admin());

DROP POLICY IF EXISTS "projects_insert_authenticated" ON projects;
CREATE POLICY "projects_insert_authenticated"
  ON projects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "projects_update_member" ON projects;
CREATE POLICY "projects_update_member"
  ON projects FOR UPDATE
  USING (is_project_member(id) OR is_admin())
  WITH CHECK (is_project_member(id) OR is_admin());

DROP POLICY IF EXISTS "projects_delete_admin" ON projects;
CREATE POLICY "projects_delete_admin"
  ON projects FOR DELETE
  USING (is_admin());

-- ════════════════════════════════════════════════════════════════════════
-- 4. tool_data — read/write requires project membership.
--    Heavy table; this is the policy most likely to surprise. Test:
--      ✓ FRT loads existing project
--      ✓ FRT pushes saves
--      ✓ Cross-device sync (two devices, same project, same user)
--      ✓ Multi-user sync (two users, both members of same project)
--      ✓ AI Usage dashboard (admin reads all)
-- ════════════════════════════════════════════════════════════════════════

-- ALTER TABLE tool_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tool_data_select_member" ON tool_data;
CREATE POLICY "tool_data_select_member"
  ON tool_data FOR SELECT
  USING (is_project_member(project_id) OR is_admin());

DROP POLICY IF EXISTS "tool_data_insert_member" ON tool_data;
CREATE POLICY "tool_data_insert_member"
  ON tool_data FOR INSERT
  WITH CHECK (is_project_member(project_id) OR is_admin());

DROP POLICY IF EXISTS "tool_data_update_member" ON tool_data;
CREATE POLICY "tool_data_update_member"
  ON tool_data FOR UPDATE
  USING (is_project_member(project_id) OR is_admin())
  WITH CHECK (is_project_member(project_id) OR is_admin());

DROP POLICY IF EXISTS "tool_data_delete_admin" ON tool_data;
CREATE POLICY "tool_data_delete_admin"
  ON tool_data FOR DELETE
  USING (is_admin());

-- ════════════════════════════════════════════════════════════════════════
-- 5. ai_usage_log — each user sees their own logs; admins see all.
--    Inserts are open to authenticated users; updates/deletes admin-only.
-- ════════════════════════════════════════════════════════════════════════

-- ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_log_select_own_or_admin" ON ai_usage_log;
CREATE POLICY "ai_log_select_own_or_admin"
  ON ai_usage_log FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "ai_log_insert_authenticated" ON ai_usage_log;
CREATE POLICY "ai_log_insert_authenticated"
  ON ai_usage_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

DROP POLICY IF EXISTS "ai_log_update_admin" ON ai_usage_log;
CREATE POLICY "ai_log_update_admin"
  ON ai_usage_log FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "ai_log_delete_admin" ON ai_usage_log;
CREATE POLICY "ai_log_delete_admin"
  ON ai_usage_log FOR DELETE
  USING (is_admin());

-- ════════════════════════════════════════════════════════════════════════
-- 6. app_settings — admin-only writes; authenticated reads.
-- ════════════════════════════════════════════════════════════════════════

-- ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_authenticated" ON app_settings;
CREATE POLICY "settings_select_authenticated"
  ON app_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "settings_write_admin" ON app_settings;
CREATE POLICY "settings_write_admin"
  ON app_settings FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "settings_update_admin" ON app_settings;
CREATE POLICY "settings_update_admin"
  ON app_settings FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "settings_delete_admin" ON app_settings;
CREATE POLICY "settings_delete_admin"
  ON app_settings FOR DELETE
  USING (is_admin());

-- ════════════════════════════════════════════════════════════════════════
-- Test queries (run as a non-admin user via Supabase SQL editor "Run as"
-- feature, or via the FRT in the browser):
--
-- 1. SELECT count(*) FROM profiles;             -- should see all
-- 2. SELECT count(*) FROM projects;             -- only your projects
-- 3. SELECT count(*) FROM tool_data;            -- only data for your projects
-- 4. SELECT count(*) FROM ai_usage_log;         -- only your own
-- 5. UPDATE profiles SET role='admin' WHERE id=<someone-else-id>;
--                                               -- should fail unless you're admin
-- 6. INSERT INTO tool_data (project_id, ...)
--                                               -- should fail if you're not a
--                                               -- member of that project
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (if any table breaks the FRT after enabling):
--
--   ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;
--
-- This instantly restores anon-key full access. Policies remain defined
-- (next ENABLE re-activates them).
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- End RLS Phase 2 review draft
-- ════════════════════════════════════════════════════════════════════════
