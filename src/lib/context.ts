import type { IncidentBrief, Scenario } from "@/lib/types";

export function resolveReferenceIncident(scenario: Scenario): IncidentBrief {
  const hasCommand = scenario.evidence.some(
    (item) => item.kind === "telecommand" && item.timestamp <= scenario.eventWindow[0],
  );
  const hasPlan = scenario.evidence.some(
    (item) => item.kind === "planned-event" && item.timestamp <= scenario.eventWindow[1],
  );

  if (hasCommand && hasPlan) {
    return scenario.referenceAnalysis;
  }

  if (!hasCommand && !hasPlan && scenario.classification === "ANOMALY") {
    return scenario.referenceAnalysis;
  }

  return {
    ...scenario.referenceAnalysis,
    disposition: "INVESTIGATE",
    summary: "Available context does not support a safe monitor or escalate decision.",
  };
}
