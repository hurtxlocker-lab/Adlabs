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
   ( Ingestion Persistence )      <-- Step 4C1-4C4: Foundation, Ads, Cards & Media Persistence
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
   - `persistObservedAd` wraps `saveRawIngestionItem`, `upsertAd`, `reconcileAdCards`, and `createAdObservation` in an atomic transaction.
   - If any step fails, the transaction rolls back atomically (including raw items and card mutations).
   - The outer ingestion run remains intact.
   - Run counters are calculated and passed to `finishIngestionRun` at the orchestration level, not inside individual item transactions.

---

## 6. Card Persistence & Reconciliation Rules

Ad card persistence (`reconcileAdCards`) enforces snapshot reconciliation for multi-card/DCO/carousel ads:

1. **Card Database Identity**:
   - Card identity is `(ad_id, position)` with zero-indexed positions (`0, 1, 2...`).
   - Cards represent current-snapshot state, not historical timeline entities.

2. **Deterministic Reconciliation & Stale Deletion**:
   - Incoming `SourceAd.cards` replaces the existing card set for that `ad_id`.
   - Existing cards at matching positions are updated with current snapshot copy, URLs, and `raw_payload`.
   - Any card rows with positions not present in the incoming snapshot are deleted.
   - If incoming `SourceAd.cards` is empty, all card rows for that `ad_id` are deleted.

3. **Null Overwrite Semantics**:
   - Canonical `null` fields in an incoming card overwrite previous non-null values in PostgreSQL.

4. **Reorder Semantics**:
   - Card order changes update the rows at respective positions (position-based snapshot replacement).

5. **Validation & Atomic Integration**:
   - Incoming card positions are validated to be safe non-negative integers. Duplicate positions within an incoming array throw `DuplicateCardPositionError`.
   - Card reconciliation executes inside the `persistObservedAd` per-item transaction between `upsertAd` and `createAdObservation`. If card operations fail, observation creation is aborted and the transaction rolls back.
   - Card media candidate persistence remains deferred for subsequent pipeline steps.

---

## 7. Stored Media Persistence & Relationship Reconciliation Rules

Physical media persistence (`ensureStoredMediaAsset`, `reconcileAdMedia`, `reconcileCardMedia`) handles completed, already-stored media:

1. **Locator vs Exact Physical Identity**:
   - A `SourceMedia` URL is an ephemeral locator, not physical identity.
   - Physical media identity is strictly `sha256` (64 hexadecimal characters, lowercase).
   - SHA-256 is computed upstream only after physical byte retrieval.
   - MIME type is descriptive metadata, not exact byte identity; `null` MIME enriches to known MIME, while conflicting MIME strings preserve the canonical first-observed MIME without failure.

2. **Persistence Boundary**:
   - The persistence layer receives already-downloaded, already-stored media (`download_status = "STORED"`).
   - No network requests, external CDN fetches, hash calculations, or R2 API calls occur in this layer.

3. **Race-Safe Deduplication, Metadata Enrichment & Immutability**:
   - `ensureStoredMediaAsset` uses `INSERT ... ON CONFLICT (sha256) DO NOTHING`.
   - When an existing SHA-256 is encountered:
     - Strict physical invariants (`byte_size`, `storage_provider`, `storage_key`) must match exactly or throw `MediaAssetConflictError`.
     - Media type allows `UNKNOWN` $\rightarrow$ known type enrichment; conflicting known types throw `MediaAssetConflictError`.
     - First-observed `source_url` is preserved and not overwritten by subsequent ephemeral URLs.
     - Storage location is immutable.

4. **Ad & Card Relationship Identity & Reconciliation**:
   - Relationship identity is `(parent_id, media_asset_id, position)` where `parent_id` is `ad_id` or `ad_card_id` (`role` is excluded from identity).
   - Within an incoming batch for a parent, duplicate incoming tuples with identical `(SHA-256, position)` are rejected regardless of role.
   - `role` is mutable snapshot metadata; changes to role on matching relationship identity update the row.
   - Incoming media sets represent the current observed snapshot; stale relationships are deleted.
   - Shared physical `media_assets` rows are **never** deleted during relationship reconciliation or ad deletion (no orphan GC in M0).
   - Deletions are strictly scoped to the specific `ad_id` or `ad_card_id`.

---

## 8. Secure Media Downloader & Streaming SHA-256 Rules

The media downloader (`src/ingestion/media/`) retrieves remote media assets safely:

1. **Untrusted External Input & Protocol Policy**:
   - All `SourceMedia.sourceUrl` strings are treated as untrusted external inputs.
   - Only `http:` and `https:` protocols are accepted; all other schemes (`file:`, `data:`, `blob:`, `ftp:`, etc.) and malformed URLs are rejected.

2. **DNS & SSRF Protection**:
   - Direct IP addresses and DNS-resolved addresses are validated against private, link-local, loopback, CGNAT, documentation, and multicast ranges (both IPv4 and IPv6).
   - Local hostnames (`localhost`, `*.localhost`) are rejected.
   - If any resolved address for a domain is private or reserved, the request fails closed.
   - *Residual TOCTOU Limitation*: Standard Node.js fetch does not support IP pinning across DNS resolution and socket connection; pre-fetch multi-IP resolution validation provides the strongest standard defense against SSRF.

3. **Redirect Validation**:
   - Native auto-redirects are disabled (`redirect: "manual"`).
   - A maximum of 5 redirects are allowed. Every hop re-executes full SSRF, protocol, and loop validation before issuing the next request.

4. **Memory-Bounded Streaming & Hard Size Limits**:
   - Maximum download size is capped at 100 MiB (`104,857,600` bytes).
   - If `Content-Length` exceeds the limit or is negative, the request is rejected before reading the body.
   - Body bytes are streamed chunk-by-chunk through a streaming SHA-256 hasher and written directly to a temporary file on disk (in `os.tmpdir()`), aborting if streamed bytes exceed the limit. No full in-memory buffering is permitted.

5. **Exact-Byte SHA-256 Calculation**:
   - SHA-256 is computed strictly over raw streamed bytes using Node `crypto.createHash("sha256")` and formatted as lowercase 64-hex.

6. **Bounded Magic-Byte Sniffing & Content Validation**:
   - The initial 512 bytes are inspected for media signatures (JPEG, PNG, GIF, WebP, MP4/ftyp, WebM) and obvious text/HTML/JSON error payloads.
   - Text error pages and mismatched formats (e.g. video returned when image was expected) are rejected with `InvalidMediaContentError`.

7. **Temporary File Lifecycle**:
   - Temp files use randomized safe filenames in `os.tmpdir()`.
   - Partial files from aborted/failed downloads are cleaned up immediately.
   - The caller/storage layer owns cleanup of successful downloads via `DownloadedMedia.cleanup()`.

8. **Isolation & Retries**:
   - The downloader has zero awareness of database schemas or object storage (R2).
   - Retries are not performed at the downloader layer (a single deterministic attempt per call).

---

## 9. Cloudflare R2 Object Storage Adapter Rules

The object storage adapter (`src/storage/`) manages content-addressed media persistence in Cloudflare R2:

1. **Object Storage vs Media Identity**:
   - R2 is a physical object store, not canonical media identity.
   - Physical media identity is strictly the lowercase 64-hex SHA-256 hash.
   - Public base URLs and R2 endpoints are configuration/presentation concerns and are **never** stored in the database as persistent media identity.

2. **True SHA-Addressed Deterministic Storage Keys**:
   - Keys follow the pure SHA-addressed pattern: `media/sha256/<sha256>`.
   - Keys depend **solely** on the canonical SHA-256 hash of the downloaded bytes.
   - Keys do **not** contain file extensions, mediaType directories (`images/`, `videos/`, `previews/`), MIME types, brands, ad IDs, timestamps, or URLs.
   - `IMAGE` and `VIDEO_PREVIEW` sharing the exact same byte payload map to the exact same R2 object key.
   - Same physical bytes (SHA-256) always resolve to the exact same R2 key.

3. **Existence Check, Upload & Verification Flow**:
   - `storeDownloadedMedia()` issues a `HeadObject` check against the bucket and key (`media/sha256/<sha256>`).
   - If the object exists (200): verifies that `ContentLength` matches `byteSize` and that `Metadata.sha256` (if present) matches. If valid, the existing object is reused without uploading, even if the incoming `mediaType` or `mimeType` varies.
   - If the object is absent (404): streams the temporary file to R2 via `PutObject` with SHA-256 metadata (`Metadata: { sha256 }`), setting `ContentType: mimeType`, then performs a post-upload `HeadObject` verification to confirm storage integrity.
   - Non-404 `HeadObject` errors (e.g. 403 Forbidden, network failures) fail immediately without attempting `PutObject`.

4. **Upload Idempotency & Concurrency Races**:
   - If two concurrent workers simultaneously check and find an object missing, both issue `PutObject` for the same deterministic key `media/sha256/<sha256>` with identical bytes and metadata, ensuring logical idempotency.

5. **Lifecycle & Temp File Cleanup Ownership**:
   - `storeDownloadedMedia()` streams and reads `downloaded.tempFilePath` but does **not** delete it.
   - Ownership of `downloaded.cleanup()` remains with the outer orchestration layer, allowing clean reuse/recovery if downstream database transactions fail.

6. **Boundary Isolation & Metadata Privacy**:
   - No database writes occur within the storage adapter.
   - Semantic `mediaType`, raw source URLs, signed query parameters, and access credentials are never stored in R2 object metadata.

