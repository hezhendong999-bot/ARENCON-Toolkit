// ============================================================================
// lib/esc.js — shared HTML-escape helper (S453)
// ----------------------------------------------------------------------------
// Single source for HTML text/attribute escaping. Escapes & < > " — the safe
// set for both element text and double-quoted attributes. This matches the
// EXACT current output of the strictest common FRT copies (pdf.js,
// deficiencies.js, drawings.js, exportview.js), so those files can adopt it
// with ZERO behavior change (byte-identical output).
//
// NOT migrated yet (different output — would be a behavior change):
//   - copies that escape only & < >  (ai/*, photos, viewer._escHtml)
//   - app.js._escHtml which ALSO escapes single-quote '  (stricter superset)
// Those need per-file review before adopting this.
//
// Pure function, no state, no DOM. Safe in workers.
// ============================================================================

export function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// window fallback for any classic-script include (nothing runs on import).
if (typeof window !== 'undefined') { window._frtEsc = esc; }
