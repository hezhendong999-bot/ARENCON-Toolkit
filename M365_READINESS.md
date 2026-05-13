# M365 Readiness Audit

**Purpose:** Document what changes when ARENCON migrates from the current Supabase + R2 + GitHub Pages stack to Microsoft 365 (SharePoint + Entra ID + R2 + Azure Functions + GitHub Pages). Captured tonight so that when ARENCON's M365 tenant is provisioned (~end of 2026), this document is the migration roadmap.

**Author:** Claude (Session 127) — Tuesday, May 12, 2026
**Trigger event for migration:** ARENCON IT provisions a SharePoint site for the toolkit. No work begins until then; tenant + Entra ID app registration are prerequisites.

---

## Current architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (FRT / Hub / Pump / IST / OBC / DD / Resource)      │
│   ↓ fetch with sb-access-token                              │
│ ─────────────────────────────────────────────────────────── │
│ Supabase (xsemvinxsyphjiaqgywv.supabase.co)                 │
│   ├─ Auth (email + password JWT)                            │
│   └─ tool_data table — JSON blob per project per tool       │
│                                                             │
│ Cloudflare R2 (arencon-files)                               │
│   ├─ photos/{pid}/frt/original/                             │
│   ├─ photos/{pid}/frt/marked/                               │
│   ├─ photos/{pid}/frt/drawings/                             │
│   ├─ photos/{pid}/frt/markup/{drawingId}.json (S126 Phase B)│
│   └─ {pid}/tiles/{drawingId}/L0..L4/                        │
│                                                             │
│ Azure Function (arencon-pdf-render)                         │
│   └─ PDF → WebP tile pyramid renderer                       │
│                                                             │
│ GitHub Pages — hosts the static HTML/JS/CSS                 │
└─────────────────────────────────────────────────────────────┘
```

## Target architecture (post-M365 migration)

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (FRT / Hub / Pump / IST / OBC / DD / Resource)      │
│   ↓ fetch with Entra ID bearer token (MSAL.js)              │
│ ─────────────────────────────────────────────────────────── │
│ Microsoft Entra ID                                          │
│   └─ Auth via MSAL.js (replaces Supabase Auth)              │
│                                                             │
│ SharePoint Online (ARENCON tenant, dedicated site)          │
│   └─ Document library "FRT-Projects"                        │
│        ├─ {pid}.json — full project payload                 │
│        ├─ {pid}.json — (one file per project)               │
│        └─ ...                                               │
│   ↑ accessed via Microsoft Graph API                        │
│                                                             │
│ Cloudflare R2 (arencon-files) — UNCHANGED                   │
│   └─ Same paths; auth swap from sb-access-token to          │
│      Entra bearer (or remove Worker auth entirely if data   │
│      stays internal)                                        │
│                                                             │
│ Azure Function (arencon-pdf-render) — UNCHANGED             │
│                                                             │
│ GitHub Pages — UNCHANGED                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Component-by-component migration plan

### 1. Authentication — Supabase Auth → MSAL.js (~1 session)

**Files affected:**
- `frt/js/data/auth.js` (or equivalent hub auth module)
- All places that read `localStorage.getItem('sb-access-token')`
- `ARENCON_Project_Hub.html` sign-in / sign-out flows
- Each tool's standalone auth check

**Migration steps:**
1. Register a new app in Entra ID admin center (post-tenant-provisioning)
2. Note Application (client) ID and Directory (tenant) ID
3. Add MSAL.js library (`@azure/msal-browser` from CDN or bundled)
4. Replace `_sb.auth.signInWithPassword()` with `msalInstance.loginPopup()`
5. Replace `localStorage.getItem('sb-access-token')` with MSAL token acquisition
6. Token refresh: MSAL handles automatically; remove manual refresh logic if any

**Risks:**
- MSAL.js bundle is ~200KB; may push past current SW cache size
- Token format differs — Supabase JWT vs Entra access token; downstream consumers (R2 Worker) need a swap too
- Popup-based auth can be blocked by browsers; popup vs redirect flow choice matters for mobile

**Rollback strategy:** Keep both auth modules side-by-side during cutover via feature flag.

### 2. Data persistence — Supabase tool_data → SharePoint document library (~3 sessions)

**Files affected:**
- `frt/js/data/sync.js` — push and pull paths
- `frt/js/data/cloudSync.js` (or equivalent) — same
- All pump tool `_cloudPush` / `_cloudPull` functions
- IST, OBC, DD per-tool sync modules

**Data shape:**
- Today: 1 row in `tool_data` per (project, tool, instance) with `data` JSONB column
- Target: 1 file in SharePoint document library per project named `{pid}.json`, containing the full project payload

**Migration code pattern:**

Current (push):
```javascript
await _sb.from('tool_data').upsert({
  project_id: pid, tool_key: 'frt', instance_number: 1,
  data: projectData, updated_at: new Date().toISOString()
});
```

Target (push):
```javascript
const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/root:/FRT-Projects/${pid}.json:/content`;
await fetch(url, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${await getToken()}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(projectData)
});
```

**Risks:**
- SharePoint has ~15GB per file limit; well above tool_data row size, fine
- File update returns a new ETag; concurrent-edit detection needs ETag handling
- SharePoint API rate limits: 600 requests per minute per app per site — fine for current usage
- File-level versioning: SharePoint keeps versions automatically, great for audit, but storage grows; configure version retention

**Rollback strategy:** Dual-write to both Supabase and SharePoint during cutover. Read from SharePoint first; fall back to Supabase. Once parity verified for N days, drop Supabase writes.

### 3. Hub aggregation queries (~2–3 sessions)

**Files affected:**
- `ARENCON_Project_Hub.html` — every `_sb.from('tool_data')...` site (15+ locations)

**Migration code pattern:**

Current:
```javascript
const { data: rows } = await _sb.from('tool_data')
  .select('project_id, data, updated_at')
  .eq('tool_key', 'frt');
```

Target:
```javascript
const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/root:/FRT-Projects:/children?$top=200`;
const { value: items } = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` }})).json();
// items[].name = "{pid}.json", items[].@microsoft.graph.downloadUrl for content
```

**Risks:**
- Aggregation across 100+ projects requires N fetches OR a Graph batch endpoint (`/v1.0/$batch`). Performance worse than a single Postgres query.
- Mitigation: maintain a summary index file (`_index.json`) at the root of the library, updated on every project save. Hub reads index, not individual files.

### 4. R2 Worker auth swap (~0.5 session)

**Files affected:**
- `arencon-r2-worker.hezhendong999.workers.dev` source (Cloudflare Dashboard)

**Migration steps:**
1. Replace Supabase JWT verification with Entra access token verification
2. Add a JWKS endpoint check against `https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys`
3. Validate `aud` and `iss` claims

**Risks:**
- JWKS rotation; Worker needs cache + refresh logic
- Tenant-scoped tokens vs. multi-tenant tokens; choose at app registration time

**Alternative:** Drop R2 Worker auth entirely if data stays internal and R2 bucket is private. Use Cloudflare access policies instead. Simpler.

### 5. Per-tool sync clients (~3–5 sessions)

**Tools needing sync swap:**
- Diesel Pump Commissioning — CloudSync integrated → swap to Graph
- Electric Pump Commissioning — same
- IST S1001 — no CloudSync yet; add Graph-native from start
- OBC Report Generator — no CloudSync yet; add Graph-native from start
- DD Checklist — no CloudSync yet; add Graph-native from start
- Resource Planner — uses tool_data → swap to Graph

Each is ~1 session of focused swap work. The architecture is identical across tools (each writes one JSON file per project to a tool-specific subfolder).

### 6. Testing & rollback infrastructure (~2 sessions)

- End-to-end test: create project on dev environment, verify it shows in M365 admin
- Migration script for existing Supabase data → SharePoint (one-time bulk import)
- Rollback toggle: `FRT_BACKEND` environment flag → `supabase` | `sharepoint` | `dual-write`
- Smoke test checklist: open project, save, photo upload, drawing markup, PDF export

---

## Total effort estimate

| Component | Sessions |
|---|---|
| Auth (MSAL.js) | 1 |
| Sync (push + pull) | 3 |
| Hub aggregation | 2–3 |
| R2 Worker auth | 0.5 |
| Per-tool clients | 3–5 |
| Testing + rollback | 2 |
| **Total** | **11–14 sessions** |

At 1 session/week pace, that's **3–4 months** from when ARENCON's tenant is ready. At 2 sessions/week, **2 months**.

---

## What stays the same (no migration needed)

- All HTML, CSS, frontend rendering code
- The FRT field tool UX (pin placement, markup, PDF export, photo gallery, signatures, etc.)
- R2 photo storage paths and access patterns
- Azure Function PDF renderer
- GitHub Pages deployment
- Service worker caching strategy
- IDB offline persistence
- The data shape inside each project's JSON blob

---

## Pre-flight checklist before migration starts

When ARENCON IT provisions M365 Business Standard/Premium for the toolkit:

1. **Confirm SharePoint Online is licensed** in the M365 plan (Basic/Standard/Premium all include it; Exchange-only does not)
2. **Request a dedicated SharePoint site** named "ARENCON Toolkit" or similar
3. **Get site URL and site ID** (visible in SharePoint admin or via Graph API)
4. **Register an app in Entra ID admin center** with these permissions:
   - `Sites.ReadWrite.All` (or scoped to specific site)
   - `Files.ReadWrite.All` (scoped to specific drive)
   - `User.Read` (basic profile)
5. **Note app's Client ID and Tenant ID**
6. **Add the GitHub Pages URL to the app's redirect URIs**
7. **Create the document libraries**:
   - `FRT-Projects`
   - `DieselPump-Projects`
   - `ElectricPump-Projects`
   - `IST-Projects`
   - `OBC-Projects`
   - `DD-Projects`
   - `ResourcePlanner` (single file)
8. **Test Graph API access** with a known good token before migration starts

---

## Risks specific to ARENCON's situation

### 1. ARENCON M365 rollout slippage

The current "end of 2026" estimate is org-wide aspiration. If it slips into 2027, the free-tier Supabase setup may need upgrading mid-stream. Memory usage at session 127 is already 411 MB / 572 MB (72%). At 18 technical staff with growing tool adoption, 100% utilization is a realistic worry inside 6 months.

**Mitigation if slippage happens:** Upgrade Supabase to Pro + Small compute ($75/mo) for the bridge period only. Cancel when M365 ready.

### 2. SharePoint Online performance ceiling

SharePoint document library performance degrades past ~5,000 items per view. At ARENCON's current pace (~150 projects), this is not a near-term issue. At 5,000 projects (decades out), the architecture would need a re-think (multiple libraries, or move to Dataverse).

**Not a concern for this migration.** Worth flagging for very long-term planning.

### 3. Entra ID licensing for non-employee users

If ARENCON ever wants contractors or third-party reviewers to access projects, Entra B2B guest user licensing applies. Free up to a generous limit, then per-user costs. Plan for it if the use case emerges.

### 4. Concurrent edit handling

Current Supabase sync uses last-write-wins. SharePoint's ETag mechanism enables proper optimistic concurrency control. Migration is a good opportunity to add conflict detection.

**Recommended:** Implement ETag-based If-Match headers on save; on 412 Precondition Failed, prompt user to reload and merge.

### 5. Token TTL and offline operation

Entra access tokens default to 1 hour TTL. Refresh requires popup or silent renewal. For field tablets that may be offline for hours, MSAL.js handles silent renewal when connectivity returns, but interactive sign-in might be needed after long offline gaps.

**Mitigation:** Sliding session window + offline IDB queue (already exists). Test thoroughly before cutover.

---

## What this document is NOT

- A commitment to migrate. Migration starts only when ARENCON's tenant is provisioned.
- A guarantee on timing. ARENCON's IT timeline is the gating factor, not the technical work.
- An architecture decision. SharePoint vs Dataverse vs Lists is open for re-evaluation when migration time arrives (especially if data scale changes substantially).
- A budget estimate. Microsoft licensing for the broader org is a separate question from this technical migration.

---

## Recommended next action when ARENCON's M365 tenant lands

1. Read this document
2. Confirm SharePoint is in the licensed plan
3. Request site provisioning + Entra app registration
4. Start Session N+1 with the pre-flight checklist complete
5. Build in dual-write mode (Supabase + SharePoint) for 2 weeks of burn-in
6. Cut over reads to SharePoint
7. Cut over writes (drop Supabase) after another 2 weeks of clean operation
8. Decommission Supabase project, keep tool_data backup in R2 indefinitely

— End of M365 readiness audit. Session 127, May 12, 2026.
