# HANDOFF — Design Resource Planner Session
**Date:** 2026-03-19
**Status:** v3 cloud-enabled, deployed to GitHub Pages. Core tool working. Four features queued.

---

## WHAT WAS BUILT THIS SESSION

### Design Resource Planner — New Tool from Scratch
Single-file HTML tool: `ARENCON_Design_Resource_Planner.html` (~146KB, ~1930 lines)

**Architecture:**
- Standalone tool (not per-project like FRT/Diesel)
- Supabase auth (reuses Hub session — no separate login)
- Shared `resource_planner` table (single row, all users see same data)
- Admin/Super Admin = full edit; Inspector/Viewer = read-only
- 15s auto-save for admins, 60s heartbeat for viewers
- localStorage backup always maintained
- RLS policy currently set to admin-only access (SELECT + UPDATE)

**Features built:**
1. **4 Gantt views**: By Project, By Person, Week Calendar, Day View
2. **7 category chips**: FP Systems/Design, Code-I, Code-Non-I, FSP/IST/TFS, Alt Solutions/Modelling, Energy, Legal
3. **Multi-assignment per project**: click category chips → each gets own person + dates
4. **People pool**: add/edit/remove team members with name, initials, role, color
5. **Quick Dump**: drag & drop Excel/CSV/text files → smart CSV parser auto-detects columns
6. **Auto-categorization**: maps task descriptions (e.g. "Sprklr Design" → FP Systems/Design)
7. **Inline person creation**: "+ Add new person" in assignment rows
8. **Availability indicator**: shows free/busy/partial per person in assignment rows
9. **Conflict detection**: red outlines on overlapping bars, badge in toolbar
10. **Capacity panel**: 30-day utilization bars per person
11. **PDF report export**: ARENCON-branded report with team, projects, conflicts
12. **JSON export/import**: backup and restore
13. **Dark mode**: shared ARENCON_Dark key
14. **Cloud status indicator**: green dot (synced), yellow (saving), red (error)
15. **TimeOff data structure**: ready in state, UI not yet built

### Hub Update
- Added **📊 Planner** button to Hub header (desktop + mobile menu)
- Visible only for Admin/Super Admin roles
- Opens Resource Planner in new tab

### Supabase Setup
- Table: `resource_planner` (single row, JSONB data column)
- RLS: admin-only SELECT + UPDATE (can open to all authenticated later)
- SQL script: `resource_planner_setup.sql`

---

## FILES DELIVERED

| File | Description |
|------|-------------|
| `ARENCON_Design_Resource_Planner.html` | The planner tool (v3, cloud-enabled) |
| `ARENCON_Project_Hub.html` | Hub with Planner button added |
| `resource_planner_setup.sql` | Supabase table creation script (already run) |

---

## KNOWN ISSUES

1. **AI parsing doesn't work from GitHub Pages** — Claude API requires auth headers only available in claude.ai artifacts. The smart CSV parser handles Excel/CSV files directly as fallback. For AI parsing, would need a Cloudflare Worker proxy (future).
2. **GitHub Pages caching** — hard refresh (Ctrl+Shift+R) needed after each upload to see changes.
3. **Work types migration** — if user had old work types from v2 localStorage, they'll persist. The DEFAULT_WT only applies on fresh start.
4. **Drag bars in read-only mode** — currently bars are still draggable for viewers (drag handlers don't check _isAdmin). Should add guard.

---

## QUEUED FOR NEXT SESSION — Priority Order

### 1. Authorization/Status Filter
- Add status field to projects: `authorized`, `proposal`, `on-hold`
- Filter toggle in toolbar: "All / Authorized / Proposal"
- Proposal projects shown with dashed/dimmed bars on Gantt
- Status imported from Alex's spreadsheet "Authorization" column

### 2. Due Date Markers on Gantt
- Add `dueDate` field to projects
- Render as red diamond ◆ marker on Gantt bars
- Show in Day view and Report
- Auto-imported from Excel "Due Date" column

### 3. Drag to Reassign Between People (Person View)
- In Person view, vertical drag moves assignment from one person to another
- Visual feedback: ghost bar follows cursor to target person row
- Updates personId in assignment, re-renders
- Only works in Person view (not Project view)

### 4. Utilization Heatmap
- Replace or supplement the simple capacity bars
- Week-by-week grid per person
- Color coded: green (<50%), yellow (50-80%), red (>80%)
- Shows in Capacity tab sidebar
- Accounts for timeOff blocks

### 5. Time Off UI (data structure ready)
- Add "🏖 Time Off" button per person in People tab
- Date range picker modal: start, end, reason
- Gray hatched bars on Gantt
- Blocks in Week/Day calendar views
- Reduces capacity %

### 6. Review Hours Tracking
- Add `hoursEstimated` + `hoursActual` fields per assignment
- Shows in Day view task cards
- Included in Report export

---

## DATA MODEL (current state shape)

```json
{
  "people": [{"id":"...", "name":"Anna", "initials":"AN", "role":"designer", "color":"#3B82F6"}],
  "workTypes": ["FP Systems/Design", "Code-I", "Code-Non-I", "FSP/IST/TFS", "Alt Solutions/Modelling", "Energy", "Legal"],
  "projects": [{
    "id":"...", "projectNumber":"7155.51", "name":"Fenmar Sprklr", "client":"Caplink",
    "priority":"medium", "status":"authorized", "notes":"Office Sprklr Design",
    "assignments": [
      {"personId":"...", "workType":"FP Systems/Design", "startDate":"2026-03-19", "endDate":"2026-04-16"}
    ]
  }],
  "timeOff": [{"id":"...", "personId":"...", "startDate":"...", "endDate":"...", "reason":"Vacation"}]
}
```

---

## CRITICAL RULES (for this tool)

- **No login form** — tool reuses Hub Supabase session from localStorage
- **No session = redirect to Hub** — show "Go to Project Hub" button
- **Single shared row** in `resource_planner` table — NOT per-project
- **Admin-only write** — RLS enforced at Supabase level
- **Smart CSV parser** as primary import method (AI API not available from GitHub Pages)
- **Category chips replace work type dropdown** — each checked category = separate assignment row
- **autoCategory()** function maps task descriptions to 7 high-level categories
- **SheetJS loaded from CDN** on first Excel upload — `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`

---

## ALEX'S SPREADSHEET COLUMN FORMAT

```
A: Project #
B: Client / Project Name
C: Task / Deliverable (maps to category via autoCategory())
D: Designer
E: PM / Reviewer
F: Engineer
G: Due Date
H: Start Date
I: End Date
J: Authorization (Yes / Proposal Stage)
K: Notes
```

Known people from Alex's sheet: Anna, Stacy, Franz, Elvis, IL, ILi, SK, AJY, MHe, JTC, MNZ, Stoppi
