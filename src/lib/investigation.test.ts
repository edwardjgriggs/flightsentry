import { describe, expect, it } from "vitest";

import {
  createInvestigationRunbook,
  reconcileInvestigationRunbook,
  summarizeInvestigationRunbook,
  updateInvestigationCheck,
} from "@/lib/investigation";

describe("investigation runbook", () => {
  const prompts = ["Verify command history.", "Confirm recovery."];

  it("creates stable pending checks for an incident", () => {
    const runbook = createInvestigationRunbook("esa-m2-618", prompts);

    expect(runbook.checks.map((check) => check.id)).toEqual([
      "esa-m2-618-diagnostic-1",
      "esa-m2-618-diagnostic-2",
    ]);
    expect(summarizeInvestigationRunbook(runbook)).toMatchObject({
      status: "IN_PROGRESS",
      resolved: 0,
      total: 2,
    });
  });

  it("tracks verified checks and open concerns", () => {
    let runbook = createInvestigationRunbook("esa-m2-618", prompts);
    runbook = updateInvestigationCheck(
      runbook,
      runbook.checks[0].id,
      { status: "VERIFIED" },
      "2026-08-14T15:00:00.000Z",
    );
    runbook = updateInvestigationCheck(
      runbook,
      runbook.checks[1].id,
      { status: "CONCERN", note: "Recovery remains outside the expected envelope." },
      "2026-08-14T15:01:00.000Z",
    );

    expect(summarizeInvestigationRunbook(runbook)).toEqual({
      status: "CONCERN",
      resolved: 2,
      verified: 1,
      concerns: 1,
      total: 2,
    });
    expect(runbook.checks[1].note).toMatch(/outside the expected envelope/i);
  });

  it("preserves results only while the diagnostic prompt remains the same", () => {
    const original = updateInvestigationCheck(
      createInvestigationRunbook("esa-m2-609", prompts),
      "esa-m2-609-diagnostic-1",
      { status: "VERIFIED" },
      "2026-08-14T15:00:00.000Z",
    );
    const reconciled = reconcileInvestigationRunbook(
      "esa-m2-609",
      ["A replacement check.", prompts[1]],
      original,
    );

    expect(reconciled.checks[0].status).toBe("PENDING");
    expect(reconciled.checks[1].status).toBe("PENDING");
  });

  it("rejects updates to unknown checks", () => {
    const runbook = createInvestigationRunbook("esa-m2-609", prompts);
    expect(() => updateInvestigationCheck(runbook, "missing", { status: "VERIFIED" })).toThrow(
      /unknown diagnostic check/i,
    );
  });
});
