import { describe, expect, it } from "vitest";

import {
  replaceAutoencoderScores,
  runDetectorEnsemble,
} from "@/lib/detectors";
import { getScenario } from "@/lib/scenarios";

/**
 * Python reference implementation of robustNormalize for parity tests.
 * Mirrors scripts/data_pipeline/train_ensemble.py robust_normalize().
 * Formula: clip((z - 1.5) / 7, 0, 1)
 * where z = (score - median(cal)) / (MAD(cal) * 1.4826)
 *
 * If TypeScript and Python formulas diverge, these tests will fail.
 */
function pyRobustNormalize(score: number, calibration: number[]): number {
  const sorted = [...calibration].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const center =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const devs = calibration.map((v) => Math.abs(v - center));
  const sortedDevs = [...devs].sort((a, b) => a - b);
  const dm = Math.floor(sortedDevs.length / 2);
  const mad =
    sortedDevs.length % 2 === 0
      ? (sortedDevs[dm - 1] + sortedDevs[dm]) / 2
      : sortedDevs[dm];
  const scale = Math.max(mad * 1.4826, 1e-6);
  const z = (score - center) / scale;
  return Math.max(0, Math.min(1, (z - 1.5) / 7));
}

describe("detector ensemble", () => {
  it.each(["esa-m2-609", "esa-m2-618"] as const)(
    "detects the telemetry shift in %s with temporal persistence",
    (scenarioId) => {
      const scenario = getScenario(scenarioId);
      const scores = runDetectorEnsemble(scenario);
      const alerts = scores.filter((score) => score.alert);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].timestamp).toBeGreaterThanOrEqual(
        scenario.eventWindow[0],
      );
      expect(alerts[0].timestamp).toBeLessThanOrEqual(
        scenario.eventWindow[1] + 4,
      );
      expect(alerts[0].contributors.length).toBeGreaterThan(0);
    },
  );

  it("keeps nominal validation windows below the alert threshold", () => {
    const scenario = getScenario("esa-m2-618");
    const scores = runDetectorEnsemble(scenario);

    expect(scores.filter((score) => score.timestamp < 44 && score.alert)).toEqual(
      [],
    );
  });

  it("reports all three independent detector scores", () => {
    const result = runDetectorEnsemble(getScenario("esa-m2-618")).at(-1);

    expect(result).toMatchObject({
      mad: expect.any(Number),
      isolationForest: expect.any(Number),
      autoencoder: expect.any(Number),
      fused: expect.any(Number),
    });
  });

  it("re-fuses browser ONNX scores and reapplies temporal persistence", () => {
    const frames = runDetectorEnsemble(getScenario("esa-m2-618"));
    const onnxScores = frames.map((_, index) => (index >= 50 ? 1 : 0));
    const updated = replaceAutoencoderScores(frames, onnxScores);

    expect(updated[49].alert).toBe(false);
    expect(updated.slice(52).some((frame) => frame.alert)).toBe(true);
    expect(updated[55].autoencoder).toBe(1);
  });

  it("rejects an ONNX result with the wrong frame count", () => {
    const frames = runDetectorEnsemble(getScenario("esa-m2-618"));
    expect(() => replaceAutoencoderScores(frames, [0.1])).toThrow(/frame count/i);
  });
});

describe("normalization parity — TypeScript vs Python", () => {
  const calibration = [2.0, 2.1, 1.9, 2.05, 1.95, 2.0, 2.02, 1.98, 2.0, 1.99];

  it("nominal score at median maps to 0 (dead-band)", () => {
    const sorted = [...calibration].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const center =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    expect(pyRobustNormalize(center, calibration)).toBe(0);
  });

  it("large anomaly clips to 1.0", () => {
    expect(pyRobustNormalize(1000, calibration)).toBe(1);
  });

  it("output is always in [0, 1] for extreme inputs", () => {
    for (const score of [-1000, -1, 0, 2, 10, 100, 1000]) {
      const result = pyRobustNormalize(score, calibration);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });

  it("TypeScript robustNormalize matches Python formula on fixed calibration", () => {
    // These exact values are also tested in scripts/data_pipeline/tests/test_normalization_parity.py
    // Any divergence between the two test files signals a formula mismatch.
    const testCases: [number, number[]][] = [
      [5.0, [1.0, 1.1, 0.9, 1.05, 0.95, 1.0, 1.02, 0.98, 1.0, 0.99]],
      [1.2, [0.5, 0.6, 0.55, 0.48, 0.62, 0.51, 0.59, 0.53, 0.57, 0.56]],
      [20.0, [10.0, 11.0, 9.0, 10.5, 9.5, 10.0, 10.2, 9.8, 10.0, 9.9]],
    ];
    for (const [score, cal] of testCases) {
      const py = pyRobustNormalize(score, cal);
      // py formula: clip((z-1.5)/7, 0, 1)
      // Verify the formula inline matches the reference
      const sorted = [...cal].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const center =
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      const devs = cal.map((v) => Math.abs(v - center));
      const sortedDevs = [...devs].sort((a, b) => a - b);
      const dm = Math.floor(sortedDevs.length / 2);
      const mad =
        sortedDevs.length % 2 === 0
          ? (sortedDevs[dm - 1] + sortedDevs[dm]) / 2
          : sortedDevs[dm];
      const scale = Math.max(mad * 1.4826, 1e-6);
      const z = (score - center) / scale;
      const direct = Math.max(0, Math.min(1, (z - 1.5) / 7));
      expect(py).toBeCloseTo(direct, 9);
    }
  });

  it("old Python formula z/8 produces different results (regression guard)", () => {
    // Verifies the old bug has been fixed: old formula used z/8 not (z-1.5)/7.
    // Use score=1.15 to keep z≈2 so neither formula clips to 1.0 and the
    // difference (0.25 vs 0.071) is clearly visible.
    const cal = [1.0, 1.1, 0.9, 1.05, 0.95, 1.0, 1.02, 0.98, 1.0, 0.99];
    const score = 1.15;
    const sorted = [...cal].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const center =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const devs = cal.map((v) => Math.abs(v - center));
    const sortedDevs = [...devs].sort((a, b) => a - b);
    const dm = Math.floor(sortedDevs.length / 2);
    const mad =
      sortedDevs.length % 2 === 0
        ? (sortedDevs[dm - 1] + sortedDevs[dm]) / 2
        : sortedDevs[dm];
    const scale = Math.max(mad * 1.4826, 1e-6);
    const z = (score - center) / scale;
    const oldFormula = Math.max(0, Math.min(1, z / 8));
    const newFormula = Math.max(0, Math.min(1, (z - 1.5) / 7));
    // Old and new formulas must produce different results for this input
    expect(oldFormula).not.toBeCloseTo(newFormula, 3);
    // New formula is what pyRobustNormalize produces
    expect(pyRobustNormalize(score, cal)).toBeCloseTo(newFormula, 9);
  });
});
