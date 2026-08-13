import { describe, expect, it } from "vitest";

import { evaluateContextDecision } from "@/lib/context-integrity";
import { runDetectorEnsemble } from "@/lib/detectors";
import {
  buildIncidentDecisionRecord,
  renderIncidentDecisionHtml,
} from "@/lib/incident-export";
import { getScenario } from "@/lib/scenarios";

describe("incident decision record", () => {
  const scenario = getScenario("esa-m2-609");
  const response = {
    analysis: scenario.referenceAnalysis,
    source: "reference" as const,
    offline: true,
    model: "stored-reference-v1",
  };

  it("exports configuration, evidence, decision, uncertainty, and acknowledgement fields", () => {
    const record = buildIncidentDecisionRecord({
      scenario,
      frames: runDetectorEnsemble(scenario),
      response,
      decision: evaluateContextDecision(scenario, "trusted-context"),
      generatedAt: "2026-08-13T20:00:00.000Z",
    });

    expect(record.recordId).toBe("flightsentry-esa-m2-609-20260813200000");
    expect(record.detection.configurationProfile).toBe("bundled-demo-v1");
    expect(record.detection.firstPersistentAlert).not.toBeNull();
    expect(record.evidence.map((item) => item.id)).toContain("tc-609-recorded");
    expect(record.analysis.validatedDisposition).toBe("MONITOR");
    expect(record.operatorAcknowledgement).toEqual({ name: "", timestamp: "", notes: "" });
  });

  it("omits removed evidence and labels a counterfactual policy-only record", () => {
    const decision = evaluateContextDecision(scenario, "trusted-context", ["tc-609-recorded"]);
    const record = buildIncidentDecisionRecord({
      scenario,
      frames: runDetectorEnsemble(scenario),
      response,
      decision,
      generatedAt: "2026-08-13T20:00:00.000Z",
    });

    expect(record.evidence.map((item) => item.id)).not.toContain("tc-609-recorded");
    expect(record.analysis.policyOnly).toBe(true);
    expect(record.analysis.originalBriefWithheld).toBe(true);
    expect(record.analysis.validatedDisposition).toBe("INVESTIGATE");
    expect(record.analysis.summary).toMatch(/does not pass every required context check/i);
    expect(record.analysis.summary).not.toMatch(/monitored through recovery/i);
  });

  it("exports telemetry-only decisions without leaking the withheld context brief", () => {
    const decision = evaluateContextDecision(scenario, "telemetry-only");
    const record = buildIncidentDecisionRecord({
      scenario,
      frames: runDetectorEnsemble(scenario),
      response,
      decision,
      generatedAt: "2026-08-13T20:00:00.000Z",
    });

    expect(record.analysis.policyOnly).toBe(true);
    expect(record.analysis.summary).toMatch(/cannot explain operational intent/i);
    expect(record.evidence.map((item) => item.kind)).not.toContain("telecommand");
    expect(record.evidence.map((item) => item.kind)).not.toContain("planned-event");
  });

  it("renders a self-contained printable HTML record and escapes evidence text", () => {
    const maliciousScenario = structuredClone(scenario);
    maliciousScenario.evidence[0].label = "<script>alert('x')</script>";
    const record = buildIncidentDecisionRecord({
      scenario: maliciousScenario,
      frames: runDetectorEnsemble(maliciousScenario),
      response,
      decision: evaluateContextDecision(maliciousScenario, "trusted-context"),
      generatedAt: "2026-08-13T20:00:00.000Z",
    });
    const html = renderIncidentDecisionHtml(record);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Operator acknowledgement");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
