import { describe, expect, it } from "vitest";
import {
  saveAdTransparencyObservations,
} from "../ad-transparency-observations";
import type {
  SourceAccountObservationData,
  SourceAdTransparencyObservation,
} from "@/ingestion/types";
import type { DbExecutor } from "../types";

describe("Transparency & Account Observation Persistence Helpers", () => {
  it("formats source account observation insert values accurately", () => {
    const fakeData: SourceAccountObservationData = {
      pageCategory: "Apparel & clothing",
      facebookLikes: BigInt(10500),
      instagramUsername: "souledstore",
      instagramFollowers: BigInt(1200000),
      facebookVerified: true,
      instagramVerified: true,
      pageIsDeleted: false,
      pageIsRestricted: false,
      aboutText: "Official store for pop culture merchandise.",
      profileImageUrl: "https://cdn.example.com/p.jpg",
      coverImageUrl: "https://cdn.example.com/c.jpg",
      providerMetadata: { page_spend: { is_political_page: false } },
    };

    expect(fakeData.pageCategory).toBe("Apparel & clothing");
    expect(fakeData.facebookLikes).toBe(BigInt(10500));
    expect(fakeData.instagramFollowers).toBe(BigInt(1200000));
    expect(fakeData.facebookVerified).toBe(true);
  });

  it("handles empty transparency observations list without DB call", async () => {
    const fakeExecutor = {
      insert: () => {
        throw new Error("Should not be called");
      },
    } as unknown as DbExecutor;

    const ids = await saveAdTransparencyObservations(
      {
        adObservationId: "11111111-1111-1111-1111-111111111111",
        transparencyObservations: [],
      },
      fakeExecutor,
    );

    expect(ids).toEqual([]);
  });

  it("maps multiple regional transparency objects faithfully", async () => {
    const transparencyObservations: SourceAdTransparencyObservation[] = [
      {
        region: "EU",
        totalReach: BigInt(82531),
        targetAgeMin: 25,
        targetAgeMax: 40,
        targetGender: "All",
        targetCountries: ["FR"],
        reachedCountries: ["FR"],
        reachBreakdown: { male: 100, female: 200 },
        providerPayload: { eu_total_reach: 82531 },
      },
      {
        region: "UK",
        totalReach: BigInt(15400),
        targetAgeMin: 18,
        targetAgeMax: 65,
        targetGender: "All",
        targetCountries: ["GB"],
        reachedCountries: ["GB"],
        reachBreakdown: { male: 50, female: 80 },
        providerPayload: { total_reach: 15400 },
      },
    ];

    let insertedValues: Record<string, unknown>[] = [];
    const fakeExecutor = {
      insert: () => ({
        values: (vals: Record<string, unknown>[]) => {
          insertedValues = vals;
          return {
            onConflictDoUpdate: () => ({
              returning: () => [{ id: "obs-1" }, { id: "obs-2" }],
            }),
          };
        },
      }),
    } as unknown as DbExecutor;

    const ids = await saveAdTransparencyObservations(
      {
        adObservationId: "22222222-2222-2222-2222-222222222222",
        transparencyObservations,
      },
      fakeExecutor,
    );

    expect(ids).toEqual(["obs-1", "obs-2"]);
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0].region).toBe("EU");
    expect(insertedValues[0].totalReach).toBe(BigInt(82531));
    expect(insertedValues[0].targetCountries).toEqual(["FR"]);
    expect(insertedValues[1].region).toBe("UK");
    expect(insertedValues[1].totalReach).toBe(BigInt(15400));
    expect(insertedValues[1].targetCountries).toEqual(["GB"]);
  });
});
