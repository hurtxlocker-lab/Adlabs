# AdLabs M0 — Ingestion Architecture & Source Contract

This document outlines the boundary between external scraper provider payloads (e.g. Curious Coder Meta scraper) and AdLabs' canonical domain model.

---

## 1. Provider Parser vs Canonical Source Model

AdLabs strictly separates external scraper formats from internal domain representations:

```
[ Curious Coder Scraper JSON ]
              │
              ▼
   ( Provider Zod Parser )        <-- Validates provider structural shape & requires ad_archive_id
              │
              ▼
   ( Canonical Source Model )     <-- SourceAd, SourceAdCard, SourceMedia (Provider-independent)
              │
              ▼
   ( Domain Normalizer )          <-- Step 4B: Maps canonical source to database entities
```

1. **Provider-Specific Area (`src/ingestion/sources/meta/curious-coder/`)**:
   - Understands scraper-specific naming (`ad_archive_id`, `snapshot`, `video_hd_url`, etc.).
   - Tolerates provider schema shifts using Zod passthrough parsing.
   - Preserves complete unmodified raw payloads.
2. **Canonical Types (`src/ingestion/types/`)**:
   - Provider-independent interfaces (`SourceAd`, `SourceAdCard`, `SourceMedia`).
   - Clean domain names (`sourceAdId`, `advertiser`, `publisher`, `cards`, `directMedia`).

---

## 2. Ingestion Invariants & Contract Rules

### A. `ad_archive_id` is Canonical External Ad Identity
- In Meta Ad Library payloads, `ad_id` is frequently `null` or unpopulated, whereas `ad_archive_id` is always the unique archive record identifier.
- Canonical `sourceAdId` maps strictly to `ad_archive_id`.
- Any provider item missing or with an empty `ad_archive_id` is rejected at the parser boundary.

### B. Advertiser != Publisher != Branded Content Sponsor
- **Tracked Advertiser (`page_id` / `page_name`)**: The account being tracked/crawled for the brand.
- **Publisher Page (`snapshot.page_id` / `snapshot.page_name`)**: The Facebook/Instagram page on which the ad actually appears (e.g. an influencer or creator page).
- **Branded Content Sponsor (`snapshot.branded_content_page_id`)**: The co-branded sponsor tag on creator ads.
- These three identities are maintained independently and never collapsed.

### C. Collation Opacity
- `collation_id` and `collation_count` are stored strictly as reported provider metadata.
- They are **not** treated as campaigns, creative groups, concepts, or variant families.

### D. Source End-Date Caveat
- `sourceReportedEndAt` represents the external metadata field (which may reflect campaign scheduling or batch bounds).
- It is not a verified indicator of ad stoppage. Proven active presence is established only through successive crawl observations (`ad_observations`).

### E. Raw Payload Preservation
- Every raw crawl record is archived verbatim into `raw_ingestion_items` and `ads.raw_last_payload`.
- The provider parser returns both the validated data and the untouched `raw` payload object to guarantee full auditability and replayability.

### F. No `Creative` Abstraction in M0
- There is deliberately no `Creative` or `CreativeGroup` type in M0.
- Raw observation entities are factual: `SourceAd`, `SourceAdCard`, and `SourceMedia`. Analytical clustering into conceptual creatives will occur in later milestones.
