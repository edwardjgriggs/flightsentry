import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { POST } from "./route";

vi.mock("server-only", () => ({}));

const originalEnvironment = {
  enabled: process.env.GRANITE_LIVE_ENABLED,
  apiKey: process.env.WATSONX_API_KEY,
  projectId: process.env.WATSONX_PROJECT_ID,
  url: process.env.WATSONX_URL,
  modelId: process.env.WATSONX_MODEL_ID,
};

beforeEach(() => {
  // Disable live mode for route tests to avoid network calls
  process.env.GRANITE_LIVE_ENABLED = "false";
});

afterEach(() => {
  process.env.GRANITE_LIVE_ENABLED = originalEnvironment.enabled;
  process.env.WATSONX_API_KEY = originalEnvironment.apiKey;
  process.env.WATSONX_PROJECT_ID = originalEnvironment.projectId;
  process.env.WATSONX_URL = originalEnvironment.url;
  process.env.WATSONX_MODEL_ID = originalEnvironment.modelId;
  vi.restoreAllMocks();
});

describe("POST /api/analyze route contract", () => {
  it("accepts esa-m2-609 scenario ID", async () => {
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "esa-m2-609" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("analysis");
    expect(data).toHaveProperty("source");
    expect(data).toHaveProperty("offline");
  });

  it("accepts esa-m2-618 scenario ID", async () => {
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "esa-m2-618" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("analysis");
    expect(data).toHaveProperty("source");
    expect(data).toHaveProperty("offline");
  });

  it("returns 400 for unknown scenario ID", async () => {
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "unknown-scenario" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/supported scenarioId/i);
  });

  it("returns 400 for missing scenario ID", async () => {
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/supported scenarioId/i);
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/supported scenarioId/i);
  });

  it("returns 400 for extra properties in request", async () => {
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "esa-m2-609",
        extraProperty: "should not be allowed",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/supported scenarioId/i);
  });

  it("includes Cache-Control: no-store header in success responses", async () => {
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "esa-m2-609" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 500 status with generic error message for unexpected downstream errors", async () => {
    const { createPOSTHandler } = await import("./route");
    const failingAnalyzer = vi.fn().mockRejectedValue(new Error("Unexpected internal error"));
    const POST = createPOSTHandler(failingAnalyzer);

    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "esa-m2-609" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Analysis could not be completed." });
  });

  it("does not leak API key in error responses", async () => {
    process.env.WATSONX_API_KEY = "secret-api-key-12345";
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "unknown" }),
    });

    const response = await POST(request);
    const data = await response.json();
    const responseText = JSON.stringify(data);

    expect(responseText).not.toContain("secret-api-key");
    expect(responseText).not.toContain("12345");
  });

  it("does not leak project ID in error responses", async () => {
    process.env.WATSONX_PROJECT_ID = "secret-project-id-67890";
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "unknown" }),
    });

    const response = await POST(request);
    const data = await response.json();
    const responseText = JSON.stringify(data);

    expect(responseText).not.toContain("secret-project-id");
    expect(responseText).not.toContain("67890");
  });

  it("does not leak watsonx URL in error responses", async () => {
    process.env.WATSONX_URL = "https://secret-watsonx-url.example.com";
    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "unknown" }),
    });

    const response = await POST(request);
    const data = await response.json();
    const responseText = JSON.stringify(data);

    expect(responseText).not.toContain("secret-watsonx-url");
    expect(responseText).not.toContain("example.com");
  });

  it("does not leak IAM token in success responses", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";

    const mockToken = "secret-iam-token-abcdef";
    const scenario = await import("@/lib/scenarios").then((m) => m.getScenario("esa-m2-609"));
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: mockToken,
            expiration: Math.floor(Date.now() / 1000) + 600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(scenario.referenceAnalysis) } }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = mockFetch;

    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "esa-m2-609" }),
    });

    const response = await POST(request);
    const data = await response.json();
    const responseText = JSON.stringify(data);

    expect(response.status).toBe(200);
    expect(data.source).toBe("watsonx");
    expect(responseText).not.toContain(mockToken);
    expect(responseText).not.toContain("secret-iam-token");
    expect(responseText).not.toContain("abcdef");
  });

  it("does not leak model response body in fallback responses", async () => {
    process.env.GRANITE_LIVE_ENABLED = "true";
    process.env.WATSONX_API_KEY = "test-key";
    process.env.WATSONX_PROJECT_ID = "test-project";

    const sensitiveContent = "SENSITIVE_MODEL_OUTPUT_12345";
    const mockFetch = vi
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
            choices: [{ message: { content: sensitiveContent } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: sensitiveContent } }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = mockFetch;

    const request = new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "esa-m2-609" }),
    });

    const response = await POST(request);
    const data = await response.json();
    const responseText = JSON.stringify(data);

    // The response should fall back to reference and not include the malformed model output
    expect(responseText).not.toContain(sensitiveContent);
    expect(responseText).not.toContain("SENSITIVE_MODEL_OUTPUT");
  });
});
