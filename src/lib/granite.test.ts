import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getScenario } from "@/lib/scenarios";

vi.mock("server-only", () => ({}));

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  enabled: process.env.GRANITE_LIVE_ENABLED,
  apiKey: process.env.WATSONX_API_KEY,
  projectId: process.env.WATSONX_PROJECT_ID,
};

// Mock setTimeout to avoid real delays in tests
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  process.env.GRANITE_LIVE_ENABLED = originalEnvironment.enabled;
  process.env.WATSONX_API_KEY = originalEnvironment.apiKey;
  process.env.WATSONX_PROJECT_ID = originalEnvironment.projectId;
  vi.restoreAllMocks();
  // Clear module cache to reset the token cache between tests
  vi.resetModules();
});

describe("Granite service boundary", () => {
  it("returns a visibly offline reference analysis when live mode is disabled", async () => {
    process.env.GRANITE_LIVE_ENABLED = "false";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const response = await analyzeScenario(getScenario("esa-m2-609"));

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/disabled or not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns reference analysis when API key is missing", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const response = await analyzeScenario(getScenario("esa-m2-609"));

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/disabled or not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns reference analysis when project ID is missing", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const response = await analyzeScenario(getScenario("esa-m2-609"));

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/disabled or not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to reference after malformed non-JSON model content", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "This is not JSON at all" } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Still not valid JSON" } }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    // 1 IAM call + 2 watsonx calls
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("falls back to reference after JSON that violates the incident schema", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const invalidBrief = {
      disposition: "INVALID_DISPOSITION",
      summary: "Test",
      observations: [],
      hypotheses: [],
      uncertainty: "Test",
      diagnosticChecks: [],
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(invalidBrief) } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(invalidBrief) } }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("falls back to reference when model cites an unsupported evidence ID", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const briefWithBadEvidence = {
      ...scenario.referenceAnalysis,
      observations: [
        {
          statement: "Test observation",
          evidenceIds: ["invented-evidence-id"],
        },
      ],
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(briefWithBadEvidence) } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(briefWithBadEvidence) } }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    expect(response.message).not.toContain("invented-evidence-id");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("falls back to reference after transport error", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"));
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("falls back to reference after AbortError timeout", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError);
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("retries one failed watsonx request and validates the successful brief", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-618");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("temporary error", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(scenario.referenceAnalysis) } }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "watsonx", offline: false });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("stops after exactly two watsonx attempts on persistent failure", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response("error", { status: 500 }));
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    // Must be exactly 3 calls: 1 IAM + 2 watsonx
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("reuses IAM token across retry when token remains valid", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("error", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(scenario.referenceAnalysis) } }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "watsonx", offline: false });
    // Should be exactly 3 calls: 1 IAM + 2 watsonx (no second IAM call)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });

  it("returns explicit offline metadata and message after final failure", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response("error", { status: 500 }));
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.source).toBe("reference");
    expect(response.offline).toBe(true);
    expect(response.message).toBeDefined();
    expect(response.message).toMatch(/failed after one retry/i);
    expect(response.message).toMatch(/reference brief/i);
  });

  it("falls back to reference after IAM returns non-200 status", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    // Should attempt IAM twice
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    expect(iamCalls).toHaveLength(2);
  });

  it("falls back to reference when watsonx returns no model content", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";
    const scenario = getScenario("esa-m2-609");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "test-token",
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      );
    globalThis.fetch = fetchSpy;
    const { analyzeScenario } = await import("@/lib/granite");

    const responsePromise = analyzeScenario(scenario);
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response).toMatchObject({ source: "reference", offline: true });
    expect(response.message).toMatch(/failed after one retry/i);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const iamCalls = fetchSpy.mock.calls.filter((call) =>
      call[0].includes("iam.cloud.ibm.com"),
    );
    const watsonxCalls = fetchSpy.mock.calls.filter((call) => call[0].includes("/ml/v1/"));
    expect(iamCalls).toHaveLength(1);
    expect(watsonxCalls).toHaveLength(2);
  });
});
