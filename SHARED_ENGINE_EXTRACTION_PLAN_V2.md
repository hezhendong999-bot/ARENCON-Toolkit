# SHARED ENGINE EXTRACTION PLAN — v2 (S442)
**Supersedes v1 (S392–S400). Written against live HEAD after the S441 arc. v1's audit verdicts all RECONFIRMED by the S442 code re-scan; v2 adds the chrome layer (Mark's S442 direction), three scan amendments, and the post-audit change catalog.**

## Goal (Mark's words, v1 + S442 extension)
One shared library of engines. Every tool borrows; fix once, every tool updates.
Add a feature once → all tools have it. Tools keep their own labels/content.
**S442 extension: the chrome is shared too.** Headers, buttons, colours, sizes — the layout identical across tools other than each tool's unique buttons; per-tool uniqueness (e.g. photo badge categories) is config, never restyled chrome. All future tools are shared-module tools. The system the same; the content per-tool.

## Standing decisions (unchanged from v1 unless noted)
- Single self-contained HTML file rule RETIRED; tools become folders. (Project-instructions line still pending Mark's edit — this plan overrides.)
- Diesel = content reference for commissioning; **FRT = engine reference** for the data layer.
- Electric's checklist content is correct and never touched; engines ported under it.
- Sequence: /lib/ extraction → **Electric first** → Diesel → IST/others.
- **NEW (S442): the shared header debuts in the Electric skeleton (Step 0) as the chrome demo.** Live tools adopt chrome only at their own conversion step — never retro-fitted onto deployed single-files.
- Field deployment is **Android TWA** (`com.arencon.projecthub`); iOS abandoned. v1's "iPad Safari" acceptance line is corrected to "GitHub Pages + Android field device". Sticky-fullscreen IIFE (S439/S441) is a chrome-layer standard on every page.

## Hard safety constraints (non-negotiable, unchanged)
1. Live single-file Diesel & Electric stay untouched and deployed during all builds.
2. New folder versions share the SAME backend (tool_key, Supabase rows, R2 keys) — zero migration.
3. Feature-parity gate + field-verify before any switchover. Test agent extended per step.
4. Switchover = Hub pointer change only; rollback = point back. Old files retired only by Mark.

## S442 re-scan — audit refresh (verdicts reconfirmed; deltas that matter)
| Module | v1 verdict | S442 status |
|---|---|---|
| toast.js | FRT, clean | Unchanged. **/lib/ version self-creates its container** (drop-in, zero required markup). EXTRACTED at Step 0. |
| dialogs.js | FRT, clean | Now imports **scrollLock.js** (S416, post-audit) → scrollLock joins Step 1. One retired export (`confirmIARDeactivate`, IAR is dead) — do NOT carry into /lib/. |
| auth.js | FRT, must pass S395 | S395 behaviour (401 → silent refresh → retry, S91 path) confirmed present in current code. |
| idb.js | FRT, clean | `DB_NAME='ARENCON_FRT_V2'` + FRT store list hardcoded → **/lib/ API takes {dbName, version, stores} config**; each tool gets its own DB. |
| merge.js | FRT 3-way | **Gained S43x tombstone deletion-wins + 29-test self-hook (`window._frt_mergeDiag`) THIS WEEK.** /lib/ merge MUST be extracted from current code — an audit-era copy reintroduces the photo-resurrection bug. |
| sync.js | FRT, pairs with merge | Gained S426 stale-writer guard + S440 repaint-after-pull. Model coupling is only 4 methods (getProject/setProject/applyMerged/saveNow) → step-3 adapter is small. |
| photoOutbox.js | FRT | S414/S421 touches; still the winner; step 2 as planned. |
| r2.js | FRT + Diesel key scheme | `/frt/` hardcoded in every key path → config gains **toolKey** alongside the S398 instance-key scheme. HEAD unsupported by worker (S421) — Range-GET probes only, carry into /lib/. |
| scrollLock.js | (didn't exist at audit) | NEW shared module; zero deps; dialogs depends on it → **joins Step 1**; also satisfies the pending Electric/IST/OBC/DD port. |
| deviceBudget.js | (not in v1) | 51 lines, zero deps — free rider for /lib/shared/ whenever convenient. |

**Post-audit change catalog (so nothing is re-forgotten):** camera Android-native rewrite arc S424–S438 (gravity orientation SACRED; adaptive 4096 capture; torch hunt; 3-state flash) — reshapes step-4 photoEngine scope; Recently Deleted redesign (S439 + the July-6 arc: grid multi-select, on-photo restore/delete icons, category badges stamped at delete, gallery-matched thumbnails); tombstone purge system + consumer sweep (S441) — purged photos are permanent tombstones, ALL consumers skip them; ai-proxy repoint (S415); sticky fullscreen all pages (S439) + frt/index.html (S441); header canon: QR never a header button — lives in More ▾ / ☰ (S441); Hub gallery fixes S404–S431.

## NEW — Chrome layer (Mark-approved direction, S442)
```
/lib/
  css/    chrome.css      ← ARENCON Bold tokens (both modes), shared header layout,
                            S341 button system, chips/pills, completion bar, cards,
                            section-number chips. Defined ONCE.
  ui/     header.js       ← ONE header component. Standard cluster identical everywhere:
                            ← Back · logo(→Hub, S412) · title | cloud dot (§S114-16,
                            never hides) · ☀/☾ · ☰. Tool-unique buttons/menu items
                            injected via config slots; buttons auto-collapse into ☰
                            ≤1024px. QR is a menu item, never a header button (S441).
  assets/ logo.js         ← the ARENCON logo data-URL, one copy for all tools.
```
- Theme: `data-theme` on `<html>`, ONE shared per-device key `arencon-theme` — every tool on a device matches. Field tools boot Light; indoor tools boot Dark; manual toggle only.
- Chrome scoping unchanged from canon: Bold is the UI-chrome layer; the muted report/PDF palette and deficiency status-colour logic stay locked and separate.
- Per-tool config file declares: tool name, unique header buttons, menu items, badge category→token mapping, photo slot declarations, R2 toolKey, reading labels, PDF template.

## Target layout (v2)
```
/lib/
  css/    chrome.css
  ui/     header.js  photoEngine.js  lightboxMarkup.js
  assets/ logo.js
  shared/ toast.js  dialogs.js  auth.js  scrollLock.js  (deviceBudget.js)
  data/   idb.js  r2.js  photoOutbox.js  merge.js  sync.js
  export/ paginate.js
/electric/  index.html + electric-config + tool js   (first consumer)
/diesel/    (second consumer)
frt/        (migrates imports to /lib/ LAST, import-path-only, explicit authorization)
```

## Build sequence + acceptance (v2)
0. **Foundation — SHIPPED S442.** /lib/ skeleton (toast + chrome.css + header.js + logo.js) + /electric/ skeleton consuming them. ✓ Loads on GitHub Pages + Android; header demo in both modes pending Mark's sign-off. Test-agent electric coverage: next step.
1. **Small shared** — dialogs + **scrollLock** + auth + **idb (parameterized {dbName, version, stores})**. ✓ Harness green; auth passes S395; dialogs drop the retired IAR export.
2. **R2 + outbox** — config {toolKey, instance-key scheme}; Range-GET probes (never HEAD). ✓ v1 criteria + S398 ownership guard.
3. **Merge + sync (pair) — extracted from CURRENT code** (tombstone deletion-wins + self-tests travel with it). ✓ v1 criteria + the three S43x resurrection tests green.
4. **Photo engine + slot config** — scope now includes the S428–S438 camera canon (gravity SACRED — verify by diff; adaptive 4096; torch hunt) and tombstone-aware galleries/Recently-Deleted patterns.
5. **Electric conversion complete** → parity gate → field-verify → Hub pointer flip.
6. **Diesel conversion** (lightbox canon extracted here — Diesel is that engine's reference).
7. **Paginate extraction + camera rotation once in photoEngine** — the "build once" proof.

## Known context (v1 items still true + new)
- Electric's live Object.assign data-loss bug: fixed automatically at step 3/5 (stopgap declined).
- FRT never-touch files: viewer.js, markup.js, markupEngine.js, tiledPdf.js — import-path-only at the final FRT step, explicit authorization required.
- Rotation: do NOT resurrect the S357 rollback; rebuild in lib.
- Concurrent Training-Center writer moves `main` constantly — every /lib/ push follows full push discipline (HEAD re-assert, rebase-safe transforms, push_guard, Trees-API post-verify).
