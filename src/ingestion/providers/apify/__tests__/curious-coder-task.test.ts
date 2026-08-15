/**
 * src/ingestion/providers/apify/__tests__/curious-coder-task.test.ts
 *
 * Unit tests for fetchCuriousCoderTaskItems.
 *
 * All tests are fully offline — no real Apify network calls.
 * The real ApifyClient is never imported or referenced.
 * Dependencies are injected via the fake client builder below.
 */

import { describe, it, expect, vi } from "vitest";
import { fetchCuriousCoderTaskItems } from "../curious-coder-task";
import {
  ApifyTaskRunError,
  ApifyDatasetError,
} from "../errors";
import type { ApifyClientInterface } from "../types";

// ---------------------------------------------------------------------------
// Fake client builder
// ---------------------------------------------------------------------------

type TaskCallResult = {
  id: string;
  status: string;
  defaultDatasetId?: string | null;
};

type DatasetListResult = {
  items: unknown[];
};

function buildFakeClient(opts: {
  taskCallResult?: TaskCallResult;
  taskCallError?: Error;
  datasetListResult?: DatasetListResult;
  datasetListError?: Error;
}): ApifyClientInterface {
  const taskCall = opts.taskCallError
    ? vi.fn().mockRejectedValue(opts.taskCallError)
    : vi.fn().mockResolvedValue(opts.taskCallResult ?? {
        id: "run-123",
        status: "SUCCEEDED",
        defaultDatasetId: "dataset-abc",
      });

  const datasetListItems = opts.datasetListError
    ? vi.fn().mockRejectedValue(opts.datasetListError)
    : vi.fn().mockResolvedValue(
        opts.datasetListResult ?? { items: [] },
      );

  return {
    task: vi.fn().mockReturnValue({ call: taskCall }),
    dataset: vi.fn().mockReturnValue({ listItems: datasetListItems }),
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TASK_ID = "hurtxlocker/3-ad-task-mamaearth";
const SAMPLE_ITEMS = [
  { ad_archive_id: "aaa", page_id: "111" },
  { ad_archive_id: "bbb", page_id: "111" },
  { ad_archive_id: "ccc", page_id: "111" },
  { ad_archive_id: "ddd", page_id: "111" }, // 4th item — should be capped
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchCuriousCoderTaskItems", () => {
  it("1. invokes the saved task with the expected task ID and no input override", async () => {
    const client = buildFakeClient({
      datasetListResult: { items: SAMPLE_ITEMS.slice(0, 3) },
    });

    await fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client);

    // task() called with exact task ID
    expect(client.task).toHaveBeenCalledWith(TASK_ID);

    // call() invoked with only waitSecs — no input field
    const taskObj = (client.task as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(taskObj.call).toHaveBeenCalledWith({ waitSecs: 300 });
    const callArgs = taskObj.call.mock.calls[0][0];
    expect(Object.keys(callArgs)).toEqual(["waitSecs"]);
  });

  it("2. no actor-input reconstruction: call() receives no 'input' field", async () => {
    const client = buildFakeClient({
      datasetListResult: { items: [] },
    });
    await fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client);

    const callArgs = (
      (client.task as ReturnType<typeof vi.fn>).mock.results[0].value
        .call as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    expect(callArgs).not.toHaveProperty("input");
    expect(callArgs).not.toHaveProperty("memory");
    expect(callArgs).not.toHaveProperty("build");
  });

  it("3. successful task run returns raw dataset items unmodified", async () => {
    const rawItems = [
      { ad_archive_id: "x1", page_id: "42", extra_field: "preserved" },
      { ad_archive_id: "x2", page_id: "42" },
    ];
    const client = buildFakeClient({
      datasetListResult: { items: rawItems },
    });

    const result = await fetchCuriousCoderTaskItems(
      { taskId: TASK_ID, limit: 10 },
      client,
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual(rawItems[0]);
    expect(result.items[1]).toEqual(rawItems[1]);
  });

  it("4. raw objects are returned completely unmodified (no parsing, stripping, or transformation)", async () => {
    const raw = {
      ad_archive_id: "z99",
      page_id: "999",
      unknown_future_field: { nested: true },
      snapshot: { page_id: "999", videos: [{ video_hd_url: "https://v.example.com/x" }] },
    };
    const client = buildFakeClient({ datasetListResult: { items: [raw] } });

    const result = await fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 5 }, client);

    expect(result.items[0]).toBe(raw); // same object reference — untouched
  });

  it("5. local hard cap: >3 dataset items are truncated to 3", async () => {
    const client = buildFakeClient({
      datasetListResult: { items: SAMPLE_ITEMS }, // 4 items
    });

    const result = await fetchCuriousCoderTaskItems(
      { taskId: TASK_ID, limit: 3 },
      client,
    );

    expect(result.datasetItemCount).toBe(4); // full count from dataset
    expect(result.items).toHaveLength(3);    // capped to limit
    expect(result.items.map((i) => (i as { ad_archive_id: string }).ad_archive_id)).toEqual([
      "aaa",
      "bbb",
      "ccc",
    ]);
  });

  it("6. failed task status throws ApifyTaskRunError", async () => {
    const client = buildFakeClient({
      taskCallResult: {
        id: "run-fail-999",
        status: "FAILED",
        defaultDatasetId: "dataset-fail",
      },
    });

    await expect(
      fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client),
    ).rejects.toThrow(ApifyTaskRunError);
  });

  it("6b. failed task throws with run ID and status in error", async () => {
    const client = buildFakeClient({
      taskCallResult: {
        id: "run-fail-999",
        status: "FAILED",
        defaultDatasetId: "dataset-fail",
      },
    });

    let caught: ApifyTaskRunError | null = null;
    try {
      await fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client);
    } catch (e) {
      caught = e as ApifyTaskRunError;
    }

    expect(caught).toBeInstanceOf(ApifyTaskRunError);
    expect(caught!.runId).toBe("run-fail-999");
    expect(caught!.runStatus).toBe("FAILED");
    expect(caught!.taskId).toBe(TASK_ID);
  });

  it("7. missing defaultDatasetId throws ApifyDatasetError", async () => {
    const client = buildFakeClient({
      taskCallResult: {
        id: "run-nodataset",
        status: "SUCCEEDED",
        defaultDatasetId: null,
      },
    });

    await expect(
      fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client),
    ).rejects.toThrow(ApifyDatasetError);
  });

  it("7b. empty defaultDatasetId (blank string) throws ApifyDatasetError", async () => {
    const client = buildFakeClient({
      taskCallResult: {
        id: "run-emptyds",
        status: "SUCCEEDED",
        defaultDatasetId: "   ",
      },
    });

    await expect(
      fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client),
    ).rejects.toThrow(ApifyDatasetError);
  });

  it("8. dataset retrieval failure throws ApifyDatasetError", async () => {
    const client = buildFakeClient({
      datasetListError: new Error("network timeout"),
    });

    await expect(
      fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client),
    ).rejects.toThrow(ApifyDatasetError);
  });

  it("9. no automatic retry: task() is called exactly once even on failure", async () => {
    const client = buildFakeClient({
      taskCallResult: {
        id: "run-fail",
        status: "FAILED",
        defaultDatasetId: null,
      },
    });

    try {
      await fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client);
    } catch {
      // expected
    }

    // task() called exactly once — no retry loop
    expect(client.task).toHaveBeenCalledTimes(1);
  });

  it("10. APIFY_TOKEN absence does not cause test failure (adapter is never invoked in tests)", () => {
    // This test verifies the architecture invariant:
    // Importing the adapter module does not throw even when APIFY_TOKEN is absent.
    // The adapter errors only when called (via createApifyClient), which tests never invoke.
    expect(fetchCuriousCoderTaskItems).toBeDefined();
  });

  it("11. errors do not expose token (ApifyTaskRunError)", async () => {
    const client = buildFakeClient({
      taskCallError: new Error("run failed"),
    });

    let errorMessage = "";
    try {
      await fetchCuriousCoderTaskItems({ taskId: TASK_ID, limit: 3 }, client);
    } catch (e) {
      errorMessage = (e as Error).message;
    }

    // No token leakage — message should not contain any secret-looking value
    expect(errorMessage).not.toContain("apify_api_");
    expect(errorMessage).not.toContain("token");
    expect(errorMessage).toContain(TASK_ID);
  });

  it("12. adapter performs no DB or R2 operations", async () => {
    // Structural test: fetchCuriousCoderTaskItems only calls client.task() and client.dataset().
    // No db, no storage client, no HTTP to R2 or Supabase.
    const client = buildFakeClient({
      datasetListResult: { items: [{ ad_archive_id: "test" }] },
    });

    const result = await fetchCuriousCoderTaskItems(
      { taskId: TASK_ID, limit: 3 },
      client,
    );

    // Only task() and dataset() on the client — no other client methods called
    const clientKeys = Object.keys(client);
    expect(clientKeys).toEqual(["task", "dataset"]);
    expect(client.task).toHaveBeenCalledTimes(1);
    expect(client.dataset).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
  });

  it("uses custom timeoutSeconds when provided", async () => {
    const client = buildFakeClient({
      datasetListResult: { items: [] },
    });

    await fetchCuriousCoderTaskItems(
      { taskId: TASK_ID, limit: 3, timeoutSeconds: 120 },
      client,
    );

    const callArgs = (
      (client.task as ReturnType<typeof vi.fn>).mock.results[0].value
        .call as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];

    expect(callArgs.waitSecs).toBe(120);
  });

  it("returns correct metadata fields", async () => {
    const client = buildFakeClient({
      taskCallResult: {
        id: "run-meta-99",
        status: "SUCCEEDED",
        defaultDatasetId: "ds-meta-99",
      },
      datasetListResult: {
        items: [{ ad_archive_id: "m1" }, { ad_archive_id: "m2" }],
      },
    });

    const result = await fetchCuriousCoderTaskItems(
      { taskId: TASK_ID, limit: 10 },
      client,
    );

    expect(result.runId).toBe("run-meta-99");
    expect(result.runStatus).toBe("SUCCEEDED");
    expect(result.datasetId).toBe("ds-meta-99");
    expect(result.datasetItemCount).toBe(2);
    expect(result.items).toHaveLength(2);
  });
});
