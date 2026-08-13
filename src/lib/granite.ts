import "server-only";

import { buildGraniteMessages, parseGraniteContent } from "@/lib/granite-prompt";
import {
  enforceSafeDisposition,
  validateIncidentBrief,
} from "@/lib/incident-contract";
import type { AnalysisResponse, Scenario } from "@/lib/types";

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | undefined;

function referenceResponse(scenario: Scenario, message: string): AnalysisResponse {
  return {
    analysis: scenario.referenceAnalysis,
    source: "reference",
    offline: true,
    message,
  };
}

function watsonxConfigured(): boolean {
  return (
    process.env.GRANITE_LIVE_ENABLED === "true" &&
    Boolean(process.env.WATSONX_API_KEY) &&
    Boolean(process.env.WATSONX_PROJECT_ID)
  );
}

async function getIamToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey: process.env.WATSONX_API_KEY ?? "",
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`IBM IAM returned ${response.status}.`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expiration?: number;
  };
  if (!payload.access_token) throw new Error("IBM IAM did not return an access token.");
  cachedToken = {
    value: payload.access_token,
    expiresAt: (payload.expiration ?? Math.floor(Date.now() / 1000) + 300) * 1000,
  };
  return cachedToken.value;
}

async function requestGranite(scenario: Scenario): Promise<AnalysisResponse> {
  const token = await getIamToken();
  const baseUrl = (process.env.WATSONX_URL ?? "https://us-south.ml.cloud.ibm.com").replace(
    /\/$/,
    "",
  );
  const response = await fetch(
    `${baseUrl}/ml/v1/text/chat?version=2025-10-25`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: buildGraniteMessages(scenario),
        project_id: process.env.WATSONX_PROJECT_ID,
        model_id: process.env.WATSONX_MODEL_ID ?? "ibm/granite-4-h-small",
        max_completion_tokens: 1800,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(25_000),
    },
  );

  if (!response.ok) throw new Error(`watsonx.ai returned ${response.status}.`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("watsonx.ai returned no model content.");
  const validated = validateIncidentBrief(
    parseGraniteContent(content),
    scenario.evidence,
  );

  return {
    analysis: enforceSafeDisposition(validated, scenario.evidence),
    source: "watsonx",
    offline: false,
  };
}

export async function analyzeScenario(scenario: Scenario): Promise<AnalysisResponse> {
  if (!watsonxConfigured()) {
    return referenceResponse(
      scenario,
      "Live Granite analysis is disabled or not configured. Showing the validated reference brief.",
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestGranite(scenario);
    } catch {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return referenceResponse(
    scenario,
    "Live Granite analysis failed after one retry. Showing the validated reference brief.",
  );
}
