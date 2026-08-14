# SCOPE — Shared header, outstanding work (Mark, 14 Aug)

Recorded because these were raised verbally across sessions and kept slipping.
This file is the durable list; a handoff paragraph is not sufficient — the
DEMO_account_S631b.html file was lost exactly that way, and the rebuild
instructions then pointed at a file nobody could open.

Lane B owns this. Nothing here is started.

---

## 1. Header avatar showed "?" on the live Hub — FIXED S652

The header is built once at boot, before the profile and roster are fetched, so
initials and colour resolved to nothing and the fallback stuck. Nothing ever
refreshed it. The avatar is now the only route to Account and Sign out, so a
"?" there is not cosmetic — the way out of the app looked broken.

Fix: `window.__hubHdr.setAccount({...})` is called once the profile is known.
The engine already had the repaint API (S633); nobody was calling it.

**Watch for this class of bug elsewhere:** anything the header is told once at
boot is wrong until something repaints it.

---

## 2. FRT, Diesel and Electric still show a Sign Out button — NOT STARTED

The Hub moved Sign Out, Profile and the user chip into the avatar menu (S633e).
The other tools did not follow. Today a person's header differs depending on
which tool they opened, and Sign Out is still a bright standalone button — one
mis-tap from ending a session mid-review, which is the reason it was moved in
the Hub.

Work: pass `account` to the shared header from FRT, Diesel and Electric, with
the same confirm-before-sign-out. No new shell, no per-tool menu — the engine
already draws it.

Depends on: the Account panel wiring (below), or those tools' avatars open a
panel that does not exist yet.

---

## 3. Header is short and leaves a gap — NOT STARTED

Mark, on the live Hub and the tools. Needs measuring on a real screen before
touching numbers: per the S278 lesson, inspect painted pixels, not computed box
values. A screenshot at desktop width plus one at tablet width, before any CSS
changes.

---

## 4. FRT and Diesel show a hamburger at full-screen width, with Dashboard
   inside it — NOT STARTED

At desktop width there is room for the control; hiding it in a drawer makes a
common action two taps for no reason. The hamburger belongs on narrow screens.

Work: the drawer collapse threshold and what is allowed to collapse into it.
Dashboard/Back is a primary navigation action and should stay visible while
there is room for it.

---

## 5. Account panel wiring — BUILT, BLOCKED ON MARK

`lib/ui/accountPanel.js` was rebuilt in S652 against DEMO_account_S631b.html
(signed off 09 Aug). The panel now owns every style it needs and hosts pass
DATA, never markup — that is the fix for the S630 failure, where host-supplied
picker markup arrived in a shadow root its page CSS could not reach.

Verified by VERIFY_account_panel_S652.html, which mounts the REAL module and
the REAL dialog engine so the shadow boundary is genuinely present. A markup
harness cannot reproduce the failure and must never again be treated as proof.

**Blocked:** the gate correctly refuses the push because four style names from
the old stacked-card layout (`.ap-card`, `.ap-glabel`, `.ap-group`, `.ap-item`)
are registered under Mark's Account panel feature entry. Only Mark may clear
them. The grouping those classes expressed is still enforced — the design he
approved draws it as sidebar navigation instead.

Once cleared: push the module, wire the Hub, then FRT / Diesel / Electric by
passing sections (item 2 above).

---

## Also open, not header work

- **33 live sessions on the server**, oldest 154 days, never revoked. Needs the
  Supabase dashboard session limits set (Mark's action — dashboard only, not
  reachable from code), then a revoke at a quiet moment. Revoking signs out all
  17 staff and sends each through mandatory PIN enrolment.
- **Mandatory PIN enrolment (S650) has never been watched on a real device.**
  13 staff meet it at their next sign-in. If it misbehaves it misbehaves at the
  front door for most of the firm.
