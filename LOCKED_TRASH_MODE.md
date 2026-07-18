# LOCKED — Trash Mode (markup delete) · Drawing Viewer + Photo Lightbox

**Status:** LOCKED — demo approved by Mark, S489 (2026-07-18). **Not built.**
**Hosts:** FRT drawing viewer **and** photo lightbox. Mark: "I want this feature in lightbox too."
**Owner at build time:** the session holding the `frt/**` code lane.
**Demo of record:** `ARENCON_Trash_Mode_Demo.html` (S489).

---

## ▶ PROMPT OPENER

Building this? Read this file fully, then verify the live engine at GitHub HEAD before proposing
anything. **Do not re-derive any colour from the ARENCON Bold token table** — every value below is
copied verbatim from `lib/ui/markupSelection.js` `SEL{}`, and Bold is a separate system that must not
overwrite the locked markup palette. That exact mistake was made and corrected during the demo.

Do not re-litigate the design; Mark approved it. If something cannot be built as written, say so and
ask rather than substituting.

**Standing command meanings:** "give me handoffs" = handoff + PK delta + Style delta (deltas only).
"give me FULL handoffs" = handoff + complete regenerated PK + complete regenerated Style Guide.
"Proceed with handoff XXX" = read that tool's latest handoff plus every delta on top, then report the
to-do list. Never means "write a handoff."

---

## 1. The problem

Deleting a markup on a tablet currently takes five steps: Select → choose rubber-band or tap sub-mode
→ tap the marks → ✓ to group → ✗ to delete. Mark's complaint, verbatim: *"It takes many steps to
delete a markup."*

The grouping step is the waste. Grouping exists to make marks **moveable**. When the next action is
delete, moveability is irrelevant — so the group step buys nothing and costs two taps.

**Trash mode: two steps.** Arm 🗑 → tap marks → confirm.

---

## 2. Non-negotiable: this is a MODE on the existing engine, not a second selection system

Mark, verbatim: *"I dont want new invention in design style. I want unified design."*

Trash mode reuses the locked lightbox-markup selection standard exactly:

- **Tap toggles marks into the PICK set only.** Never auto-groups, never joins an existing group.
- **Picked marks show the engine member glow + green check badge.**
- **The confirm bar keeps its existing shape and position.** The only change is the confirm icon —
  green ✓ becomes red 🗑 — and the action, which deletes instead of grouping.
- **✗ still cancels. Escape exits trash mode only — it NEVER closes the viewer or lightbox.**

Nothing new is drawn, positioned, or coloured. If a build introduces a new visual idiom, it is wrong.

---

## 3. Colours — verbatim from `lib/ui/markupSelection.js` SEL{}

| Role | Value | Notes |
|---|---|---|
| Member glow (halo) | `#7FE9FF` @ alpha **0.62** | Ink-hugging contour. Cyan-**white** — must pop on red/orange/yellow ink |
| Member glow, active | `#B8F4FF` @ alpha **0.80** | |
| Green check badge | `#3FD08A` | |
| Group box | `#4DA6E8` | Not used by trash mode (no grouping) |
| Group copy | `#2E86C8` | Not used by trash mode |
| **Delete red** | `#C0445F` | `SEL.groupDelete` — armed state, trash confirm button |

**Do not substitute** `#46C5E8` for the halo. That is the pick-**box** colour, a different layer.
**Do not substitute** Bold's `#2E9E72` for the check, or Bold's `--fail` for the delete red.

**Engine constraint to preserve:** the halo and the blue group box must stay distinct hues. Same
colour would make picked marks inside a group read as identical outlines with no clue which is
draggable. Trash mode never groups so it doesn't hit this today — preserve it if the mode ever gains
a move step.

---

## 4. UI

**Toolbar button:** its own dedicated 🗑 button. Mark's explicit choice ("I want an own button looks
like a trash bin") — routing through Select would preserve most of the steps this feature exists to
remove, and a dedicated button makes destructive intent explicit from the first tap.

Follows the existing toolbar toggle convention in both hosts: tapping the armed 🗑 disarms it, same as
every other tool (lightbox S487d, viewer S461g).

**Armed state — the button ONLY (locked, Mark option A):**

The 🗑 button lights red (`#C0445F`) when armed. **No banner. No canvas frame tint.** This is the same
signal every other tool in the toolbar already uses when it arms.

Rationale, and it corrects Claude's first proposal: an initial design added a red banner and inset
frame border on the grounds that a mis-armed delete mode on a shared tablet destroys field evidence.
Mark pushed back, and the pushback was right — **tapping a mark in trash mode does not delete
anything.** It only adds the mark to the pick set. Destruction requires the red trash confirm AND
clearing the confirm modal. So the "someone else picks up an armed tablet" case ends at a cancellable
selection, not lost work.

The confirm modal is the real gate. A banner is a second warning about a thing that already warns you,
and — more importantly — it would be **a new visual idiom this toolbar does not otherwise use**,
which is exactly the "new invention" Mark ruled out.

Revisit only if field use shows accidental arming. Easy to add later; not justified now.

**Confirm pill:** existing bar position and shape. Reads *"N selected"*, red 🗑 confirm, grey ✕ cancel.
Touch targets 42–46px throughout (gloves).

**Confirm modal:** custom callback modal, never `confirm()`/`alert()`. **One tap, never
type-to-confirm.** Applies even though delete is undoable, per the universal destructive-action rule.
The modal states where the undo lives.

**Undo toast** after deletion, so a fat-finger is recoverable without hunting for Undo.

---

## 5. Both hosts, one implementation

The photo lightbox (`frt/js/ui/lightbox.js`) and the drawing viewer both drive the same
`window.MarkupEngine` and already share the Select / sub-mode / confirm-bar structure. Trash mode is
therefore **one implementation in the engine layer, called by both hosts** — not two builds.

Per shared-engine discipline: the engine owns the behaviour; each host wires its own toolbar button
using its **existing** classes. If after the build either host still implements its own trash
behaviour, the conversion is fake.

**Storage stays per-host.** Each host keeps its own field-proven save path — the S393/S481 photo-loss
protections must not be routed through shared code.

---

## 6. Build notes / risks

- **Photo lightbox deletes markup, not photos.** The modal copy must make that unambiguous — the
  demo uses *"Photos and the deficiency are not affected."*
- **`markup.js`, `markupEngine.js`, `viewer.js` are never-touch files** without explicit
  authorisation. This build touches the selection layer and both hosts' toolbars; get authorisation
  before entering those files.
- Deleting markup is a **data-path change** — field-verify with Mark present before trusting on live
  reports.
- Verify the interaction with the eraser tool: two ways to remove ink now exist. They should not
  fight, and arming one must disarm the other.

---

## 7. Selection sub-mode — TAP ONLY (locked)

**Trash mode is tap-only. No rubber-band.** Mark, S489: *"No rubber band, tap only is good."*

This is a deliberate divergence from the Select tool, which offers both sub-modes. Rationale:
rubber-band over dense markup catches marks the inspector did not intend, and the entire point of
trash mode is fewer, safer steps. A destructive mode should not have a bulk-capture gesture.

**Consequence for the build:** arming 🗑 must NOT show the rubber-band/tap sub-mode flyout that the
Select button opens. There is no sub-mode choice in trash mode — that skipped step is part of how
5 steps becomes 2.

---

## 8. Open items for Mark

None. Design is fully locked: dedicated 🗑 button, tap-only selection, button-only armed state,
existing confirm bar with the tick swapped for a red trash icon, one-tap confirm modal, undo toast.

Remaining work is the build itself, which is gated on the `frt/**` code lane and on field-verify
(deleting markup is a data path — Mark present).
