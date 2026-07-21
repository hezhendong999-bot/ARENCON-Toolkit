#!/usr/bin/env node
/**
 * S495 STAGE 2 — NIGHTLY RETENTION ELIGIBILITY REPORT.
 *
 * Design: DESIGN_DELETED_REPORTS_AND_RETENTION_S494.md, Part 3, Stage 2.
 * Pattern copied from tools/photo_integrity_sweep.mjs on purpose:
 *
 *   THE SCHEDULED JOB REPORTS; IT DOES NOT DELETE.
 *
 * This script has no delete verb anywhere. It reads soft-deleted reports
 * (tool_data.deleted_at) and soft-deleted projects (projects.deleted_at),
 * computes their age against the 90-day retention policy, and writes
 * reports/retention.json. An administrator purges eligible items by hand
 * from the Hub (type-to-confirm, snapshot-audited). An automated destroyer
 * is the one component that must never be wrong, and the cheapest way to
 * guarantee that is to not give it the verb.
 *
 * The clock runs from deleted_at, NEVER updated_at — a quiet project is not
 * a dead one. Archived projects never appear here: archive is deliberate
 * filing, not deletion (they carry no deleted_at, so the query excludes them
 * by construction).
 *
 * Exit codes:
 *   0 — normal (including "items are eligible"; eligibility is policy, not error)
 *   1 — ANOMALY: eligibility count exceeds MAX_EXPECTED_ELIGIBLE. A sudden
 *       spike means something upstream broke (a bad migration back-dating
 *       deleted_at, a mass-delete bug) — not that dozens of reports genuinely
 *       expired at once. Red run = email to Mark = a human looks BEFORE anyone
 *       purges anything. This is design rule 2's abort-on-surprise, applied to
 *       the reporter since the purge itself is manual.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service-role read, bypasses RLS)
 */

import { writeFileSync, mkdirSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsemvinxsyphjiaqgywv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('::error::SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

const RETENTION_DAYS = 90;          // must match RETENTION_DAYS in ARENCON_Project_Hub.html
const WARN_DAYS = 14;               // must match RETENTION_WARN_DAYS in the Hub
const MAX_EXPECTED_ELIGIBLE = 25;   // anomaly cap — more than this at once is a fault, not policy

async function rest(path) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
  });
  if (!r.ok) throw new Error('REST ' + r.status + ' on ' + path);
  return r.json();
}

function ageOf(deletedAt, now) {
  const days = Math.floor((now - new Date(deletedAt).getTime()) / 86400000);
  const daysLeft = RETENTION_DAYS - days;
  return { days, daysLeft: Math.max(0, daysLeft), eligible: daysLeft <= 0, warn: daysLeft > 0 && daysLeft <= WARN_DAYS };
}

async function main() {
  const now = Date.now();

  // Soft-deleted REPORTS. select excludes the data blob — this report needs
  // identity and age, not content, and must never grow into something that
  // carries report data around.
  const reports = await rest(
    'tool_data?select=id,project_id,tool_key,instance_number,label,status,deleted_at,deleted_by'
    + '&deleted_at=not.is.null&order=deleted_at.asc'
  );

  // Soft-deleted PROJECTS.
  const projects = await rest(
    'projects?select=id,project_number,project_name,client,deleted_at,deleted_by'
    + '&deleted_at=not.is.null&order=deleted_at.asc'
  );

  const classify = (rows, describe) => {
    const out = { eligible: [], warning: [], holding: [] };
    for (const row of rows) {
      const a = ageOf(row.deleted_at, now);
      const item = Object.assign(describe(row), {
        deleted_at: row.deleted_at, deleted_by: row.deleted_by || null,
        days_deleted: a.days, days_until_eligible: a.daysLeft
      });
      if (a.eligible) out.eligible.push(item);
      else if (a.warn) out.warning.push(item);
      else out.holding.push(item);
    }
    return out;
  };

  const rep = classify(reports, r => ({
    kind: 'report', id: r.id, project_id: r.project_id,
    tool_key: r.tool_key, instance: r.instance_number,
    label: r.label || null, status: r.status || null
  }));
  const prj = classify(projects, p => ({
    kind: 'project', id: p.id, project_number: p.project_number || null,
    project_name: p.project_name || null, client: p.client || null
  }));

  const eligibleTotal = rep.eligible.length + prj.eligible.length;
  const anomaly = eligibleTotal > MAX_EXPECTED_ELIGIBLE;

  const report = {
    generated_at: new Date().toISOString(),
    policy: { retention_days: RETENTION_DAYS, warn_days: WARN_DAYS, clock: 'deleted_at' },
    note: 'REPORT ONLY. Nothing here has been deleted. Purge is manual, admin-only, from the Hub.',
    totals: {
      reports_deleted: reports.length, projects_deleted: projects.length,
      eligible_for_purge: eligibleTotal,
      in_warning_window: rep.warning.length + prj.warning.length
    },
    anomaly: anomaly
      ? ('ELIGIBLE COUNT ' + eligibleTotal + ' EXCEEDS EXPECTED MAX ' + MAX_EXPECTED_ELIGIBLE
         + ' — investigate before purging anything. A spike means an upstream fault, not real expiry.')
      : null,
    reports: rep,
    projects: prj
  };

  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/retention.json', JSON.stringify(report, null, 2));

  console.log('Retention report written.');
  console.log('  soft-deleted reports : ' + reports.length
    + '  (eligible ' + rep.eligible.length + ', warning ' + rep.warning.length + ')');
  console.log('  soft-deleted projects: ' + projects.length
    + '  (eligible ' + prj.eligible.length + ', warning ' + prj.warning.length + ')');

  if (anomaly) {
    console.error('::error::' + report.anomaly);
    process.exit(1);
  }
}

main().catch(e => { console.error('::error::retention sweep failed: ' + (e && e.message)); process.exit(1); });
