/**
 * ARENCON /lib/ui/headerConfigs.js — FRT + Electric header configs (S455 prep)
 * ══════════════════════════════════════════════════════════════════════
 * Ready-to-use buildHeader() config objects for FRT and Electric, so the
 * eventual (Mark-present) wiring session drops these in rather than
 * re-deriving button lists live. Companion to lib/ui/headerEngine.js.
 *
 * SOURCE OF TRUTH:
 *  - FRT config: extracted VERBATIM from live frt/index.html header
 *    (all 25 FRT-only IDs from HEADER_EXTRACTION_MAP_S448 §4 preserved).
 *    FRT wires behavior via addEventListener on IDs (NOT inline onclick),
 *    so these config entries carry IDs + labels + icons + fold metadata
 *    ONLY; FRT's existing JS attaches the handlers unchanged. Handlers are
 *    left as `onClick:null` here on purpose — do NOT invent them.
 *  - Electric config: SCAFFOLD. Live Electric is still a skeleton/harness
 *    (its buttons are placeholder toasts). This mirrors its sibling Diesel
 *    structure as the intended shape; refine when Electric is built out.
 *
 * CANONICAL IDs (locked S455): ☰ = mobile-menu-btn, QR = btn-qr.
 *  - FRT today uses btn-qr-more → repoint FRT's JS ref to btn-qr at wire time.
 *  - FRT already uses mobile-menu-btn (no ☰ repoint needed for FRT).
 *
 * ICONS: carried verbatim from each live tool. FRT day-night is a bare
 * <img> (NOT the Diesel SVG-wrapped variant) — its exact markup is in
 * FRT_DAYNIGHT_ICON below. NO glyph substitution, ever (Mark, locked).
 *
 * FOLD METADATA: exemptUntilLast + exemptOrder mark QR (0) and day-night (1)
 * as the survive-longest pair (QR folds first among the two). Sign Out uses
 * isSignout:true so it pins to the drawer bottom. Everything else folds
 * right-to-left in declared order (see headerEngine.js engine).
 *
 * NOT WIRED. This module is prep only — no live tool imports it yet.
 */

/* FRT's live day-night icon, verbatim (bare <img>, base64 PNG, 22×22).
   Injected at build time from frt/index.html so it is byte-identical. */
export const FRT_DAYNIGHT_ICON = '<img src="data:image/png;base64,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" width="22" height="22" alt="Light mode" style="vertical-align:middle;display:inline-block;">';

/* Diesel's live day-night icon is SVG-wrapped (viewBox 0 0 61 61,
   preserveAspectRatio xMidYMid meet). Captured separately in the Diesel
   config at wire time; not duplicated here to avoid a second 2KB blob. */

/* ────────────────────────────────────────────────────────────────────
 * FRT — Field Review Tool
 * Bar order = live declared order (never rearranged):
 *   presence-chip · cloud-status · r2-upload-badge · save-ts · sync-indicator
 *   · undo/redo · IDB meter · inspector chip · Load · Export All · AI Review
 *   · Reports · More · day-night · text-size · Sign Out · ☰
 * Note: presence-chip / cloud-status / r2-upload-badge / sync-indicator /
 *   header-filename / save-ts are LIVE SIGNAL slots FRT carries that Diesel
 *   lacks. They are optional slots the shell injects (type:'slot'); never
 *   dropped. They do not participate in fold (always-visible signals or
 *   self-hiding via their own display logic).
 * ──────────────────────────────────────────────────────────────────── */
export function frtHeaderConfig(handlers){
  handlers = handlers || {};
  return {
    title: 'Field Review Tool',
    logoSrc: handlers.logoSrc || '',
    homeHref: '../index.html',
    defaultTheme: 'light',
    onBack: handlers.onBack || null,   // FRT: back-btn listener attached in FRT JS
    onHome: handlers.onHome || null,
    // live-signal slots injected verbatim (kept in DOM, self-managing display)
    signalSlots: [
      { id:'presence-chip', textId:'presence-chip-text' },
      { id:'r2-upload-badge' },
      { id:'header-save-ts' },
      { id:'sync-indicator', labelId:'sync-label' }
    ],
    actions: [
      { key:'nav', type:'nav-arrows', id:'header-nav-arrows', drawerLabel:'Undo / Redo',
        items:[
          { id:'btn-undo', icon:'↩', title:'Undo (Ctrl+Z)', dim:true, onClick:null },
          { id:'btn-redo', icon:'↪', title:'Redo (Ctrl+Y)', dim:true, onClick:null }
        ]},
      { key:'idb', type:'meter', id:'storage-display', fillId:null, title:'Browser storage usage', drawerLabel:'Storage usage' },
      { key:'inspector', type:'chip', id:'inspector-chip', title:'Change inspector', drawerLabel:'Inspector',
        label:'<span class="ic-icon">👤</span><span class="ic-name" id="inspector-chip-name">Set Name</span>', onClick:null },
      // dashboard buttons (FRT shows/hides these itself by context)
      { key:'load', type:'text', id:'btn-load', label:'📂 Load', title:'Load JSON', drawerLabel:'Load', onClick:null },
      { key:'exportall', type:'text', id:'btn-export-all', label:'📦 Export All', title:'Export All Projects', drawerLabel:'Export All', onClick:null },
      // AI Review dropdown (FRT purple #7B2D8E)
      { key:'ai', type:'menu', id:'btn-ai-review', wrapId:'btn-ai-wrap', menuId:'ai-mode-menu',
        label:'✨ AI Review ▾', bg:'#7B2D8E', title:'AI Review', drawerLabel:'AI Review',
        items:[
          { id:'ai-mode-rewrite', label:'✨ Full Rewrite', sub:'Professional report language (Sonnet)', onClick:null },
          { divider:true },
          { id:'btn-ai-usage', label:'📊 Usage & Costs', sub:'View AI token usage & costs', onClick:null }
        ]},
      // Reports dropdown (FRT indigo #1A237E)
      { key:'reports', type:'menu', id:'btn-reports-parent', wrapId:'btn-reports-wrap', menuId:'reports-mode-menu',
        label:'📄 Reports ▾', bg:'#1A237E', title:'Reports', drawerLabel:'Reports',
        items:[
          { id:'btn-issue', label:'📋 Issue', sub:'Bump revision (A01 → A02)', onClick:null },
          { id:'btn-pdf', label:'📄 Export PDF', sub:'Generate Field Review Report', onClick:null }
        ]},
      // More dropdown (slate #455A64) — includes the repair sub-section + QR
      { key:'more', type:'menu', id:'btn-more-wrap-btn', wrapId:'btn-more-wrap', menuId:'more-menu',
        label:'⚙️ More ▾', bg:'#455A64', title:'More options', drawerLabel:'More',
        items:[
          { id:'btn-export', label:'💾 Download JSON', sub:'Save project data to file', onClick:null },
          { id:'btn-load-more', label:'📂 Load Project', sub:'Open a JSON project file', onClick:null },
          { divider:true },
          // repair sub-section (FRT-only): btn-repair-toggle expands more-repair-items.
          // Kept as a nested marker; FRT's collapse JS manages more-repair-section.
          { id:'more-repair-section', repairSection:true, toggleId:'btn-repair-toggle', itemsId:'more-repair-items' },
          { divider:true },
          { id:'btn-diagnostics', label:'🩺 Diagnostics', sub:'Check cloud, sync, photo subsystem state', onClick:null },
          // CANONICAL: emit id 'btn-qr' (was btn-qr-more in live FRT — repoint FRT JS at wire)
          { id:'btn-qr', legacyId:'btn-qr-more', label:'📱 QR Code', sub:'Scan to open this tool on another device', onClick:null },
          { divider:true },
          { id:'btn-reset-current-tab', label:'🗑️ Reset Current Tab', sub:"Clear this tab's data", onClick:null },
          { id:'btn-reset-project', label:'⚠️ Reset Entire Project', sub:'Delete all project data', danger:true, onClick:null }
        ]},
      // exempt-until-last pair: QR (in More menu above, not a bar icon for FRT) —
      // FRT keeps QR inside More, so the ONLY exempt bar icon is day-night.
      { key:'dark', type:'icon', id:'dark-toggle', icon:FRT_DAYNIGHT_ICON, title:'Toggle Dark Mode',
        exemptUntilLast:true, exemptOrder:1, drawerLabel:'Day / Night', onClick:null },
      { key:'ts', type:'icon', id:'btn-text-size', icon:'M', title:'Text size: Small / Medium / Large', drawerLabel:'Text size', onClick:null },
      // perf-toggle is display:none in live FRT (console-only) — carried but hidden
      { key:'perf', type:'icon', id:'btn-perf-toggle', icon:'📊', title:'Toggle performance overlay', hidden:true, onClick:null },
      { key:'signout', type:'icon', id:'btn-signout', icon:'🔓', title:'Sign Out', isSignout:true, drawerLabel:'Sign Out', onClick:null }
    ]
  };
}

/* ────────────────────────────────────────────────────────────────────
 * ELECTRIC — Electric Fire Pump Commissioning  (SCAFFOLD)
 * Live Electric is still a skeleton; this mirrors sibling Diesel's shape so
 * that when Electric is built out, its header is already standardized. Its
 * own unique buttons (Readings, etc.) are marked TODO. Diesel LWW / merge
 * boundary is unrelated to the header — this is chrome only.
 * ──────────────────────────────────────────────────────────────────── */
export function electricHeaderConfig(handlers){
  handlers = handlers || {};
  return {
    title: 'Electric Fire Pump Commissioning',
    logoSrc: handlers.logoSrc || '',
    homeHref: '../ARENCON_Project_Hub.html',
    defaultTheme: 'light',
    onBack: handlers.onBack || null,
    onHome: handlers.onHome || null,
    actions: [
      { key:'nav', type:'nav-arrows', id:'header-nav-arrows', drawerLabel:'Undo / Redo',
        items:[
          { id:'btn-undo', icon:'↩', title:'Undo (Ctrl+Z)', dim:true, onClick:null },
          { id:'btn-redo', icon:'↪', title:'Redo (Ctrl+Y)', dim:true, onClick:null }
        ]},
      { key:'idb', type:'meter', id:'storage-display', fillId:'idb-bar-fill', title:'Browser storage usage', drawerLabel:'Storage usage' },
      { key:'inspector', type:'chip', id:'inspector-chip', title:'Change inspector', drawerLabel:'Inspector',
        label:'<span class="ic-icon">👤</span><span class="ic-name" id="inspector-chip-name">Set Name</span>', onClick:null },
      { key:'ai', type:'menu', id:'btn-ai-review', wrapId:'ai-review-wrap', menuId:'ai-mode-menu',
        label:'✨ AI Review ▾', bg:'#7d1f35', title:'AI Review', drawerLabel:'AI Review',
        items:[ { id:'ai-mode-full', label:'Review All', sub:'Deficiencies, responses & notes', onClick:null } ]},
      { key:'reports', type:'menu', id:'btn-reports-parent', wrapId:'btn-reports-wrap', menuId:'reports-menu',
        label:'📄 Reports ▾', bg:'#1A237E', title:'Reports', drawerLabel:'Reports',
        items:[
          { id:'btn-issue', label:'Issue Report', onClick:null },
          { id:'btn-pdf', label:'Export PDF', onClick:null }
        ]},
      // TODO(Electric build-out): 'Readings' tool-specific control lives here.
      { key:'more', type:'menu', id:'btn-more-wrap-btn', wrapId:'btn-more-wrap', menuId:'more-menu',
        label:'⚙️ More ▾', bg:'#455A64', title:'More options', drawerLabel:'More',
        items:[
          { id:'btn-download-json', label:'Download JSON', onClick:null },
          { id:'btn-export-docs', label:'Export Project Docs', onClick:null },
          { id:'btn-import-json', label:'Import JSON', onClick:null },
          { divider:true },
          { id:'btn-reset-page', label:'Reset This Page', onClick:null },
          { id:'btn-reset-all', label:'Reset All Pages', onClick:null }
        ]},
      { key:'qr', type:'icon', id:'btn-qr', icon:'📱', title:'QR Code for this tool',
        exemptUntilLast:true, exemptOrder:0, drawerLabel:'QR Code', onClick:null },
      { key:'dark', type:'icon', id:'dark-toggle', icon:'__ELECTRIC_DAYNIGHT_ICON__', title:'Toggle Dark Mode',
        exemptUntilLast:true, exemptOrder:1, drawerLabel:'Day / Night', onClick:null },
      { key:'ts', type:'icon', id:'btn-text-size', icon:'S', title:'Text size: Small / Large', drawerLabel:'Text size', onClick:null },
      { key:'signout', type:'icon', id:'btn-signout', icon:'🔓', title:'Sign Out', isSignout:true, drawerLabel:'Sign Out', onClick:null }
    ]
  };
}
