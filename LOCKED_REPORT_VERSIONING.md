# LOCKED — Report Versioning (A/B series)

**Status:** design-locked. **Foundation built and pushed 6 Sep 2026 (S724/S724b) — NOT
field-verified, and NOT seen by any device.** The header navigator (§11) is not built at all.
See §16.3 for exactly what shipped and what is owed.
**Applies to:** FRT first, then Diesel and Electric commissioning. One implementation in
shared `/lib/`, per-tool config only.
**Supersedes:** the current issued flag, and every place that derives a version number
from it.
**Built from:** full walk-through of session S702j–S715; amended 6 Sep 2026 (§3.2, §4.2,
§4.3, §6.1, §10.1, §16.3, §17, §17.1). Amendments are labelled where they are builder
decisions rather than Mark's rulings.

This document is the ruling. Where a handoff, a prior session, or an earlier scope file
disagrees with it, this wins.

---

## 1. Why this exists

Three problems in the tool today, all the same root:

1. The revision number is **typed by a person**. Staff flip a report to B02 to test
   something and hand-type it back. Mark has done it himself to demonstrate.
2. Issuing is a **flag on the live document**, so an issued report is both the frozen
   record and the thing everyone is still working in. That contradiction is what refuses
   contractor answers on the cloud while accepting them on the tablet.
3. There is **no way to see where you are** without reading the filename or page one, and
   no way to open an earlier revision at all.

The fix: a version number becomes a position in a sequence rather than a value someone
enters, and issued copies become frozen snapshots rather than a flag.

---

## 2. The two series

| Series | Meaning |
|---|---|
| **A** — `A01`, `A02`, `B01A01`, `B01A02` … | Draft. Internal. Review copies. |
| **B** — `B01`, `B02`, `B03` … | Issued. Has gone out, or is literally going out. |

**Firm policy, and the reason B exists:** a B-series copy is a report that has gone out or
is going out right now. Nothing else is ever a B.

Drafts before the first issue are `A01`, `A02`. Drafts after `B01` is issued are
`B01A01`, `B01A02` — named for the issued copy they follow.

### 2.1 A is the default state, but keeping an A copy is not compulsory

**A new draft is an A by default.** Nobody chooses this and nobody types it.

**Promoting that same draft straight to `B01` without preserving `A01` as a separate
frozen copy is allowed and normal.** Most reports go out in one go and will have no
A-series history at all.

*Do not read this as "the A-series is optional."* Drafts are always A. What is optional is
whether an A copy is left behind when the draft is promoted.

**Sizing note (Mark):** the A-series rarely passes `A03`. Most deficiency reports are one
round of review maximum. The interface must not be built as though deep A histories are
the norm.

---

## 3. The numbering law

**A version number is a position in a sequence, never an identity. Always the next one.
Never a hole. Never a skip. Numbers are never retired.**

**The sequence belongs to one report, not to the project.** FRT #2 starts again at `A01`
and gets its own `B01`. A project may therefore hold several documents numbered `B02` —
one per report — and there is no conflict, because a document's identity is the project,
the report number and the version together: *4380.24 FRT #2 B02*. What must never exist is
**two different sets of words under one report's `B02`.**

### 3.1 The locking rule — one sentence, three levels

**Anything with something after it is locked. Delete what is after it and it opens
again.**

- Create `B01A01` → `B01` is locked until `B01A01` is deleted.
- Create `B02` → `B01A01` is locked until `B02` is deleted.
- Create FRT #2 `A01` → FRT #1's tip is locked until FRT #2 is deleted.

That is the whole rule. Drafts, revisions, issued copies and whole reports all obey it;
there is no separate cross-report mechanism to learn. **Mark's ruling, 5 Sep 2026.**

Consequences worth stating because they are not obvious:

- FRT #1 closes the moment FRT #2 **exists**, not when FRT #2 is issued.
- FRT #2's `A01` is seeded from whatever the **tip of FRT #1 is at that moment.** If that
  tip is an unfinished draft rather than an issued copy, New Report says so and offers
  both paths — seed from the draft anyway, or go finish it first. It does not block and it
  is not silent.
- Reopening FRT #1 means deleting FRT #2 from inside FRT #2, then returning to FRT #1 and
  finding it open. **No control in FRT #1 ever reaches forward** into a later report; that
  is what makes forking the carry-forward chain impossible.
- Deleting a report destroys the work inside it — carried items, new deficiencies, site
  photos, imported contractor answers. The confirmation states what is being destroyed in
  counts, not "are you sure".
- Locking is per report. FRT #1 being locked never restricts FRT #2.

Everything below follows from the same sentence:

- Withdraw `B02` and resume drafting → the resumed draft is `B01A04` if `B01A03` was the
  last one, and **the next issue is `B02` again.**
- Delete `B01A04` → the next draft created is `B01A04`.
- **Only the newest thing may be deleted.** Anything with something after it is immovable,
  because removing it would create a hole. `B01A04` cannot be deleted while `B02` exists,
  and nothing in FRT #1 can be touched while FRT #2 exists.
- **The newest issued copy may be deleted even after a PDF has been produced from it.**
  Deleting `B02` returns drafting to the revision it was made from, and the next issue is
  `B02` again. Mark's ruling, 5 Sep 2026: the tool must not restrict this — it is the same
  power as unlocking and correcting in place (§5), only slower. The export record (§4)
  retains what each `B02` PDF actually said, so a reused number never becomes invisible.

**No version number is ever typed by a person, in any tool, anywhere.** The field does not
exist. This is the entire mechanism that stops premature B-numbering and hand-editing, and
it is why the system needs no guards.

---

### 3.2 How the sequence is stored — the ledger (6 Sep 2026)

Until S724 the tool kept **one value**, the current revision, and issuing overwrote it. That
single value cannot answer any question in §3.1. It cannot say whether something exists after
this copy, so it cannot say what is locked. It cannot say what a delete should fall back to,
which is why Revert to Draft used to jump to the next unused draft number and leave a hole
this section forbids.

The report therefore carries a **ledger**: every version it has had, oldest first. The last
live entry is the tip. **Every number is derived from what is in the ledger, never from a
stored counter** — which is what makes a hole or a skip impossible rather than merely
discouraged.

Three properties are load-bearing, and each was found by reading the sync merge rather than
by reasoning about it. *Builder findings, 6 Sep — Mark has not reviewed these individually.*

- **Every entry carries an `id`.** The sync merge matches list items by an id field and
  nothing else. Without one, two devices that both issue produce two different arrays, the
  merge cannot pair them up, and it resolves the whole array one-side-wins — **silently
  discarding the other device's history.** Measured: 3 of 4 entries kept.
- **Delete is a TOMBSTONE, never a removal.** Same law the drawing folders settled at S719. An
  entry that simply vanishes on one device reads as absent-here-present-there and is re-added
  on the next sync, so a deleted version would come back. Marking it deleted travels; removing
  it does not. The array therefore never shrinks, and needs no pull-path shrinkage guard.
- **A seeded entry's id is derived from its version, not minted.** Two devices opening the same
  pre-ledger report each build the starting entry independently; random ids would give the
  merge two entries for one copy and the ledger would double.

**Not retroactive (§17.1).** A report that predates the ledger is seeded with the single
revision it already carries, marked inferred, carrying no fingerprint. No history is invented
for it, and any comparison against it answers *unknown* — never *unchanged*.

---

## 4. What creates a snapshot, and what creates a B

These are two different things and must not be merged.

**Every export takes a snapshot.** Not a prompt, not a decision — a consequence. Export
`B01` at 14:00, notice an error, fix it, export again at 14:20 → two snapshots, both
`B01`, both kept forever. The number did not move and nobody was asked anything.

**Exporting never mints a B.** Promotion from A to B is the user's explicit act, taken
when the report is ready to go. If export minted a B, printing three copies for your own
review would burn `B02`, `B03`, `B04`.

**A B copy can be PDF'd directly.** Producing a PDF from `B01` is normal and does not
change its number.

**Pressing Issue repeatedly does not mint anything.** Issue compares the report in front of
you against the last issued copy. If the words have not moved, the answer is `B01` again —
no new number, no second copy, no message. `B02` appears only when something has actually
changed. Mashing the button on `A02` yields `B01` every time. Mark's ruling, 5 Sep 2026.

**A working copy and the on-screen preview record nothing at all.** Only an issued PDF
writes an export record. Reviewing, demonstrating and checking formatting are therefore
free of consequence, which is what keeps Issue from becoming a button people avoid.

Snapshot-on-export is the safety net that lets the rest of the system have **no guards at
all**: whatever a person decides about numbering, the record of what each PDF actually
contained survives.

### 4.1 Snapshots are stored silently

The navigator shows **one chip per version number** — a single `B01`, regardless of how
many times `B01` was exported. A strip showing five `B01` chips turns the version row from
an answer into a puzzle.

**Stored must mean retrievable, not merely retained.** Export history lives one tap deep
off the version, alongside who issued it and when, so "what did the PDF we sent on 12 June
actually say?" can be answered eight months later. Invisible in normal work; available
when only it will do.

---

### 4.2 A re-issue must not restamp the date of issue (6 Sep 2026)

Issuing has always stamped `dateOfIssue` with today. Left in place under the rule above, that
**quietly defeats the rule**: the date of issue prints, so it is part of the words. Press
Issue a second time and the date moves; the words have now changed; the *third* press mints a
new number after all — for a report nobody edited.

A re-issue therefore leaves the date alone, and says nothing (§4: no new number, no second
copy, no message).

*Builder finding while wiring S724b, not something Mark ruled on. It follows from §4 rather
than adding to it, but it is written down because it is invisible until it bites.*

### 4.3 What the button OFFERS, before it is pressed

The rule is silent-by-design, which makes the button's label the only honest signal. If the
words have not moved, the Issue button shows the **same** number with no arrow —
`Issue Report  B01` — rather than promising `B01 → B02` and then not delivering it. A button
that offers a number it will not mint is the confusing version of this rule.

*Builder decision, 6 Sep. Mark ruled the behaviour; this is how it is surfaced.*

---

## 5. Soft lock on issued copies

Issuing applies a **soft lock**. Editing a locked copy requires one confirmation, after
which the user may keep revising and re-issue under the same number, or issue as the next
B.

**The lock's purpose is not enforcement.** It is the one moment a person is made to ask
*"has this gone out?"* — a judgment the tool cannot make and must not pretend to.

The confirmation says so plainly: continuing to edit is right if the copy has not been
sent; if it has, the change belongs in the next revision. Then it gets out of the way.
**One tap. Never type-to-confirm.**

**It is the user's responsibility** to decide whether to import comments against the
current copy or issue the next B. The tool does not decide and does not second-guess.

### 5.1 Reversal on the record

Earlier in this session Claude argued the lock/issue button should be removed entirely,
on the grounds that under forward-revision there is no trap to warn about. **Mark
reinstated it.** The lock stays. See §14.

---

### 5.2 The unlock confirmation and the save modal — 5 Sep 2026

The unlock confirmation does not say *"are you sure"*. It states what is actually at stake:
this copy's PDF was produced at a given time, and if that PDF has gone out, correcting here
means the copy in the contractor's hands no longer matches ours. Then one tap, and out of
the way.

On saving a corrected issued copy the modal offers **two named outcomes, never a generic
Save**:

- **Save as `B02`** — this never left the building, or the change is trivial.
- **Save as `B03`** — the previous copy has gone out; this is a new issue.

Both are always available. Neither is blocked.

## 6. Withdrawal, and the sent/not-sent fork

**Not yet sent → delete or correct in place.** Either works and both are legitimate.
Deleting `B02` resumes drafting at `B01A04` and the next issue is `B02` again; unlocking
and correcting in place (§5) keeps the number and skips the ceremony. **These are the same
power**, and the choice between them is style, not policy.

**Already sent → revise forward** — `B02A01`, `B02A02`, issue as `B03` — so the `B02` in
the client's hands stays exactly as they received it.

**But the tool does not enforce that.** Mark's ruling, 5 Sep 2026: an issued copy is
**not** permanently frozen, and delete remains available on the newest issued copy even
after a PDF has been produced. Correcting a typo or a formatting fault in the last copy
before it goes out is the normal last mile of real work, and a design that turns every one
of those into a revision the client never asked for will simply stop people pressing Issue
— which loses the record entirely. Word has the identical hole and is used anyway.

**What replaces enforcement is the record.** Every issued PDF writes what it contained and
when (§4). `B02` may accumulate several such records; the version carries one current set
of words and the earlier exports sit behind it, one tap deep. Nothing is blocked, nothing
is asked, and the inspector sees none of it.

**Superseded on this point:** an earlier draft of this section said a withdrawn copy is
kept and shown struck through and never deleted. Delete is now permitted, so there is no
withdrawn-but-retained state and no struck-through chip. `DEMO_version_navigator_v3_S715
.html` still demonstrates withdrawal; **that part of the demo is now stale** and must not
be built from.

**The tool cannot know whether a copy was emailed.** No guard is built for this; the
sent/not-sent call is the user's. See §14.

**Rejected on 5 Sep, with reasons, so neither is reopened:**

- **Locking on downstream evidence** — a contractor sheet returning stamped `B02`, or a
  later report being derived. Claude proposed it; it fails because those signals arrive
  weeks late and would not have caught the incident that prompted the design.
- **Hard-freezing an issued copy the moment its PDF is produced** — Grok's recommendation,
  5 Sep. Correctly identifies the failure, but prices the last mile wrongly for this firm.
  Its reframe survives in the export record above; its enforcement does not.

---

### 6.1 What Revert to Draft actually does now (6 Sep 2026)

With a real ledger behind it, **Revert to Draft is the delete in §3.1**: the newest issued
copy is tombstoned, drafting resumes at exactly the revision it was made from, and the number
becomes available again. It burns nothing.

A report that predates the ledger has nothing behind its single seeded entry, so there is
nothing to fall back to. For those — and only those — Revert keeps the pre-ledger behaviour of
minting the next unused draft number. That is a hole in the sequence, and it is accepted
knowingly: the alternative is inventing a history the report never had. It disappears
naturally as reports issued after S724 replace the older ones.

*Builder decision, 6 Sep. The alternative — refusing Revert on every existing report — would
have been a regression on the whole live estate.*

---

## 7. Snapshots and retention

**Every snapshot is kept permanently.** Nothing ages out, nothing is pruned.

Mark's ruling: storage is paid for; losing a copy is not acceptable. An earlier proposal
to age out superseded A drafts was **rejected**.

A snapshot stores the **words** — report structure, deficiencies, comments, thread
history. It does **not** store images.

---

## 8. Photos

**A photo belongs to the site visit and the date it was taken. A revision references it;
it never owns a copy.**

Five revisions of one report reference the same images and duplicate nothing. This is why
permanent retention is affordable.

**JSON export already strips all image data and exports references only** — verified live
in `frt/js/export/json.js` (S715). Exporting a report with every revision is therefore
text-sized regardless of photo count, and is safe.

---

## 9. Contractor rounds

**Rounds and revisions are different things and must never be conflated in labels or
speech.**

**The round of a contractor answer is the B-series copy the sheet was printed from.**
Sheet off `B01` → round 1. Off `B02` → round 2. Off `B03` → round 3.

- Sheets only ever come from issued copies, never drafts. Every sheet therefore carries
  exactly one B number, therefore exactly one round.
- **One sheet produces exactly one round number for every answer on it. Never a mix.**
  This replaces the current per-item calculation
  (`Math.max(1, sheetFrt - notedOnInstance + 1)`), which produces *different* round
  numbers for different items on the same sheet — the defect Mark identified.
- Multiple rounds against a single site visit are normal: contractors answer `B01`, we
  issue `B02`, they answer again, we issue `B03`.
- Read as "FRT 2, round 2" — the round is qualified by the report.

**Superseded within this same session:** the earlier ruling that the round follows the
site-visit (FRT) number. It cannot carry three rounds of correspondence against one visit.

**Backfill largely disappears.** The existing older-sheet dialog exists because the round
had to be inferred. With the round carried by the sheet's B number there is nothing to
infer. What remains worth asking is whether a very late reply should also surface in the
current round's thread so nobody misses it.

---

## 10. Everything that displays a version comes from the sequence

The issued flag currently drives the version number, which drives the filename. All of it
moves onto the sequence, and **none of it is editable**:

- exported PDF filename
- report cover
- **project information page revision number**
- header navigator
- Hub page row

One source, no typing, no drift. **This is part of the same job, not a follow-on.**

### 10.1 The revision field is read-only, not removed (6 Sep 2026)

*Builder decision, pending Mark's confirmation.* §3 says no version number is ever typed. It
does not say the number may not be **seen**, and people need to see it — so the project
information field stays where it is and became read-only, using the same grey styling as the
Date Modified field beside it. It reads as deliberate rather than broken, and no layout
changed.

Deleting the field outright was considered and not taken: it removes information the user
legitimately wants, and it leaves a gap in a form row that would then need a design pass.

---

## 11. Header navigator

Two rows below the header (`crumbbar` slot). Approved framework:
`DEMO_version_navigator_v3_S715.html` — Option 3's two rows with Option 2's lock bar.

- **Row 1 — reports.** FRT 1, FRT 2, FRT 3, with state.
- **Row 2 — revisions of the selected report.** Every B always visible. A-series drafts
  shown only for the group being viewed; other groups fold to a tappable count.
- **One chip per version number.** Repeat exports never appear as separate chips.
- **Collapses to nothing when there is only one revision** — the common field case. An
  inspector on a first visit must not lose a strip of tablet screen to this.
- Only the newest A is editable. Everything else opens read-only with a way back to the
  live draft.
- Locked copies carry a padlock. Withdrawn copies are struck through.
- **Both modes.** Every class works in Bold·Light and Bold·Dark. Field tools boot Light.
- `@media(pointer:coarse)` fallbacks on anything hover-revealed.

---

## 12. Hub page

One row per report — Field Review, Diesel, Electric — showing current state
(`FRT 2 · B01A01 draft · edited 14:32`). Revisions are navigated inside the tool, not
listed on the Hub.

Motivation (Mark): the Hub currently shows report 1, 2, 3 but never their revisions, so
there is no way to see B01 vs B02 from the project board. Putting versions inside the tool
shortens the Hub rather than lengthening it.

`+ New Report` stays where it is — it is the existing, working path to FRT N+1, seeding
the next report from the last with open items carried forward.

---

## 13. Review mode (designed, not yet scoped)

The problem: **there is no way to see the report as it will look while still being able to
change it.** So staff print a set, Mark marks up a PDF he cannot edit, and someone
transcribes it back.

- In-app review rendering the report **exactly as it will print** — same layout, photos,
  thread cards — with **every comment editable in place.** No printing, no PDF markup, no
  transcription.
- **A coaching note per item, addressed to the author, that never prints.** Mark's point:
  silently fixing someone's wording teaches them nothing. The note carries the reasoning
  and stays on the item for whoever picks it up next.
- **Compare / track changes.** The app already records every amendment — who, when, before
  and after — so "what changed since I sent it to Ian" is a matter of surfacing an
  existing record, not inventing a diff. Changed comments highlighted, prior wording
  beneath, accept or revert each.
- **Review markup revs the A-series by itself.** Open `B01A01`, mark it up, and saving the
  review creates `B01A02`. The author sees a new revision containing the changes; the copy
  they submitted stays exactly as they submitted it. `B01A01` vs `B01A02` **is** the change
  set.
- **Photo comments:** allowed on an item, but rare. Do not build a workflow around them.
- **The working copy stays for now.** Mark: it is still doing a job for reviews until this
  exists. Working-copy marking on every page remains.

---

## 14. Deliberately NOT built — do not reintroduce

Each was proposed during design and **rejected by Mark**:

1. **Retiring a B number after withdrawal.** Numbers always follow the sequence.
2. **Aging out superseded A drafts.** Every copy kept forever; storage is not a concern.
3. **Demoting a prematurely-named `B01` to `A01` when sent for review.** "Too much messing
   around."
4. **Restricting B-minting to principals/reviewers.** "No I do not want B series be minted
   by principals." Anyone can issue.
5. **A guard preventing withdrawal of a copy that has contractor responses against it.**
   Too complicated for the value.
6. **Removing the soft lock / issue affordance** — proposed by Claude, reinstated by Mark.
7. **Missing-round detection** (warning that FRT 2's sheet was never imported). The FRT 3
   sheet already carries the contractor's current position; nothing is recoverable, so the
   warning would be noise.
8. **A raw "clear all contractor responses" button.** See §15.5.
9. **Locking an issued copy on downstream evidence** — a stamped contractor sheet
   returning, a later report being derived. Proposed by Claude 5 Sep, rejected: the signals
   arrive weeks after the moment they would need to fire. Retained as an audit flag only —
   if a returning sheet's version has changed since that export, the import says so without
   blocking anything (§9).
10. **Hard-freezing an issued copy the moment its PDF is produced.** Grok's recommendation,
    5 Sep, rejected by Mark: correcting a typo in the last copy before it goes out is normal
    work, and forcing a client-facing revision for it would stop people pressing Issue at
    all. See §6.
11. **A manual padlock as the primary mechanism.** Considered 5 Sep and set aside — it
    depends on someone remembering at the right moment, which is the one thing that cannot
    be assumed. May survive as a minor extra for what the tool genuinely cannot see (a copy
    printed from another machine); it is not load-bearing and nothing depends on it.

**The system has no guards by design.** Snapshot-on-export plus never-typed numbers make
them unnecessary; the remaining decisions belong to the user.

---

## 15. Contractor import — rulings from this session

**15.1 Always import; never ask permission to re-add.** The sheet is the truth for that
round. A previously-deleted answer that appears again on the sheet is imported without a
question, then **reported afterwards** — "2 answers you had removed were re-imported" —
with one undo. Protection moves from a gate in front of the user to a report behind them.

*Deleting a hand-typed comment and importing the contractor's real answer is not a
conflict* — nothing live disagrees with the sheet. It imports silently.

**15.2 Conflicts always ask.** If a typed comment is still present and the sheet says
something different, ask: keep yours, take theirs, or keep both with attribution. Silence
is only permitted when nothing is being overridden.

**15.3 Import preview.** Before anything is written: each answer shown against its
deficiency, with prior correspondence above it so the conversation is visible rather than
an isolated sentence. **Reuses the locked thread-card design** — do not draw a second
version of it.

Items the contractor left blank appear in the same list and can be given a comment or
marked no-response there — a decision made while looking at the round, not something to
remember beforehand.

**15.4 Typing in the preview must survive an accidental close.** Saved to the device the
moment a box is left; pushed to cloud on the normal cadence. Reopening offers the work
back rather than starting clean.

*Storage asymmetry, deliberate:* **burst photos stay local-only** — large, captured
offline, and pushing them mid-capture fails exactly when the network is worst. **Review and
import comments go to both** — small text, so an accidental close recovers instantly
offline and a lost tablet does not take the review with it.

**15.5 Clear rounds = surfaced import log, not a wipe button.** Every import already writes
a receipt; undoing one hard-removes what that import wrote and un-registers the sheet, so
the same PDF imports fresh — a clean demo loop, already built, currently reachable only
from the post-import toast.

Surface it as a list grouped by round, each with undo. "Clear current round" = undo that
round's entries. "Clear everything" = undo them all. **It can never touch a manually typed
comment or an ARENCON review** — only what an import put there. A raw wipe button would
destroy both and would eventually be pressed on a live project.

**15.6 Round numbers are never consumed.** Delete and re-import as often as you like.
Nothing is burned.

**15.7 Roadmap — contractor portal.** Contractors uploading their own photos is a future
direction. **For now: comments only, with photos attachable per item.**

---

## 16. What this resolves, and corrections to the record

The live document is never the issued one. Issued copies are frozen snapshots — immutable
because that is what they are, not because a database rule is fighting the application.

**This dissolves the S480/S509 vs S693 contradiction.** Contractors respond to a frozen
copy; answers file into the live draft; nothing needs unlocking to record them. The
database trigger that currently refuses contractor answers stops being needed.

### 16.1 Corrections verified live in S715 — do not re-list these as gaps

- **Markup on issued reports IS database-enforced.** The trigger is live and attached on
  `tool_data`, and refuses *any* change to an issued row, markup included. The claim that
  it was "blocked client-side only" was **wrong** and must not reappear in a carried list.
- **Contractor PDF sheet import on an issued report is already refused cleanly** (S700a) —
  the sheet is not consumed and nothing is lost.
- **The 8 open contractor deficiencies were never stuck.** `+ New Report` in the Hub
  creates FRT 2 with open items carried forward; answers can be imported there today.

### 16.2 The real live gap

**Three in-app thread paths have no issued check** — typing a contractor's answer,
replying as ARENCON, and recording "no response received"
(`frt/js/ui/deficiencies.js:6192`, `:6372`, and the no-response path). They write to the
tablet, report success, and are then refused by the cloud. The answer sits on one device
looking recorded.

Exposed: `7249121d` (issued 23 Jun) and `a587ab75` (issued 11 Aug), 8 open contractor
deficiencies between them.

### 16.3 Build status — 6 Sep 2026 (S724, S724b)

**Pushed to `main`. Nothing below has been run in a browser or seen by any device.** Deployed
is not working; treat every line as unverified until the field check passes.

Shipped:

- **The ledger** (`frt/js/data/versionSeq.js`) — the sequence engine. It decides; app.js no
  longer holds a copy of the grammar. `_parseRevision`, `_calcIssueRevision` and
  `_calcRevertDraft` were **deleted** from `frt/js/app.js` and declared to the gate.
- **The words** (`frt/js/data/reportWords.js`) — the content fingerprint that answers "have
  the words moved". Storage pointers, timestamps, device fields and array order are all
  excluded; a photograph's identity is in, its location is out.
- **The export record** (`frt/js/data/exportRecord.js`) — written on the Export tap in
  `frt/js/export/pdf.js`, never on the preview render. Words only, never images. No prune
  function exists, per §7.
- **Repeated Issue mints nothing** (§4), including the date-restamp trap in §4.2.
- **Revert no longer burns a number** (§6.1), with the pre-ledger fallback.
- **The revision field is read-only** (§10.1).

Proven only by test, not by use: 175 assertions across `tools/sim/words_stability.mjs`,
`version_sequence.mjs` and `export_record.mjs` — including the ledger and the snapshots run
through the **real** `lib/data/merge.js`, not a stand-in. Each suite was red-armed against
deliberately broken versions to prove it can fail.

**Field check owed** (five minutes, any device): corner stamp `S724b`; revision field greyed
and untypeable; Issue behaves as always; **press Issue again immediately and nothing happens**;
edit a comment and Issue now moves the number; PDF still exports; the project opens on a
second device with the right version. If Issue or Export misbehaves, `376d8968` is the
recording-only build and is safe to fall back to.

**Not built:** the header navigator (§11). Nothing renders a version strip; B01 and B02 cannot
be seen or flipped between. The slot exists in the shared header and nothing else.

---

## 17. Open — needs Mark before build

1. **Close the three thread paths now** (clean refusal pointing at `+ New Report`), or
   leave them until the versioning work lands? **STILL OPEN — and still live.** The
   foundation shipped on 6 Sep without them; §16.2 is unchanged and the two exposed reports
   are unchanged.
2. **Review mode** — designed in §13, not scoped or sequenced.
3. ~~**Build order**~~ — **RESOLVED 5 Sep, and the foundation SHIPPED 6 Sep** (§16.3): the
   sequence engine, the export records and the removal of the typed revision field are all
   in, unverified. The three unguarded thread paths were part of this slice and did **not**
   ship — see item 1.
4. **The navigator is the next build** (§11), and now has real history to read. Three things
   §11 requires are absent from the approved demo and must be built: the padlock on locked
   copies, collapse-to-nothing on a single-version report, and `@media(pointer:coarse)`
   fallbacks. **The demo's withdrawal behaviour is stale** — §6 removed the
   withdrawn-but-retained state, so there is no struck-through chip. Do not build it.
5. **`DEMO_version_navigator_v3_S715.html` is still not in the repo.** It has gone missing
   once and been recovered from a transcript once. Committing it outside the tablet download
   set was recommended; **Mark has not ruled.**

### 17.1 Carried risks — not decisions, but do not lose these

- ~~**Defining "the words" is the load-bearing piece and the easiest thing to get wrong.**~~
  **CLOSED 6 Sep.** `frt/js/data/reportWords.js` plus `tools/sim/words_stability.mjs`: the
  same report through twenty opens — save stamps, previews hydrated and stripped, uploads
  landing and re-keying pointers, arrays reordered — returns the same answer every time, and
  twenty-four real edits each move it. Excluded by construction: storage pointers, machine
  timestamps, device and session fields, array order. **Known limit: drawing markup is not
  covered.** Markings live outside the report and are shared across report instances, so a
  drawing marked up after issue does not register as a change. That is the existing
  shared-markup problem showing through rather than a new one — but it is a stated limit, not
  something to discover later.
- **None of this is retroactive.** No export records existed before 6 Sep, so a report
  already issued has nothing stored to compare against. If one went out and was edited in
  place afterwards, that is undetectable now and always will be. Reports issued from S724
  onward accumulate real history; older ones never will.
- **Lane B must be told** that only the newest report in a project may be removed. The
  closure rule (§3.1) is enforced in the field tool, but reports are created and deleted in
  the Hub. If the Hub allows deleting FRT #2 while FRT #3 exists, the chain breaks from
  that side.
- **The demo's withdrawal behaviour is stale** — see §6. Its two-row structure, collapsing
  groups and read-only states remain approved. §11's padlock, the collapse-to-nothing on a
  single-version report, and coarse-pointer fallbacks are required and are not in the demo.
