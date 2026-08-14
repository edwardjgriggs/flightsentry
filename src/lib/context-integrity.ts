import type {
  ContextDecision,
  ContextIntegrityCheck,
  DecisionMode,
  EvidenceItem,
  Scenario,
} from "@/lib/types";

export const CONTEXT_POLICY_VERSION = "context-gate-v1";

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  evidenceIds: string[],
  provenance: ContextIntegrityCheck["provenance"],
): ContextIntegrityCheck {
  return {
    id,
    label,
    status: passed ? "PASS" : "FAIL",
    detail,
    evidenceIds,
    provenance,
  };
}

function overlapsEvent(item: EvidenceItem, window: [number, number]): boolean {
  const itemEnd = item.endTimestamp ?? item.timestamp;
  return item.timestamp <= window[1] && itemEnd >= window[0];
}

export function evaluateContextDecision(
  scenario: Scenario,
  mode: DecisionMode,
  excludedEvidenceIds: string[] = [],
): ContextDecision {
  const trustedEvidenceIds = new Set(scenario.evidence.map((item) => item.id));
  const excluded = new Set(excludedEvidenceIds.filter((id) => trustedEvidenceIds.has(id)));
  const activeEvidence = scenario.evidence.filter((item) => !excluded.has(item.id));
  const modelEvidence = activeEvidence.filter((item) => item.kind === "model");
  const telemetryEvidence = activeEvidence.filter(
    (item) => item.kind === "model" || item.kind === "telemetry",
  );

  if (mode === "telemetry-only") {
    return {
      mode,
      disposition: "INVESTIGATE",
      gatePassed: false,
      rationale: "Telemetry confirms an unusual event but cannot explain operational intent.",
      activeEvidenceIds: telemetryEvidence.map((item) => item.id),
      excludedEvidenceIds: scenario.evidence
        .filter((item) => item.kind === "telecommand" || item.kind === "planned-event")
        .map((item) => item.id),
      checks: [
        check(
          "persistent-alert",
          "Persistent telemetry alert",
          modelEvidence.length > 0,
          "The numerical ensemble raised a persistent event-level alert.",
          modelEvidence.map((item) => item.id),
          "DETECTOR",
        ),
        check(
          "operational-context-enabled",
          "Operational context available to decision",
          false,
          "Telemetry-only mode intentionally withholds telecommand and mission-plan records.",
          [],
          "POLICY",
        ),
      ],
      policyVersion: CONTEXT_POLICY_VERSION,
      scope: scenario.contextAssurance.scope,
      productionLimitations: scenario.contextAssurance.productionLimitations,
    };
  }

  const commands = activeEvidence.filter((item) => item.kind === "telecommand");
  const plans = activeEvidence.filter((item) => item.kind === "planned-event");
  const precedingCommands = commands.filter((item) => item.timestamp <= scenario.eventWindow[0]);
  const overlappingPlans = plans.filter((item) => overlapsEvent(item, scenario.eventWindow));
  const pairedContextAvailable = precedingCommands.length > 0 && overlappingPlans.length > 0;

  const checks = [
    check(
      "persistent-alert",
      "Persistent telemetry alert",
      modelEvidence.length > 0,
      "The numerical ensemble raised a persistent event-level alert.",
      modelEvidence.map((item) => item.id),
      "DETECTOR",
    ),
    check(
      "command-precedes-onset",
      "Command record precedes onset",
      precedingCommands.length > 0,
      precedingCommands.length > 0
        ? "A trusted command record occurs before the annotated telemetry onset."
        : "No active command record precedes the telemetry onset.",
      precedingCommands.map((item) => item.id),
      "ESA RECORD",
    ),
    check(
      "plan-overlaps-event",
      "Operational event overlaps window",
      overlappingPlans.length > 0,
      overlappingPlans.length > 0
        ? "A trusted operational-event record overlaps the anomaly window."
        : "No active operational-event record overlaps the anomaly window.",
      overlappingPlans.map((item) => item.id),
      "ESA RECORD",
    ),
    check(
      "command-history-complete",
      "Replay command history complete",
      scenario.contextAssurance.commandHistoryComplete,
      "The bundled replay trust assertion marks the command-history slice complete for this window.",
      commands.map((item) => item.id),
      "REPLAY ASSERTION",
    ),
    check(
      "mission-plan-complete",
      "Replay mission-plan history complete",
      scenario.contextAssurance.missionPlanComplete,
      "The bundled replay trust assertion marks the operational-event slice complete for this window.",
      plans.map((item) => item.id),
      "REPLAY ASSERTION",
    ),
    check(
      "context-pair-available",
      "Command and plan evidence pair available",
      pairedContextAvailable,
      pairedContextAvailable
        ? "Both independent context records remain in the active evidence packet."
        : "The active evidence packet does not contain both required context records.",
      [...precedingCommands, ...overlappingPlans].map((item) => item.id),
      "POLICY",
    ),
  ];
  const gatePassed = checks.every((item) => item.status === "PASS");

  return {
    mode,
    disposition: gatePassed ? "MONITOR" : "INVESTIGATE",
    gatePassed,
    rationale: gatePassed
      ? "Independent command and operational-event records explain the timing, so monitor through recovery."
      : "The evidence does not pass every required context check, so operator investigation remains required.",
    activeEvidenceIds: activeEvidence.map((item) => item.id),
    excludedEvidenceIds: [...excluded],
    checks,
    policyVersion: CONTEXT_POLICY_VERSION,
    scope: scenario.contextAssurance.scope,
    productionLimitations: scenario.contextAssurance.productionLimitations,
  };
}

export interface ContextMetrics {
  sampleSize: number;
  telemetryOnlyInvestigations: number;
  trustedContextInvestigations: number;
  unnecessaryInvestigationsPrevented: number;
  rareNominalDeEscalationRate: number;
  anomalyInvestigationRecall: number;
  counterfactualDependencyRate: number;
}

export function calculateContextMetrics(scenarios: Scenario[]): ContextMetrics {
  const telemetryOnly = scenarios.map((scenario) =>
    evaluateContextDecision(scenario, "telemetry-only"),
  );
  const trustedContext = scenarios.map((scenario) =>
    evaluateContextDecision(scenario, "trusted-context"),
  );
  const rareNominal = scenarios.filter((scenario) => scenario.classification === "RARE_NOMINAL");
  const anomalies = scenarios.filter((scenario) => scenario.classification === "ANOMALY");
  const prevented = scenarios.filter(
    (scenario, index) =>
      scenario.classification === "RARE_NOMINAL" &&
      telemetryOnly[index].disposition === "INVESTIGATE" &&
      trustedContext[index].disposition === "MONITOR",
  ).length;
  const anomalyRetained = scenarios.filter(
    (scenario, index) =>
      scenario.classification === "ANOMALY" &&
      trustedContext[index].disposition === "INVESTIGATE",
  ).length;
  const counterfactualTrials = rareNominal.flatMap((scenario) =>
    scenario.evidence
      .filter((item) => item.kind === "telecommand" || item.kind === "planned-event")
      .map((item) => evaluateContextDecision(scenario, "trusted-context", [item.id])),
  );
  const dependencyPasses = counterfactualTrials.filter(
    (decision) => decision.disposition === "INVESTIGATE",
  ).length;

  return {
    sampleSize: scenarios.length,
    telemetryOnlyInvestigations: telemetryOnly.filter(
      (decision) => decision.disposition === "INVESTIGATE",
    ).length,
    trustedContextInvestigations: trustedContext.filter(
      (decision) => decision.disposition === "INVESTIGATE",
    ).length,
    unnecessaryInvestigationsPrevented: prevented,
    rareNominalDeEscalationRate: rareNominal.length === 0 ? 0 : prevented / rareNominal.length,
    anomalyInvestigationRecall: anomalies.length === 0 ? 0 : anomalyRetained / anomalies.length,
    counterfactualDependencyRate:
      counterfactualTrials.length === 0 ? 0 : dependencyPasses / counterfactualTrials.length,
  };
}
