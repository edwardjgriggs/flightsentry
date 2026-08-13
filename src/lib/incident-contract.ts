import { z } from "zod";

import type { EvidenceItem, IncidentBrief } from "@/lib/types";

const observationSchema = z.strictObject({
  statement: z.string().min(1).max(400),
  evidenceIds: z.array(z.string().min(1)).min(1).max(8),
});

const hypothesisSchema = z.strictObject({
  rank: z.number().int().min(1).max(5),
  label: z.string().min(1).max(120),
  rationale: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().min(1)).min(1).max(8),
});

export const incidentBriefSchema = z.strictObject({
  disposition: z.enum(["MONITOR", "INVESTIGATE", "ESCALATE"]),
  summary: z.string().min(1).max(600),
  observations: z.array(observationSchema).min(1).max(8),
  hypotheses: z.array(hypothesisSchema).min(1).max(5),
  uncertainty: z.string().min(1).max(500),
  diagnosticChecks: z.array(z.string().min(1).max(300)).min(1).max(8),
});

function referencedEvidence(brief: IncidentBrief): string[] {
  return [
    ...brief.observations.flatMap((item) => item.evidenceIds),
    ...brief.hypotheses.flatMap((item) => item.evidenceIds),
  ];
}

export function validateIncidentBrief(
  input: unknown,
  evidence: EvidenceItem[],
): IncidentBrief {
  const brief = incidentBriefSchema.parse(input);
  const trustedIds = new Set(evidence.map((item) => item.id));
  const unsupported = referencedEvidence(brief).filter((id) => !trustedIds.has(id));

  if (unsupported.length > 0) {
    throw new Error(`Unsupported evidence reference: ${unsupported.join(", ")}`);
  }

  return brief;
}

export function enforceSafeDisposition(
  brief: IncidentBrief,
  evidence: EvidenceItem[],
): IncidentBrief {
  const hasTelecommand = evidence.some((item) => item.kind === "telecommand");
  const hasPlannedEvent = evidence.some((item) => item.kind === "planned-event");
  const hasBothOperationalContexts = hasTelecommand && hasPlannedEvent;
  const explicitlyAmbiguous = /ambiguous|unknown|insufficient|incomplete/i.test(
    brief.uncertainty,
  );

  if (brief.disposition === "MONITOR" && (!hasBothOperationalContexts || explicitlyAmbiguous)) {
    return {
      ...brief,
      disposition: "INVESTIGATE",
      summary: `${brief.summary} FlightSentry raised the disposition because the evidence is insufficient for monitoring alone.`,
    };
  }

  return brief;
}
