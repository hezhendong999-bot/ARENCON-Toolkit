# ARENCON DIESEL PK — DELTA S499 (Lane C)

Layer this on top of `ARENCON_Diesel_PK.md` and prior deltas. Verify against live HEAD
before trusting any statement here. Accurate at `0b25b9c`.

---

## NEW — `lib/calc/` : the shared calc namespace

First modules carved out of the Diesel monolith. Both are **classic `<script>`** following the
`lib/**` house pattern (IIFE + `window` global, guarded CommonJS export, **no bare `export`
statements** — those throw the moment a classic `<script>` parses the file, which is how a
shared module takes a whole tool down).

### `lib/calc/pumpCurve.js` v1.0.0 → `window.PumpCurve`
- `interpCurve(curve, flow)` — linear interpolation along the measured curve.
  Clamps outside the measured range (**no extrapolation** — a curve outside measured data is
  not evidence). Returns `null` (never `0`) for an empty/missing curve, so a missing curve
  cannot read as a real zero-head measurement. Duplicate `x` guarded with `t = 0`.
- `curveDevOver1pct(adjNet, pointPlacard)` — NFPA-style 1% deviation vs placard.
  **Strict `>`**, so exactly 1.00% is NOT a deviation. Returns `false` for null/NaN/non-positive
  placard: an unknown reading is not a deviation, and flagging unknown as failure would put
  false deficiencies on a report going to an owner and an AHJ.

### `lib/calc/curveData.js` v1.0.0 → `window.CurveData`
- `measuredDischargePts(rows, isPld, rowFlow)` — rows → sorted `{x,y}` points.
  Rows with unreadable flow **or** discharge are **dropped, not zeroed** (a missing reading must
  never plot as 0 psi — that draws a pump collapsing to no pressure). Pld tab prefers `dis_w`,
  falls back to `discharge`; `dis_w === 0` is a real reading, not an absence (`!= null`).
- `goldenCurve(pts, cap)` — clips at the lowest active cap and **inserts an interpolated point
  at the cap crossing**, so the plotted line bends at the cap instead of cutting the corner.
  Without it the chart shows the pump leaving the cap at the wrong flow. No crossing inserted
  when `y === y2` (divide-by-zero guard).

**Host contract for both:** the host keeps its existing function names as **thin delegates**
with an inline fallback, so existing call sites are untouched and a failed module load cannot
strand an inspector mid-commissioning. **Global and DOM reads stay in the host**
(`stdData`/`pldData`, cap inputs); modules take values as arguments. That separation is the
only reason the maths is testable.

---

## NEW — Diesel test suite (`tests/unit/`, 61 tests)

`vitest.config.js` `include` widened to `['frt/tests/**/*.test.js', 'tests/**/*.test.js']` so
shared-lib and FRT suites run in one command — a shared-engine change cannot pass by testing
only one tool.

| File | Tests | Covers |
|---|---|---|
| `pumpCurve.test.js` | 22 | interpolation + deviation, all edge cases |
| `curveData.test.js` | 21 | curve construction + cap clipping |
| `dieselMerge.test.js` | 18 | cloud↔local merge, run against LIVE monolith source |

`dieselMerge.test.js` extracts its functions from the shipped HTML **at test time**, so it
cannot drift from what runs in the field. Its harness self-checks the dependency closure and
throws if a helper is missing.

---

## MERGE ENGINE — DEFENCE IN DEPTH (documented, not changed)

`_mergeCloudLocal` + family (~785 lines, zero DOM) was **not extracted**. Mutation testing
reintroduced three historical field bugs into the live source:

1. S314 — `flowTestPhotosPld` preserve pass removed (the months-long wipe)
2. S353 — pairing switched back to array index (cross-copied binaries)
3. S335 — local-only fresh-photo union removed

**None caused data loss.** Each is independently covered by a second layer: the S314 global
binary invariant sweeps every photo location after the specific passes, and S335 has its own
rescue. Disabling the backstop alone also loses nothing, because the per-array passes work.

**This redundancy is the safety property** and is why photo loss stopped being a field problem.
Do not "simplify" it. Any future carve must keep the layers independent; the tests now pin them
separately, plus a case asserting binaries survive in all six photo locations (recordPhotos,
flowTestPhotos, flowTestPhotosPld, clState items, general deficiencies, contractor deficiencies).

Canon confirmed: **cloud owns structure; local owns binary data.**

---

## FIXED — checklist photo attach (affected LIVE, not just beta)

Boot `renderChecklist()` runs during parse, before deferred `photoInput.js` executes, so every
item's photo zone was baked with the "Photo input engine not loaded" hint and nothing repainted
them. Clicking NO merely revealed a zone baked wrong at boot. Electric never had this because
its engine surfaces are painted after the engine arrives — the one property the S496 port did
not carry over.

**Fix:** `_mountPhotoInput` calls the existing S301 verb `_dslRefreshPhotoSurfaces()` once when
the engine lands. Verified live: 0 baked hints, 120 real engine buttons.

---

## ADDED — auth gate

`shared/auth-gate.js` in Diesel `<head>` at Electric's exact placement (after title/icons,
before the first script). Beta mirrors as `../shared/auth-gate.js` — without it, the Hub flip
would have silently reopened the ungated hole.

---

## CHANGED — precache scope (`tools/gen_precache.py`)

`diesel-app/index.html` promoted from beta lane to production shell (listed in
`tools/precache_extra.txt` like `frt/index.html`). Before this, **none** of the modular build's
files were precached while the Hub pointed at it.

- Warm device: worked — same-origin is network-first and populates the runtime cache as a side
  effect of normal use. **This is why airplane-mode testing passed and hid the problem.**
- Cold device (new tablet, cleared storage, first open on site): would have failed completely
  with no signal.

Precache 103 → 125 entries. Excluded deliberately: `_split_manifest.json` (build metadata,
never fetched). `diesel-app/app.js` was a stale S447 artifact and has been **deleted**.

---

## ARCHITECTURE NOTE — photo engine is ALREADY shared

Both FRT and Diesel consume `photoInput`, `cameraBurst`, `markupTools`, `markupSelection`,
`markupText`, `markupEraser`, `photoMint`, `lightbox`. What remains in Diesel is
**tool-specific wiring** to Diesel's own surfaces and is not sharable — each tool's screens
differ. Do not re-propose "extract photos to a shared engine."

---

## SIZE REALITY

`diesel-app/js/part06.js` is still **11,800 lines** of the monolith's 18,486. The three S499
steps bought **provability, not bulk reduction**. Remaining large blocks (deficiencies UI,
flow-photo modal, PDF builder) are DOM-heavy and Diesel-specific: extracting them reduces line
count but cannot be differentially tested and produces nothing another tool can use.
