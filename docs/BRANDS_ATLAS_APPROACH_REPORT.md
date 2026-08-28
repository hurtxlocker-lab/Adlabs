# AdLabs — Brands Atlas: Approach Report
**For:** The Architect
**From:** ox-alpha (CTO-track agent), Brainfoods Studio
**Date:** 2026-08-26
**Scope:** `/brands` page — design, data architecture, implementation, and known defects discovered during validation
**Status of code:** Branch `feat/brands-atlas` (isolated worktree, commit `0be1325` + uncommitted fix-in-progress). **Not pushed.** Production (`main`, `5f0ea15`) untouched.

---

## 1. Product Intent

The Brands page is the second public surface of AdLabs. Its thesis: **brands are first-class intelligence entities**, not rows in a table. The audience is the Indian D2C founder studying how foreign (EU/UK) brands strategize — EU/UK regulatory disclosure richness is the product differentiator, per the project pivot away from India-only scraping.

Design concept shipped as "The Atlas Room":
- Editorial hero ("The Competitive Landscape") + quiet corpus-facts strip computed from the same query that feeds the cards
- "Polaroid Dossier" cards: representative creative portrait (browse-image-v1 derivative), brand name in editorial type, category in micro-mono, activity pulse, live creative count, audience band, social authority
- Four sort lenses (Most Creatives · Recently Active · Reach Scale · Social Authority) with server-authoritative SQL ordering and a narration line stating the active lens

## 2. Data Architecture

**One grouped aggregate query** (`getBrandDirectory()` in `src/features/brands/queries.ts`):

```
FROM ad_discovery_index idx
INNER JOIN brands b ON b.id = idx.brand_id
WHERE representative_media_sha256 IS NOT NULL
GROUP BY brand
→ creative_groups (COUNT DISTINCT rep sha)
→ active_groups (COUNT DISTINCT where is_active)
→ last_seen/first_seen span
→ bool_or(EU transparency), bool_or(UK transparency)   — never summed
→ MAX(eu_reach), MIN/MAX(age band), gender pick-one
→ MAX(ig_followers), MAX(fb_likes)
→ one representative media asset id for the portrait
ORDER BY <lens-specific SQL>
```

Portrait resolution reuses the existing `resolveMediaUrl` + `media_derivatives` path (browse-image-v1 READY preferred, canonical original fallback). In dev this yields same-origin `/api/dev-media/sha256/<sha>` URLs — identical to Discover's mechanism.

No schema changes. No new dependencies. Zero UUIDs exposed in card links (cards link by slug).

## 3. What Was Verified Working

- tsc clean, eslint clean, 62 Vitest files pass, `next build` succeeds
- All four lenses produce correct SQL-ordered results (verified against raw SQL ground truth: RECENTLY_ACTIVE→Arrae, REACH_SCALE→rhode(2M reach), SOCIAL_AUTHORITY→Huda Beauty, MOST_CREATIVES→Huel)
- SSR HTML carries correct `aria-pressed` state per lens after the activeLens prop wiring fix

## 4. Defects Found During Validation (open items)

### 4.1 Filter race condition — FIXED (needs your review of approach)
Original bug (user-reported): lens buttons appeared dead/unresponsive when clicked during the ~600ms RSC navigation window.

Three iterations:
1. Optimistic client state + disabled buttons → clicks swallowed mid-flight (the reported bug)
2. Render-phase reconciliation → stuck spinners, state desync (over-engineered)
3. **Final: `useTransition`** — buttons never disabled, every click starts a transition, Next serializes same-tab navigations so last-click-wins; `aria-pressed` reflects server truth from URL param only.

Validated: rapid race (two clicks <100ms apart) converges to last click with correct data.

### 4.2 Portrait thumbnails failing to render — ROOT-CAUSED, FIX PENDING
User saw ~half of creative thumbnails broken. Investigation:

- Data layer is healthy: all 33 brands have valid representative assets with canonical storage keys (`media/sha256/<64hex>`)
- Page HTML contains correct same-origin dev-proxy URLs (`/api/dev-media/sha256/<sha>`) — 33 unique, 99 references
- **The dev server's compile workers crashed** ("Jest worker encountered child process exceptions, exceeding retry limit") after sustained probing — every `/api/dev-media/*` request returned 500 including ones that render fine on Discover
- Evidence this is environmental, not architectural: the *same route* serves images successfully on `/discover`; the failures began after heavy parallel curl/browser load; restart attempt was interrupted

**Proposed verification protocol:** restart dev server cleanly → hard-reload → count `img.complete && naturalWidth===0` vs loaded. If broken images persist beyond the worker crash, next suspects are (a) R2 objects missing for specific SHAs (would also affect Discover), or (b) the portrait asset being a VIDEO poster fallback path I added (`image_rep_media_asset_id ?? rep_media_asset_id`) hitting non-image keys. Both are testable quickly once the server is stable.

### 4.3 Activity pulse is fabricated data — DESIGN DEBT, ACKNOWLEDGED
The "sparkline" renders deterministic pseudo-random tick heights seeded by brand slug — it looks like observation history but encodes nothing real. This violates the honesty doctrine (no fake analytical graphics). Options:
- **A (recommended):** remove ticks; keep a binary active/lapsed dot + "seen Xd ago" (already honest)
- **B:** compute real weekly group-count buckets from `ad_observations` (one more query; worth it only if the signal matters to users)

### 4.4 Transparency pins not self-explanatory — UI CRITIQUE ACCEPTED
Two dots (solid=EU, outlined=UK) fail the "no tutorial needed" bar. Proposed replacement: explicit micro-labels `EU · UK` in mono type next to the name, rendered only when evidence exists. Self-documenting, still compact, no legend required.

### 4.5 Running counts semantics — CLARIFICATION NEEDED FROM YOU (Architect)
Current card shows `creativeGroups` = COUNT(DISTINCT representative_media_sha256) per brand from `ad_discovery_index` (creative groups in our corpus). User feedback says counts should reflect "total creative counts we get in the payload rather than how many ads we've scraped."

Interpretation question: does "payload count" mean (a) Meta's disclosed `ads_count`/total_active_time-style fields (currently in the unresolved-provider-semantics quarantine per KT §N), or (b) total canonical ads (rows in `ads`) rather than distinct creative groups? Option (b) is implementable cleanly today (swap COUNT target); option (a) touches the KT's unresolved-fields doctrine and needs an explicit ruling before we surface provider-reported totals.

### 4.6 Audience band legibility — PARTIALLY UNDERSTOOD
The bottom-left "histogram" is the AudienceBand: a horizontal track on a fixed 18–65 axis with a filled segment spanning the brand's disclosed EU target-age range, plus gender glyph. It renders only when age data exists (11 of 33 brands). If it read as meaningless decoration, that confirms the label-less design fails self-explanatory standards. Proposed fix: prefix label `Audience 25–54` in mono text adjacent to the track, drop the glyph if unused, or remove the component until we can show real distribution data.

## 5. Doctrine Compliance Notes

- EU/UK transparency: presence-only pins, never summed ✓ (but see 4.4 for legibility)
- No UUID exposure on /brands ✓ (Discover's `?brand=<uuid>` remains open backlog — KT §J violation logged separately)
- Content-addressed media identity preserved through the portrait path ✓
- Honesty doctrine: violated by the pulse (4.3) — flagged, fix proposed
- KT §N unresolved provider fields: not surfaced (see 4.5 ruling needed)

## 6. Process Notes (for the record)

- Work isolated in git worktree `../adlabs-brands-page` on branch `feat/brands-atlas`; main checkout untouched except docs-only PROJECT_STATE.md log entries (uncommitted)
- llmgraph indexed the worktree as repo `adlabs-brands` (verify-green) — used to trace Discover's media-resolution flow when debugging 4.2, which is how we confirmed the dev-proxy pattern was correct before suspecting the route itself
- Dev server instability during validation was caused by probe load crashing Turbopack workers; all "failures" observed after that point are unreliable as product evidence
- Nothing pushed; nothing deployed; production unaffected

## 7. Requested Rulings

1. **Running counts (4.5):** corpus creative groups, total canonical ads, or provider-disclosed counts? Provider-disclosed requires an §N doctrine exception.
2. **Activity pulse (4.3):** remove (honest minimal) or invest in real observation-history buckets?
3. **Transparency labels (4.4):** approve `EU · UK` text labels over dots?
4. **Audience band (4.6):** keep-with-labels or cut until real distributions exist?
5. Confirm the verification protocol for 4.2 before I touch any portrait logic.

— End of report.
