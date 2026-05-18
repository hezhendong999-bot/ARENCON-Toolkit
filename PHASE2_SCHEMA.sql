-- ============================================================================
-- ARENCON TRAINING CENTER — PHASE2_SCHEMA.sql
-- Schema of record (Phase 1 + Phase 2). Roadmap v4 §4. Slice 1a.
--
-- IDEMPOTENT + NON-DESTRUCTIVE: safe to apply against the live DB.
--   - Existing objects (tc_is_admin, tc_courses, tc_modules, tc_progress and
--     their live policies) are re-asserted with IF NOT EXISTS / DROP..IF EXISTS
--     + CREATE so re-running is a no-op for what already exists.
--   - No DROP TABLE / DROP COLUMN anywhere. Existing rows are not touched.
--   - tc_progress and tc_modules.quiz are left in place (superseded by
--     tc_attempts / tc_modules.question_bank; retired at Slice 1b/1c, NOT here).
--
-- Apply via Supabase connector as a single migration (transactional), then
-- commit this file to the repo. This file ALSO closes the missing
-- PHASE1_SCHEMA.sql gap (it is the complete replayable schema).
--
-- created_by / answered_by / signed_off_by / user_id: the client NEVER sends
-- these. They are set server-side (Edge Function service role, from the JWT)
-- or by admin action. Known FRT/TC failure mode: client-sent created_by =
-- FK/RLS reject.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Admin gate helper (re-assert; identical to live definition)
-- ----------------------------------------------------------------------------
create or replace function public.tc_is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin','admin')
  );
$$;

-- ============================================================================
-- 1. PHASE 1 TABLES — re-asserted for completeness (no-op on live DB)
-- ============================================================================

create table if not exists public.tc_courses (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'general',
  description text,
  sort_order  int default 0,
  status      text default 'active',
  created_by  uuid references public.profiles(id),   -- client NEVER sends
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.tc_modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references public.tc_courses(id),
  title       text not null,
  description text,
  source_type text,            -- Phase-1 legacy (superseded by attachments)
  source_url  text,            -- Phase-1 legacy
  source_text text,            -- Phase-1 legacy
  quiz        jsonb,           -- Phase-1 legacy (superseded by question_bank)
  sort_order  int default 0,
  status      text default 'active',
  created_by  uuid references public.profiles(id),   -- client NEVER sends
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.tc_progress (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id),
  module_id  uuid not null references public.tc_modules(id),
  viewed     boolean default false,
  quiz_score int,
  quiz_data  jsonb,
  attempts   int default 0,
  updated_at timestamptz default now()
);
-- NOTE: tc_progress is Phase-1 learner state, superseded by tc_attempts
-- (P2 full history). Left intact (0 rows in prod). Retire decision deferred
-- to Slice 1c — NOT dropped here.

alter table public.tc_courses  enable row level security;
alter table public.tc_modules  enable row level security;
alter table public.tc_progress enable row level security;

-- Re-assert live policies (idempotent; identical to current live definitions)
drop policy if exists tc_courses_read  on public.tc_courses;
drop policy if exists tc_courses_write on public.tc_courses;
create policy tc_courses_read  on public.tc_courses for select to authenticated using (true);
create policy tc_courses_write on public.tc_courses for all    to authenticated using (tc_is_admin()) with check (tc_is_admin());

drop policy if exists tc_modules_read  on public.tc_modules;
drop policy if exists tc_modules_write on public.tc_modules;
create policy tc_modules_read  on public.tc_modules for select to authenticated using (true);
create policy tc_modules_write on public.tc_modules for all    to authenticated using (tc_is_admin()) with check (tc_is_admin());

drop policy if exists tc_progress_ins on public.tc_progress;
drop policy if exists tc_progress_sel on public.tc_progress;
drop policy if exists tc_progress_upd on public.tc_progress;
create policy tc_progress_ins on public.tc_progress for insert to authenticated with check (user_id = auth.uid());
create policy tc_progress_sel on public.tc_progress for select to authenticated using (user_id = auth.uid() or tc_is_admin());
create policy tc_progress_upd on public.tc_progress for update to authenticated using (user_id = auth.uid());

-- ============================================================================
-- 2. PHASE 2 — tc_modules extension (roadmap §4, P0 attachment container)
-- ============================================================================
-- attachments: typed list (P0) — never assume one media type. Element shape:
--   { kind:'video_link'|'pdf'|'drawing'|'photo'|'tool_link'
--          |'recording_link'|'text',
--     label, url_or_r2key, source_type, processing_status }
--   (P8: video/recordings stored now as processing_status='awaiting_transcript')
-- question_bank: array of bank items (P3). Item shape:
--   { id, type:'fact'|'judgment', topic, q, opts[4], answer, why,
--     ai_original (provenance, never shown), instructor_note,
--     code_ref, review_by, confusion_score (derived),
--     status:'active'|'retired' }
-- topics: Mark-approved topic list (§9 — accurate gap analysis needs
--   Mark-approved topics, not AI-invented).

alter table public.tc_modules add column if not exists attachments    jsonb not null default '[]'::jsonb;
alter table public.tc_modules add column if not exists question_bank  jsonb not null default '[]'::jsonb;
alter table public.tc_modules add column if not exists topics         jsonb not null default '[]'::jsonb;
alter table public.tc_modules add column if not exists draw_size      int  not null default 10;   -- §7
alter table public.tc_modules add column if not exists pass_threshold int  not null default 70;
alter table public.tc_modules add column if not exists review_by      date;                       -- P9 staleness
alter table public.tc_modules add column if not exists code_ref       text;                       -- P9 staleness

-- ============================================================================
-- 3. tc_attempts — P2 full attempt history (NEVER overwritten)
-- ============================================================================
-- P2: every attempt is its own row. DELIBERATELY NO unique constraint on
--     (user_id, module_id) — the old learner bug was an upsert against a
--     constraint that should not exist.
-- P4/§5: this table is EDGE-FUNCTION-MEDIATED. No client write policy exists
--     (RLS on + no permissive write policy = deny). The training-quiz EF
--     (service role) creates/heartbeats/answers/submits/grades. Client SELECT
--     is restricted to completed attempts so the `asked` snapshot (which
--     contains correct answers, for P2 historical-scoring integrity) cannot
--     be harvested mid-attempt.

create table if not exists public.tc_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id),   -- EF sets from JWT
  module_id         uuid not null references public.tc_modules(id),
  started_at        timestamptz default now(),
  last_heartbeat_at timestamptz default now(),                      -- §7 ~15s heartbeat
  submitted_at      timestamptz,
  duration_sec      int,                                            -- P5 silent
  score             int,
  total             int,
  asked             jsonb not null default '[]'::jsonb,             -- VERBATIM snapshot (P2)
  answers           jsonb not null default '{}'::jsonb,
  confidence        jsonb not null default '{}'::jsonb,             -- per-Q sure/not-sure
  focus_events      jsonb not null default '[]'::jsonb,             -- P5 silent
  status            text not null default 'in_progress'
                      check (status in ('in_progress','interrupted','abandoned','completed')),
  created_at        timestamptz default now()
);

create index if not exists tc_attempts_user_module_idx on public.tc_attempts(user_id, module_id);
create index if not exists tc_attempts_module_status_idx on public.tc_attempts(module_id, status);
create index if not exists tc_attempts_resume_idx on public.tc_attempts(status, last_heartbeat_at);

alter table public.tc_attempts enable row level security;

-- NO client INSERT/UPDATE/DELETE policy by design (EF service role only).
drop policy if exists tc_attempts_sel on public.tc_attempts;
create policy tc_attempts_sel on public.tc_attempts for select to authenticated
  using ((user_id = auth.uid() and status = 'completed') or tc_is_admin());

-- ============================================================================
-- 4. tc_questions_feedback — "bad question/answer" → curation queue (P7/§8)
-- ============================================================================
-- question_id is the bank item's text id (bank lives in jsonb, not a table),
-- so it is plain text, NOT a foreign key.

create table if not exists public.tc_questions_feedback (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid references public.tc_attempts(id),
  question_id text,
  user_id     uuid not null references public.profiles(id),   -- EF/self
  kind        text,
  comment     text,
  status      text not null default 'open'
                check (status in ('open','reviewed','actioned','dismissed')),
  created_at  timestamptz default now()
);

create index if not exists tc_qfeedback_status_idx on public.tc_questions_feedback(status);

alter table public.tc_questions_feedback enable row level security;
drop policy if exists tc_qfeedback_ins on public.tc_questions_feedback;
drop policy if exists tc_qfeedback_sel on public.tc_questions_feedback;
drop policy if exists tc_qfeedback_upd on public.tc_questions_feedback;
create policy tc_qfeedback_ins on public.tc_questions_feedback for insert to authenticated with check (user_id = auth.uid());
create policy tc_qfeedback_sel on public.tc_questions_feedback for select to authenticated using (user_id = auth.uid() or tc_is_admin());
create policy tc_qfeedback_upd on public.tc_questions_feedback for update to authenticated using (tc_is_admin()) with check (tc_is_admin());

-- ============================================================================
-- 5. tc_tickets — "Ask a Question" (Slice 5; schema seeded now, §4)
-- ============================================================================
-- NO person's name in schema/UI: ownership/routing is user_id (uuid) only;
-- the UI must never surface identity. Publish state seeds the future
-- answered-Q&A → module-generation flywheel without auto-publishing
-- unvetted content.

create table if not exists public.tc_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),   -- owner link, NOT a name
  module_id   uuid references public.tc_modules(id),
  question_id text,
  subject     text,
  body        text,
  status      text not null default 'open'
                check (status in ('open','answered','closed')),
  visibility  text not null default 'private'
                check (visibility in ('private','answered','published')),
  answer_body text,
  answered_by uuid references public.profiles(id),            -- admin, server-set
  answered_at timestamptz,
  attachments jsonb not null default '[]'::jsonb,             -- R2 keys + external links
  follow_ups  jsonb not null default '[]'::jsonb,
  created_at  timestamptz default now()
);

create index if not exists tc_tickets_status_idx on public.tc_tickets(status);
create index if not exists tc_tickets_user_idx   on public.tc_tickets(user_id);

alter table public.tc_tickets enable row level security;
drop policy if exists tc_tickets_ins on public.tc_tickets;
drop policy if exists tc_tickets_sel on public.tc_tickets;
drop policy if exists tc_tickets_upd on public.tc_tickets;
create policy tc_tickets_ins on public.tc_tickets for insert to authenticated with check (user_id = auth.uid());
create policy tc_tickets_sel on public.tc_tickets for select to authenticated
  using (user_id = auth.uid() or visibility = 'published' or tc_is_admin());
create policy tc_tickets_upd on public.tc_tickets for update to authenticated using (tc_is_admin()) with check (tc_is_admin());

-- ============================================================================
-- 6. tc_style_corpus — P11 voice/judgment grounding (admin-only, internal)
-- ============================================================================
-- Injected into EVERY AI text-generation prompt (EF reads via service role,
-- bypassing RLS). Never learner-facing → admin read+write only.
-- source: 'mark_authored' = hand-seeded; 'from_edit' = P7 flywheel
-- (Mark's curation edits captured as the next exemplar).

create table if not exists public.tc_style_corpus (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null
               check (kind in ('phrasing','term_required','term_forbidden',
                               'tone','deficiency_pattern','exemplar')),
  content    text not null,
  source     text not null default 'mark_authored'
               check (source in ('mark_authored','from_edit')),
  created_at timestamptz default now()
);

create index if not exists tc_style_corpus_kind_idx on public.tc_style_corpus(kind);

alter table public.tc_style_corpus enable row level security;
drop policy if exists tc_style_corpus_read  on public.tc_style_corpus;
drop policy if exists tc_style_corpus_write on public.tc_style_corpus;
create policy tc_style_corpus_read  on public.tc_style_corpus for select to authenticated using (tc_is_admin());
create policy tc_style_corpus_write on public.tc_style_corpus for all    to authenticated using (tc_is_admin()) with check (tc_is_admin());

-- ============================================================================
-- 7. tc_competency_signoff — Phase-5 seed (schema only). §4
-- ============================================================================
-- The only metric that proves the system works rather than generating
-- activity. §4 "topic/module" → nullable module_id + nullable topic,
-- CHECK at least one present. "demonstrated_on" read as a description of
-- what was demonstrated; the date column is signoff_date (avoids the
-- reserved word `date`).

create table if not exists public.tc_competency_signoff (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id),
  module_id       uuid references public.tc_modules(id),
  topic           text,
  signed_off_by   uuid references public.profiles(id),          -- admin, server-set
  demonstrated_on text,                                          -- what was demonstrated
  signoff_date    date default current_date,
  created_at      timestamptz default now(),
  constraint tc_competency_signoff_target_ck
    check (module_id is not null or topic is not null)
);

create index if not exists tc_competency_user_idx on public.tc_competency_signoff(user_id);

alter table public.tc_competency_signoff enable row level security;
drop policy if exists tc_competency_sel on public.tc_competency_signoff;
drop policy if exists tc_competency_ins on public.tc_competency_signoff;
drop policy if exists tc_competency_upd on public.tc_competency_signoff;
create policy tc_competency_sel on public.tc_competency_signoff for select to authenticated using (user_id = auth.uid() or tc_is_admin());
create policy tc_competency_ins on public.tc_competency_signoff for insert to authenticated with check (tc_is_admin());
create policy tc_competency_upd on public.tc_competency_signoff for update to authenticated using (tc_is_admin()) with check (tc_is_admin());

commit;

-- ============================================================================
-- END. Apply this whole file as one migration. Re-runnable. Non-destructive.
-- ============================================================================
