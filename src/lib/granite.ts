import "server-only";

import { resolveReferenceIncident } from "@/lib/context";
import { evaluateContextDecision } from "@/lib/context-integrity";
import { buildGraniteMessages, parseGraniteContent } from "@/lib/granite-prompt";
import {
  enforceSafeDisposition,
  validateIncidentBrief,
} from "@/lib/incident-contract";
import { GRANITE_DEFAULT_MODEL_ID, REFERENCE_MODEL_ID } from "@/lib/model-ids";
import type { AnalysisResponse, Scenario } from "@/lib/types";

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | undefined;
let inflightTokenRequest: Promise<string> | undefined;

// Successful live responses are deterministic (fixed scenario packet,
// temperature 0), so a short server-side cache avoids re-billing watsonx for
// every replay rerun. Reference fallbacks are never cached so a recovered
// provider is retried on the next request.
const RESPONSE_CACHE_TTL_MS = 5 * 60_000;
const responseCache = new Map<
  string,
  { response: AnalysisResponse; expiresAt: number }
>();

function referenceResponse(scenario: Scenario, message: string): AnalysisResponse {
  return {
    // The reference brief is realigned with the deterministic context gate so
    // an offline fallback can never contradict context-gate-v1.
    analysis: resolveReferenceIncident(scenario),
    source: "reference",
    offline: true,
    model: REFERENCE_MODEL_ID,
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

async function fetchIamToken(): Promise<string> {
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

async function getIamToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  // Parallel scenario requests on a cold instance share one IAM exchange.
  if (!inflightTokenRequest) {
    inflightTokenRequest = fetchIamToken().finally(() => {
      inflightTokenRequest = undefined;
    });
  }
  return inflightTokenRequest;
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
        model_id: process.env.WATSONX_MODEL_ID ?? GRANITE_DEFAULT_MODEL_ID,
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
  const contextDecision = evaluateContextDecision(scenario, "trusted-context");

  return {
    analysis: enforceSafeDisposition(validated, scenario.evidence, contextDecision),
    source: "watsonx",
    offline: false,
    model: process.env.WATSONX_MODEL_ID ?? GRANITE_DEFAULT_MODEL_ID,
  };
}

export function clearAnalysisCache(): void {
  responseCache.clear();
}

export async function analyzeScenario(scenario: Scenario): Promise<AnalysisResponse> {
  if (!watsonxConfigured()) {
    return referenceResponse(
      scenario,
      "Live Granite analysis is disabled or not configured. Showing the validated reference brief.",
    );
  }

  const cached = responseCache.get(scenario.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.response;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await requestGranite(scenario);
      responseCache.set(scenario.id, {
        response,
        expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
      });
      return response;
    } catch (error) {
      // Server-side diagnostics only; the public payload stays sanitized.
      console.error(
        `Granite attempt ${attempt + 1} failed for ${scenario.id}:`,
        error instanceof Error ? error.message : "unknown error",
      );
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  // Structured signal: a spike in fallback activations is the single alert
  // that catches quota exhaustion, credential revocation, or provider outage.
  console.warn(
    JSON.stringify({
      event: "granite_reference_fallback",
      scenarioId: scenario.id,
      at: new Date().toISOString(),
    }),
  );
  return referenceResponse(
    scenario,
    "Live Granite analysis failed after one retry. Showing the validated reference brief.",
  );
}
