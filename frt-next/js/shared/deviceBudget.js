// frt/js/shared/deviceBudget.js
// S131 priority #1 — Device-class canvas memory budget. SINGLE SOURCE OF TRUTH.
//
// The FRT drawing viewer allocates several large GPU-/renderer-backed
// canvases at once:
//   • markup.js  — the 2D markup canvas + a sibling WebGL/Pixi canvas
//   • tiledPdf.js — one backing-store canvas per active zoom level, sized
//                   to the native level resolution (L4 ≈ 6144×4096 ≈ 96 MB)
//
// Historically each site classified the device with its own copy of a
// TWO-tier check ("Android phone" vs "everything else"). The shared Android
// FIELD TABLETS fell into "everything else" and inherited the 30 MP desktop
// budget — far beyond what the tablet GPU/renderer can hold. Combined demand
// exhausted memory → webglcontextlost / renderer OOM ("Aw snap") → the app
// crashed during a live site review on 2026-05-14.
//
// This module is the ONE place the tiers are defined. Every budget site
// imports `deviceMaxPixels()` from here so the numbers can never drift
// between files again (the duplication was the root cause — see S130/S131
// handoffs and the dead-code audit guidance).
//
// Tiers (megapixels of canvas backing store the device can afford):
//   • phone   —  8 MP  conservative handheld
//   • tablet  — 12 MP  GPU-realistic for the shared Android field tablets
//                      (starting value — validate on real hardware; this is
//                       the one constant to nudge if a tablet still OOMs)
//   • desktop — 30 MP  crisp pen strokes / tiles at max zoom
//
// Phone vs tablet detection: phones carry BOTH "Android" and "Mobile" UA
// tokens and do NOT match the Samsung tablet model prefixes. Tablets either
// omit the "Mobile" token or match SM-T / SM-X / "Tablet".

// Returns 'phone' | 'tablet' | 'desktop'. Defensive against non-browser
// environments (returns 'desktop' if there is no navigator, e.g. under a
// node test harness — the functions are import-safe even though they are
// only meaningful in a browser).
export function deviceClass() {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (!/Android/.test(ua)) return 'desktop';
  if (/Mobile/.test(ua) && !/SM-T|SM-X|Tablet/.test(ua)) return 'phone';
  return 'tablet';
}

// Maximum canvas backing-store pixel count for the current device class.
export function deviceMaxPixels() {
  switch (deviceClass()) {
    case 'phone':  return 8000000;
    case 'tablet': return 12000000;
    default:       return 30000000;
  }
}
