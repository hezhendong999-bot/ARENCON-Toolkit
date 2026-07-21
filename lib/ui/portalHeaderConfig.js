/**
 * ARENCON /lib/ui/portalHeaderConfig.js — Tools Portal header config
 * ══════════════════════════════════════════════════════════════════════════
 * S497c (Mark): the rebuilt index.html portal shipped with a HAND-ROLLED
 * header and sun/moon toggle — a parallel system imitating the shared engine,
 * which is exactly what the engine exists to prevent. This config retires it:
 * ONE engine (lib/ui/headerEngine2.js), one config per tool, same as the Hub
 * (hubHeaderConfig.js, S492 precedent — a NEW config file is the sanctioned
 * shape; the sealed engine and headerConfigs.js are not edited).
 *
 * What the portal header carries — and deliberately nothing more:
 *   • Logo + title. Logo click goes to the Hub (the toolkit's front door);
 *     the portal is a launcher, not a destination to return to.
 *   • Day/Night with the REAL sun/moon artwork imported from headerConfigs.js
 *     so it can never drift from FRT / Diesel / the Hub.
 *   • NO QR, text-size, sign-out, admin, menus — the portal is a static
 *     unauthenticated launcher; inventing controls it has no behaviour for
 *     would be decoration.
 *
 * THEME: the engine persists mode under the shared device key
 * ('arencon-theme'), which is what makes the portal finally agree with every
 * other engine tool on the same device — the gap Mark flagged in field test.
 * The HOST owns painting (documentElement[data-theme]); onToggleTheme flips
 * the host and mirrors back via ctl.setTheme(). defaultTheme is dark: the
 * portal is an indoor/desktop screen (Bold canon) — the default only applies
 * until the device has a saved choice.
 */

import { DAYNIGHT_SUN, DAYNIGHT_MOON } from './headerConfigs.js';

export function portalHeaderConfig(h) {
  h = h || {};
  return {
    title: 'Fire Protection Toolkit',
    skin: 'chrome',
    logoSrc: h.logoSrc || '',
    homeHref: 'ARENCON_Project_Hub.html',
    logoTitle: 'Project Hub',
    defaultTheme: 'dark',
    onHome: h.onHome || null,
    actions: [
      { key: 'dark', type: 'icon', id: 'dark-toggle', foldGroup: 'icons',
        iconLight: DAYNIGHT_SUN, iconDark: DAYNIGHT_MOON,
        title: 'Toggle Dark Mode', exemptUntilLast: true, exemptOrder: 1,
        drawerLabel: 'Day / Night', onClick: h.onToggleTheme || null }
    ]
  };
}
