import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import sourceEvaluation from "@/data/source-evaluation.json";

describe("source evaluation evidence", () => {
  it("records checksum-verified paired Mission 2 extracts", () => {
    expect(sourceEvaluation.source.archiveMd5).toBe("0b7505b7f0731ca037ee889ca2a520ce");
    expect(sourceEvaluation.source.extracts.map((item) => item.eventId)).toEqual([609, 618]);
    expect(sourceEvaluation.source.extracts.every((item) => item.sha256.length === 64)).toBe(true);
    for (const extract of sourceEvaluation.source.extracts) {
      const content = readFileSync(
        resolve(process.cwd(), "public", "data", "source-evaluation", `esa-m2-${extract.eventId}.json`),
      );
      expect(createHash("sha256").update(content).digest("hex")).toBe(extract.sha256);
    }
  });

  it("records the source context contrast without inventing names", () => {
    const [event609, event618] = sourceEvaluation.source.extracts;
    expect(event609.telecommands).toEqual(["telecommand_6"]);
    expect(event609.operationalEvents).toEqual(["event_14"]);
    expect(event618.telecommands).toEqual([]);
    expect(event618.operationalEvents).toEqual([]);
  });

  it("keeps the candidate staged when it does not beat the held-out baseline", () => {
    const ablation = sourceEvaluation.results.heldOutAblation;
    expect(ablation.weightedEnsemble.detected).toBe(true);
    expect(ablation.weightedEnsemble.eventF1).toBeLessThanOrEqual(ablation.rollingMad.eventF1);
    expect(sourceEvaluation.deploymentDecision.status).toBe("RETAIN_BUNDLED_DEMO");
  });
});
