# ARENCON Field Review Tool — Why We're Rebuilding the Foundation

**Prepared by:** Mark He, L.E.T.  
**Date:** April 5, 2026  
**For:** Shaun Kelly, Principal

---

## The Short Version

The Field Review Tool works. Inspectors use it. Reports come out. But under the surface, it has structural problems that cause data loss, slow performance, and will block us from growing. We've been patching these problems for months — the patches keep breaking other things. A proper rebuild fixes all of it permanently, takes about 25-30 working sessions, and the inspectors won't notice any visual changes. Everything looks and works the same, but faster and more reliable.

---

## What's Actually Happening Today

### Data Disappears

Inspectors draw markup on drawings (circles, arrows, notes). When they close the app and reopen it, the markup is sometimes gone. This has happened repeatedly. Photos attached to deficiencies vanish after a sync. The root cause: the entire project is stored as one giant file. When the cloud syncs, it replaces the whole file — and anything not yet synced gets overwritten.

**Impact:** Inspectors lose work. They stop trusting the tool. They take backup photos on their personal phones "just in case." Some have gone back to paper for markup.

### Drawings Are Slow

Opening a drawing takes 1-2 seconds. The first time you zoom in, it freezes for half a second. Switching between drawings causes a visible flash. Fieldwire — the industry tool we're trying to match — opens drawings instantly.

**Why:** We load the entire drawing image (12 megapixels) into the browser at once. Fieldwire loads only the portion you're looking at, like Google Maps.

### Drawing Markup Is Laggy

Drawing on the Samsung tablets stutters. We've had to artificially limit the drawing canvas resolution to keep it usable. Fieldwire's markup is smooth at any zoom level.

**Why:** Our drawing tool uses the browser's basic drawing API (designed for simple graphics). Fieldwire uses GPU-accelerated rendering (designed for exactly this kind of work).

### The App Crashes on iPhone

Safari on iPhone has strict memory limits. Our tool occasionally crashes when opening large drawings or when too many photos are loaded. Fieldwire never crashes because it's a native app with direct memory control.

---

## Why Patching Doesn't Work Anymore

Over the past 10 sessions, we've fixed:
- Markup disappearing (3 separate root causes, 3 separate fixes)
- Photos vanishing (2 root causes)
- Drawing viewer flash (4 attempted fixes, 2 reverted)
- iPhone crashes (2 fixes, 1 reverted because it broke Samsung)

Each fix risks breaking something else because everything is interconnected in one 16,000-line file. Fixing the markup save broke the photo sync. Fixing the drawing flash broke iPhone. This pattern will continue — the problems are architectural, not code bugs.

---

## What the Rebuild Changes

### For Inspectors (What They See)

**Nothing changes visually.** Same burgundy header. Same tabs. Same deficiency cards. Same drawing viewer. Same PDF reports — identical formatting, fonts, layout. Same buttons in the same places. If an inspector opens the rebuilt tool, they should not be able to tell anything changed.

**What they feel:**
- Drawings open instantly instead of 1-2 seconds
- Zoom and pan are smooth, no stutter
- Markup drawing is responsive at any zoom level
- No more lost markup or photos — ever
- App doesn't crash on iPhone
- Works reliably offline

### Under the Hood (What Actually Changes)

| Today | After Rebuild |
|-------|--------------|
| One 16,000-line file | 15 organized modules (~800 lines each) |
| Entire project saved as one blob | Each item saved individually |
| Cloud sync sends everything | Only changed items sync |
| Two people editing = one person's work lost | Both people's work preserved |
| Drawings: one giant image | Smart tiles (like Google Maps) |
| Markup: software rendering, limited | GPU-accelerated, no limits |
| All processing blocks the screen | Heavy work runs in background |

---

## What This Costs

**Time:** 25-30 sessions (same as roughly 8-10 months at current pace of ~3 sessions/month)

**Money:** $0 additional infrastructure. Same Supabase (free tier), same Cloudflare R2 (free tier), same GitHub Pages (free). The Android app is free to build and distribute via sideload.

**Risk:** Zero. The current tool stays live and working during the entire rebuild. Inspectors keep using it. The new version is developed in parallel and only replaces the old one after thorough testing. One-click rollback if anything goes wrong.

---

## What Happens If We Don't Rebuild

The tool continues to work but:
- Data loss incidents will continue (they're structural, not fixable with patches)
- Performance gap vs Fieldwire stays or widens
- Adding new features becomes slower (each session spends 30%+ reading and understanding the existing code)
- iPhone reliability stays poor
- Multi-inspector sync remains unreliable
- We cannot build a native iOS/Android app on this foundation

We can keep patching, but we're spending roughly 1 in every 3 sessions fixing things that broke from previous fixes. That time is better invested in doing it right once.

---

## The End Goal

After the rebuild + future native app investment:

| Capability | Fieldwire | ARENCON FRT |
|------------|-----------|-------------|
| Drawing speed | Instant | Instant |
| Markup smoothness | 60fps | 60fps |
| Offline reliability | Perfect | Perfect (Android), Good (iPhone PWA) |
| Multi-user sync | Yes | Yes |
| AI-powered writing | No | Yes (our advantage) |
| Custom PDF reports | No (their format only) | Yes (our format, our branding) |
| OBC/NFPA reference | No | Yes (integrated) |
| Cost per user | $39/user/month | $0 |

The AI Writing Assistant — which automatically cleans up field notes into professional language and can analyze photos — is something Fieldwire doesn't have. Combined with the rebuild, we'd have a tool that matches Fieldwire's performance while offering capabilities they don't.

---

## Timeline

| Phase | What | When |
|-------|------|------|
| Now | AI Writing Assistant (works on current tool) | Next 2-3 sessions |
| Phase 1 | Data layer rebuild (fixes all data loss) | Sessions 4-9 |
| Phase 2 | UI migration (same look, organized code) | Sessions 10-14 |
| Phase 3 | Fast drawing viewer + smooth markup | Sessions 15-22 |
| Phase 4 | Android app + testing + go-live | Sessions 23-30 |
| Future | iOS app (requires $99/year Apple Developer) | After principal approval |

Current tool stays live and in use throughout. No disruption to field operations.
