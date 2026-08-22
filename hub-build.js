/* ══════════════════════════════════════════════════════════════════════════
   ARENCON PROJECT HUB — BUILD STAMP                          hub-build.js
   ──────────────────────────────────────────────────────────────────────────
   S680b. This exists to be SMALL.

   One service worker serves the whole toolkit, so every lane's push announces
   a new build to every device. The update engine can tell whether a push was
   THIS tool's own — but only by re-reading the tool's build number from the
   server, and the Hub's build number used to live inside a 600 KB page. Asking
   a field tablet to re-download 600 KB to answer a yes/no question is not a
   check, it is a tax; so the Hub never had one, and four Diesel pushes in a
   morning put four "Update ready" pills in front of Mark on a Hub whose own
   code had not moved. A signal that fires when nothing happened teaches people
   to ignore signals.

   The number now lives here, in a file measured in bytes. Declared to the
   engine as buildFile/buildVar/buildValue; nothing else changed about how the
   Hub reads or reports it.

   Classic script on purpose: `var` at the top level of a classic script is a
   real global, so the Hub's module code keeps reading `HUB_BUILD` by name with
   no bridge. Classic scripts run before deferred modules, so it is always
   defined by the time anything looks.

   BUMP THIS ON EVERY HUB PUSH, the same discipline as the cache name.
   ══════════════════════════════════════════════════════════════════════════ */
var HUB_BUILD = 'S680';
