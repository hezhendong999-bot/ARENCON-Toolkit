/**
 * ARENCON /lib/ui/specHeaderConfig.js — Specification Generator header config
 * ══════════════════════════════════════════════════════════════════════════════
 * buildHeader2() config for spec/index.html. ONE shared engine
 * (headerEngine2.js) + one config per tool. This file is NEW by design:
 * lib/ui/headerConfigs.js is an existing lib file owned elsewhere and is NOT
 * edited (S491 lane rule; hubHeaderConfig.js / portalHeaderConfig.js are the
 * sanctioned precedent for a new per-tool config).
 *
 * WHY THIS EXISTS AT ALL (Mark, this session): spec/index.html shipped with a
 * HAND-ROLLED two-row header — its own wordmark, its own ☾/☀ glyph toggle, its
 * own Hub and Sign-out buttons. That is a second header system wearing the
 * toolkit's clothes, which is exactly what the engine exists to prevent, and
 * exactly the fault that was found and fixed on the portal in S497c. The host
 * now DELETES its own implementation and CALLS the engine. If this config's
 * CSS footprint in the host looks suspiciously small, that emptiness is the
 * proof the conversion is real rather than a matching copy.
 *
 * WHAT THE SPEC HEADER CARRIES — and deliberately nothing more.
 * Mark's instruction was literal: use the shared engine, drop the controls this
 * tool has no behaviour for. Every entry below maps to a control that already
 * existed and already worked in the hand-rolled bar:
 *
 *   • Back arrow   — was the "Hub" button. In project mode it returns to that
 *                    project's Hub page; in master mode to the toolkit portal.
 *                    Arrow-only per S504.
 *   • Import       — was #btnImport. Same handler, same behaviour.
 *   • Publish      — was #btnPublish. Still gated: principals only, and the
 *                    version navigator it depends on is deferred, so the host
 *                    keeps it disabled until that lands.
 *   • Help         — coming-soon panel, same as the portal. No spec card set is
 *                    Owner-reviewed yet, so the engine's own coming-soon state
 *                    shows rather than an empty guide.
 *   • Day / Night  — REAL sun/moon artwork imported from headerConfigs.js, so
 *                    it can never drift from FRT / Diesel / Hub / portal. The
 *                    ☾ / ☀ text glyph it replaces was a per-tool invention.
 *   • Avatar       — NOT configured here. The engine resolves identity by
 *                    itself and wires the shared Account panel and Sign Out.
 *                    That is why the standalone "Sign out" button is gone: as a
 *                    bare header button it sat one mis-tap from ending a
 *                    session mid-review (Hub S633 reasoning, same here — losing
 *                    your place in a 23-section document is the same cost).
 *   • Cloud + save stamp — engine slots, driven by the host's existing
 *                    freshness logic. Not actions, so they are not actions.
 *
 * DELIBERATELY ABSENT, each with a reason rather than an omission:
 *   • QR            — nothing here is worth scanning onto a phone; a spec is
 *                     read on a desktop and issued as a file.
 *   • Text size     — retired toolkit-wide into Account › Preferences (S633).
 *   • Undo / redo   — on-paper editing is approved but not built. A control
 *                     that does nothing is worse than no control.
 *   • Presence      — no realtime channel on the sg_* tables.
 *   • R2 badge, storage meter — this tool stores no binaries and uses no IDB.
 *   • Project bar   — the spec has no report instance, filename or status
 *                     badge. When issues (B01/B02) land, THIS is the slot they
 *                     belong in; until then setProjectBar is never called.
 *   • Insights, Tools, More — Hub-only. None are invented here.
 *
 * ⚠ HOST TOKENS REQUIRED. The chrome skin reads --b-chrome-bg / -fg / -rule /
 * --b-chrome2 / --b-chrome-hover / --b-btn-shadow from the host document for
 * BOTH modes. spec/index.html defined only three of the six; the missing ones
 * are added in the host alongside this file, or the engine falls back to its
 * light values and the bar stays light on a dark page.
 *
 * ⚠ THEME BRIDGE. The host paints from documentElement[data-theme] and persists
 * under the shared device key 'arencon-theme'. onToggleTheme must flip the HOST
 * and mirror the result back with ctl.setTheme() — one source of truth, and the
 * device keeps agreeing with every other ARENCON tool. Wiring the button
 * straight to ctl.setTheme makes the button and the page disagree.
 */

import { DAYNIGHT_SUN, DAYNIGHT_MOON } from './headerConfigs.js';

/* Re-declared rather than imported because headerConfigs.js does not export
   these factories. The ARTWORK is imported, so sun/moon cannot drift. */
function _dayNight(onToggle) {
  return { key: 'dark', type: 'icon', id: 'dark-toggle', foldGroup: 'icons',
    iconLight: DAYNIGHT_SUN, iconDark: DAYNIGHT_MOON,
    title: 'Toggle Dark Mode', exemptUntilLast: true, exemptOrder: 1,
    drawerLabel: 'Day / Night', onClick: onToggle || null };
}

/* Amber "?" at rest — always findable, no motion. The wn-dot span is the
   unseen-update signal, hidden until a card set exists (S505 pattern, verbatim
   from hubHeaderConfig.js / portalHeaderConfig.js). */
function _help(onClick) {
  return { key: 'help', type: 'icon', id: 'btn-help', foldGroup: 'icons', foldRank: 6,
    icon: '<span class="help-q">?</span><span class="wn-dot" style="display:none"></span>',
    title: 'Help & guide', drawerLabel: 'Help', onClick: onClick || null };
}

/**
 * @param {object} h handlers + state from spec/index.html
 *   h.logoSrc         data: URL for the ARENCON mark (logo_base64.txt, WITH prefix)
 *   h.onBack          back arrow — Hub page in project mode, portal in master mode
 *   h.onImport        Import…
 *   h.onPublish       Publish…
 *   h.onHelp          Help panel
 *   h.onToggleTheme   flips the HOST theme, then mirrors via ctl.setTheme()
 */
export function specHeaderConfig(h) {
  h = h || {};
  return {
    title: 'Specification Generator',
    skin: 'chrome',
    logoSrc: h.logoSrc || '',
    logoTitle: 'ARENCON',
    defaultTheme: 'dark',        /* indoor/desktop screen — Bold·Dark (PK canon) */
    onBack: h.onBack || null,
    /* NO onHome: the engine deliberately does not make the logo a control
       (S633b). Leaving is the back arrow, and only the back arrow. */
    actions: [
      /* A plain text entry inherits the engine's base .hbtn — white text on a
         15%-white fill, written for the dark navy skin. On the light chrome
         that is white-on-near-white. Giving an entry `bg` makes the engine
         paint a solid fill with white text, correct in BOTH modes (S492). */

      /* Graphite #4A4750 is the toolkit's neutral for "not a commitment".
         Import brings a document IN for reconciliation; it adds and modifies
         and can never delete, so it is not the dangerous half of the pair. */
      { key: 'import', type: 'text', id: 'btn-import', label: 'Import&hellip;',
        bg: '#4A4750', title: 'Bring a Word file back in',
        drawerLabel: 'Import', onClick: h.onImport || null },

      /* Slate #455A64 is the family's second header colour, the one the Hub
         uses for "More". Burgundy was wrong here: no other tool puts brand
         colour in the bar, so it read as a stray element rather than as part
         of the toolkit. Brand stays where canon puts it — primary CTAs inside
         the page, not header chrome. */
      { key: 'publish', type: 'text', id: 'btn-publish', label: 'Publish&hellip;',
        bg: '#455A64', title: 'Publish a new master version',
        drawerLabel: 'Publish', onClick: h.onPublish || null },

      _help(h.onHelp || null),
      _dayNight(h.onToggleTheme || null)

      /* NO Sign Out entry: the engine's avatar menu owns it once identity
         resolves. See the header note above. */
    ]
  };
}
