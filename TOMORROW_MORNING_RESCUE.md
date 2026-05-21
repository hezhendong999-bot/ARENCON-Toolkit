# Tomorrow Morning Rescue — 4380.24

**For Mark. Read this when you wake up. Before you do anything else.**

---

## TL;DR — what's at stake

- ✅ Your 30 photos from yesterday are SAFE in R2 (Cloudflare object storage)
- ✅ All your drawings are SAFE in R2
- ✅ Your prior 9 days of deficiencies are SAFE in cloud (Supabase)
- ❓ Yesterday's 30 deficiency records (pin positions, observation text, contractor assignments) are on your TABLET'S local storage only. Not in cloud.
- 🎯 Goal: get those 30 records from tablet to cloud. Photos auto-reattach.

**The rescue is straightforward. Don't panic. Just follow the steps.**

---

## STEP 1 — Don't break things by accident

Before you do ANYTHING:

- ❌ **Do NOT open the FRT app on the tablet**
- ❌ **Do NOT refresh, reload, or navigate in any FRT tab anywhere**
- ❌ **Do NOT clear cache, uninstall the PWA, or hard-refresh on tablet**
- ❌ **Do NOT tap "Refresh from cloud" anywhere**
- ❌ **Do NOT open the project on your PC FRT either**

If the tablet's FRT happens to already be open from yesterday, leave it alone. Just don't touch it.

---

## STEP 2 — Start a new Claude session

In a new chat, paste this:

> "Tablet rescue for 4380.24. Ready when you are."

Claude will read this rescue document. Will not start until you confirm the tablet is in front of you.

---

## STEP 3 — Get DevTools access to the tablet

You need Chrome DevTools talking to the tablet so we can read its IndexedDB without triggering any sync. Options:

**Option A — USB + chrome://inspect (preferred, Android tablets):**
1. Connect tablet to PC with USB cable
2. On tablet, enable USB debugging in developer settings if not already on
3. On PC, open Chrome → `chrome://inspect/#devices`
4. Tablet should show up as a remote device
5. Find the FRT tab in the list → click "inspect"
6. A new DevTools window opens on PC, controlling the tablet

**Option B — Eruda on-device (iPad or anywhere USB isn't available):**
1. On the tablet, open Chrome/Safari but DO NOT go to the FRT URL yet
2. Open a NEW blank tab
3. In the address bar, paste this:
   ```
   javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/eruda';document.body.appendChild(s);s.onload=function(){eruda.init();};})();
   ```
4. A floating console icon appears
5. Now navigate to the FRT URL (Hub URL with `?project=ee9e4a3e-...&instance=cb856f4b-...&pn=4380.24`)
6. **IMPORTANT: While the FRT loads, immediately tap the Eruda icon to open console**

If neither works, ping Claude. There are other paths.

---

## STEP 4 — Run the read-only IDB diagnostic

Claude will paste a console snippet at this point. The snippet:

- Reads the tablet's IndexedDB
- Does NOT trigger sync
- Does NOT modify anything in IDB or cloud
- Counts: drawings, deficiencies, pin coordinates, observation photos
- Outputs to console + auto-copies to clipboard

You paste the output back to Claude in chat.

**Expected good outcome:** ~30 deficiencies, all with `pinX`/`pinY` coordinates, with observations containing photo entries referencing R2 keys.

---

## STEP 5 — Decide based on the diagnostic

### Scenario A (95% likely) — Tablet IDB has the 30 deficiencies

Claude sends a second console snippet that triggers ONE manual push to cloud. You paste it, it runs. Cloud updates. Photos auto-reattach via existing R2 key references. Done.

After that, you refresh the PC FRT and verify everything is visible.

### Scenario B (5% likely) — Tablet IDB has partial or missing records

We slow down. Don't push anything. Capture every detail. Use the R2 photo inventory (in `R2_RECOVERY_REPORT_4380_24.md`) and your memory of yesterday's site walk to reconstruct manually.

Worst case: you'd lose pin positions and observation text but keep photos and timestamps. Still bad but recoverable enough to write up the deficiencies again from photos + your notes.

---

## STEP 6 — Only after rescue is confirmed

Don't ship any code fixes until your data is safely in cloud.

Once confirmed, discuss:
- Which of the three candidate causes actually caused the silent sync failure
- Whether S155's `_pushDirty` change contributed
- Building the staging environment (Mark's expressed view: above all feature work)
- The `_guardEmptyArrays` hardening fix for Bugs #7 + #8

---

## If Claude isn't available

If you can't reach Claude when you wake up:

1. **Still don't open the FRT on the tablet.** Wait.
2. To verify any one photo survived, paste this URL into any browser (it should show you a photo from yesterday):
   ```
   https://arencon-r2-worker.hezhendong999.workers.dev/ee9e4a3e-4a52-4b6a-bac1-6bc1a0b039c0/photos/frt/original/defic_19264e8e-0ef1-493b-b811-aaaba03f77c1.jpg
   ```
   If it loads, your photos are confirmed safe.

3. To check whether the cloud has been updated since last night, paste the full inventory check command from Claude — but better: just wait for Claude to come online.

---

## Confidence levels

- That the 30 photos in R2 are intact and readable: **99%**
- That the tablet IDB has the 30 deficiency records: **~95%**
- That the rescue completes in under an hour from start: **~90%**
- That this same incident won't recur without proper guards: **~50%** without staging environment, **~95%** with staging environment

The remaining 5-10% downside is recoverable. Nothing about this is unfixable.

---

## What this rescue doesn't include

After today's rescue, you still need to:

1. Diagnose the root cause of why sync silently failed
2. Decide whether to build a staging environment (recommended yes, 2-3 sessions to build)
3. Decide whether to back out the S155 sync optimization while uncertainty remains
4. Address Bugs #7 / #8 / #9 (the umbrella sync bugs) with a real fix that doesn't rely on assumption

None of those are tomorrow's job. Tomorrow's job is rescue.

---

## Why no rescue tonight

Mark asked at 11 PM whether we could just push the R2 photos into the FRT now. Honest answer: no. The 30 R2 photos are tied to deficiency UUIDs your tablet has but cloud doesn't. If Claude invents placeholder deficiency records to attach the photos to, then when the tablet syncs tomorrow with the REAL records (same UUIDs), bad things happen: cloud's invented records overwrite tablet's real ones, OR they merge unpredictably with conflicting fields.

The rescue requires the tablet's metadata to lead, with photos following. That means tablet in hand, in person, with diagnostics first.

Tonight's right move is sleep.

