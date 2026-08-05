# LOCKED — INSPECTOR ATTRIBUTION (pin rings)

**Locked S623 / S623b by Mark. Do not redesign without his say-so in the current conversation.**

This file exists because this feature was approved in **April (S81–S82)**, spec'd, mocked up, and
then lost — the mockup (`pin_ring_mockup.html`) was never committed and vanished from project
knowledge. Two sessions were spent rebuilding it wrongly from memory. **If you are about to
"improve" any number in this file, you are repeating that.**

---

## 1. WHAT IT IS

Every pin already records **who created it** (`defic.createdBy`). Inspector attribution paints that
on the drawing so a second inspector can tell their own work from someone else's, hide the other
person's pins to unclutter the sheet, and — for supervision — watch how a colleague is progressing
on site.

---

## 2. GEOMETRY — LOCKED (Mark picked this from a 7-variant sheet, S623)

**Variant A. Outer teardrop in the inspector's colour, pin body inset to 0.88.**

- Ring thickness lands at roughly **3px** at the native 32×42 pin size.
- The ring **touches the body** — there is no separating gap.
- Implemented in `frt/js/ui/pinsGL.js` → `_drawPinAtNative()`, unchanged since S83.
- Priority stays dominant: the body fills the majority of the pin, the ring is peripheral.

**Explicitly REJECTED by Mark:**

| Rejected | Why it was offered |
|---|---|
| **Hairline separator** between ring and body | Would have removed the body-contrast requirement entirely. Mark: *"I dont want the separator."* The palette therefore carries all the contrast unaided — which is why the ΔE floors in §4 are hard requirements, not guidance. |
| Stroke outline on the silhouette edge | — |
| Halo behind the pin | — |
| Head-band only | — |
| Thinner (0.92) / heavier (0.82) inset | — |

**Not implemented, and not in the lock:** the S82 note about the current user's own pins carrying a
*slightly thicker* ring. It never reached the engine. Do not add it without asking.

---

## 3. THE STRUCTURAL RULE — WHY THE TWO PALETTES CANNOT COLLIDE

> **Mark, S623b: "Contractor colours shall never overlap with inspector badge colours and shall
> always be distinguished apart easily."**

Enforced by **lightness band**, not by audit — so it survives people who never read this file:

```
CONTRACTOR_COLOR_PALETTE   slots 8–15   DEEP band    L* 20–46
INSPECTOR_COLOR_PALETTE    all 12       LIGHT band   L* 66–90
```

The bands cannot meet. **Hue carries identity within a family; lightness carries which family it
is.** A side benefit: the two families stay distinguishable on a **greyscale print**, where hue
tells the reader nothing at all.

Measured: closest new-contractor-to-inspector **ΔE 32.5**; minimum lightness gap **26 L\***.

**Grandfathered exception.** Contractor slots **0–7** are the original eight and sit mid-tone, not in
the deep band. They are **not** band-guaranteed — they are individually verified clear of every
inspector colour (worst **ΔE 26.2**). They stay unchanged because contractors on live projects
already carry these colours and they are already printed in reports clients hold. **Do not edit
slots 0–7.**

---

## 4. CLEARANCE FLOORS — EVERY ENTRY, BOTH PALETTES

ΔE ≈ 25 is roughly where two colours stop being separable at a glance on a busy drawing.
**Floor: ΔE 26.**

Every inspector colour clears:

| Must clear | Why | Worst measured |
|---|---|---|
| The 5 pin **body** colours | The ring touches the body | **26.0** |
| The 8 **legacy** contractor colours | Old projects keep their stored colour; a new palette does not retro-fit | 26.2 |
| All current contractor colours | The contractor **highlight lens recolours the body** to a contractor colour | 26.0 |
| Both sheet backgrounds (light + dark) | A ring invisible on one theme is a broken ring | 30+ |
| Each other | Two inspectors must not read alike | 21.8 |

**Pin body colours (the fixed obstacle):**
`#A85959` high · `#B07F5A` low · `#5F8068` closed/general · `#5E5440` recommendation ·
`#6B6FA8` site record

### The bug this table exists to prevent

The first attempt used a colour measuring **ΔE 17.0 against closed-green**. The ring was
**completely invisible** on closed pins and on site records. Mark caught it on sight. There is no
single colour that clears all five body states by luck — this is why the check is mandatory.

**Adding a colour to either list means re-running the whole check.** A colour that looks fine as a
swatch can still vanish on one pin state.

---

## 5. BEHAVIOUR — LOCKED

- **Layers popover → INSPECTORS group**, below HIGHLIGHT CONTRACTOR.
- **Checkboxes, not radios.** The field need is *"take Ian's pins off my sheet while I work"*, not
  *"show only Ian"*. Contractor highlight stays a radio lens; these are independent hides.
- One row per person **who has actually placed a pin on this project**, showing their ring colour and
  pin count, with the signed-in user marked *(you)*.
- **Hidden on a solo job entirely** — nothing to attribute when one person placed every pin.
- Master row: **Inspector rings** on/off.

### Persistence — deliberately split

| What | Where | Why |
|---|---|---|
| Master on/off | `proj.ui.showInspectorRings`, saved via `Model.touch()` | A project-level default everyone opening the job shares. `touch()` not `saveNow()` — saveNow writes IDB only, and an un-dirtied field is overwritten by the next cloud pull (S351b). |
| Per-person hide list | `localStorage`, keyed by project id | **Per-device on purpose. Never sync this.** It is a view preference about one person's screen; syncing it would let one inspector's tidying hide pins on somebody else's tablet. |

**Default when unset:** off for a solo job, on once more than one inspector has placed a pin.

### Colour assignment

Hashed from the **user id** into `INSPECTOR_COLOR_PALETTE`. Stable per person across every project
and every device, so a ring on a drawing always matches that person's badge elsewhere. **Not**
allocated per project — a person's colour is theirs.

---

## 6. THE FAILURE THAT HID THIS FOR FOUR MONTHS

The ring was **fully implemented in `pinsGL.js` in S83** and could never render, because
`viewer.js` resolved each pin's colour from `proj.ui.inspectorColors[createdBy]` and **nothing in
any tool ever wrote that object.** Empty lookup → null colour → `_showRing` false → nothing drawn,
silently, forever.

Engine complete, tap never connected. Mark remembered an approved feature that wasn't there and was
right. Fixed S623 by falling back to the palette resolver.

**The lesson worth keeping:** a feature is not shipped because the hard part is written. Something
has to *turn it on*, and nothing in the code will tell you it doesn't.

---

## 7. NOT IN SCOPE HERE — the two-tone pin

Body = priority, **tip = contractor** was decided at **S209** and is still **not built**. It touches
the pin render in the viewer **and** `pdf.js` in one change (the PDF pin is a faithful teardrop, not
a flat dot — never simplify the PDF to make it match; make the PDF match). It also requires the
contractor palette collision fix.

That work is tracked separately. It is not part of this lock, and shipping it must not alter
anything above.
