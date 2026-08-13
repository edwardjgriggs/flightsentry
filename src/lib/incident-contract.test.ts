import { describe, expect, it } from "vitest";

import {
  enforceSafeDisposition,
  validateIncidentBrief,
} from "@/lib/incident-contract";
import { getScenario } from "@/lib/scenarios";

describe("Granite incident contract", () => {
  const scenario = getScenario("esa-m2-618");

  it("accepts a structured brief whose evidence references are trusted", () => {
    expect(
      validateIncidentBrief(scenario.referenceAnalysis, scenario.evidence),
    ).toEqual(scenario.referenceAnalysis);
  });

  it("rejects evidence identifiers that are not in the trusted packet", () => {
    const unsafe = structuredClone(scenario.referenceAnalysis);
    unsafe.observations[0].evidenceIds.push("invented-evidence");

    expect(() => validateIncidentBrief(unsafe, scenario.evidence)).toThrow(
      /unsupported evidence/i,
    );
  });

  it("forces ambiguous monitor recommendations to investigate", () => {
    const ambiguous = {
      ...scenario.referenceAnalysis,
      disposition: "MONITOR" as const,
      uncertainty: "The available evidence is ambiguous.",
    };

    expect(enforceSafeDisposition(ambiguous, scenario.evidence).disposition).toBe(
      "INVESTIGATE",
    );
  });

  it("preserves MONITOR for event 609 because trusted command and plan context are present", () => {
    // Event 609 evidence includes a telecommand and a planned-event;
    // MONITOR must not be upgraded to INVESTIGATE.
    const scenario609 = getScenario("esa-m2-609");
    const brief609 = {
      ...scenario609.referenceAnalysis,
      disposition: "MONITOR" as const,
      uncertainty: "Bounded response consistent with the planned window.",
    };
    const result = enforceSafeDisposition(brief609, scenario609.evidence);
    expect(result.disposition).toBe("MONITOR");
  });

  it("upgrades MONITOR to INVESTIGATE for event 618 because no operational context exists", () => {
    // Event 618 evidence contains only telemetry and model items — no telecommand or planned-event.
    const scenario618 = getScenario("esa-m2-618");
    const monitorWithoutContext = {
      ...scenario618.referenceAnalysis,
      disposition: "MONITOR" as const,
      uncertainty: "Unclear why the shift occurred.",
    };
    const result = enforceSafeDisposition(monitorWithoutContext, scenario618.evidence);
    expect(result.disposition).toBe("INVESTIGATE");
  });

  it("upgrades MONITOR to INVESTIGATE when only telecommand context exists (no planned event)", () => {
    const scenario609 = getScenario("esa-m2-609");
    const evidenceWithOnlyTelecommand = scenario609.evidence.filter(
      (item) => item.kind !== "planned-event",
    );
    const monitorBrief = {
      ...scenario609.referenceAnalysis,
      disposition: "MONITOR" as const,
      uncertainty: "Response is bounded and consistent with the command.",
    };
    const result = enforceSafeDisposition(monitorBrief, evidenceWithOnlyTelecommand);
    expect(result.disposition).toBe("INVESTIGATE");
  });

  it("upgrades MONITOR to INVESTIGATE when only planned-event context exists (no telecommand)", () => {
    const scenario609 = getScenario("esa-m2-609");
    const evidenceWithOnlyPlannedEvent = scenario609.evidence.filter(
      (item) => item.kind !== "telecommand",
    );
    const monitorBrief = {
      ...scenario609.referenceAnalysis,
      disposition: "MONITOR" as const,
      uncertainty: "Response aligns with the planned calibration window.",
    };
    const result = enforceSafeDisposition(monitorBrief, evidenceWithOnlyPlannedEvent);
    expect(result.disposition).toBe("INVESTIGATE");
  });

  it("upgrades MONITOR to INVESTIGATE when both contexts exist but uncertainty is explicitly ambiguous", () => {
    const scenario609 = getScenario("esa-m2-609");
    const monitorWithAmbiguousUncertainty = {
      ...scenario609.referenceAnalysis,
      disposition: "MONITOR" as const,
      uncertainty: "The evidence is insufficient to determine the root cause.",
    };
    const result = enforceSafeDisposition(monitorWithAmbiguousUncertainty, scenario609.evidence);
    expect(result.disposition).toBe("INVESTIGATE");
  });

  it("preserves ESCALATE disposition without modification", () => {
    const escalated = { ...scenario.referenceAnalysis, disposition: "ESCALATE" as const };
    expect(enforceSafeDisposition(escalated, scenario.evidence).disposition).toBe("ESCALATE");
  });

  it("rejects briefs with empty string evidence IDs", () => {
    const withEmptyId = structuredClone(scenario.referenceAnalysis);
    withEmptyId.observations[0].evidenceIds = [""];
    expect(() => validateIncidentBrief(withEmptyId, scenario.evidence)).toThrow();
  });

  it("rejects briefs where disposition is not a valid enum value", () => {
    const badDisposition = { ...scenario.referenceAnalysis, disposition: "IGNORE" };
    expect(() => validateIncidentBrief(badDisposition, scenario.evidence)).toThrow();
  });
});
