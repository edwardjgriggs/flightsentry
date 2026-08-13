import { z } from "zod";

import { analyzeScenario } from "@/lib/granite";
import { getScenario } from "@/lib/scenarios";
import type { AnalysisResponse, Scenario } from "@/lib/types";

export const runtime = "nodejs";

const requestSchema = z.strictObject({
  scenarioId: z.enum(["esa-m2-609", "esa-m2-618"]),
});

export function createPOSTHandler(
  analyzer: (scenario: Scenario) => Promise<AnalysisResponse> = analyzeScenario,
) {
  return async function POST(request: Request): Promise<Response> {
    try {
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
