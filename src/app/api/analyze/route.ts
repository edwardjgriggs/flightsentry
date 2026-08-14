import { z } from "zod";

import { analyzeScenario } from "@/lib/granite";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getScenario } from "@/lib/scenarios";
import type { AnalysisResponse, Scenario } from "@/lib/types";

export const runtime = "nodejs";

const requestSchema = z.strictObject({
  scenarioId: z.enum(["esa-m2-609", "esa-m2-618"]),
});

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export function createPOSTHandler(
  analyzer: (scenario: Scenario) => Promise<AnalysisResponse> = analyzeScenario,
) {
  return async function POST(request: Request): Promise<Response> {
    try {
      if (!consumeRateLimit(clientKey(request))) {
        // Structured server-side signal for abuse monitoring; the key is not
        // logged verbatim to keep client addresses out of plain logs.
        console.warn(
          JSON.stringify({ event: "analyze_rate_limited", at: new Date().toISOString() }),
        );
        return Response.json(
          { error: "Too many analysis requests. Retry shortly." },
          { status: 429, headers: { "Retry-After": "10" } },
        );
      }
      const input = requestSchema.parse(await request.json());
      const response = await analyzer(getScenario(input.scenarioId));
      return Response.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return Response.json(
          { error: "Request must contain a supported scenarioId." },
          { status: 400 },
        );
      }
      return Response.json(
        { error: "Analysis could not be completed." },
        { status: 500 },
      );
    }
  };
}

export const POST = createPOSTHandler();
