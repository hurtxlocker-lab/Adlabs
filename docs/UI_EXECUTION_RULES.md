# AdLabs — UI Execution Rules

## Hard Implementation Standards & Architectural Constraints

---

## 1. Creative Dominance
1. **Visual Attention Allocation**: On primary discovery surfaces (such as the Discover grid), media assets must occupy **65% to 80%** of the visual real estate on viewport. Chrome, toolbars, sidebars, and metadata containers must not overpower the creative.
2. **Hero Status**: The creative work is the hero. Surrounding framing must act as an exhibition environment (like a gallery or master print catalogue), maintaining quiet contrast against the media.
3. **No Decorative Intrusion**: UI labels, badges, or overlays must never clip, obscure, or cover crucial creative content (such as headlines, faces, or call-to-action overlays inside video/images) unless explicitly placed in standardized corner status positions with high-contrast legibility.

---

## 2. Composition & Framing
1. **Container Minimization**: Do NOT use identical rounded boxes with 1px grey borders as the default layout primitive for every piece of content. 
2. **Structural Tools Before Boxes**: Establish visual structure using **whitespace, alignment, typographic contrast, subtle rules (`1px` hairline dividers), and spatial proximity** before wrapping elements in background containers.
3. **Layering Over Enclosure**: Use subtle elevation and clean planar shifts rather than nested box-inside-box layouts.
4. **Hierarchy Rules**:
   - Level 1: Primary Creative Media
   - Level 2: Core Factual Anchor (Advertiser / Brand Name + Source Ad ID)
   - Level 3: Creative Copy (Headline & Primary Text snippet)
   - Level 4: Observation Signals (Format, First/Last Seen duration)

---

## 3. Grid Behavior & Proportions
1. **Aspect Ratio Respect**: Preserve natural source aspect ratios whenever possible:
   - **9:16** Vertical Video / Stories / Reels
   - **1:1** Square Feed Posts / Carousels
   - **4:5** Vertical Feed Posts
   - **16:9** Landscape Display Video
2. **No Arbitrary Cropping**: Center-cropping a 9:16 vertical video into a 1:1 square is strictly prohibited unless explicitly accompanied by an aspect-ratio pill and full-view expansion affordance.
3. **Masonry & Column Rhythms**: Use multi-column responsive grid structures with variable-height cells or disciplined row-aligned modular grids that allow different aspect ratios to coexist rhythmically without visual collapse.
4. **Consistent Gaps**: Maintain uniform gutter scales (e.g. `gap-4` / `16px` or `gap-6` / `24px`) across all grid containers.

---

## 4. Typography
1. **Dual Typographic Roles**:
   - **Editorial / Expressive Role**: For brand names, section titles, and key quotes. High aesthetic character, precise kerning, and editorial presence.
   - **Utility / Monospace Role**: For technical metadata, SHA-256 hashes, timestamps, formats, byte sizes, and IDs. Crisp, legible, tabular figures.
2. **No Default Browser Fonts**: Never rely on unconfigured system fallbacks (`Times New Roman`, `Arial`). Use curated, high-craft web typography loaded via Next.js font optimization.
3. **Type Scale Discipline**: Define and strictly adhere to a 6-step typographic scale:
   - `Display` (24–32px, bold/medium)
   - `Title` (18–20px, medium)
   - `Body Large` (15–16px, regular)
   - `Body Small` (13–14px, regular)
   - `Caption / Meta` (11–12px, regular/medium, tabular figures)
   - `Micro / Tag` (10–11px, uppercase/mono, tracked +0.05em)
4. **Line-Height & Measure**: Maintain `1.4–1.6` line-height for body copy. Cap text column width to `60–75` characters to preserve reading comfort.

---

## 5. Color System
1. **Palette Discipline**:
   - **Dark / Deep Charcoal Base**: A sleek, museum-grade dark foundation (e.g., deep warm charcoals `#0D0F12`, `#14171C`, `#1C2026`) that makes video and color photography pop without blinding eye fatigue.
   - **Crisp Neutral Text**: Tiered neutral scales for text (`100% white` for primary, `70% neutral` for secondary, `45% muted` for meta).
   - **Precise Accent**: Exactly one restrained, intentional accent color (e.g., warm amber, editorial ochre, or electric vermillion) used strictly for interactive states, focal highlights, and active filters.
2. **No Rainbow Badge Spam**: Do NOT assign random bright colors (red, green, blue, purple, orange) to different metadata tags. Badges must use monochromatic neutral shades with subtle contrast differences.
3. **Contrast Ratios**: All text must meet WCAG 2.1 AA contrast requirements (minimum 4.5:1 for normal text, 3:1 for large text).

---

## 6. Media Handling & Storage Pipeline
1. **Storage Source Invariant**: All displayed media in UI must resolve from verified Cloudflare R2 storage keys (`media/sha256/<sha256>`) or our configured media serving layer. Never render direct, ephemeral signed Meta CDN URLs in user-facing UI.
2. **Lazy Loading**: All images and video posters outside the initial viewport must use `loading="lazy"` or Next.js `Image` optimization with blur placeholders.
3. **Video Autoplay Policy**:
   - **Never autoplay all videos simultaneously** on grid surfaces.
   - Support hover-to-preview (silent, muted, looping preview) on individual grid cells.
   - Full playback with sound is triggered only on explicit user click / modal expansion.
4. **Resolution Fallback**: If an HD video is available, use it for full detail; use lightweight compressed thumbnails / previews for grid stream rendering.

---

## 7. Annotation & Metadata Language
1. **Factual Clarity**: Metadata tags must be compact, unambiguous, and formatted consistently:
   - Formats: `VIDEO`, `IMAGE`, `CAROUSEL`, `DCO`
   - Dates: Relative for recent (`"3d ago"`), ISO date for absolute (`"2026-08-15"`)
   - Platform: Clean text markers (`"Meta Ad Library"`, `"Instagram"`, `"Facebook"`)
2. **No Badge Overload**: Maximum of 2 to 3 compact badges per grid card (e.g., Format + Duration). Additional metadata belongs in the detail drawer/view.

---

## 8. Navigation & Spatial Continuity
1. **Orientation Permanence**: The user must always know where they are. Active page/filter state must be visible in the persistent navigation bar.
2. **Unbroken Search Flow**: The search input must remain accessible from anywhere in the exploration workflow. Pressing `/` or `Cmd+K` / `Ctrl+K` must instantly focus search.
3. **Effortless Back-Navigation**: Expanding an ad into a modal or detail view must never destroy the user's scroll position in the primary stream. Returning to the grid must preserve exact scroll and filter state.

---

## 9. Information Density
1. **Dense, Not Noisy**: Expert workflows require dense information. Achieve density through compact typography, tight tabular metrics, and disciplined alignment—not by reducing padding to zero.
2. **No Faux-Luxury Voids**: Do not create 200px empty margins merely to simulate "high-end" design. Space must be purposeful and rhythmic.

---

## 10. Motion & Animation
1. **Functional Motion Only**:
   - Open/close transitions (subtle scale/fade, `150–220ms`, `cubic-bezier(0.16, 1, 0.3, 1)`).
   - Hover elevation / border glow (`120ms` ease-out).
   - Tab / filter slider transitions (`200ms` ease-out).
2. **One Delight Moment per Screen**:
   - **Discover**: Smooth, responsive hover-to-scrub / video preview expansion.
   - **Brand Dossier**: Fluid timeline scrubbing across historical campaigns.
   - **Creative Detail**: Seamless card traversal with synchronized copy highlighting.
3. **Accessibility**: Honor `prefers-reduced-motion` across all CSS transitions and animations.

---

## 11. Interaction & Keyboard Accessibility
1. **Keyboard-First Navigation**:
   - `J` / `K` or `ArrowDown` / `ArrowUp` to navigate across ads in stream.
   - `Enter` / `Space` to open detail inspector.
   - `Escape` to close modal/inspector and return to grid.
   - `/` or `Cmd+K` to search.
2. **Fluid Hover Feedback**: Every interactive cell must clearly indicate clickability via subtle border lighting or smooth image scaling (`scale(1.01)` max), never abrupt layout shifts.

---

## 12. Epistemic & Semantic Honesty
1. **Four-Tier Epistemic Visual Grammar**:
   - **FACT**: Clean, neutral, high-legibility tabular style (e.g. `first_seen_at: 2026-08-15`).
   - **SIGNAL**: Subtly differentiated with contextual indicator (e.g. `Active for 42 days (High Longevity)`).
   - **INTERPRETATION**: Distinctly styled (e.g. italicized or labeled `Derived Analysis`).
   - **CONCEPT**: High-level strategic archetype framing.
2. **M1 Constraint**: In M0/M1, **ONLY FACTUAL DATA MAY BE DISPLAYED**.
3. **Zero Fake Metrics**: Absolutely no AI-generated "Virality Index", "Performance Score", or "Estimated Spend" unless backed by actual verified platform data.

---

## 13. Indian Cultural Grammar (Intellectual, Not Decorative)
1. **No Decorative Clichés**: Absolutely zero paisley patterns, rangoli vectors, elephant illustrations, or faux-sanskrit typography.
2. **Grammar of Complexity & Rhythm**: Indian visual culture is masterfully dense, layered, and rhythmic (miniature paintings, temple architecture, textile patterns). In AdLabs, this translates into:
   - Rich, multi-level spatial layouts
   - Intricate comparative side-by-side matrices
   - Precision handling of multilingual copy (Hindi, Hinglish, Tamil, Bengali script support)
   - Category-specific commercial context (COD trust badges, festival shopping seasons, UPI price anchors)

---

## 14. Performance & Core Web Vitals
1. **Sub-Second Initial Render**: Core discovery grid must render visible content in `< 800ms`.
2. **Zero Layout Shift**: Fixed aspect-ratio skeleton placeholders must occupy cell dimensions before media loads (`CLS < 0.05`).
3. **Bundle Weight Discipline**: Do NOT import massive third-party icon sets or heavy UI libraries. Use pure CSS, Tailwind CSS tokens, and lightweight SVGs.

---

## 15. Responsive Architecture
1. **Desktop Powerhouse**: Primary design target is desktop (`1440px+` / `1920px` viewports) where creative directors do deep research with multi-column comparative layouts.
2. **Tablet & Laptop Grace**: Fluid adaptation down to `1024px` and `768px` with clean column reduction (e.g. 4 columns $\rightarrow$ 3 columns $\rightarrow$ 2 columns).
3. **Mobile Comprehension**: Clean, focused single/two-column feed on mobile viewports (`375px–430px`) with full inspection capabilities.

---

## 16. Banned Patterns Checklist

Before committing any UI, verify that none of these banned patterns exist:
- [ ] No generic purple-to-blue AI gradient backgrounds
- [ ] No glassmorphic blur layers obscuring text legibility
- [ ] No identical 1px grey bordered boxes tiling the entire screen
- [ ] No fake quality/performance scores or progress bars
- [ ] No decorative Indian motifs or clip art
- [ ] No raw unparsed JSON payloads dumped into user views
- [ ] No unformatted database UUIDs shown as primary labels
- [ ] No simultaneous autoplaying videos causing audio/video chaos
- [ ] No broken aspect ratios or forced distortion of creative assets

---

## 17. The 5-Pass Implementation Sequence

All UI development must follow this sequential progression:

```
PASS 1: COMPOSITION
  • Spatial hierarchy, grid structure, aspect ratio framing, whitespace rhythm.
  • Test with blank/wireframe blocks to verify composition before styling.

PASS 2: VISUAL LANGUAGE
  • Typography scale, dark palette tokens, hairline rules, contrast ratios.
  • Static high-fidelity layout review.

PASS 3: INTERACTION & MEDIA
  • R2 media integration, hover previews, video player controls, smooth modals.
  • Keyboard shortcuts, scroll preservation, search focus.

PASS 4: PRODUCT INTELLIGENCE
  • Factual metadata binding, brand dossier timeline, card inspection.
  • Epistemic labeling and data honesty verification.

PASS 5: REVIEW & CRITIQUE
  • Pass the Creative Director, Product Designer, and Engineering tests.
  • Screenshot review rubric and performance audit.
```

---

## 18. Initial Discover Surface Constraints (M1 Ground Zero)

When building the first version of the **Discover** page:
1. **Real Data Only**: Render strictly verified persisted ads from Supabase and R2 (e.g. Mamaearth live run items). Zero mock placeholder ads.
2. **Creative Grid is Hero**: Discover stream is the centerpiece of the application.
3. **Search & Filter Anchor**: Search by brand/keyword and filter by format (`VIDEO`, `IMAGE`, `CAROUSEL`) must work with live data.
4. **Factual Metadata Only**: Display only verified brand names, formats, dates, headlines, and exact copy.
5. **No Premature Complexity**: No auth gates, no fake bookmark buttons, no fake AI summaries, no broken payment links. Everything on screen must be real, functional, and true.
