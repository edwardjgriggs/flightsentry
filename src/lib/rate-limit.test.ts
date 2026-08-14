import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  RATE_LIMIT_CAPACITY,
  consumeRateLimit,
  resetRateLimit,
} from "@/lib/rate-limit";

describe("analysis endpoint rate limit", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("allows exactly the configured burst capacity", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) {
      expect(consumeRateLimit("burst-client", now)).toBe(true);
    }
    expect(consumeRateLimit("burst-client", now)).toBe(false);
  });

  it("refills tokens over time", () => {
    const start = 2_000_000;
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) {
      consumeRateLimit("refill-client", start);
    }
    expect(consumeRateLimit("refill-client", start)).toBe(false);
    // One minute restores the full budget.
    expect(consumeRateLimit("refill-client", start + 60_000)).toBe(true);
  });

  it("tracks clients independently", () => {
    const now = 3_000_000;
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) {
      consumeRateLimit("noisy-client", now);
    }
    expect(consumeRateLimit("noisy-client", now)).toBe(false);
    expect(consumeRateLimit("quiet-client", now)).toBe(true);
  });

  it("returns 429 with Retry-After from the analysis route once the budget is spent", async () => {
    const { createPOSTHandler } = await import("@/app/api/analyze/route");
    const scenario609 = (await import("@/lib/scenarios")).getScenario("esa-m2-609");
    const handler = createPOSTHandler(async () => ({
      analysis: scenario609.referenceAnalysis,
      source: "reference",
      offline: true,
    }));

    const makeRequest = () =>
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.7",
        },
        body: JSON.stringify({ scenarioId: "esa-m2-609" }),
      });

    let lastStatus = 0;
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) {
      lastStatus = (await handler(makeRequest())).status;
    }
    expect(lastStatus).toBe(200);

    const limited = await handler(makeRequest());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("10");
    const body = (await limited.json()) as { error: string };
    expect(body.error).toMatch(/too many/i);
    expect(body.error).not.toMatch(/watsonx|granite|key|token/i);
  });
});
