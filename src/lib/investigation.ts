import type {
  AnalysisResponse,
  ContextDecision,
  DiagnosticCheckStatus,
  InvestigationRunbook,
  ScenarioId,
} from "@/lib/types";

export const policyOnlyDiagnosticChecks = Object.freeze([
  "Verify the missing operational-context source and packet completeness.",
  "Continue operator investigation until the required evidence is restored or independently resolved.",
]);

export function getEffectiveDiagnosticChecks(
  response: AnalysisResponse | undefined,
  decision: ContextDecision,
): string[] {
  const policyOnly =
    decision.mode === "telemetry-only" || decision.excludedEvidenceIds.length > 0;
  return policyOnly
    ? [...policyOnlyDiagnosticChecks]
    : [...(response?.analysis.diagnosticChecks ?? [])];
}

export function createInvestigationRunbook(
  scenarioId: ScenarioId,
  prompts: readonly string[],
): InvestigationRunbook {
  return {
    scenarioId,
    checks: prompts.map((prompt, index) => ({
      id: `${scenarioId}-diagnostic-${index + 1}`,
      prompt,
      status: "PENDING",
      note: "",
      updatedAt: null,
    })),
  };
}

export function reconcileInvestigationRunbook(
  scenarioId: ScenarioId,
  prompts: readonly string[],
  current?: InvestigationRunbook,
): InvestigationRunbook {
  const fresh = createInvestigationRunbook(scenarioId, prompts);
  if (!current || current.scenarioId !== scenarioId) return fresh;

  return {
    scenarioId,
    checks: fresh.checks.map((check) => {
      const existing = current.checks.find(
        (item) => item.id === check.id && item.prompt === check.prompt,
      );
      return existing ?? check;
    }),
  };
}

export function updateInvestigationCheck(
  runbook: InvestigationRunbook,
  checkId: string,
  update: { status?: DiagnosticCheckStatus; note?: string },
  updatedAt = new Date().toISOString(),
): InvestigationRunbook {
  if (!runbook.checks.some((check) => check.id === checkId)) {
    throw new Error(`Unknown diagnostic check: ${checkId}`);
  }

  return {
    ...runbook,
    checks: runbook.checks.map((check) =>
      check.id === checkId
        ? {
            ...check,
            ...update,
            updatedAt,
          }
        : check,
    ),
  };
}

export function summarizeInvestigationRunbook(runbook: InvestigationRunbook): {
  status: "IN_PROGRESS" | "COMPLETE" | "CONCERN";
  resolved: number;
  verified: number;
  concerns: number;
  total: number;
} {
  const verified = runbook.checks.filter((check) => check.status === "VERIFIED").length;
  const concerns = runbook.checks.filter((check) => check.status === "CONCERN").length;
  const resolved = verified + concerns;
  return {
    status:
      concerns > 0
        ? "CONCERN"
        : resolved === runbook.checks.length && runbook.checks.length > 0
          ? "COMPLETE"
          : "IN_PROGRESS",
    resolved,
    verified,
    concerns,
    total: runbook.checks.length,
  };
}
