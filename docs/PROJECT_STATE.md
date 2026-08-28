# AdLabs Project State

## Product
- **Brainfoods AdLabs**: India-focused ad intelligence and competitor research product.
- **Initial Wedge**: Fast, reliable, searchable ad library and creative intelligence tool built for D2C founders, growth marketers, and performance marketing agencies.
- **AI Deferred in M0**: AI/LLM analysis is intentionally excluded from the M0 milestone.
- **Long-term Direction**: Semantic ad search and an evidence-backed LLM-Wiki-style advertising intelligence layer, but strictly designed as derived/rebuildable intelligence over immutable raw payloads and normalized source facts.

---

## M0 Goal
Build and prove the end-to-end ingestion pipeline for configured Meta advertiser pages:
```
Apify/Meta Scraper Data
  │
  ▼
Raw Preservation (raw_ingestion_items)
  │
  ▼
Domain Normalization (SourceAd / SourceAdCard / SourceMedia)
  │
  ▼
Database Persistence (ads, ad_cards, ad_observations)
  │
  ▼
Secure Media Download & Streaming SHA-256
  │
  ▼
Cloudflare R2 Object Storage
  │
  ▼
Observation Timeline & History
  │
  ▼
Crude Internal Browsing UI
```

**M0 Success Criterion**: Rerunning ingestion on successive crawls correctly distinguishes:
- Existing ads
- New ads
- Mutable field updates
- Exact duplicate physical media assets

without relying on ephemeral, time-expiring Meta CDN media URLs.

---

## Current Completed State
- **Core Foundation**: Next.js 16 (Turbopack) + TypeScript + Tailwind CSS v4.
- **Database Architecture**: Supabase PostgreSQL + Drizzle ORM + postgres.js client.
- **Target Safety Verification**: Write-capable scripts verify pooler host, database name, and fail closed unless `DATABASE_URL` project ref matches `SUPABASE_PROJECT_REF`.
- **Domain Model**: 10 relational tables applied via version-controlled SQL migration (`0000_tough_doctor_octopus.sql`).
- **Provider Parser & Contract**: Curious Coder Meta scraper Zod parser preserving unmodified raw payloads.
- **Canonical Model**: Provider-independent `SourceAd`, `SourceAdCard`, and `SourceMedia` types.
- **Pure Normalizer**: Deterministic `normalizeCuriousCoderAd` with video (HD > SD) and image (Original > Resized) rendition precedence and exact casing preservation.
- **Persistence Foundation (Step 4C1)**: Race-safe `ensureBrand`, `ensureSourceAccount`, `startIngestionRun`, `finishIngestionRun`, and append-only `saveRawIngestionItem`.
- **Ad & Observation Persistence (Step 4C2)**: `upsertAd`, `createAdObservation`, and atomic per-item transactions.
- **Card Reconciliation (Step 4C3)**: Position-based card snapshot reconciliation with stale card deletion (`reconcileAdCards`).
- **Stored Media Persistence (Step 4C4 + 4C4.1)**: Deduplication by SHA-256, conservative media type / MIME enrichment, and ad/card relationship reconciliation (`reconcileAdMedia`, `reconcileCardMedia`).
- **Secure Media Downloader (Step 4D1 + 4D1.1)**: HTTP/HTTPS streaming downloader with multi-address DNS SSRF checks, private IP blocking, manual redirect verification (max 5), single 60s operation-wide deadline, 100 MiB limit, magic-byte sniffing, streaming SHA-256 calculation, and memory-bounded temporary file management.
- **Cloudflare R2 Object Storage Adapter (Step 4D2 + 4D2.1 + 4D2.2)**: S3-compatible R2 storage adapter (`src/storage/`), true SHA-addressed deterministic storage keys (`media/sha256/<sha256>`), existence check via `HeadObject`, streaming upload via `PutObject`, post-upload verification, and `StoredMediaInput` output without leaking signed URLs or persisting public base URLs as canonical identity. Live-verified against DEV bucket via dedicated `pnpm test:r2` covering PUT, HEAD, metadata, exact-key deletion, and cleanup.
- **Media Orchestration (Step 4D3 + 4D3.1)**: Two-phase decoupled orchestration (`src/ingestion/media-orchestration/`). Phase A (`prepareAdMedia`) performs external download, SHA-256 calculation, and R2 storage with bounded concurrency (3), temp file cleanup, and in-memory memoization without holding any DB connection. Separation of physical media type (`IMAGE`, `VIDEO`, `UNKNOWN`) from semantic preview usage (`role: "preview"`).
- **Atomic Single-Ad Workflow (Step 4E)**: Unified two-phase end-to-end single-ad pipeline (`ingestNormalizedAd`). Phase A executes media preparation with zero DB connection; Phase B commits raw payload, ad upsert, card reconciliation, direct/card media reconciliation, and run observation in ONE short atomic PostgreSQL transaction with observation-last guarantee.
- **Batch Ingestion Run Orchestration (Step 4F)**: Full run-level batch orchestration engine (`runCuriousCoderIngestion`) over in-memory Curious Coder payload arrays. Sequential item processing, item-level failure isolation (`failures` reporting with typed stage classification), truthful counter accumulation (`createdAdsCount` $\rightarrow$ `new_ads_count`, `updatedAdsCount` $\rightarrow$ `updated_ads_count`, uninstrumented media metrics kept at 0), and strict `ingestion_runs` finalization (`SUCCEEDED`, `PARTIAL`, `FAILED`).
- **Apify Saved-Task Adapter & Live End-to-End Smoke Ingestion (Step 4G)**: Decoupled Apify provider adapter (`src/ingestion/providers/apify/`) executing saved Apify task (`hurtxlocker/3-ad-task-mamaearth`) without actor input reconstruction. Live smoke run on 2026-08-15 (Run `lDqD8PcsDpaatgNV5`, Dataset `1VAqLdRZiiygZwvnj`) successfully ingested 3 real Mamaearth video ads into Supabase (`5f91511b-a185-4d69-82de-e4974c3592d6`), downloaded 6 media assets (3 MP4 videos + 3 JPEG previews), computed exact streaming SHA-256 hashes, uploaded to Cloudflare R2 (`media/sha256/<sha256>`), verified via R2 HEAD (100% byte size match), and persisted atomic observations. Accommodates Curious Coder minimum charge threshold (`count: 10`) via independent local hard cap (`LOCAL_HARD_CAP = 3`).
- **Canonical Private Media Gateway (Step M1A-0)**: Dedicated Cloudflare Worker (`workers/adlabs-media/`, name: `adlabs-media-dev`) attached to custom domain `https://media.brainfoods.in` and bound to private R2 bucket (`brainfoods-ads-dev`). Serves canonical `media/sha256/<sha256>` paths with RFC 7233 byte-range streaming (`206 Partial Content`), private cache gating (`Cache-Control: private, no-transform`), and fail-closed path validation. Application URL resolver (`resolveMediaUrl` using `MEDIA_BASE_URL=https://media.brainfoods.in`).
- **Live Infrastructure Verification (2026-08-16)**:
  - `brainfoods.in` DNS active on Cloudflare with DNSSEC active.
  - Product application: `https://adlabs.brainfoods.in` attached to Vercel.
  - Canonical media origin: `https://media.brainfoods.in` served by Cloudflare Worker `adlabs-media-dev`.
  - Private storage: `brainfoods-ads-dev` bucket remains strictly private (`r2.dev` disabled, no direct public custom domain).
  - Cloudflare Access DEV Gate: `media.brainfoods.in` is gated behind Cloudflare Zero Trust Access. Unauthenticated requests are challenged/denied; authenticated founder sessions load images and stream MP4 videos cleanly with range support.
  - Browser Subresource Behavior: In DEV, unauthenticated `<img>`/`<video>` tags receive an Access login redirect instead of media binaries until an active Access session is established for `media.brainfoods.in`.
  - Security Posture: No blockers for current private DEV media gateway. Final customer-facing media authorization remains intentionally deferred to the future AdLabs Auth/RBAC milestone.
  - Zero Next.js media proxying, zero public bucket exposure, and zero Meta source URL fallback.
- **Test Architecture**: Clean separation between pure offline unit tests (`pnpm test`), database integration tests (`pnpm test:db`), and live R2 smoke test (`pnpm test:r2`).

---

## Current Database Tables
1. `brands`
2. `source_accounts`
3. `ingestion_runs`
4. `raw_ingestion_items`
5. `ads`
6. `ad_cards`
7. `media_assets`
8. `ad_media`
9. `card_media`
10. `ad_observations`

*Explicit M0 Invariant: There is NO `creatives` table in M0.*

---

## Frozen Identity Rules
1. **Meta External Ad Identity**: Curious Coder `ad_archive_id` $\rightarrow$ `SourceAd.sourceAdId` $\rightarrow$ `ads.source_ad_id`.
2. **Provider `ad_id`**: Not canonical ad identity; frequently null in scraper payloads and must never be used as primary ad identity.
3. **Internal Ad Identity**: `ads.id` (UUID v4 generated by AdLabs), referenced by `ad_cards.ad_id`, `ad_media.ad_id`, and `ad_observations.ad_id`.
4. **Brand Identity**: `brands.slug`.
5. **Source Account Identity**: `(source, source_page_id)`.
6. **Ad Database Identity**: `(source, source_ad_id)`.
7. **Card Identity**: `(ad_id, position)` (0-indexed position within an ad).
8. **Physical Media Identity**: Exact lowercase 64-hex SHA-256 hash of downloaded bytes (`media_assets.sha256`).
9. **Media Relationship DB Identity**:
   - `ad_media`: `(ad_id, media_asset_id, position)`
   - `card_media`: `(ad_card_id, media_asset_id, position)`
   *(Role is mutable metadata, excluded from relationship PK).*

---

## Semantic Invariants
- **Identity Separation**: Tracked advertiser $\neq$ publisher page $\neq$ branded content sponsor tag.
- **Collation Opacity**: `collation_id` and `collation_count` are stored strictly as reported metadata and do not define campaigns or creative clusters.
- **End-Date Caveat**: `source_reported_end_at` is external reported metadata, not a verified stoppage timestamp.
- **Active State Observation**: Absence from a single crawl does not prove stoppage; active presence is established by `ad_observations`.
- **First Seen Immutability**: `ads.first_seen_at` is set on initial observation and never modified.
- **Last Seen Semantics**: `ads.last_seen_at` reflects AdLabs platform observation time.
- **Locator vs Physical Identity**: `SourceMedia.sourceUrl` is an ephemeral remote locator; exact physical identity is strictly SHA-256 computed post-download.
- **Card Snapshot State**: Cards represent the current normalized snapshot of multi-card/carousel ads, not historical entities.
- **Auditability**: `raw_ingestion_items` and `ad_observations` preserve immutable historical crawl truth.
- **No Conceptual Creative**: Analytical grouping into "Creatives" is deferred to post-M0 milestones.

---

## Transaction Boundaries
- **Ingestion Run Lifecycle**: An ingestion run is not one giant transaction. It is created as `RUNNING` via `startIngestionRun()` and finalized to `SUCCEEDED`, `PARTIAL`, or `FAILED` via `finishIngestionRun()`.
- **Per-Item Atomic Transaction**: `persistPreparedObservedAd` runs a short scoped transaction for:
  `saveRawIngestionItem` $\rightarrow$ `upsertAd` $\rightarrow$ `reconcileAdCards` $\rightarrow$ `reconcileAdMedia` $\rightarrow$ `reconcileCardMedia` $\rightarrow$ `createAdObservation`.
- **Media Decoupling**: External media downloading and R2 storage execute in Phase A prior to opening the Phase B database transaction.
- **Run Counters**: Computed and passed at the outer batch orchestration level (`runCuriousCoderIngestion`).

---

## Media Rules
- **Protocols**: Downloader accepts only `http:` and `https:`.
- **SSRF / DNS Policy**: Resolves DNS hostnames and verifies all resolved IP addresses against private, link-local, CGNAT, documentation, and multicast ranges (IPv4 & IPv6).
- **Redirects**: Native auto-redirects disabled (`redirect: "manual"`). Max 5 redirects, each re-validated for SSRF/protocols.
- **Single Absolute Deadline**: Operation-wide 60-second deadline across all DNS queries, redirects, and body streaming.
- **Hard Size Limit**: 100 MiB (`104,857,600` bytes). Rejects oversized `Content-Length` early and enforces byte-by-byte streaming limits.
- **Streaming & Memory Safety**: Streams directly to temporary files in `os.tmpdir()` while computing streaming SHA-256 hash. Zero unbounded in-memory buffering.
- **Magic-Byte Sniffing**: Inspects initial 512 bytes for binary signatures (JPEG, PNG, GIF, WebP, MP4/ftyp, WebM) and rejects HTML/JSON/text error payloads.
- **Temporary File Ownership**: Caller/storage layer owns cleanup via `DownloadedMedia.cleanup()`; failed downloads unlink partial files immediately.
- **Physical vs Semantic Media Typing**: SHA-256 identifies exact physical bytes. `media_assets.media_type` reflects physical byte class (`IMAGE`, `VIDEO`, `UNKNOWN`), while semantic usage (such as `video_preview` or poster frames) lives exclusively in relationship metadata (`ad_media.role` / `card_media.role`).
- **Stored Media Deduping**: `ensureStoredMediaAsset` uses `INSERT ... ON CONFLICT (sha256) DO NOTHING`. First observed `source_url` is preserved.
- **Shared Assets**: Shared physical media across multiple ads references a single `media_assets` row; relationships are updated while physical rows are never deleted.
- **R2 Storage Bridge**: Content-addressed keys derived strictly from SHA-256 (`media/sha256/<sha256>`), `HeadObject` existence verification, `PutObject` with SHA-256 metadata, and post-upload verification.

---

## Database Safety
- **Pooler Configuration**: Supabase DEV connects through Session Pooler (port 5432) with SSL required.
- **Migration Discipline**: Migrations are strictly source-controlled (`drizzle-kit generate` $\rightarrow$ inspect SQL $\rightarrow$ `pnpm db:migrate`). `drizzle-kit push` is strictly forbidden.
- **Target Safety Verification**: Write-capable commands verify hostname, port, database, and match `DATABASE_URL` project ref against `SUPABASE_PROJECT_REF` before running.
- **Credential Protection**: Database connection strings, passwords, and tokens are never printed in logs or console output.
- **Production Isolation**: Production database does not exist in the current development workflow.

---

## Deferred From M0
- User Authentication & Session Management
- Billing, Subscriptions, & Metering
- Organizations, Teams, & RBAC
- AI / LLM Tagging, Classification, & Copy Analysis
- Vector Embeddings (`pgvector`) & Similarity Search
- OCR & Video Audio Transcription
- Perceptual Hashing (pHash) & Near-Duplicate Matching
- Google Ads, TikTok, or LinkedIn scrapers
- Meta Marketing API publishing
- Ingestion Queue / Background Job Workers (BullMQ / Redis)
- Microservices, Docker containers, & Kubernetes
- Production Design System / UI Polish

---

## Future Intelligence Direction
- **Long-term Derived Architecture**:
  ```
  Raw Source Payloads (Audit Truth)
    │
    ▼
  Normalized Ad Facts (Domain Reality)
    │
    ▼
  Semantic Representation (Angles, Hooks, Offers)
    │
    ▼
  Persistent Advertising Knowledge / LLM-Wiki
  ```
- **Derived Layer Invariant**: The semantic/wiki intelligence layer must remain derived, versioned, rebuildable, and evidence-linked to source ads. It is never authoritative over raw facts.
- **Target Core Value**: Deep competitor intelligence, longitudinal angle/hook analysis, pain-point discovery, and India-specific creative strategy synthesis.

---

## Immediate Next Step
**Step M1A — Pass 1: Discover Composition**
- **Objective**: Build the first factual Discover composition surface using real persisted AdLabs data. Establish spatial hierarchy, central search, format filtering, media-dominant grid (~70% visual focus), and minimal creative detail navigation depth using the canonical private media gateway (`https://media.brainfoods.in`).
- **Scope**: Product read model (`AdLibraryItem`), Discover server route, factual annotations, responsive variable-aspect grid, minimal `/ads/[id]` detail view.

---

## Operating Principle
The codebase is the durable project memory. When implementation decisions and chat context diverge, committed architecture documentation, schema definitions, and automated test suites represent the authoritative engineering truth. Any alterations to frozen domain invariants require explicit review and documentation updates.

---

## Media Gateway Deployment Note (2026-08-26)
Commit `4609acf` (immutable edge caching for media Worker) was merged Aug 23 but **never deployed to Cloudflare** — live `media.brainfoods.in` continued emitting the old `Cache-Control: private, no-transform` on all success paths. Discovered via header fingerprinting during Phase 5C.1 production measurement closure.

Deployed Aug 26 (wrangler, version `4608ff0e`). Verified live:
- Image derivative GET: `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`; repeat requests serve `CF-Cache-Status: HIT`
- Video full GET (200) and Range (206 + correct Content-Range): both carry immutable cache policy; seeking intact
- R2 binding unchanged (`brainfoods-ads-dev`); custom domain route unchanged (`media.brainfoods.in`)

---

## Brands Atlas — Phase M1B (2026-08-26)
Branch: `feat/brands-atlas` (isolated worktree `../adlabs-brands-page`, commit `0be1325`, NOT pushed).

- **New surface:** `/brands` — "The Competitive Landscape": brands as first-class intelligence entities.
- **Polaroid Dossier cards:** representative creative (browse-image-v1) portrait + editorial name +
  EU/UK transparency pins (presence only, never summed) + observation pulse sparkline + live group
  count + audience band (disclosed EU age range on fixed 18–65 axis) + IG/FB social authority.
- **Query:** `getBrandDirectory()` — single grouped aggregate over `ad_discovery_index` JOIN brands;
  per-lens SQL ordering (server-authoritative); client search filters instantly over server order.
- **4 sort lenses:** Most Creatives (default) · Recently Active · Reach Scale · Social Authority;
  narration line states the active lens doctrine-style ("where reported").
- **Header:** dead "Brands" span replaced by live nav link with active-state prop (`active=`).
- **Verified:** tsc clean, eslint clean, 62 test files pass, next build ok; REACH_SCALE lens
  live-ordered rhode→Garnier→Summer Fridays→Eucerin→La Roche-Posay→Huda Beauty (matches raw SQL truth).
- **Craft refs vendored:** `.agents/skills/design-craft/reference/` (motion, interaction-states,
  anti-slop from h3nryprod01/design-taste MIT).
- **Known finding:** brand filter URL exposes internal brand UUID on Discover (`?brand=<uuid>`) —
  violates KT §J token rule; backlog fix: slug/token mapping. RSC payload ~440KB linear growth noted.

---

---

## Technical Debt Register

### TD-1: Query normalization bypass heuristics (logged 2026-08-26)
Discovery query entry points use duck-typing to detect "already normalized"
filter objects and may skip `discoveryFilterInputSchema.parse()`.

- Locations: `src/discovery/filters/query.ts` ~L88, ~L288, ~L408
- Risk: shape-based detection can trust raw URL inputs and bind unvalidated
  values against typed columns. Realized once as the brand-slug 500
  (`?brand=huel` bound to uuid column) — fixed at the contract boundary in
  `feat/brands-atlas` commit `3b10c96` by accepting slug tokens explicitly.
- Remediation (post-release): replace parse-bypass heuristics with an explicit
  contract — raw/public inputs ALWAYS parse through the schema; internally
  normalized inputs use a distinct type/API boundary; no trust inferred from
  field presence. Add regression tests proving raw URL inputs cannot bypass
  normalization.
- Constraint: do NOT change during Brands Atlas release stabilization.

---

## 1-Product Working Trees Unification (2026-08-29)
Merged all working trees into unified codebase on `main`:
- **Merged Surfaces**: `/discover` (Packed Field + Discover filters), `/brands` (Brands Atlas with Polaroid Dossier cards + real-time client search + 4 sort lenses), `/ads/[id]` (Detail view + Intelligence Console Hero).
- **Slug Token Support**: `?brand=<slug>` URL parameters supported across contract and predicate compilers, preventing 500 errors when navigating from Brands to Discover.
- **Bug Fixes**: Fixed search filter disconnection in `BrandAtlasView`, fixed operator precedence bug in `BrandCard` age disclosures, cleaned up UTF-8 formatting, and stabilized detector unit test timeouts.
- **Validation**: 64 test suites (581 tests) passing, `tsc --noEmit` clean (0 errors), Next.js production build succeeded, and LLMGraph indexes synchronized.
