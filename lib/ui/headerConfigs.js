/**
 * ARENCON /lib/ui/headerConfigs.js — Tool header configs (S455, LOCKED)
 * ══════════════════════════════════════════════════════════════════════
 * buildHeader() configs for every tool. ONE shared engine (headerEngine.js)
 * + one config per tool. A header change happens once in the engine and
 * every tool inherits it; adding a button = one entry here.
 *
 * LOCKED STANDARDIZATION (S455, Mark) — applies to ALL tools unless a tool
 * has a genuinely unique feature:
 *   • AI Review button  = PURPLE #7B2D8E everywhere (S488 Mark: the S455
 *     burgundy ruling is REVERSED — purple is the keeper)
 *   • QR                = standalone bar icon on every tool (canonical #btn-qr),
 *                         in the survive-longest pair with day-night
 *   • Text size         = S/M/L (shows M) everywhere
 *   • Day-night         = REAL sun/moon PNG icons, swap with theme. NEVER a
 *                         glyph. sun=DAYNIGHT_SUN (light), moon=DAYNIGHT_MOON
 *                         (dark); engine swaps via iconLight/iconDark.
 *   • Sign Out          = teal #0F766E BAR button on PC; folds to the drawer
 *                         bottom only when narrow (isSignout:true).
 *   • Back              = pixel-locked 84px slot; title truncates, never hidden.
 *   • Fold              = priority-overflow, real px, no @media. QR & day-night
 *                         survive longest (QR folds first of the two).
 *
 * Per-tool uniqueness (allowed divergence):
 *   • FRT carries live-signal slots Diesel/Electric lack (presence, sync
 *     indicator, r2 badge, save-ts) and dashboard-only Load/Export All
 *     (hidden:true in-project).
 *
 * Handlers: FRT wires behavior via addEventListener on IDs, so its entries
 * carry IDs/labels/icons/fold-metadata and onClick:null. Diesel/Electric
 * pass real handlers at build time.
 *
 * Canonical IDs (locked): mobile-menu-btn, btn-qr. FRT legacy btn-qr-more
 * repointed to btn-qr at wire; FRT already uses mobile-menu-btn.
 */

export const DAYNIGHT_SUN  = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 61 61" preserveAspectRatio="xMidYMid meet" style="vertical-align:middle;display:inline-block;"><image href="data:image/png;base64,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" x="0" y="0" width="61" height="61"/></svg>';
export const DAYNIGHT_MOON = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 46 48" preserveAspectRatio="xMidYMid meet" style="vertical-align:middle;display:inline-block;"><image href="data:image/png;base64,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" x="0" y="0" width="46" height="48"/></svg>';

function _dayNight(onToggle){
  return { key:'dark', type:'icon', id:'dark-toggle', foldGroup:'icons',
    iconLight:DAYNIGHT_SUN, iconDark:DAYNIGHT_MOON,
    title:'Toggle Dark Mode', exemptUntilLast:true, exemptOrder:1,
    drawerLabel:'Day / Night', onClick:onToggle||null };
}
function _qr(onClick){
  return { key:'qr', type:'icon', id:'btn-qr', icon:'📱', title:'QR Code for this tool',
    foldGroup:'icons',   /* S488 (Mark): QR + day-night + text-size fold TOGETHER into one drawer row */
    exemptUntilLast:true, exemptOrder:0, drawerLabel:'QR Code', onClick:onClick||null };
}
function _textSize(onClick){
  return { key:'ts', type:'icon', id:'btn-text-size', icon:'M', foldGroup:'icons',
    title:'Text size: Small / Medium / Large', drawerLabel:'Text size', onClick:onClick||null };
}
/* Help (S505): amber "?" at rest (always findable, no motion). The wn-dot span is the
   unseen-content pulse; hidden until helpEngine.hasUnseen() flips it on via
   setControlIcon('help', …) AFTER header build. Copied verbatim from hubHeaderConfig.js —
   shared engine, one treatment across all tools. Folds early (foldRank 6) into the icons row. */
function _help(onClick){
  return { key:'help', type:'icon', id:'btn-help', foldGroup:'icons', foldRank:6,
    icon:'<span class="help-q">?</span><span class="wn-dot" style="display:none"></span>',
    title:'Help & guide', drawerLabel:'Help', onClick:onClick||null };
}
function _signout(onClick){
  return { key:'signout', type:'text', id:'btn-signout', label:'🔓 Sign Out', bg:'#0F766E',
    title:'Sign Out', isSignout:true, drawerLabel:'Sign Out', onClick:onClick||null };
}

/* ═══ S653 — ONE HEADER ACROSS EVERY TOOL ═══════════════════════════════════
   Mark, 14 Aug: "I want unified header." The Hub moved Sign Out, Profile and
   the user chip into the account avatar in S633e. FRT, Diesel and Electric
   never followed, so a person's header changed depending on which tool they
   opened, and Sign Out was still a bright standalone button — one mis-tap from
   ending a session mid-review, which is the reason it left the Hub's bar.

   _accountFor() builds the same account block the Hub passes, reading identity
   from the shared auth module so no tool fetches its own profile row. When it
   returns something, the standalone Sign Out button is DROPPED from the bar and
   sign-out lives in the avatar menu instead — exactly the Hub's arrangement.

   If identity is unavailable (standalone mode, no session, auth not loaded yet)
   it returns null and the old Sign Out button stays. A header with no avatar
   AND no Sign Out would leave a signed-in person with no way out, so the
   fallback is deliberate, not laziness. */
function _accountFor(h){
  h = h || {};
  if (h.account) return h.account;                 // host supplied it outright
  var A = (typeof window !== 'undefined') ? window.Auth : null;
  if (!A || !A.getUser || !A.getUser()) return null;
  var u = A.getUser() || {};
  var name = (A.getFullName && A.getFullName()) || u.email || '';
  var ini  = (A.getInitials && A.getInitials()) || '';
  if (!name && !ini) return null;
  return {
    name: name,
    email: u.email || '',
    initials: ini || '?',
    colour: (A.getRingColor && A.getRingColor()) || '#888888',
    onAccount: h.onAccount || null,
    onSignOut: h.onSignout || h.onSignOut || null
  };
}

/* Actions may contain nulls once Sign Out is dropped; the engine should never
   see a hole in the list. */
function _clean(actions){ return (actions || []).filter(Boolean); }
function _navArrows(onUndo,onRedo,opts){
  var e = { key:'nav', type:'nav-arrows', id:'header-nav-arrows', drawerLabel:'Undo / Redo',
    items:[
      { id:'btn-undo', icon:'↩', title:'Undo (Ctrl+Z)', dim:true, onClick:onUndo||null },
      { id:'btn-redo', icon:'↪', title:'Redo (Ctrl+Y)', dim:true, onClick:onRedo||null }
    ]};
  /* S585 (Mark): undo/redo live in the mobile HEADER BAR, not buried in the
     drawer — exempt from folding until truly nothing else fits. Opt-in per
     tool: Diesel passes {exempt:true}; FRT's header is Lane A's call. */
  if (opts && opts.exempt) { e.exemptUntilLast = true; e.exemptOrder = 2; }
  return e;
}

export function dieselHeaderConfig(h){
  /* S488 REWRITTEN for the SEALED v2 engine (was the v1 light-DOM contract:
     element ids, signalSlots, icon:'' day/night — none of which can cross a
     shadow boundary; icon:'' is the exact bug that blanked Electric's sun/moon).
     Mirrors live Diesel's header 1:1. Colors per S488 Mark: AI purple #7B2D8E,
     Reports navy, More slate, Sign Out teal. Icon trio carries foldGroup:'icons'
     via the shared factories, so QR/day-night/text-size share one drawer row. */
  h = h || {};
  var _acct = _accountFor(h);   /* S653: null ⇒ keep the old Sign Out button */
  return {
    title:'Diesel Fire Pump Commissioning Report',
    skin:'chrome',   /* the unified look (S488: NOT the dead navy gradient) */
    logoSrc:h.logoSrc||'', homeHref:'index.html', defaultTheme:'light',
    onBack:h.onBack||null, onHome:h.onHome||null,
    projectBar:{ onBadgeClick:h.onBadgeClick||null },
    actions:_clean([
      _navArrows(h.onUndo||null, h.onRedo||null, {exempt:true}),   /* S585: stays in the bar on mobile */
      /* S551 fold order (lower goes first). Storage usage is a number you look
         at once a month; it has no business outranking undo on a phone. */
      { key:'idb', foldRank:5, type:'meter', label:'IDB', title:'Browser storage usage', drawerLabel:'Storage usage' },
      { key:'inspector', foldRank:20, type:'chip', title:'Change inspector', drawerLabel:'Inspector',
        label:'&#128100; Set Name', onClick:h.onInspector||null },
      { key:'ai', foldRank:25, type:'menu', label:'&#10024; AI Review &#9662;', bg:'#7B2D8E',
        title:'AI text review of deficiencies, responses & notes', drawerLabel:'AI Review',
        items:[
          { label:'&#10024; Full Review', sub:'Professional report language (Sonnet)', onClick:h.onAiReviewAll||null },
          { divider:true },
          { label:'&#128202; Usage & Costs', sub:'View AI token usage & costs', onClick:h.onAiUsage||null }
        ]},
      { key:'reports', foldRank:30, type:'menu', label:'&#128196; Reports &#9662;', bg:'#1A237E',
        title:'Reports', drawerLabel:'Reports', hubOnly:true,
        items:[
          { label:'&#128203; Issue', sub:'Bump revision & mark issued', onClick:h.onIssue||null },
          { label:'&#128196; Export PDF', sub:'Generate commissioning report', onClick:h.onExportPDF||null }
        ]},
      { key:'more', foldRank:35, type:'menu', label:'&#9881;&#65039; More &#9662;', bg:'#455A64',
        title:'More options', drawerLabel:'More',
        items:[
          { label:'&#128190; Download JSON', sub:'Save project data to file', onClick:h.onDownloadJSON||null },
          { label:'&#128230; Export Project Docs', sub:'ZIP: photos + JSON + README', onClick:h.onExportDocs||null },
          { label:'&#128194; Import JSON', sub:'Load project data from file', onClick:h.onImportJSON||null },
          { divider:true },
          { label:'&#128465;&#65039; Reset Current Page', sub:"Clear this page's data", onClick:h.onResetPage||null },
          { label:'&#9888;&#65039; Reset All Pages', sub:'Delete all project data', danger:true, onClick:h.onResetAll||null },
          { divider:true, hubOnly:true },
          { label:'&#9729;&#65039; Re-upload All Photos', sub:'Push all local photos to R2', hubOnly:true, onClick:h.onReupload||null },
          { label:'&#129529; Cloud Storage Check', sub:'Stranded or missing cloud files', hubOnly:true, onClick:h.onR2Cleanup||null },
          { label:'&#128270; Photo Delete Log', sub:'Recent photo deletions + triggers', onClick:h.onDelDiag||null },
          /* S549: on-screen, because the field tablets are the installed app —
             no console, no address bar. A check that can only be run from a
             desktop answers about the desktop, and the photo store is per-device:
             the only device whose answer matters is the one that took the photos. */
          { label:'&#128190; Photo Store Check', sub:'Are this device\u2019s photos backed up?', onClick:h.onPhotoStore||null },
          /* S555: the record of what recent saves changed, on screen. The
             7155.40 wipe looked like every other save from the outside. */
          { label:'&#128221; Recent Saves', sub:'What each save added or removed', onClick:h.onSaveLog||null },
          /* S585: the phone is the installed app — no console. This panel IS
             the console: build, network, sign-in, unsent work, last push/pull. */
          { label:'&#128246; Sync Status', sub:'Is this device syncing? See exactly why not', onClick:h.onSyncStatus||null }
        ]},
      _help(h.onHelp||null),
      _qr(h.onQR||null),
      _dayNight(h.onToggleTheme||null),   /* engine-owned artwork + foldGroup */
      _textSize(h.onTextSize||null),
      _acct ? null : _signout(h.onSignout||null)   /* S653: avatar replaces it */
    ]),
    account: _acct
  };
}

export function frtHeaderConfig(h){
  /* S488 Wave 3 prep — REWRITTEN against the LIVE FRT header (the S455 skeleton
     predated: CRB Import Responses, Export Project Docs, the Repair section's
     five items with admin gating, Diagnostics, QR-in-menu, danger styling).
     Handlers are REAL callbacks now — the old onClick:null + wire-by-ID pattern
     cannot cross the v2 shadow boundary. The retired folder sync-indicator
     (display:none!important in live frt.css) is intentionally absent.
     Colors: AI Review = purple #7B2D8E (S488 Mark — reverses the S455
     burgundy standardization); Reports navy; More slate; Sign Out teal. */
  h = h || {};
  var _acct = _accountFor(h);   /* S653: null ⇒ keep the old Sign Out button */
  return {
    title:'Field Review Tool',
    skin:'chrome',   /* S488 CORRECTION (Mark): the unified header is NOT the fixed dark
       gradient — live Diesel's late !important Bold rule overrides its dead line-50
       gradient, so the real unified look is the theme-aware Bold chrome tokens
       (light #E6E3E9 day / #1d1b24 dark). The v2 'verbatim' extraction captured
       the dead rule. Diesel Wave 2 must also use skin:'chrome'. */
    logoSrc:h.logoSrc||'', homeHref:'../index.html', defaultTheme:'light',
    onBack:h.onBack||null, onHome:h.onHome||null,
    onCloudClick:h.onCloudClick||null,        /* tap-for-diagnostic */
    onPresenceClick:h.onPresenceClick||null,  /* presence popover */
    projectBar:{ onBadgeClick:h.onBadgeClick||null },
    actions:_clean([
      _navArrows(h.onUndo||null, h.onRedo||null),
      { key:'idb', foldRank:5, type:'meter', label:'IDB', title:'Browser storage usage', drawerLabel:'Storage usage' },
      { key:'inspector', foldRank:20, type:'chip', title:'Change inspector', drawerLabel:'Inspector',
        label:'&#128100; Set Name', onClick:h.onInspector||null },
      /* S488 (Mark): Load + Export All are NOT standalone header buttons —
         they live inside the More menu as items (see below). */
      { key:'ai', foldRank:25, type:'menu', label:'&#10024; AI Review &#9662;', bg:'#7B2D8E',   /* S488 (Mark): purple stays — the S455 burgundy standardization is REVERSED for AI Review */
        title:'AI Review', drawerLabel:'AI Review', hubOnly:true,
        items:[
          { label:'&#10024; Full Rewrite', sub:'Professional report language (Sonnet)', onClick:h.onAiRewrite||null },
          { divider:true },
          { label:'&#128202; Usage & Costs', sub:'View AI token usage & costs', onClick:h.onAiUsage||null }
        ]},
      { key:'reports', foldRank:30, type:'menu', label:'&#128196; Reports &#9662;', bg:'#1A237E',
        title:'Reports', drawerLabel:'Reports', hubOnly:true,
        items:[
          { label:'&#128203; Issue', sub:'Bump revision (A01 &#8594; A02)', onClick:h.onIssue||null },
          { label:'&#128196; Export PDF', sub:'Generate Field Review Report', onClick:h.onExportPDF||null },
          { label:'&#128229; Import Responses', sub:'Read a contractor-filled report PDF', onClick:h.onCrbImport||null },
          { label:'&#128274; Issue History', sub:'Locked comments &#183; unfreeze (internal)', onClick:h.onIssueHistory||null }
        ]},
      { key:'more', foldRank:35, type:'menu', label:'&#9881;&#65039; More &#9662;', bg:'#455A64',
        title:'More options', drawerLabel:'More',   /* S488: always visible — carries Load/Export All, which the dashboard needs too */
        items:[
          /* S497e (Mark): FRT More menu slimmed. REMOVED from the menu (features
             and handlers remain in code, restorable on request): Export All
             Projects (belongs to the Hub, not a field tool), Download JSON
             (redundant — Export Project Docs covers JSON + photos), Diagnostics
             (admin clutter), QR Code (duplicate of the header QR icon, which
             already folds into the drawer on small screens). Repair submenu
             kept pending Mark's decision — it is the only recovery surface for
             the photo subsystem. */
          { label:'&#128194; Load JSON', sub:'Open a saved project file', onClick:h.onLoad||null },
          { label:'&#128230; Export Project Docs', sub:'ZIP: photos + JSON + README', onClick:h.onExportDocs||null },
          { divider:true },
          { repairSection:true, label:'&#128295; Repair', adminOnly:true, repairItems:[
            /* S497f (Mark): EVERY repair row is super-admin — no staff touches
               R2 in any form. The section toggle was already gated; these two
               rows lacked their own flag and rode on the section's. Now each
               row carries the gate itself, so no future layout change can
               expose them. */
            { label:'&#9729;&#65039; Re-upload All', sub:'Push all drawings & photos to R2', adminOnly:true, onClick:h.onReupload||null },
            /* S497h: 'Fix Blurry' and 'Repair R2 Links' REMOVED — both rows were
               permanently inert (no implementation has ever existed in FRT;
               onFixBlurry/onRepairLinks were hardcoded null). A menu row that
               silently does nothing is worse than no row, especially in an
               admin recovery menu where Mark would reasonably believe a repair
               had run. Re-add only alongside a real, tested implementation. */
            { label:'&#128444;&#65039; Repair Photos', sub:'Remove duplicate pool photos & re-home orphans', adminOnly:true, onClick:h.onRepairPhotos||null },
            { label:'&#129529; R2 Cleanup', sub:'Delete orphaned cloud files', adminOnly:true, onClick:h.onR2Cleanup||null }
          ]},
          { divider:true },
          { label:'&#128465;&#65039; Reset Current Tab', sub:"Clear this tab's data", onClick:h.onResetTab||null },
          { label:'&#9888;&#65039; Reset Entire Project', sub:'Delete all project data', danger:true, onClick:h.onResetProject||null }
        ]},
      _help(h.onHelp||null),
      _qr(h.onQR||null),
      _dayNight(h.onToggleTheme||null),
      _textSize(h.onTextSize||null),
      _acct ? null : _signout(h.onSignout||null)   /* S653: avatar replaces it */
    ]),
    account: _acct
  };
}

export function electricHeaderConfig(h){
  h = h || {};
  var _acct = _accountFor(h);   /* S653: null ⇒ keep the old Sign Out button */
  return {
    title:'Electric Fire Pump Commissioning',
    skin:'chrome',   /* S488 Wave 1: Electric's live header is the Bold chrome (chrome.css), not navy */
    projectBar:{ onBadgeClick:h.onBadgeClick||null },   /* S488: project bar inside module scope */
    logoSrc:h.logoSrc||'', homeHref:'index.html', defaultTheme:'light',
    toolOwnsTheme:true,   // Electric owns body.dark-mode + its own #dark-toggle icon (updateDarkToggleIcon)
    onBack:h.onBack||null, onHome:h.onHome||null,
    // cloud sync status — Electric's JS reads/writes these spans
    signalSlots:[
      { cloudStatus:true, id:'cloud-status', dotId:'cloud-dot', textId:'cloud-status-text', lastSyncId:'last-sync-text' }
    ],
    actions:_clean([
      // Reports ▾ — grouped like diesel (Issue Report + Export PDF)
      { key:'reports', type:'menu', id:'btn-reports-parent', wrapId:'btn-reports-wrap', menuId:'reports-menu',
        label:'📄 Reports ▾', bg:'#1A237E', title:'Reports', drawerLabel:'Reports',
        items:[
          { label:'📄 Issue Report', onClick:h.onIssue||null },
          { label:'📑 Export PDF', onClick:h.onExportPDF||null }
        ]},
      // More ▾ — only Electric's REAL actions (no exportDocs/photo-log/dslDiag)
      { key:'more', type:'menu', id:'btn-more-parent', wrapId:'btn-more-wrap', menuId:'more-menu',
        label:'⚙️ More ▾', bg:'#455A64', title:'More options', drawerLabel:'More',
        items:[
          { label:'⬇️ Download JSON', onClick:h.onDownloadJSON||null },
          { label:'⬆️ Import JSON', onClick:h.onImportJSON||null },
          { divider:true },
          { label:'☁️ Re-upload All Photos', sub:'Push all local photos to R2', id:'menu-reupload', hubOnly:true, onClick:h.onReupload||null },
          { label:'🧹 R2 Cleanup', sub:'Remove stranded cloud files', id:'menu-r2cleanup', hubOnly:true, onClick:h.onR2Cleanup||null },
          /* S552: same on-screen check as Diesel. The field tablets are the
             installed app — no console — and the store is per-device, so this
             is the only place the answer can honestly be read. */
          { label:'💾 Photo Store Check', sub:'Are this device\u2019s photos backed up?', onClick:h.onPhotoStore||null },
          /* S574: Electric joins the save record. Before S567 Electric had no
             merge protection at all, so there was little meaningful to record;
             now it runs the same engine as Diesel and the same question applies
             on a tablet with no console — what did that save actually do? */
          { label:'📝 Recent Saves', sub:'What each save added or removed', onClick:h.onSaveLog||null },
          { divider:true },
          { label:'↺ Reset This Page', onClick:h.onResetPage||null },
          { label:'⟳ Reset All Pages', onClick:h.onResetAll||null }
        ]},
      _help(h.onHelp||null),
      _qr(h.onQR),
      // S488: engine-owned day/night artwork (iconLight/iconDark swap on setTheme).
      // Root cause of the S460 'day/night SVG' bug: icon:'' relied on the HOST filling
      // #dark-toggle — impossible through the v2 shadow boundary. Host still owns
      // body.dark-mode; toggleDarkMode now also calls ctl.setTheme.
      _dayNight(h.onToggleTheme||null),   /* S488: shared factory — carries foldGroup:'icons'
        so Electric's drawer gets the same 3-across row as FRT/Diesel. The inline
        entry it replaces lacked the group and would have stranded day/night. */
      _textSize(h.onTextSize),
      _acct ? null : _signout(h.onSignout)         /* S653: avatar replaces it */
    ]),
    account: _acct
  };
}
