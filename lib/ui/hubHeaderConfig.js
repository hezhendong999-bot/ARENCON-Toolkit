/**
 * ARENCON /lib/ui/hubHeaderConfig.js — Project Hub header config (S492, NEW FILE)
 * ══════════════════════════════════════════════════════════════════════════════
 * buildHeader2() config for ARENCON_Project_Hub.html. ONE shared engine
 * (headerEngine2.js) + one config per tool. This file is NEW by design:
 * lib/ui/headerConfigs.js is an existing lib file owned elsewhere and is NOT
 * edited (S491 lane rule).
 *
 * WHY THE HUB DIVERGES FROM FRT / DIESEL (measured against live code, S492):
 *   • NO Back button      — the Hub is the top of the tree. `setHubMode` is
 *                           never called with backVisible; the engine's back
 *                           slot stays hidden (.back has no .on class).
 *   • NO project bar      — the Hub has no report instance / filename / status
 *                           badge in its header. setProjectBar is never called.
 *   • NO AI Review, no Reports menu, no IDB meter, no undo/redo — none exist in
 *                           the Hub today and none are invented here.
 *   • More menu           — S492 (Mark): the board toolbar's "⚙️ More ▾" moves
 *                           UP into the header. On narrow screens it folds into
 *                           the shared drawer with everything else, so there is
 *                           no second overflow system on the page.
 *   • Two Hub-only slots  — the online/offline dot (engine `cloud` slot) and the
 *                           signed-in user's name + role (a `chip`). Diesel
 *                           carries a chip for its inspector; the Hub reuses the
 *                           same control type rather than inventing one.
 *
 * IDENTICAL ON BOTH HUB SCREENS (Mark, S492): the board and the project detail
 * page get the same bar, same order, same fold behaviour. Per-project actions
 * (Edit / Archive / Delete / project QR / Export Project Docs) stay on the page
 * where they act — they are NOT promoted into the header.
 *
 * LOCKED STANDARDS INHERITED VERBATIM from headerConfigs.js (S455/S488):
 *   • QR + day-night + text-size carry foldGroup:'icons' — one drawer row.
 *   • Day-night uses the REAL sun/moon artwork, never a glyph. The Hub's live
 *     header uses a ☀️ glyph today; this replaces it.
 *   • Sign-out/Logout is the teal bar button, pinned last in the drawer.
 *   • skin:'chrome' — the theme-aware Bold chrome, NOT the dead navy gradient.
 *
 * ⚠ THEME BRIDGE — READ BEFORE WIRING.
 * The Hub stores dark mode under its own key and paints from `body.dark-mode`.
 * The engine stores under the shared key and paints from `data-theme`. If the
 * shared toggle is wired straight to ctl.setTheme, the button and the page
 * disagree. The host MUST pass onToggleTheme -> the Hub's existing toggleDark(),
 * then mirror the result back with ctl.setTheme(). One source of truth, and the
 * device keeps matching every other ARENCON tool.
 *
 * ⚠ HOST TOKENS REQUIRED. The chrome skin reads --b-chrome-bg / -fg / -rule /
 * --b-chrome2 / --b-chrome-hover / --b-btn-shadow from the host document for
 * BOTH modes. The Hub does not define them today. Without them the engine falls
 * back to its light values and the header stays light on a dark page.
 */

import { DAYNIGHT_SUN, DAYNIGHT_MOON } from './headerConfigs.js';

/* Shared factories are re-declared here rather than imported because
   headerConfigs.js does not export them. The artwork IS imported, so the
   sun/moon can never drift between tools. */

function _qr(onClick){
  return { key:'qr', type:'icon', id:'btn-qr', icon:'📱', title:'QR Code for the Hub',
    foldGroup:'icons', exemptUntilLast:true, exemptOrder:0,
    drawerLabel:'QR Code', onClick:onClick||null };
}
function _dayNight(onToggle){
  return { key:'dark', type:'icon', id:'dark-toggle', foldGroup:'icons',
    iconLight:DAYNIGHT_SUN, iconDark:DAYNIGHT_MOON,
    title:'Toggle Dark Mode', exemptUntilLast:true, exemptOrder:1,
    drawerLabel:'Day / Night', onClick:onToggle||null };
}
function _textSize(onClick){
  return { key:'ts', type:'icon', id:'btn-text-size', icon:'M', foldGroup:'icons',
    title:'Text size: Small / Medium / Large', drawerLabel:'Text size',
    onClick:onClick||null };
}

/**
 * @param {object} h handlers + state from the Hub
 *   h.logoSrc            data: URL for the ARENCON mark
 *   h.onHome             logo click (Hub: return to the board, never navigate away)
 *   h.onUser             user chip click
 *   h.onAdmin, h.onProfile, h.onTools, h.onQR, h.onToggleTheme, h.onTextSize,
 *   h.onLogout
 */
export function hubHeaderConfig(h){
  h = h || {};
  return {
    title:'Project Hub',
    skin:'chrome',
    logoSrc:h.logoSrc || '',
    homeHref:'#',                 /* onHome preventDefaults; the Hub is a single page */
    logoTitle:'Back to the project board',
    defaultTheme:'dark',          /* indoor/desktop screens boot Bold·Dark (PK canon) */
    onHome:h.onHome || null,
    /* NO onBack — the Hub is the top of the tree.
       NO projectBar — the Hub header carries no report instance. */
    actions:[
      { key:'user', type:'chip', title:'Your profile',
        drawerLabel:'Signed in', label:'&#128100; Signed out',
        onClick:h.onUser || null },

      { key:'admin', type:'text', id:'btn-admin', label:'&#128100; Admin',
        title:'Admin panel', drawerLabel:'Admin Panel',
        onClick:h.onAdmin || null },

      { key:'profile', type:'text', id:'btn-profile', label:'&#9881;&#65039; Profile',
        title:'Your profile', drawerLabel:'Profile',
        onClick:h.onProfile || null },

      { key:'tools', type:'text', id:'btn-tools', label:'&#129520; Tools',
        title:'All ARENCON tools', drawerLabel:'All Tools',
        onClick:h.onTools || null },

      /* S492 (Mark): the board toolbar's "More" moves UP into the header, and
         folds into the shared drawer on narrow screens like every other tool's
         More. Slate #455A64 matches FRT and Diesel.
         ACTIONS ONLY. Archived / Deleted left this menu and became visible
         toggles on the board row — they are VIEWS, not actions, and hiding a
         view-state inside a menu meant you could not tell which set you were
         looking at without opening the menu. That also removes the need for a
         menu item to relabel itself, which the sealed engine cannot do. */
      { key:'more', type:'menu', id:'btn-more', label:'&#9881;&#65039; More &#9662;',
        bg:'#455A64', title:'More options', drawerLabel:'More',
        items:[
          { label:'&#128229; Export All', sub:'Every project as one file',
            onClick:h.onExportAll || null },
          { label:'&#128230; Export Project Docs', sub:'ZIP: photos + JSON + README',
            onClick:h.onExportDocs || null }
        ]},

      _qr(h.onQR || null),
      _dayNight(h.onToggleTheme || null),
      _textSize(h.onTextSize || null),

      { key:'signout', type:'text', id:'btn-logout', label:'&#128682; Logout',
        bg:'#0F766E', title:'Log out', isSignout:true, drawerLabel:'Logout',
        onClick:h.onLogout || null }
    ]
  };
}
