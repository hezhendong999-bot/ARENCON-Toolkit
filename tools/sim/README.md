# ARENCON sync harness suite (Lane C law: no fix without a first-failing test)
Setup: `cd tools/sim && npm i jsdom fake-indexeddb`
Roots are resolved from the file (S614): `SIM_TARGET=fix` = this repo; `SIM_TARGET=live` = `$SIM_LIVE` (a checkout of the build you are comparing against). No absolute paths — any lane can run these.
Run any: `SIM_TARGET=fix node <name>.mjs`
- tickhealth.mjs   — S602: hung-probe deafening / swallowed probe failure / quiet-check gauge
- bootstall.mjs    — S603: init must survive a hanging network step (HANG=auth|project|instance)
- stalemate.mjs    — S604: stamp revert + push-dedupe deadlock (the 200/150 field incident)
- deficsync.mjs    — S605: deficiency typed-fields propagation under 412 concurrency
- offlineflush.mjs — S608: offline work pushes on the first online beat
- converge.mjs     — S611: FULL-REPORT walker (reads the merge spec itself): P propagate,
                     K keep-newer, W no-wipe, G no-ghost per family + statusMaps.
                     KNOWN RED: W fails on all array families on live AND fix — a
                     pre-existing uniform engine gap found on the harness's maiden
                     run (04-Aug). Next named target. G test lacks teeth (passes on
                     live) — sharpen before trusting it.
- coverage_audit.py — every collectState key must be spec-covered or classified;
                     NEW unclassified keys exit 1. KNOWN_GAPS may only shrink.
