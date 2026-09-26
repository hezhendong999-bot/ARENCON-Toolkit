/* ═══ lib/shared/localDate.js — S732 ════════════════════════════════════════
   THE DATE THE INSPECTOR IS STANDING IN.

   Every ARENCON tool stamps a date into a form field: Date of Inspection,
   the sign-off Date & Time, Date Modified. Until S732 the pump tools filled
   those with new Date().toISOString(), which is the UTC calendar — so a
   commissioning test after 8 pm in summer opened dated TOMORROW, and the
   sign-off time was always four or five hours ahead of the wall clock. Both
   printed verbatim on the cover as Date of Test. A pre-filled field reads as
   correct; nobody checks it. S731 audit finding F1.

   This is a CLASSIC script, not a module, on purpose: the fields are filled
   by top-level statements in classic scripts as they are parsed, and module
   code does not run until every classic script has finished — a module
   helper would be undefined at exactly the moment it is needed. Load it
   with a plain <script src> before any script that stamps a date.

   Device-local, not a hard-coded zone: the tablets are set to Toronto, and
   if one is ever carried to a site in another zone, the date on the report
   should be the date at the site. This is also exactly how the pump PDF's
   Date of Issue already works (toLocaleDateString('en-CA')). No locale
   formatting is relied on here, though — the parts are read and padded
   directly, so the result is the same on every browser and language. */
(function (root) {
  'use strict';
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* 'YYYY-MM-DD' in the device's own calendar. For <input type="date">. */
  function dateISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* 'YYYY-MM-DDTHH:MM' in the device's own clock. For <input type="datetime-local">. */
  function dateTimeISO(d) {
    d = d || new Date();
    return dateISO(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  root.ArcLocalDate = { dateISO: dateISO, dateTimeISO: dateTimeISO };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
