import type { IncidentBrief, Scenario } from "@/lib/types";
import { evaluateContextDecision } from "@/lib/context-integrity";

export function resolveReferenceIncident(scenario: Scenario): IncidentBrief {
  const decision = evaluateContextDecision(scenario, "trusted-context");
  return {
    ...scenario.referenceAnalysis,
    disposition: decision.disposition,
    summary:
      decision.disposition === scenario.referenceAnalysis.disposition
        ? scenario.referenceAnalysis.summary
        : decision.rationale,
  };
}
