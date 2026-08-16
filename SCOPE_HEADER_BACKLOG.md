# SCOPE — Shared header (Mark, 14 Aug · trued up S671, 16 Aug)

Recorded because these were raised verbally across sessions and kept slipping.
This file is the durable list; a handoff paragraph is not sufficient — the
DEMO_account_S631b.html file was lost exactly that way, and the rebuild
instructions then pointed at a file nobody could open.

Lane B owns this.

**S671 — WHY THIS FILE WAS REWRITTEN.** Every item below except one shipped
between S652 and S670, and the file still read "NOT STARTED" for all of them.
A durable list that lies is worse than no list: the next session either redoes
finished work or, worse, stops believing the file and stops keeping it. Each
item now carries the state it is actually in, verified against live `main`
rather than against a handoff's own claims.

---

## CLOSED

**1. Header avatar showed "?" on the live Hub — FIXED S652.**
The header was built once at boot, before the profile and roster were fetched,
and nothing ever repainted it. `setAccount({...})` is now called once the
profile is known. **The lesson generalises and is the reason S670 happened:
anything the header is told once at boot is wrong until something repaints it.**

**2. FRT, Diesel and Electric still showed a Sign Out button — FIXED S665–S669.**
The standalone Sign Out is removed from the bar when an avatar exists, with a
deliberate fallback: no identity means Sign Out stays, because a signed-in
person with neither is trapped. Those tools now get Account and Sign out from
the avatar menu, drawn by the engine, same as the Hub.

**3. Header short / left a gap — FIXED S662–S664 (FRT).**
Diagnosed the right way and worth keeping: Diesel ran the same engine and had
no gap, which proved the fault was in the host page, not the engine. FRT had an
`html{}` rule Diesel never had.

**4. Hamburger showing at full width with Dashboard inside — FIXED S659/S661.**
Dashboard has a permanent home in the bar. The hamburger is fold-only and may
only be forced visible if Dashboard loses that home. Fold solves in two passes:
pass 1 assumes no hamburger, and only if something must fold does pass 2 make
room for one — reserving space for a control that is not drawn was the same
mistake as the right-edge gap, in miniature.

**5. Account panel wiring — SHIPPED S652 onward.** `lib/ui/accountPanel.js` was
rebuilt in S652 against DEMO_account_S631b.html (signed off 09 Aug), and Mark
cleared the four protected style names on 14 Aug ("yes"), recorded in
`tools/protected_symbols.txt`. The panel owns every style it needs and hosts
pass DATA, never markup — that is the fix for the S630 failure, where
host-supplied markup arrived in a shadow root its page CSS could not reach.
A markup harness cannot reproduce that failure and must never again be treated
as proof; `VERIFY_account_panel_S652.html` mounts the real module and the real
dialog engine.

**6. Avatar never appeared in FRT / Diesel / Electric — FIXED S670.**
Creation was a one-shot at build time inside `if (cfg.account)`. Only the Hub
can supply an account block up front, so those three tools got no avatar — and
because item 2 hides the standalone Sign Out once identity arrives, they were
left with no avatar and no way out. Creation is now a function called by both
the build path and the late path. Guarded by `E18` in
`lib/tests/header2.test.mjs`.

**7. 33–35 live sessions, oldest 154 days — REVOKED 15 Aug.**
Everyone signs in fresh, which is what feeds item 8.

---

## STILL OPEN

**8. Mandatory PIN enrolment (S650) has never been watched on a real device.**
The 11 staff without a PIN meet enrolment at their next sign-in, and all
sessions were revoked on 15 Aug, so that is now everyone's next sign-in. If it
misbehaves it misbehaves at the front door for most of the firm. **This is a
field-verify item for Mark — there is nothing left to build.**

---

## WHEN THIS FILE IS FINISHED

Item 8 is a watch, not work. Once Mark has seen enrolment run on a device,
this file has nothing left in it and should be deleted rather than kept as an
empty shell — a scope file with no scope is the next stale document.
