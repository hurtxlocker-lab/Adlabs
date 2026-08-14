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
   ( Domain Normalizer )          <-- Step 4B: Pure deterministic transformation
              │
              ▼
   ( Ingestion Persistence )      <-- Step 4C1 & 4C2: Foundation + Ad & Observation Upsert
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
- **Branded Content Sponsor (`snapshot.branded_content.page_id`)**: The co-branded sponsor tag on creator ads.
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

---

## 3. Pure Normalization & Media Extraction Rules

The normalizer (`normalizeCuriousCoderAd`) is a pure, deterministic function transforming validated provider data into `SourceAd` without I/O or state:

1. **Video Rendition Precedence (HD > SD)**:
   - If `video_hd_url` exists, emit one `video` candidate with role `primary` (or `extra`).
   - Else if `video_sd_url` exists, emit `video` with role `primary` (or `extra`).
   - HD and SD are renditions of the same physical media; only the highest quality candidate is emitted.
   - `video_preview_image_url` is extracted as a separate candidate (`type: "video_preview"`, `role: "preview"`).

2. **Image Rendition Precedence (Original > Resized)**:
   - If `original_image_url` exists, emit one `image` candidate with role `primary` (or `extra`).
   - Else if `resized_image_url` exists, emit `image` with role `primary` (or `extra`).

3. **URL-Level Candidate Deduplication vs Physical Deduplication**:
   - Exact duplicate candidate items `(type, sourceUrl, role)` within a single ad are conservatively deduped.
   - Different URLs are **never** deduped during normalization; physical deduplication is based exclusively on `sha256` hashes computed after downloading in subsequent pipeline steps.

4. **Card Independence**:
   - Multi-card (carousel/DCO) copy and card-specific media remain isolated inside `SourceAdCard.media` with zero-indexed positions (`0, 1, 2...`).
   - Parent copy and card copy are never flattened or interpolated.

---

## 4. Ingestion Persistence & Lifecycle Rules

The persistence foundation (`src/ingestion/persistence/`) manages baseline database entities for crawls:

1. **Ingestion Run Lifecycle (No Giant Transaction)**:
   - An ingestion run is initialized as `RUNNING` via `startIngestionRun()`.
   - Ingestion runs must remain persisted even if subsequent processing fails or crashes.
   - Individual source items are processed independently using short, scoped transactions.
   - The run is finalized atomically via `finishIngestionRun()` to `SUCCEEDED`, `PARTIAL`, or `FAILED`. Re-finalizing an already-finished run throws `IngestionRunStateError`.

2. **Identity Resolution vs Metadata Synchronization**:
   - `ensureBrand(input)` resolves brand identity by unique `slug`.
   - `ensureSourceAccount(input)` resolves source account identity by `(source, source_page_id)`.
   - These functions resolve canonical identities race-safely (`ON CONFLICT DO NOTHING`); they **never** silently overwrite existing brand names, URLs, or account metadata.

3. **Source-Account Ownership Conflict Safety**:
   - If a `(source, source_page_id)` already exists in PostgreSQL linked to a different `brandId`, `ensureSourceAccount` throws `SourceAccountOwnershipConflictError`.
   - It will **never** silently reassign an existing advertising page from one brand to another.

4. **Append-Only Raw Items**:
   - `saveRawIngestionItem()` writes an immutable record to `raw_ingestion_items`.
   - `payload_hash` is preserved for verification but is deliberately **not** unique, allowing identical raw payloads to be captured across multiple runs.

---

## 5. Ad & Observation Persistence Rules

Ad and observation persistence (`upsertAd`, `createAdObservation`, `persistObservedAd`) enforces domain invariants:

1. **Ad Database Identity**:
   - Ad canonical identity is `(source, source_ad_id)`.
   - For Meta, `source = "meta"` and `source_ad_id = SourceAd.sourceAdId` (`ad_archive_id`).

2. **`first_seen_at` Immutability**:
   - `first_seen_at` is set to database `now()` when an ad is first inserted.
   - It is **never** modified on subsequent observations or updates.

3. **`last_seen_at` Semantics**:
   - `last_seen_at` is set to database `now()` on every successful observation.
   - It reflects AdLabs platform observation time, not provider scheduling dates.

4. **Advertiser / Source-Account Ownership Consistency**:
   - `SourceAd.advertiser.sourcePageId` must match the tracked `source_accounts.source_page_id`. Mismatches throw `AdvertiserSourceAccountMismatchError`.
   - An existing ad cannot be silently reparented across different `source_account_id` rows; attempting to do so throws `AdSourceAccountConflictError`.

5. **Append-Only Observations & Duplicate Rejection**:
   - `ad_observations` records are append-only per `(ad_id, ingestion_run_id)`.
   - Attempting to process the same ad twice within the same ingestion run throws `DuplicateAdObservationError`.

6. **Short Per-Item Atomic Transaction**:
   - `persistObservedAd` wraps `saveRawIngestionItem`, `upsertAd`, and `createAdObservation` in an atomic transaction.
   - If ad or observation persistence fails, the raw item in that transaction rolls back with it.
   - The outer ingestion run remains intact.
   - Cards and media assets are excluded from this stage.
   - Run counters are calculated and passed to `finishIngestionRun` at the orchestration level, not inside individual item transactions.
