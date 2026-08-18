import { describe, expect, it, vi } from "vitest";
import {
  buildCuriousCoderTaskInput,
  MIN_PROVIDER_COUNT,
} from "../input-builder";
import { fetchCuriousCoderTaskItems } from "../curious-coder-task";
import type { ApifyClientInterface } from "../types";

describe("Curious Coder Actor Input Builder Contract", () => {
  const sampleUrl =
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&view_all_page_id=1806087489455976";

  it("builds exact canonical actor input schema", () => {
    const input = buildCuriousCoderTaskInput({
      url: sampleUrl,
      limit: 6,
    });

    expect(input.urls).toEqual([{ url: sampleUrl }]);
    expect(input.count).toBe(10); // clamped to MIN_PROVIDER_COUNT (10)
    expect(input["scrapePageAds.activeStatus"]).toBe("all");
    expect(input["scrapePageAds.sortBy"]).toBe("impressions_desc");
    expect(input.scrapeAdDetails).toBe(true);

    // Strictly ensure stale/deprecated fields are never emitted
    expect(input).not.toHaveProperty("startUrls");
    expect(input).not.toHaveProperty("resultsLimit");
  });

  it("clamps provider count to MIN_PROVIDER_COUNT when local limit is lower", () => {
    const input6 = buildCuriousCoderTaskInput({ url: sampleUrl, limit: 6 });
    expect(input6.count).toBe(MIN_PROVIDER_COUNT);

    const input1 = buildCuriousCoderTaskInput({ url: sampleUrl, limit: 1 });
    expect(input1.count).toBe(MIN_PROVIDER_COUNT);
  });

  it("scales provider count if local limit exceeds MIN_PROVIDER_COUNT", () => {
    const input10 = buildCuriousCoderTaskInput({ url: sampleUrl, limit: 10 });
    expect(input10.count).toBe(10);

    const input15 = buildCuriousCoderTaskInput({ url: sampleUrl, limit: 15 });
    expect(input15.count).toBe(15);
  });

  it("passes constructed inputOverrides to task.call()", async () => {
    const taskCall = vi.fn().mockResolvedValue({
      id: "run-test-1",
      status: "SUCCEEDED",
      defaultDatasetId: "ds-test-1",
    });
    const fakeClient: ApifyClientInterface = {
      task: vi.fn().mockReturnValue({ call: taskCall }),
      dataset: vi.fn().mockReturnValue({
        listItems: vi.fn().mockResolvedValue({ items: [] }),
      }),
    };

    const actorInput = buildCuriousCoderTaskInput({
      url: sampleUrl,
      limit: 6,
    });

    await fetchCuriousCoderTaskItems(
      {
        taskId: "test-task",
        limit: 6,
        inputOverrides: actorInput,
      },
      fakeClient,
    );

    expect(taskCall).toHaveBeenCalledTimes(1);
    expect(taskCall).toHaveBeenCalledWith(actorInput, { waitSecs: 300 });

    const passedInput = taskCall.mock.calls[0][0];
    expect(passedInput.urls).toEqual([{ url: sampleUrl }]);
    expect(passedInput.count).toBe(10);
    expect(passedInput).not.toHaveProperty("startUrls");
    expect(passedInput).not.toHaveProperty("resultsLimit");
  });
});
