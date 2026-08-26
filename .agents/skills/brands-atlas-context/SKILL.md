---
name: adlabs-brands-atlas
description: "Use when building the AdLabs Brands Atlas page (feat/brands-atlas worktree). Design law, dials, invariants."
version: 1.0.0
---

# AdLabs Brands Atlas — Working Context

**Worktree:** `C:\Users\abhit\Documents\adlabs-brands-page` (branch `feat/brands-atlas`, from main@`5f0ea15`)
**llmgraph repo id:** `adlabs-brands` (in shared graphs.db, verify-green)
**Rule:** NO PUSH. No unrelated commits. Docs-only changes ride with feature commit.

## Design Read
"Reading this as: intelligence atlas gallery for Indian D2C founders studying
foreign (EU/UK) brand mastery, museum-dark editorial language, leaning toward
existing AdLabs tokens (#07080a canvas, Geist + mono, single accent #d46b38)
+ restrained motion."

## Dials
DESIGN_VARIANCE: 4 · MOTION_INTENSITY: 3 · VISUAL_DENSITY: 6

## Law (overrides any external skill)
1. `docs/UI_EXECUTION_RULES.md` — creative dominance, monochrome badges (max 3),
   editorial+mono dual typography, no box-in-box, aspect respect, orientation permanence
2. `docs/CREATIVE_EXPERIENCE.md` — every pixel teaches; facts as facts;
   no fake analytics (→ NO age pie charts: index has min/max range only)
3. KT invariants — no UUID exposure in public URLs (cards link via slug),
   EU/UK never summed, representative media = browse-image-v1 derivative

## Card anatomy (approved "Polaroid Dossier" v3)
portrait creative → name + transparency pins → category · region (mono) →
obs sparkline + live count → audience band (ageMin–ageMax on axis + gender)

## Hero band
"The Competitive Landscape" editorial statement; stats computed from same query
as cards (N brands · M creatives · X observed days); sub-line narrates active
sort/filter lens.

## Sort lenses
Most Creatives (default) · Recently Active · Reach Scale · Social Authority

## Build steps
1. `getBrandDirectory()` grouped query in queries.ts
2. Rep creative resolution via existing derivative map helper
3. `/brands/page.tsx` server component + grid
4. `BrandCard` component (polaroid, pulse, audience band)
5. Header dead span → Link /brands

## Vendored craft references
`.agents/skills/design-taste-frontend/SKILL.md` (already in repo) +
h3nryprod01/design-taste reference files: motion.md, interaction-states.md,
anti-slop.md (to vendor during build). Pre-flight matrix = self-audit gate.

## Gotchas
- llmgraph console server locks graphs.db — stop port 7788 before builds
- Worker deploy is separate from Vercel web deploys (wrangler, workers/adlabs-media)
- Tailwind v4 static color maps only (no dynamic class strings)
