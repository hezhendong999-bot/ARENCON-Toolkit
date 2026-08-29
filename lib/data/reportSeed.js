/* ═══════════════════════════════════════════════════════════════════════════
   lib/data/reportSeed.js — S700a — THE ONE REPORT SEEDER.

   WHY THIS FILE EXISTS
   Creating "the next report" happened in exactly one place: the Project Hub's
   createNewReport(). S700a puts the same act inside the report itself — an
   issued FRT offers "Start next FRT" so a return visit lands on a NEW report
   instead of being typed into the one that already went to the client.

   Two callers, ONE implementation. The rules that decide the next number and
   what carries forward are the most consequential rules in the toolkit: an
   FRT's deficiencies carry their visit number internally, so a second copy of
   these rules that drifted by one line would corrupt the carried-vs-new
   arithmetic on every future report. The Hub therefore DELETED its own copy
   and calls this; it did not keep a matching one alongside.

   WHAT EACH SIDE OWNS
   This file owns: the next live number, the seed contents, the insert, and the
   retry when two people create at once. Each host owns its own presentation —
   the Hub keeps its toast and list refresh, FRT keeps its banner and
   navigation. Nothing in here touches the DOM.

   It reads Auth for the URL, the anon key and the token, exactly as the sync
   engine does (S125: never keep a second copy of the anon key), so a host
   needs to pass nothing but the project and the tool.

   Classic script on purpose — the Hub is not a module page. FRT's app.js is a
   module and reads it from window.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function _auth() {
    return (typeof global.Auth !== 'undefined' && global.Auth) ? global.Auth : null;
  }
  function _url() {
    var A = _auth();
    return (A && A.SUPABASE_URL) ? A.SUPABASE_URL : 'https://xsemvinxsyphjiaqgywv.supabase.co';
  }
  /* S125 — ALWAYS read the live anon key from Auth. A stale copy here would
     fail every write with "Invalid API key" while reads kept working, which is
     how cloud saves once died silently for six weeks. */
  function _anonKey() {
    var A = _auth();
    return (A && A.SUPABASE_ANON_KEY) ? A.SUPABASE_ANON_KEY : '';
  }
  function _token() {
    try {
      var t = global.localStorage ? global.localStorage.getItem('sb-access-token') : null;
      if (t) return t;
    } catch (_e) {}
    var A = _auth();
    var u = (A && A.getUser) ? A.getUser() : null;
    return u ? (u.access_token || null) : null;
  }
  function _userId() {
    var A = _auth();
    var u = (A && A.getUser) ? A.getUser() : null;
    return u ? (u.id || null) : null;
  }

  /* CREDENTIALS ARE PASSED IN, NOT ASSUMED. FRT has the shared Auth module;
     the Project Hub does not — its Supabase config is page-local. A seeder
     that reached for Auth unconditionally would send an empty API key from
     the Hub and fail every creation with "Invalid API key", which is exactly
     how cloud saves once died silently for six weeks (S125). Each host hands
     over what it holds; Auth is only the fallback. */
  function _creds(cfg) {
    cfg = cfg || {};
    return {
      url: cfg.url || _url(),
      anonKey: cfg.anonKey || _anonKey(),
      token: cfg.token || _token(),
      userId: (cfg.userId !== undefined) ? cfg.userId : _userId()
    };
  }

  function _headers(extra, creds) {
    var h = {
      'apikey': creds.anonKey,
      'Authorization': 'Bearer ' + (creds.token || ''),
      'Content-Type': 'application/json'
    };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k]; } }
    return h;
  }

  /* The LIVE reports for this project+tool, newest number first.

     S693 — NUMBER REUSE LAW. Report numbers are unique among LIVE reports only
     (partial index tool_data_live_number_uniq, WHERE deleted_at IS NULL). The
     deleted_at filter is written out explicitly: the RESTRICTIVE policy hides
     deleted rows from every client query anyway, and a comment that claimed
     otherwise is exactly what left two projects unable to create any report at
     all. The query says what it does. */
  function _listLive(projectId, toolKey, creds) {
    var u = creds.url + '/rest/v1/tool_data'
          + '?project_id=eq.' + encodeURIComponent(projectId)
          + '&tool_key=eq.' + encodeURIComponent(toolKey)
          + '&deleted_at=is.null'
          + '&select=id,instance_number,data,status,deleted_at'
          + '&order=instance_number.desc';
    return fetch(u, { method: 'GET', headers: _headers(null, creds) }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('list failed (' + res.status + ') ' + t); });
      return res.json();
    });
  }

  /* WHAT CARRIES FORWARD — S488 carry-forward, S692 issue identity.

     Carried: contractors, trades, drawings (pins and their deficiencies, still
     tagged notedOnInstance N so the carried-vs-new filters keep working),
     photos (the R2 pool is per-project, so pointers stay valid), info,
     settings, signatures, distribution.

     Stripped, because they belong to the report that made them:
       exportRegistry / exportIds — CRB round maths ties an export to the
         report that noted it.
       _s217Backup / _s464Backup   — point-in-time backups of the OLD report.

     Wiped: info.dateOfIssue. S692 — the date of issue is the identity of ONE
     issued document. Carried along with the rest of info{}, it made 7155.34
     FRT #2 go out as a draft whose cover claimed it was issued two weeks
     before the site visit it described. Every field added to the issue
     lifecycle in future must be reset here too; carrying it is the bug.

     Commissioning tools are genuinely per-visit and start blank. */
  function buildSeed(srcData, toolKey, nextNum) {
    if (toolKey !== 'frt') return {};
    if (!(nextNum > 1)) return {};
    if (!srcData) return {};
    var seed;
    try { seed = JSON.parse(JSON.stringify(srcData)); }
    catch (_e) { return {}; }
    delete seed.exportRegistry;
    delete seed.exportIds;
    delete seed._s217Backup;
    delete seed._s464Backup;
    /* ═══ S692 / S700a — CARRY-FORWARD LAW: ISSUE IDENTITY NEVER TRAVELS. ═══
       7155.34 FRT #2 went out as a draft whose cover read "Date of Issue:
       2026-08-11" — FRT #1's issue date, carried here along with the rest of
       info{}, claiming the report was issued two weeks before the site visit
       it describes.

       S700a extends the same law to the REVISION LETTER, which was carried and
       should never have been. Seeded from an issued FRT #1 (revision B01), a
       brand new FRT #2 was born reading B01, and the issue dialog — which
       reads any B-or-later letter as "already issued" — would then offer B02.
       A new report's FIRST issue would print a revision letter it never
       earned, on a cover handed to a client. A new report starts at A01.

       `_lastDraftNum` is the previous report's draft counter and means nothing
       here. `issuedArchive`, when it exists, holds pointers to the PREVIOUS
       report's issued PDFs; inheriting them would attach one report's record
       of what was sent to a different report.

       Every field added to the issue lifecycle in future must be reset here
       too — carrying it is the bug. */
    try{ if(seed.info){ seed.info.dateOfIssue=''; } }catch(_ci){}
    try{ if(seed.info){ seed.info.revision='A01'; delete seed.info._lastDraftNum; } }catch(_cr){}
    try{ delete seed.issuedArchive; }catch(_ca){}
    seed.currentFrtInstance = String(nextNum);
    seed.status = 'draft';
    seed.modified = new Date().toISOString();
    return seed;
  }

  function _insert(projectId, toolKey, nextNum, seedData, creds) {
    var uid = creds.userId;
    var body = JSON.stringify({
      project_id: projectId,
      tool_key: toolKey,
      instance_number: nextNum,
      data: seedData,
      status: 'draft',
      created_by: uid,
      updated_by: uid
    });
    return fetch(creds.url + '/rest/v1/tool_data', {
      method: 'POST',
      headers: _headers({ 'Prefer': 'return=representation' }, creds),
      body: body
    }).then(function (res) {
      if (res.ok) {
        return res.json().then(function (rows) {
          return { ok: true, row: (rows && rows[0]) || null };
        });
      }
      return res.text().then(function (t) {
        /* 409 / SQLSTATE 23505 = someone else created this number between our
           read and our write. That is a NORMAL outcome with 20 people on the
           platform, not an error to show anybody — the caller retries against
           a fresh live max. Every other failure is real and is raised. */
        var dup = (res.status === 409) || (t && t.indexOf('23505') !== -1) ||
                  (t && t.indexOf('tool_data_live_number_uniq') !== -1);
        if (dup) return { ok: false, duplicate: true, detail: t };
        var msg = t;
        try { var j = JSON.parse(t); msg = j.message || j.hint || t; } catch (_p) {}
        throw new Error(msg || ('insert failed (' + res.status + ')'));
      });
    });
  }

  /* createReport({ projectId, toolKey })
       → { row, instanceNumber, seededFrom, existingNewerDraft }

     `existingNewerDraft` is filled, and NOTHING is created, when a live draft
     of a HIGHER number than the caller's report already exists. Two people
     coming back from the same site should land in the same next report, not
     mint #3 and #4 an hour apart. The caller decides what to offer.

     `fromInstance` (optional) is the number of the report the caller is
     standing in; it is only used for that check. */
  function createReport(cfg) {
    cfg = cfg || {};
    var projectId = cfg.projectId;
    var toolKey = cfg.toolKey || 'frt';
    var fromInstance = Number(cfg.fromInstance || 0) || 0;
    var maxRetries = 2;
    var creds = _creds(cfg);

    if (!projectId) return Promise.reject(new Error('createReport: no project id'));
    if (!creds.anonKey) return Promise.reject(new Error('This page did not supply its database key — reload and try again.'));
    if (!creds.token) return Promise.reject(new Error('You are signed out on this device — sign in again to create a report.'));

    function attempt(n) {
      return _listLive(projectId, toolKey, creds).then(function (rows) {
        rows = rows || [];
        var top = rows.length ? rows[0] : null;
        var nextNum = top ? (Number(top.instance_number || 0) + 1) : 1;

        /* BELT AND BRACES — the seed must never resurrect deleted work. The
           query above already asks for live rows only, and the RESTRICTIVE
           policy hides deleted rows from every client query anyway, so this
           can only ever agree with it. It stays because the cost of being
           wrong here is a deleted report's contents reappearing inside a new
           one, and the check is one comparison. */
        var seedSrc = null;
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].deleted_at) { seedSrc = rows[i]; break; }
        }

        if (fromInstance && top && Number(top.instance_number) > fromInstance) {
          return {
            row: null,
            instanceNumber: Number(top.instance_number),
            existingNewerDraft: {
              id: top.id,
              instance_number: Number(top.instance_number),
              status: top.status || 'draft'
            }
          };
        }

        var seedData = buildSeed(seedSrc ? seedSrc.data : null, toolKey, nextNum);
        return _insert(projectId, toolKey, nextNum, seedData, creds).then(function (out) {
          if (out.ok) {
            return {
              row: out.row,
              instanceNumber: nextNum,
              seededFrom: (seedSrc && seedData && seedData.currentFrtInstance) ? Number(seedSrc.instance_number) : null,
              existingNewerDraft: null
            };
          }
          if (out.duplicate && n < maxRetries) return attempt(n + 1);
          throw new Error('Another report was created at the same moment. Try once more.');
        });
      });
    }

    return attempt(0);
  }

  global.ReportSeed = {
    createReport: createReport,
    buildSeed: buildSeed,
    BUILD: 'S700a'
  };
})(typeof window !== 'undefined' ? window : this);
