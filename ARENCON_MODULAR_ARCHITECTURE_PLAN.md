# ARENCON Toolkit — Shared/Unique Modular Architecture Plan
### The map for rebuilding every tool on one shared engine, with zero visual or functional deviation

**Status:** Planning document (S446). No code changes proposed here — this is the map Mark steers from across sessions.
**Reference tool:** live `ARENCON_Diesel_Fire_Pump_Commissioning.html` (1.44 MB / 19,707 lines) — the mature, field-proven tool. Diesel is the source of truth; Electric and FRT converge onto the same shared pieces.

---

## 1. The goal, stated once

Every tool (Diesel, Electric, FRT, and future tools) is rebuilt as a **thin tool-specific layer composed on top of shared `/lib/` modules**. The rebuilt tool must be **pixel-identical and function-identical** to the live tool today. The only thing that changes is *underneath*: shared modules replace each tool's private inline copy. A user must not be able to tell the difference.

**Two hard rules that govern every decision below:**
1. **Zero deviation.** Shared modules are adopted only where the behavior is genuinely identical across tools. Where a tool's behavior is unique, it stays local. We never bend a tool's UX to fit a shared module.
2. **Live-data safety.** Diesel and FRT are live with real data and users. Every rebuilt tool is built *beside* the live one (same tool_key / Supabase rows / R2 keys — no data migration), and switchover is a Hub pointer flip only after full parity **and** Mark field-verifies with me on a device.

---

## 1B. Corrections locked with Mark (S446)

1. **Checklist is a PUMP-TOOL module, not universal.** The checklist component is shared by Diesel + Electric only. FRT is excluded — its deficiency/pin model is different. (Same tier as reading-grid and the PLD/3pt/7pt families.)

2. **No sticky fullscreen on desktop — touch devices only, all tools (present + future).** The figure/chart fullscreen feature (`.fig-fs` / `.fig-fs-overlay` in Diesel, and any equivalent in other tools) must only be reachable on touch devices, gated via `@media(pointer:coarse)` — the pattern Diesel already uses (its `.fig-fs` button is already coarse-gated). Desktop/mouse never triggers sticky-fullscreen.
   - **The HEADER is NOT part of this.** The header's `position:sticky` stays exactly as it is today. Header behavior matches current Diesel, untouched.
   - **Zero deviation guarantee:** on desktop, Diesel must look and behave exactly as it does now; the only enforced difference is that the fullscreen overlay does not trigger on PC.

## 2. What's SHARED vs UNIQUE (the core map)

### 2A. Already extracted and shared (the data engine — done, S446 Steps 0–4)

| Shared module | Replaces the tool's inline… | Notes |
|---|---|---|
| `lib/data/idb.js` | private IndexedDB cache | per-tool dbName via config |
| `lib/shared/auth.js` | inline Supabase auth | same project `xsemvinxsyphjiaqgywv` |
| `lib/data/r2.js` | `R2Photos` upload/list | per-tool `toolKey`; `files.arencon.app` host |
| `lib/data/uploadQueue.js` | inline upload concurrency | verbatim |
| `lib/data/photoOutbox.js` | inline pending-upload logic | 2-method model adapter |
| `lib/data/sync.js` + `syncWorker.js` + `syncWorkerHost.js` | the `CloudSync` IIFE | 4-method canonical model adapter |
| `lib/data/merge.js` | inline 3-way merge | S43x deletion-wins tombstones; 29 self-tests |
| `lib/ui/cameraBurst.js` | inline `openCameraBurst` | SACRED capture, byte-identical |
| `lib/workers/imageWorker(Host).js` | inline compress | off-thread resize |
| `lib/ui/photoEngine.js` | inline compress/EXIF/thumbnail/trash | Layers 1+2 (tool-agnostic photo primitives) |
| `lib/shared/toast.js`, `scrollLock.js`, `dialogs.js` | inline equivalents | done |
| `lib/css/chrome.css` (Bold), `lib/css/status.css` (verdicts) | inline theme | Bold chrome + locked verdict palette |

### 2B. SHARED — not yet extracted (the UI layer — this is the real remaining work)

These are the pieces Mark named as shared. **None are extracted yet.** This is the bulk of the future build.

| Candidate shared module | Present in Diesel | Why shared | Tool-unique edges to parameterize |
|---|---|---|---|
| **Header component** (`lib/ui/header.js` — partial today) | header markup + back/logo/sync-stamp/dark/text-size | "mostly the same across all tools" | the action buttons differ **in function only** (Diesel: AI Review / Reports / More / Sign Out; FRT/Electric differ). Header = shared shell; buttons = injected config. |
| **Lightbox** (photo viewer) | 66 refs | identical viewing UX everywhere | none material; Diesel deferred it here — this is where Step 6 lands |
| **Photo markup** (draw-on-photo) | 302 refs — the biggest shared feature | identical: mark-on-photo **creates a duplicate marked copy**; removing markup **removes the duplicate**. Same rule every tool. | stroke palette only |
| **Site records** | part of the 272 deficiency/site refs | "site records are the same" across tools | none — genuinely shared |
| **Deficiency system** (shared parts) | 272 deficiency/contractor refs | the record model + Recently-Deleted are shared (already Layer-2 in photoEngine) | pin→observation linking is FRT-specific; Diesel's is simpler |
| **Signature capture** | 53 refs | signature pad is generic | witness/contractor row labels differ |
| **Sketch canvas** | 225 refs | freehand sketch is generic | none material |
| **PDF export framework** | cover + `@media print` + bin-pack pagination | the *paper/preview/pagination/export-bar* shell is shared canon (Style Guide §PDF) | the report *content* per section is tool-unique |
| **Leave dialog, autosave cadence, theme toggle** | present | identical behavior | none |

### 2C. UNIQUE to Diesel (stays local — must NOT be shared)

| Diesel-unique | Evidence | Why it stays local |
|---|---|---|
| **PLD test** (7-point VFD) | 1,282 PLD refs | pump-drive concept; not in FRT |
| **3-Point / 7-Point performance tests** | 52 / 51 refs | fire-pump-specific test sheets |
| **RPM / gauge / rated / churn / 150% flow** | RPM 136, rated 205, churn 30 | pump performance vocabulary |
| **Badge names + colours** (RPM, gauge, 3pt, 7pt) | 133 badge refs | Mark: "not applicable for FRT". Diesel-unique chip vocabulary — like Electric's VFD/PLD chips. |
| **Net-performance / PLD charts** | chart init fns | pump-curve specific |
| **Diesel verdict rules** (churn/rated/150% pass logic) | verdict 166 refs | fire-pump acceptance criteria |

**Key principle from Mark:** *site records are shared; RPM/gauge/3pt/7pt badges are not.* The shared/unique line runs through the **verdict + badge vocabulary**, not the components that render them. A shared verdict-pill component (status.css) renders both a shared PASS and a Diesel-unique "churn OK" — the pill is shared, the label/threshold is tool config.

---

## 3. Section-by-section review of Diesel (the 10 panels)

Diesel panels: `proj · s1 · s2 · s3 · s4 · s5 · defic · sign · sketch · photos`

| Panel | Content | Shared module(s) | Diesel-unique |
|---|---|---|---|
| **proj** (Summary) | verdict banner, Pass/Fail/N-A/I-C donut, completion bar, per-section status | verdict-pill (status.css), donut component (to build, shared), completion-bar (Bold chrome) | which sections exist; churn/rated pass rules |
| **s1 Pre-Commissioning** | checklist | shared checklist component (to build) | the specific line items |
| **s2 Visual Inspection** | checklist | shared checklist component | line items |
| **s3 Controller Tests** | checklist + data | shared checklist + reading-grid (to build) | controller item set |
| **s4 Performance Test** | 3-Point / 7-Point PLD, RPM, gauge, charts | reading-grid shell shared | **all pump test logic + charts UNIQUE** |
| **s5 FA & Signaling** | checklist | shared checklist | item set |
| **defic Deficiencies** | deficiency records, contractor, site records | **shared** deficiency/site-record + Recently-Deleted | Diesel severity vocabulary |
| **sign Signature** | signature pads | **shared** signature capture | witness/contractor labels |
| **sketch Sketches** | freehand + markup | **shared** sketch + markup | none material |
| **photos Photos** | gallery, camera, lightbox, markup | **shared** photoEngine + cameraBurst + lightbox + markup | none material |

**Reusable UI components to extract (the shared build list, in dependency order):**
1. **Header** (`lib/ui/header.js`) — finish the shared header; buttons via config.
2. **Verdict pill + donut + completion bar** — small, high-reuse, status.css-backed.
3. **Checklist component** — used by s1/s2/s3/s5. **PUMP TOOLS ONLY (Diesel + Electric), NOT FRT.** Item set is data.
4. **Reading-grid** — the data-entry table shell (Diesel readings, Electric readings).
5. **Deficiency + site-record + Recently-Deleted** — largely in photoEngine Layer 2 already; finish it.
6. **Lightbox** (Step 6 as planned) — Diesel is its reference.
7. **Photo markup** (the 302-ref feature) — duplicate-copy-on-markup rule; shared everywhere.
8. **Signature capture**, **Sketch canvas**.
9. **PDF framework** — shared paper/pagination/export-bar; content per tool.

---

## 4. Sequence (how we actually build it, safely)

Per Mark's decision: **Diesel first** (the mature reference), then port shared-module Diesel → Electric, then FRT converges.

- **Phase A — Diesel on `/lib/`, beside live.** Copy live Diesel verbatim into its own modular home; keep 100% of UI/verdict/checklist/PDF markup byte-identical; replace only the inline `CloudSync` + `R2Photos` blocks with the already-shared data engine. Field-verify against real data before any Hub pointer flip. *(This alone proves the data-engine swap on the real tool with zero UI change.)*
- **Phase B — Extract shared UI components** (list in §3) one at a time, each proven zero-deviation against Diesel before reuse.
- **Phase C — Electric = Diesel-minus-diesel-unique + electric-unique.** Electric inherits the proven shared components; swaps pump vocabulary (VFD/PLD readings vs Diesel's).
- **Phase D — FRT converges** onto the shared header, lightbox, markup, photoEngine, sync — keeping FRT's unique deficiency/pin logic local.

**Every phase:** built beside live, zero visual/functional deviation as the acceptance test, field-verified before switchover.

---

## 5. What this session (S446) actually produced — honest status

**Done and real:** the shared *data* engine (idb, auth, r2, uploadQueue, photoOutbox, sync/merge quartet, cameraBurst, image-worker, photoEngine Layers 1+2, chrome.css, status.css). All extracted from current code, validated, pushed.

**Wrong-order / to reconsider:** the `electric-app/` shell was built Electric-first (Electric has nothing to copy from) and is an empty placeholder — a deviation, not a foundation. Per this plan, the correct path is **Diesel-first**. The `electric-app/` shell should be set aside (not extended) until Electric is derived from a proven shared-module Diesel.

**Not started (the real remaining work):** the entire **shared UI layer** in §2B/§3 — header, lightbox, markup, verdict/donut/checklist/reading-grid, signature, sketch, PDF framework. This is the bulk of the vision and is multi-session.

---

## 6. Decisions locked with Mark (S447)

1. **`electric-app/` shell:** LEAVE in place, do not extend. Inert (not linked from Hub), zero risk to live tools. Fragments (tab structure, leave-dialog wiring already proven against `/lib/`) may be cribbed when Electric's real turn comes in Phase C.
2. **Diesel modular home:** YES — a `diesel-app/` folder (`index.html` + `app.js` + `diesel.css`, importing from `/lib/`), built beside live. Becomes the literal template Electric (Phase C) and FRT (Phase D) copy.
3. **First shared UI component after Phase A:** HEADER. Highest reuse, lowest risk — shared shell + injected button config, rendered by every tool. Lightbox+markup (302-ref feature) comes after the pattern is established.

**Phase A first-commit scope (S447 refinement):** Phase A does NOT land as one giant extraction. First commit = stand up the `diesel-app/` shell that loads the live Diesel UI and wires the shared `/lib/` data engine (idb/auth/r2/outbox/sync quartet), then FIELD-VERIFY the data path against real Diesel data on a device BEFORE touching another line. The field-verify gate sits exactly at the data-path swap.
