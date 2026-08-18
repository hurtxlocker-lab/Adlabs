import { discoveryFilterInputSchema } from "./contract";
import type { DiscoveryFilterInput, NormalizedDiscoveryFilters } from "./types";

/**
 * Deduplicates, trims, and deterministically sorts an array of strings.
 * Returns undefined if array becomes empty.
 */
function cleanStringArray(arr?: (string | null | undefined)[]): string[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  const set = new Set<string>();
  for (const item of arr) {
    if (typeof item === "string" && item.trim().length > 0) {
      set.add(item.trim());
    }
  }
  if (set.size === 0) return undefined;
  return Array.from(set).sort();
}

/**
 * Canonicalizes country code arrays into uppercase 2-letter codes, deduped and sorted.
 */
function cleanCountryArray(arr?: (string | null | undefined)[]): string[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  const set = new Set<string>();
  for (const item of arr) {
    if (typeof item === "string" && item.trim().length === 2) {
      set.add(item.trim().toUpperCase());
    }
  }
  if (set.size === 0) return undefined;
  return Array.from(set).sort();
}

/**
 * Parses and normalizes discovery filter input into strict, canonical filter state.
 */
export function normalizeDiscoveryFilters(
  input?: DiscoveryFilterInput,
): NormalizedDiscoveryFilters {
  if (!input) return {};

  const parsed = discoveryFilterInputSchema.parse(input);

  const normalized: NormalizedDiscoveryFilters = {
    brandIds: cleanStringArray(parsed.brandIds),
    sourceAccountIds: cleanStringArray(parsed.sourceAccountIds),

    isActive: parsed.isActive,
    startedAfter: parsed.startedAfter,
    startedBefore: parsed.startedBefore,
    runningMinDays: parsed.runningMinDays,
    runningMaxDays: parsed.runningMaxDays,

    mediaTypes: cleanStringArray(parsed.mediaTypes),
    shapeFamilies: parsed.shapeFamilies && parsed.shapeFamilies.length > 0
      ? (Array.from(new Set(parsed.shapeFamilies)).sort() as typeof parsed.shapeFamilies)
      : undefined,
    videoDurationMinMs: parsed.videoDurationMinMs,
    videoDurationMaxMs: parsed.videoDurationMaxMs,
    ctaTypes: cleanStringArray(parsed.ctaTypes),
    publisherPlatforms: cleanStringArray(parsed.publisherPlatforms),
    copyLengthMinChars: parsed.copyLengthMinChars,
    copyLengthMaxChars: parsed.copyLengthMaxChars,
    copyLengthMinWords: parsed.copyLengthMinWords,
    copyLengthMaxWords: parsed.copyLengthMaxWords,

    exactCreativeReuseMin: parsed.exactCreativeReuseMin,
    exactCreativeReuseMax: parsed.exactCreativeReuseMax,

    pageCategories: cleanStringArray(parsed.pageCategories),
    instagramFollowersMin: parsed.instagramFollowersMin,
    instagramFollowersMax: parsed.instagramFollowersMax,
    facebookLikesMin: parsed.facebookLikesMin,
    facebookLikesMax: parsed.facebookLikesMax,
    facebookVerified: parsed.facebookVerified,
    instagramVerified: parsed.instagramVerified,

    hasEuTransparencyEvidence: parsed.hasEuTransparencyEvidence,
    hasUkTransparencyEvidence: parsed.hasUkTransparencyEvidence,
    hasBrTransparencyEvidence: parsed.hasBrTransparencyEvidence,

    euReachMin: parsed.euReachMin,
    euReachMax: parsed.euReachMax,
    ukReachMin: parsed.ukReachMin,
    ukReachMax: parsed.ukReachMax,
    brReachMin: parsed.brReachMin,
    brReachMax: parsed.brReachMax,

    targetCountries: cleanCountryArray(parsed.targetCountries),
    reachedCountries: cleanCountryArray(parsed.reachedCountries),

    euTargetAgeMin: parsed.euTargetAgeMin,
    euTargetAgeMax: parsed.euTargetAgeMax,
    ukTargetAgeMin: parsed.ukTargetAgeMin,
    ukTargetAgeMax: parsed.ukTargetAgeMax,
    brTargetAgeMin: parsed.brTargetAgeMin,
    brTargetAgeMax: parsed.brTargetAgeMax,

    euTargetGenders: cleanStringArray(parsed.euTargetGenders),
    ukTargetGenders: cleanStringArray(parsed.ukTargetGenders),
    brTargetGenders: cleanStringArray(parsed.brTargetGenders),
  };

  return normalized;
}
