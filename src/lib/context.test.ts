import { describe, expect, it } from "vitest";

import { resolveReferenceIncident } from "@/lib/context";
import { getScenario } from "@/lib/scenarios";

describe("context resolution", () => {
  it("de-prioritizes event 609 because trusted command and plan evidence overlap", () => {
    const result = resolveReferenceIncident(getScenario("esa-m2-609"));

    expect(result.disposition).toBe("MONITOR");
    expect(result.observations.flatMap((item) => item.evidenceIds)).toEqual(
      expect.arrayContaining(["tc-609-recorded", "plan-609-event-14"]),
    );
  });

  it("escalates event 618 because no command or planned event explains it", () => {
    const result = resolveReferenceIncident(getScenario("esa-m2-618"));

    expect(result.disposition).toBe("ESCALATE");
    expect(result.uncertainty).toMatch(/root cause/i);
  });
});
