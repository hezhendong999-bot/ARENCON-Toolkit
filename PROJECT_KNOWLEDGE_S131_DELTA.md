# PROJECT KNOWLEDGE — S131 DELTA

Merge into `ARENCON_Project_Knowledge.md`.

---

## NEW: Device-class canvas budget (`frt/js/shared/deviceBudget.js`)

**Single source of truth** for how much canvas backing store a device can afford.
Created S131 after the field tablet zoom crash. Exports:
- `deviceClass()` → `'phone'` | `'tablet'` | `'desktop'` (from UA)
- `deviceMaxPixels()` → `8000000` / `12000000` / `30000000`

**RULE: any code that allocates a large canvas backing store MUST budget it through
`deviceMaxPixels()`.** Do not re-implement device detection inline — the duplicated
2-tier classifier (phone vs "everything else") was the root cause of the S131 crash:
field tablets (`SM-T|SM-X|Tablet`) fell into "everything else" and inherited the 30 MP
desktop budget.

Current consumers: `markup.js` (2D + WebGL markup canvases), `tiledPdf.js` (per-level
tile canvas). Pattern: `bufScale = nativePx > budget ? sqrt(budget/nativePx) : 1`, then
the canvas CSS size stays at logical drawing dimensions so a budgeted buffer is simply
browser-upscaled. **When under budget, `bufScale === 1` — behaviour is byte-for-byte
unchanged (desktop is never affected).**

**The `tablet` value (12 MP) is a tuning dial.** Raising it reduces L4 blur but reduces
crash headroom. Do not change without real-tablet re-validation.

---

## tiledPdf.js — level canvas is now device-budgeted

`_getOrCreateLevelCanvas` sizes the backing buffer via `deviceMaxPixels()`, not the full
native level resolution. The entry object now carries `bufScale`. Three compositing sites
multiply native-level coordinates by `entry.bufScale`:
- `_getOrCreateLevelCanvas` — buffer allocation
- `_startFetchCanvas` — `drawImage` destination rect (source rect stays native)
- `_evictTileFromCanvas` — `clearRect`

`LEVEL_WIDTHS = [256, 1024, 2560, 6144, 12288]` — **L4 is 12288px longest dim**. A full
ARCH-D sheet at L4 ≈ 101 MP ≈ 403 MB at full backing resolution. This is why an untiered
level canvas crashed tablets.

**KNOWN LIMITATION:** the global budget makes L4 noticeably blurry on tablets (~35% linear
res at the 12 MP cap). Proper fix = viewport-windowed level canvas (size backing store to
visible region, not whole sheet). Scoped as S132 Priority #1. Until then the blur is an
accepted tradeoff — the crash is worse than the blur.

---

## markup.js — tablet WebGL→2D fallback

On the FIRST `webglcontextlost` on a device classified as `tablet`, markup abandons WebGL
(`_useWebGL = false`) and re-renders on Canvas 2D, instead of the 3× WebGL re-init retry
loop. Rationale: on a memory-starved tablet a context loss is real OOM, not a driver blip;
retrying re-attempts the same too-large allocation and cascades into a crash loop. Canvas
2D allocates no GPU textures so loss cannot recur. **Desktop keeps the retry path.**

---

## LESSON: `git commit -am` skips new untracked files

`git commit -am` only stages *modified tracked* files. A newly `create_file`'d module is
untracked and will be silently omitted — shipping broken imports. **After creating any new
file: `git status` (or `git add -A`) before treating a commit as complete.** Cost this
session: one extra commit (`ceabce0`) to recover `deviceBudget.js`.

---

## OBSERVED BUG (not yet fixed): blank-project window during load

Between IDB-snapshot restore and cloud-pull completion, `Model.getProject()` can briefly
return a blank/placeholder object (`name` undefined, empty `drawings`/`deficiencies`, and
a project id that does not match the URL `?project=` id). Data is NOT lost — it repopulates
when the cloud pull lands. **Risk:** a save/sync firing in that window could persist the
blank state. Needs a dedicated investigation session — do not bundle with tiledPdf work.
