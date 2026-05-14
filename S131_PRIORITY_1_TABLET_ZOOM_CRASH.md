# S131 PRIORITY #1 — Field Tablet Zoom Crash (WebGL Context Loss)

**Status:** CONFIRMED, UNFIXED. Blocks field use.
**Severity:** CRITICAL — the team could not use FRT for a live site review on
2026-05-14. The app failed in the field. This is the single highest priority
for Session 131 and must be addressed before any other S131 work, including
the dead-code audit.

---

## Symptom

Field staff zoom in on a drawing in the FRT viewer → the app crashes / goes
blank / reloads. Described by the team as "similar behavior to the iOS system
crash" — i.e. the renderer dies and the page is lost. Happened repeatedly
during a real site review; the team had to abandon the app and could not
complete the review in FRT.

## Root cause (confirmed from console logs + code read)

It is **GPU memory exhaustion causing WebGL context loss** on the Android
field tablets.

Evidence from the user's console screenshots earlier in S130:
```
[Markup] Canvas: logical 6144×4096, buffer 6144×4096 (dpr=1.000, 25M px) [WebGL initializing]
[WebGLMarkup] MAX_TEXTURE_SIZE=16384, canvas device-px=6144x4096
[Markup] WebGL CONTEXT_LOST — attempting recovery on restore
[Diag-Mem] WebGL context lost #1 ... #5 ... #6
```

The mechanism:
1. The team's drawings rasterize to a ~**25-megapixel** canvas (6144×4096).
2. The markup layer allocates **three large buffers**: the 2D main canvas, the
   WebGL/Pixi sibling canvas, and (separately) `tiledPdf` decodes higher-res
   tile textures for the zoom level.
3. On zoom, `_resizeMarkupForScale()` (frt/js/viewer/markup.js ~line 497)
   **reallocates** the main + WebGL canvases at the new scale, synchronously,
   on every zoom change (called from `Markup.setRenderScale` → from viewer.js
   `_applyTransform`).
4. The combined GPU memory demand exceeds the tablet's budget → the browser
   kills the WebGL context (`webglcontextlost`) → the markup canvas bricks →
   page crash / blank.

## The actual bug in the code

`frt/js/viewer/markup.js` has the memory budget defined in **TWO places**,
both with the same flawed tier logic:

- **Line 304 & 311** (`_setupCanvas` or equivalent — initial allocation):
  ```js
  var isAndroidPhone = /Android/.test(ua) && /Mobile/.test(ua) && !/SM-T|SM-X|Tablet/.test(ua);
  var maxPixels = isAndroidPhone ? 10000000 : 30000000;
  ```
- **Line 512 & 513** (`_resizeMarkupForScale` — the zoom-triggered resize):
  ```js
  var isAndroidPhone = /Android/.test(ua) && /Mobile/.test(ua) && !/SM-T|SM-X|Tablet/.test(ua);
  var maxPixels = isAndroidPhone ? 10000000 : 30000000;
  ```

**The bug:** there are only TWO tiers — `isAndroidPhone` (10 MP) and
"everything else" (30 MP). The field tablets match `SM-T|SM-X|Tablet`, so they
are deliberately classified as **NOT** `isAndroidPhone` — which dumps them into
the **30 MP "everything else" budget, the same budget as a desktop**.

A field tablet is not a desktop. 30 MP of 2D canvas backing store + a 30 MP
WebGL texture + tiledPdf's tile-decode buffers is far beyond what the tablet
GPU can hold. The "30 MP for anything that isn't a phone" assumption is the
defect.

There is also a third budget at **line 597** (`_ensureOverlay`,
`var ovMax = 30000000;`) — the live-drag preview overlay canvas — which has the
same flat 30 MP with no tablet tier. It must be fixed too or it reintroduces
the pressure during pen/shape drawing.

## Immediate field workaround (already documented to the user)

There is a built-in opt-out — `_useWebGL` check at markup.js line 89-99:
- URL param `?webgl=0` (or `&webgl=0`)
- or console: `localStorage.setItem('ARENCON_NoWebGL', '1')` then reload

This disables the WebGL/Pixi renderer and falls back to Canvas 2D. Canvas 2D
does not allocate GPU textures, so the WebGL-context-loss crash cannot occur.
Markup still fully functions, just rendered on 2D. **This is a mitigation, not
the fix** — it leaves the 2D canvas still at 30 MP on tablets, which is heavy
but does not trigger *context loss* specifically. The real fix still must lower
the tablet budget.

---

## THE FIX (for S131 — execute first)

### Step 1 — Add a real Android-tablet tier to the device budget

Both budget sites (lines ~304/311 and ~512/513) need a **three-tier** classifier
instead of two. Add an `isAndroidTablet` detection and give it its own,
GPU-realistic budget. Proposed:

```js
var isAndroid = /Android/.test(ua);
var isAndroidPhone  = isAndroid && /Mobile/.test(ua) && !/SM-T|SM-X|Tablet/.test(ua);
var isAndroidTablet = isAndroid && !isAndroidPhone;   // SM-T / SM-X / Tablet, or Android w/o "Mobile"
var maxPixels = isAndroidPhone  ? 8000000      // phones: conservative
              : isAndroidTablet ? 12000000     // field tablets: GPU-realistic
              :                   30000000;    // desktop/laptop
```

The exact tablet number (12 MP is a starting proposal) **MUST be validated on
the team's actual tablets** — see Step 4. Do not ship a guessed number as final.

Because the budget is defined in **two** places, S131 should **extract it into a
single shared helper** (e.g. `_deviceMaxPixels()`) so the two sites can never
drift again. This also covers the audit concern — duplicated budget logic is
exactly the kind of cruft the S131 dead-code audit targets.

The overlay budget at line ~597 (`ovMax`) should use the same helper, or at
minimum get the same three-tier treatment.

### Step 2 — Consider lowering the desktop budget's interaction with tiles

Even on the corrected tablet tier, the markup canvas is only one consumer.
`tiledPdf` is decoding tiles concurrently. S131 should check whether, on a
tablet, the markup budget + the tiledPdf tile budget can co-exist. If not, the
tablet markup budget needs to come down further, OR tiledPdf needs to cap its
tablet tile-cache size. Investigate `tiledPdf.js` tile-cache sizing as part of
this — but per project rules, do NOT edit tiledPdf.js without Mark's explicit
direction; flag findings and propose.

### Step 3 — Make WebGL context-loss recovery degrade gracefully to 2D faster

The existing `webglcontextrestored` handler (markup.js ~line 381-434) retries
WebGL init up to 3× before falling back to 2D. On a tablet that is genuinely out
of GPU memory, those 3 retries each re-attempt the same too-large allocation and
can each trigger another context loss — a crash loop. S131 should consider: on
the **first** context loss on a device classified as a tablet, skip straight to
`_useWebGL = false` + Canvas 2D rather than retrying WebGL three times. Retrying
makes sense on desktop (transient driver hiccup); on a memory-starved tablet it
just prolongs the crash.

### Step 4 — VALIDATE ON THE ACTUAL TABLETS BEFORE CALLING IT DONE

This fix CANNOT be validated from the dev environment. It is GPU-memory- and
device-specific. Required before marking resolved:
- Mark or a team member loads a real 25 MP project drawing on an actual field
  tablet (the shared Android tablets).
- Zoom in to L4 (max zoom). Confirm: no crash, no `WebGL CONTEXT_LOST` in
  console, `[Diag-Mem]` loss counter stays at 0.
- Confirm markup still renders crisply (the budget tiers were originally tuned
  for stroke crispness — S125 hotfix 4/5 comments — so a too-low tablet budget
  could bring back blurry thin strokes; check pen lines + dimensions at zoom).
- Check the `[Markup] Canvas:` console log line — on a tablet it should now
  report a buffer well under 25M px (e.g. ~12M px), not 25M.
- Test both WebGL-on and `?webgl=0` paths.

### Step 5 — Keep the workaround discoverable

Until Step 4 passes, the team should keep using `?webgl=0` /
`localStorage.ARENCON_NoWebGL='1'`. Consider adding a visible "Lite rendering
mode" toggle in the FRT viewer settings so field staff can flip it without the
console — but that is secondary to the budget fix.

---

## Files involved

| File | What | Rule |
|---|---|---|
| `frt/js/viewer/markup.js` | budget logic lines ~304/311, ~512/513, ~597; WebGL recovery ~381-434 | **PROTECTED FILE** — project rules say never touch without explicit direction. Mark has now given explicit direction: this is S131 priority #1. |
| `frt/js/viewer/webglMarkup.js` | the Pixi renderer (`WebGLMarkupRenderer`) | read to understand texture allocation; edit only if Step 1-3 require it |
| `frt/js/viewer/tiledPdf.js` | concurrent tile-decode memory consumer | **PROTECTED** — investigate only, propose, do not edit without direction |
| `frt/js/viewer/viewer.js` | calls `Markup.setRenderScale` on zoom | **PROTECTED** — likely no edit needed |

## Why this wasn't caught earlier

The S125 hotfix history (hotfix 1-7 in the code comments) shows this budget has
been tuned repeatedly — but always tuned on the assumption that the only two
classes are "Android phone" and "everything else." The tablet case was never
given its own tier; it silently inherited the desktop budget. The S130 console
logs (`WebGL context lost #1...#6`) showed it was happening, but were read as
incidental warnings rather than the precursor to a field failure. **Lesson for
S131: a recurring `CONTEXT_LOST` in the console is not noise — it is a crash
waiting for the right conditions.**

---

## Acceptance criteria for S131

- [ ] Three-tier device budget (phone / tablet / desktop), extracted into one
      shared helper used by all budget sites
- [ ] Tablet budget validated on a real field tablet — zoom to L4 with no
      context loss, loss counter stays 0
- [ ] Markup strokes still render crisply on the tablet at all zoom levels
      (no regression of the S125 hotfix 4/5 crispness work)
- [ ] First-context-loss-on-tablet degrades straight to Canvas 2D instead of
      retrying WebGL 3×
- [ ] tiledPdf tablet tile-budget interaction investigated and findings
      documented (edit only with Mark's direction)
- [ ] Both `webgl=0` and WebGL-on paths tested on tablet
- [ ] SW cache bumped, tests green, pushed

**Do not mark this resolved on a dev-environment check. It is resolved when it
runs on the team's tablets without crashing.**
