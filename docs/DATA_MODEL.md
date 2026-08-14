# AdLabs M0 — Data Model & Schema Invariants

This document outlines the core domain entities, foreign key delete rules, and structural invariants governing the AdLabs M0 PostgreSQL schema.

---

## 1. Domain Entities & Table Summary

| Table | Purpose | Primary Key | Key Relationships & Foreign Keys |
| :--- | :--- | :--- | :--- |
| `brands` | Tracked business / brand identity | `id` (UUID) | Root parent entity |
| `source_accounts` | Tracked ad platform account/page for a brand | `id` (UUID) | `brand_id` -> `brands(id)` (`ON DELETE RESTRICT`) |
| `ingestion_runs` | Audit log and telemetry per crawl execution | `id` (UUID) | `source_account_id` -> `source_accounts(id)` (`ON DELETE RESTRICT`) |
| `raw_ingestion_items` | Immutable provider payloads for replay/debugging | `id` (UUID) | `ingestion_run_id` -> `ingestion_runs(id)` (`ON DELETE RESTRICT`) |
| `ads` | Observed external ad record (keyed by archive ID) | `id` (UUID) | `source_account_id` -> `source_accounts(id)` (`ON DELETE RESTRICT`) |
| `ad_cards` | Child carousel/DCO card payload & copy | `id` (UUID) | `ad_id` -> `ads(id)` (`ON DELETE CASCADE`) |
| `media_assets` | Physical media metadata & storage tracking | `id` (UUID) | Standalone asset record |
| `ad_media` | Attachment link between an ad and a media asset | `(ad_id, media_asset_id, position)` | `ad_id` -> `ads(id)` (`CASCADE`), `media_asset_id` -> `media_assets(id)` (`RESTRICT`) |
| `card_media` | Attachment link between a card and a media asset | `(ad_card_id, media_asset_id, position)` | `ad_card_id` -> `ad_cards(id)` (`CASCADE`), `media_asset_id` -> `media_assets(id)` (`RESTRICT`) |
| `ad_observations` | Append-only timeline of ad presence per crawl | `id` (UUID) | `ad_id` -> `ads(id)` (`RESTRICT`), `ingestion_run_id` -> `ingestion_runs(id)` (`RESTRICT`) |

---

## 2. Foreign-Key Delete Behaviors

Foreign key constraints default to conservative, restrictive behaviors to prevent accidental historical data loss:

1. **Restrictive (`ON DELETE RESTRICT`) on Core Entities**:
   - `source_accounts` -> `brands`: A brand cannot be dropped while tracked accounts reference it.
   - `ingestion_runs` -> `source_accounts`: Crawl audit runs are permanent historical records.
   - `raw_ingestion_items` -> `ingestion_runs`: Raw payload archives cannot be dropped.
   - `ads` -> `source_accounts`: Ads cannot be deleted by deleting an account.
   - `ad_observations` -> `ads` & `ingestion_runs`: Historical time-series observations are append-only.
   - `ad_media` & `card_media` -> `media_assets`: Physical media assets cannot be removed while referenced.

2. **Cascading (`ON DELETE CASCADE`) on Dependent Sub-components**:
   - `ad_cards` -> `ads`: Cards are structural components of a specific parent ad.
   - `ad_media` -> `ads`: Ad-to-media junction rows are removed if the parent ad is deleted.
   - `card_media` -> `ad_cards`: Card-to-media junction rows are removed if the parent card is deleted.

---

## 3. Structural Invariants

The data model enforces the following critical invariants:

1. **Tracked Brand != Publishing Identity (`publisher_page_id` / `publisher_page_name`)**:
   - `brands` represents our internal entity for tracking.
   - Ads report `publisher_page_id` and optional `branded_content_page_id`. An advertiser account may run ads across different or co-branded pages. These identities must not be collapsed.

2. **Ad != Card**:
   - Single-asset ads have top-level copy in `ads`.
   - Multi-card (carousel/DCO) ads contain 1..N child records in `ad_cards` with card-specific headlines, descriptions, CTAs, and destination URLs. Card copy is never flattened into the parent ad.

3. **Ad != Media & Card != Media**:
   - Media exists as a separate physical asset (`media_assets`) attached via junction tables (`ad_media`, `card_media`).
   - Multiple ads or cards may share or re-use identical physical media assets.

4. **Collation != Proven Campaign or Creative Concept**:
   - `source_collation_id` is an opaque provider grouping identifier from Meta Ad Library.
   - It does not represent a verified campaign, angle, or creative grouping, and is stored strictly as reported metadata without higher-level domain inferences.

5. **Source-Reported End Date != Proven Stop Date**:
   - `source_reported_end_at` is an external field provided in the payload that often changes or indicates scheduled bounds rather than real run time.
   - Proven active presence is derived exclusively from `ad_observations`.

6. **Absence From One Crawl != Proven Inactivity**:
   - Network timeouts, pagination changes, or search glitches can omit an ad from a crawl run.
   - Absence in a run is not recorded as inactive; only explicit observation state in `ad_observations` and aggregated `last_seen_at` establish verified activity windows.

7. **Media Source URL != Persistent Media Identity**:
   - Meta CDN URLs (`source_url`) are ephemeral and expire.
   - Permanent media deduplication and storage identity rely on `sha256` content hashing and durable object storage keys (`storage_key`), not ephemeral URLs.

8. **SHA-256 Media Identity & Uniqueness**:
   - Once known, SHA-256 is the canonical exact identity of a persisted physical media file. Multiple pending assets may have NULL hashes, but non-null hashes must be unique.

---

## 4. Architectural Decision: Omission of `creatives` Table in M0

There is deliberately **no `creatives` / `creative_groups` / `creative_concepts` table** in M0.

### Rationale:
1. **Premature Abstraction**: Current observed data provides verifiable facts: an ad archive ID, child cards, and raw media files. A "creative concept" (e.g. angle, hook, visual variant) is an analytical inference, not a raw observation.
2. **Avoid Dirty Groupings**: Attempting to cluster ads into "creatives" before deduplication, hashing, and visual clustering algorithms are tested leads to fragile foreign keys and cascading schema migrations.
3. **Evolutionary Path**: Higher-level creative grouping entities will be introduced as derived analytical models in later milestones once real India-corpus ad data has been ingested and analyzed.
