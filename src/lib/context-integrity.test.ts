import { describe, expect, it } from "vitest";

import {
  calculateContextMetrics,
  evaluateContextDecision,
} from "@/lib/context-integrity";
import { getAllScenarios, getScenario } from "@/lib/scenarios";

describe("context-integrity policy", () => {
  it("requires investigation for both events in telemetry-only mode", () => {
    expect(evaluateContextDecision(getScenario("esa-m2-609"), "telemetry-only").disposition).toBe("INVESTIGATE");
    expect(evaluateContextDecision(getScenario("esa-m2-618"), "telemetry-only").disposition).toBe("INVESTIGATE");
  });

  it("monitors event 609 only when every replay context check passes", () => {
    const decision = evaluateContextDecision(getScenario("esa-m2-609"), "trusted-context");

    expect(decision.disposition).toBe("MONITOR");
    expect(decision.gatePassed).toBe(true);
    expect(decision.checks.every((check) => check.status === "PASS")).toBe(true);
  });

  it("keeps event 618 at investigate because no explanatory context exists", () => {
    const decision = evaluateContextDecision(getScenario("esa-m2-618"), "trusted-context");

    expect(decision.disposition).toBe("INVESTIGATE");
    expect(decision.gatePassed).toBe(false);
    expect(decision.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "command-precedes-onset", status: "FAIL" }),
        expect.objectContaining({ id: "plan-overlaps-event", status: "FAIL" }),
      ]),
    );
  });

  it.each(["tc-609-recorded", "plan-609-event-14"])(
    "raises event 609 to investigate when %s is removed",
    (evidenceId) => {
      const decision = evaluateContextDecision(
        getScenario("esa-m2-609"),
        "trusted-context",
        [evidenceId],
      );

      expect(decision.disposition).toBe("INVESTIGATE");
      expect(decision.gatePassed).toBe(false);
      expect(decision.excludedEvidenceIds).toContain(evidenceId);
    },
  );

  it("ignores unknown counterfactual evidence identifiers", () => {
    const decision = evaluateContextDecision(
      getScenario("esa-m2-609"),
      "trusted-context",
      ["invented-evidence"],
    );

    expect(decision.disposition).toBe("MONITOR");
    expect(decision.excludedEvidenceIds).toEqual([]);
  });

  it("reports paired-case context metrics without presenting them as a broad benchmark", () => {
    expect(calculateContextMetrics(getAllScenarios())).toEqual({
      sampleSize: 2,
      telemetryOnlyInvestigations: 2,
      trustedContextInvestigations: 1,
      unnecessaryInvestigationsPrevented: 1,
      rareNominalDeEscalationRate: 1,
      anomalyInvestigationRecall: 1,
      counterfactualDependencyRate: 1,
    });
  });
});
