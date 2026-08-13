import type { Scenario } from "@/lib/types";
import { evaluateContextDecision } from "@/lib/context-integrity";

export interface GraniteMessage {
  role: "system" | "user";
  content: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "disposition",
    "summary",
    "observations",
    "hypotheses",
    "uncertainty",
    "diagnosticChecks",
  ],
  properties: {
    disposition: { enum: ["MONITOR", "INVESTIGATE", "ESCALATE"] },
    summary: { type: "string" },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "evidenceIds"],
        properties: {
          statement: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rank", "label", "rationale", "confidence", "evidenceIds"],
        properties: {
          rank: { type: "integer" },
          label: { type: "string" },
          rationale: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    uncertainty: { type: "string" },
    diagnosticChecks: { type: "array", items: { type: "string" } },
  },
};

export function buildGraniteMessages(scenario: Scenario): GraniteMessage[] {
  const contextDecision = evaluateContextDecision(scenario, "trusted-context");
  return [
    {
      role: "system",
      content: [
        "You are FlightSentry, a spacecraft mission-assurance analysis assistant.",
        "Use only the trusted evidence packet. Cite evidence IDs exactly; never invent an ID.",
        "Never issue or execute spacecraft commands. Recommend diagnostic checks only.",
        "If evidence is ambiguous or incomplete, disposition must be INVESTIGATE.",
        "MONITOR requires both a trusted telecommand record and an overlapping planned-event record.",
        "Missing operational context alone requires INVESTIGATE, not ESCALATE. Use ESCALATE only when trusted evidence establishes active critical progression.",
        "Return only JSON matching this schema:",
        JSON.stringify(RESPONSE_SCHEMA),
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        scenario: {
          id: scenario.id,
          eventId: scenario.eventId,
          eventWindow: scenario.eventWindow,
          description: scenario.description,
        },
        evidence: scenario.evidence,
        contextIntegrity: {
          policyVersion: contextDecision.policyVersion,
          gatePassed: contextDecision.gatePassed,
          requiredChecks: contextDecision.checks,
          scope: contextDecision.scope,
        },
        task: "Produce an evidence-grounded incident brief for a human operator.",
      }),
    },
  ];
}

export function parseGraniteContent(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Granite response did not contain a JSON object.");
  }
  return JSON.parse(content.slice(start, end + 1));
}
