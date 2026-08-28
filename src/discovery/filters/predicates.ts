import { adDiscoveryIndex, brands } from "@/db/schema";
import { eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { DiscoveryFilterGroup, NormalizedDiscoveryFilters } from "./types";

export interface CompilePredicatesOptions {
  filters: NormalizedDiscoveryFilters;
  now?: Date;
  excludeGroups?: DiscoveryFilterGroup[] | Set<DiscoveryFilterGroup>;
}

/**
 * Compiles a normalized filter state into an array of SQL predicates against `ad_discovery_index`.
 * Supports group exclusion for disjunctive faceting.
 */
export function compileDiscoveryPredicates(
  options: CompilePredicatesOptions,
): SQL<unknown>[] {
  const { filters, now = new Date() } = options;
  const excluded =
    options.excludeGroups instanceof Set
      ? options.excludeGroups
      : new Set(options.excludeGroups ?? []);

  const predicates: SQL<unknown>[] = [];

  // 1. Identity
  if (!excluded.has("IDENTITY")) {
    if (filters.brandIds && filters.brandIds.length > 0) {
      // Mixed tokens allowed: internal UUIDs and/or public brand slugs
      // (Brands Atlas links use slugs per KT §J). Slugs resolve against the
      // brands table; unknown tokens yield zero rows instead of a 500.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuids = filters.brandIds.filter((t) => UUID_RE.test(t));
      const slugs = filters.brandIds.filter((t) => !UUID_RE.test(t));
      const uuidPredicate =
        uuids.length > 0 ? inArray(adDiscoveryIndex.brandId, uuids) : undefined;
      const slugPredicate =
        slugs.length > 0
          ? sql`${adDiscoveryIndex.brandId} IN (SELECT ${brands.id} FROM ${brands} WHERE lower(${brands.slug}) IN (${sql.join(
              slugs.map((s) => sql`${s.toLowerCase()}`),
              sql`, `,
            )}))`
          : undefined;
      if (uuidPredicate && slugPredicate) {
        predicates.push(sql`(${uuidPredicate} OR ${slugPredicate})`);
      } else if (uuidPredicate) {
        predicates.push(uuidPredicate);
      } else if (slugPredicate) {
        predicates.push(slugPredicate);
      }
    }
    if (filters.sourceAccountIds && filters.sourceAccountIds.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.sourceAccountId, filters.sourceAccountIds));
    }
  }

  // 2. Lifecycle
  if (!excluded.has("LIFECYCLE")) {
    if (filters.isActive !== undefined) {
      predicates.push(eq(adDiscoveryIndex.isActive, filters.isActive));
    }
    if (filters.startedAfter) {
      predicates.push(gte(adDiscoveryIndex.startDate, filters.startedAfter));
    }
    if (filters.startedBefore) {
      predicates.push(lte(adDiscoveryIndex.startDate, filters.startedBefore));
    }
  }

  // 3. Running Days
  // Cutoffs are bound as ISO strings, not raw Dates: the postgres@3 driver's
  // timestamptz Bind serializer crashes (Buffer.byteLength) on Date params,
  // while string params serialize correctly. Semantically identical.
  if (!excluded.has("RUNNING_DAYS")) {
    if (filters.runningMinDays !== undefined) {
      const minCutoff = new Date(now.getTime() - filters.runningMinDays * 24 * 60 * 60 * 1000);
      predicates.push(
        sql`${adDiscoveryIndex.startDate} IS NOT NULL AND ${adDiscoveryIndex.startDate} <= ${minCutoff.toISOString()}`,
      );
    }
    if (filters.runningMaxDays !== undefined) {
      const maxCutoff = new Date(now.getTime() - filters.runningMaxDays * 24 * 60 * 60 * 1000);
      predicates.push(
        sql`${adDiscoveryIndex.startDate} IS NOT NULL AND ${adDiscoveryIndex.startDate} >= ${maxCutoff.toISOString()}`,
      );
    }
  }

  // 4. Media Type
  if (!excluded.has("MEDIA_TYPE")) {
    if (filters.mediaTypes && filters.mediaTypes.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.representativeMediaType, filters.mediaTypes));
    }
  }

  // 5. Shape Family
  if (!excluded.has("SHAPE")) {
    if (filters.shapeFamilies && filters.shapeFamilies.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.representativeShapeFamily, filters.shapeFamilies));
    }
  }

  // 6. Video Duration
  if (!excluded.has("VIDEO_DURATION")) {
    if (filters.videoDurationMinMs !== undefined) {
      predicates.push(gte(adDiscoveryIndex.videoDurationMs, filters.videoDurationMinMs));
    }
    if (filters.videoDurationMaxMs !== undefined) {
      predicates.push(lte(adDiscoveryIndex.videoDurationMs, filters.videoDurationMaxMs));
    }
  }

  // 7. CTA
  if (!excluded.has("CTA")) {
    if (filters.ctaTypes && filters.ctaTypes.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.ctaType, filters.ctaTypes));
    }
  }

  // 8. Publisher Platforms (Existential ANY)
  if (!excluded.has("PLATFORM")) {
    if (filters.publisherPlatforms && filters.publisherPlatforms.length > 0) {
      predicates.push(
        sql`${adDiscoveryIndex.publisherPlatforms} && ARRAY[${sql.join(filters.publisherPlatforms.map((p) => sql`${p}`), sql`, `)}]::text[]`,
      );
    }
  }

  // 9. Copy Length Chars
  if (!excluded.has("COPY_LENGTH_CHARS")) {
    if (filters.copyLengthMinChars !== undefined) {
      predicates.push(gte(adDiscoveryIndex.copyLengthChars, filters.copyLengthMinChars));
    }
    if (filters.copyLengthMaxChars !== undefined) {
      predicates.push(lte(adDiscoveryIndex.copyLengthChars, filters.copyLengthMaxChars));
    }
  }

  // 10. Copy Length Words
  if (!excluded.has("COPY_LENGTH_WORDS")) {
    if (filters.copyLengthMinWords !== undefined) {
      predicates.push(gte(adDiscoveryIndex.copyLengthWords, filters.copyLengthMinWords));
    }
    if (filters.copyLengthMaxWords !== undefined) {
      predicates.push(lte(adDiscoveryIndex.copyLengthWords, filters.copyLengthMaxWords));
    }
  }

  // 11. Creative Reuse
  if (!excluded.has("REUSE")) {
    if (filters.exactCreativeReuseMin !== undefined) {
      predicates.push(gte(adDiscoveryIndex.exactCreativeReuseCount, filters.exactCreativeReuseMin));
    }
    if (filters.exactCreativeReuseMax !== undefined) {
      predicates.push(lte(adDiscoveryIndex.exactCreativeReuseCount, filters.exactCreativeReuseMax));
    }
  }

  // 12. Page Category
  if (!excluded.has("PAGE_CATEGORY")) {
    if (filters.pageCategories && filters.pageCategories.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.latestPageCategory, filters.pageCategories));
    }
  }

  // 13. Instagram Followers
  if (!excluded.has("INSTAGRAM_FOLLOWERS")) {
    if (filters.instagramFollowersMin !== undefined) {
      predicates.push(gte(adDiscoveryIndex.latestInstagramFollowers, filters.instagramFollowersMin));
    }
    if (filters.instagramFollowersMax !== undefined) {
      predicates.push(lte(adDiscoveryIndex.latestInstagramFollowers, filters.instagramFollowersMax));
    }
  }

  // 14. Facebook Likes
  if (!excluded.has("FACEBOOK_LIKES")) {
    if (filters.facebookLikesMin !== undefined) {
      predicates.push(gte(adDiscoveryIndex.latestFacebookLikes, filters.facebookLikesMin));
    }
    if (filters.facebookLikesMax !== undefined) {
      predicates.push(lte(adDiscoveryIndex.latestFacebookLikes, filters.facebookLikesMax));
    }
  }

  // 15. Verification
  if (!excluded.has("VERIFICATION")) {
    if (filters.facebookVerified !== undefined) {
      predicates.push(eq(adDiscoveryIndex.latestFacebookVerified, filters.facebookVerified));
    }
    if (filters.instagramVerified !== undefined) {
      predicates.push(eq(adDiscoveryIndex.latestInstagramVerified, filters.instagramVerified));
    }
  }

  // 16. Transparency Presence
  if (!excluded.has("TRANSPARENCY_EU") && filters.hasEuTransparencyEvidence !== undefined) {
    predicates.push(eq(adDiscoveryIndex.hasEuTransparencyEvidence, filters.hasEuTransparencyEvidence));
  }
  if (!excluded.has("TRANSPARENCY_UK") && filters.hasUkTransparencyEvidence !== undefined) {
    predicates.push(eq(adDiscoveryIndex.hasUkTransparencyEvidence, filters.hasUkTransparencyEvidence));
  }
  if (!excluded.has("TRANSPARENCY_BR") && filters.hasBrTransparencyEvidence !== undefined) {
    predicates.push(eq(adDiscoveryIndex.hasBrTransparencyEvidence, filters.hasBrTransparencyEvidence));
  }

  // 17. Regional Reach
  if (!excluded.has("EU_REACH")) {
    if (filters.euReachMin !== undefined) {
      predicates.push(gte(adDiscoveryIndex.latestEuTotalReach, filters.euReachMin));
    }
    if (filters.euReachMax !== undefined) {
      predicates.push(lte(adDiscoveryIndex.latestEuTotalReach, filters.euReachMax));
    }
  }
  if (!excluded.has("UK_REACH")) {
    if (filters.ukReachMin !== undefined) {
      predicates.push(gte(adDiscoveryIndex.latestUkTotalReach, filters.ukReachMin));
    }
    if (filters.ukReachMax !== undefined) {
      predicates.push(lte(adDiscoveryIndex.latestUkTotalReach, filters.ukReachMax));
    }
  }
  if (!excluded.has("BR_REACH")) {
    if (filters.brReachMin !== undefined) {
      predicates.push(gte(adDiscoveryIndex.latestBrTotalReach, filters.brReachMin));
    }
    if (filters.brReachMax !== undefined) {
      predicates.push(lte(adDiscoveryIndex.latestBrTotalReach, filters.brReachMax));
    }
  }

  // 18. Countries (Existential ANY)
  if (!excluded.has("TARGET_COUNTRY")) {
    if (filters.targetCountries && filters.targetCountries.length > 0) {
      predicates.push(
        sql`${adDiscoveryIndex.targetCountries} && ARRAY[${sql.join(filters.targetCountries.map((c) => sql`${c}`), sql`, `)}]::text[]`,
      );
    }
  }
  if (!excluded.has("REACHED_COUNTRY")) {
    if (filters.reachedCountries && filters.reachedCountries.length > 0) {
      predicates.push(
        sql`${adDiscoveryIndex.reachedCountries} && ARRAY[${sql.join(filters.reachedCountries.map((c) => sql`${c}`), sql`, `)}]::text[]`,
      );
    }
  }

  // 19. Age Overlap (ad_min <= query_max AND ad_max >= query_min)
  if (!excluded.has("EU_TARGET_AGE")) {
    if (filters.euTargetAgeMin !== undefined || filters.euTargetAgeMax !== undefined) {
      const qMin = filters.euTargetAgeMin ?? 0;
      const qMax = filters.euTargetAgeMax ?? 120;
      predicates.push(
        sql`${adDiscoveryIndex.latestEuTargetAgeMin} IS NOT NULL AND ${adDiscoveryIndex.latestEuTargetAgeMax} IS NOT NULL AND ${adDiscoveryIndex.latestEuTargetAgeMin} <= ${qMax} AND ${adDiscoveryIndex.latestEuTargetAgeMax} >= ${qMin}`,
      );
    }
  }
  if (!excluded.has("UK_TARGET_AGE")) {
    if (filters.ukTargetAgeMin !== undefined || filters.ukTargetAgeMax !== undefined) {
      const qMin = filters.ukTargetAgeMin ?? 0;
      const qMax = filters.ukTargetAgeMax ?? 120;
      predicates.push(
        sql`${adDiscoveryIndex.latestUkTargetAgeMin} IS NOT NULL AND ${adDiscoveryIndex.latestUkTargetAgeMax} IS NOT NULL AND ${adDiscoveryIndex.latestUkTargetAgeMin} <= ${qMax} AND ${adDiscoveryIndex.latestUkTargetAgeMax} >= ${qMin}`,
      );
    }
  }
  if (!excluded.has("BR_TARGET_AGE")) {
    if (filters.brTargetAgeMin !== undefined || filters.brTargetAgeMax !== undefined) {
      const qMin = filters.brTargetAgeMin ?? 0;
      const qMax = filters.brTargetAgeMax ?? 120;
      predicates.push(
        sql`${adDiscoveryIndex.latestBrTargetAgeMin} IS NOT NULL AND ${adDiscoveryIndex.latestBrTargetAgeMax} IS NOT NULL AND ${adDiscoveryIndex.latestBrTargetAgeMin} <= ${qMax} AND ${adDiscoveryIndex.latestBrTargetAgeMax} >= ${qMin}`,
      );
    }
  }

  // 20. Gender
  if (!excluded.has("EU_TARGET_GENDER")) {
    if (filters.euTargetGenders && filters.euTargetGenders.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.latestEuTargetGender, filters.euTargetGenders));
    }
  }
  if (!excluded.has("UK_TARGET_GENDER")) {
    if (filters.ukTargetGenders && filters.ukTargetGenders.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.latestUkTargetGender, filters.ukTargetGenders));
    }
  }
  if (!excluded.has("BR_TARGET_GENDER")) {
    if (filters.brTargetGenders && filters.brTargetGenders.length > 0) {
      predicates.push(inArray(adDiscoveryIndex.latestBrTargetGender, filters.brTargetGenders));
    }
  }

  return predicates;
}
