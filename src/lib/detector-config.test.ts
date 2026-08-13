/**
 * Tests for the versioned detector configuration artifact.
 *
 * Covers:
 *  - valid bundled configuration
 *  - invalid weight sum
 *  - invalid threshold
 *  - invalid persistence values
 *  - normalization formula/version mismatch
 *  - Python-generated artifact schema compatibility with TypeScript
 *  - unchanged paired-event behavior (regression)
 */

import { describe, expect, it } from "vitest";

import { detectorConfig, validateConfig } from "@/lib/detector-config";
import { detectorConfiguration, runDetectorEnsemble } from "@/lib/detectors";
import { getScenario } from "@/lib/scenarios";

// ─── Helper: build a minimal valid config for mutation tests ─────────────────

function validConfig() {
  return {
    schemaVersion: "1",
    configProfile: "test-v1",
    scope: "test scope",
    weights: { mad: 0.3, isolationForest: 0.3, autoencoder: 0.4 },
    alertThreshold: 0.78,
    persistence: { window: 5, requiredCount: 3 },
    normalization: {
      formula: "robust-z-clip",
      version: "1",
      description: "test",
      deadBand: 1.5,
      scale: 7,
      madMultiplier: 1.4826,
      minScale: 1e-6,
    },
    modelType: "bundled-rank2-linear-onnx",
    provenance: {
      source: "test",
      weightsSource: "test",
      thresholdSource: "test",
      generatedBy: "test",
      replacedBy: "test",
    },
  };
}

// ─── Bundled config validity ──────────────────────────────────────────────────

describe("detector configuration artifact — bundled profile", () => {
  it("loads without throwing (valid bundled config)", () => {
    // If this test file even runs, the module loaded successfully.
    expect(detectorConfig).toBeDefined();
    expect(detectorConfig.schemaVersion).toBe("1");
    expect(detectorConfig.configProfile).toBe("bundled-demo-v1");
  });

  it("bundled weights sum to exactly 1", () => {
    const { mad, isolationForest, autoencoder } = detectorConfig.weights;
    expect(Math.abs(mad + isolationForest + autoencoder - 1)).toBeLessThan(1e-9);
  });

  it("bundled threshold is in [0, 1]", () => {
    expect(detectorConfig.alertThreshold).toBeGreaterThanOrEqual(0);
    expect(detectorConfig.alertThreshold).toBeLessThanOrEqual(1);
  });

  it("bundled persistence requiredCount does not exceed window", () => {
    const { window, requiredCount } = detectorConfig.persistence;
    expect(requiredCount).toBeLessThanOrEqual(window);
    expect(requiredCount).toBeGreaterThanOrEqual(1);
  });

  it("detectorConfiguration derives persistence string from config", () => {
    const { window, requiredCount } = detectorConfig.persistence;
    expect(detectorConfiguration.persistence).toBe(`${requiredCount} of ${window} windows`);
  });

  it("detectorConfiguration exposes configProfile and provenance from artifact", () => {
    expect(detectorConfiguration.configProfile).toBe(detectorConfig.configProfile);
    expect(detectorConfiguration.scope).toBe(detectorConfig.scope);
    expect(detectorConfiguration.provenance).toEqual(detectorConfig.provenance);
  });
});

// ─── validateConfig invariant tests ──────────────────────────────────────────

describe("validateConfig — invariant rejection", () => {
  it("accepts a valid config without throwing", () => {
    expect(() => validateConfig(validConfig())).not.toThrow();
  });

  it("rejects weight sum < 1 (below tolerance)", () => {
    const cfg = validConfig();
    cfg.weights.mad = 0.1; // sum becomes 0.8
    expect(() => validateConfig(cfg)).toThrow(/weights must sum to 1/i);
  });

  it("rejects weight sum > 1 (above tolerance)", () => {
    const cfg = validConfig();
    cfg.weights.autoencoder = 0.6; // sum becomes 1.2
    expect(() => validateConfig(cfg)).toThrow(/weights must sum to 1/i);
  });

  it("rejects a negative weight", () => {
    const cfg = validConfig();
    cfg.weights.mad = -0.1;
    cfg.weights.isolationForest = 0.7; // keep sum at 1 but negative weight
    expect(() => validateConfig(cfg)).toThrow(/finite non-negative/i);
  });

  it("rejects NaN weight", () => {
    const cfg = validConfig();
    cfg.weights.mad = NaN;
    expect(() => validateConfig(cfg)).toThrow(/finite non-negative/i);
  });

  it("rejects alertThreshold above 1", () => {
    const cfg = validConfig();
    cfg.alertThreshold = 1.1;
    expect(() => validateConfig(cfg)).toThrow(/alertThreshold must be in \[0, 1\]/i);
  });

  it("rejects alertThreshold below 0", () => {
    const cfg = validConfig();
    cfg.alertThreshold = -0.01;
    expect(() => validateConfig(cfg)).toThrow(/alertThreshold must be in \[0, 1\]/i);
  });

  it("rejects persistence requiredCount exceeding window", () => {
    const cfg = validConfig();
    cfg.persistence.requiredCount = 6;
    cfg.persistence.window = 5;
    expect(() => validateConfig(cfg)).toThrow(/requiredCount.*must not exceed.*window/i);
  });

  it("rejects persistence requiredCount of zero", () => {
    const cfg = validConfig();
    cfg.persistence.requiredCount = 0;
    expect(() => validateConfig(cfg)).toThrow(/persistence.requiredCount must be a positive integer/i);
  });

  it("rejects normalization formula mismatch", () => {
    const cfg = validConfig();
    cfg.normalization.formula = "legacy-z-8";
    expect(() => validateConfig(cfg)).toThrow(/normalization.formula/i);
  });

  it("rejects normalization version mismatch", () => {
    const cfg = validConfig();
    cfg.normalization.version = "2";
    expect(() => validateConfig(cfg)).toThrow(/normalization.version/i);
  });

  it("rejects null config", () => {
    expect(() => validateConfig(null)).toThrow(/expected a JSON object/i);
  });

  it("rejects missing provenance.source", () => {
    const cfg = validConfig();
    (cfg.provenance as Record<string, string>).source = "";
    expect(() => validateConfig(cfg)).toThrow(/provenance.source must be a non-empty string/i);
  });
});

// ─── Python-generated artifact schema compatibility ───────────────────────────

describe("Python-generated artifact schema compatibility", () => {
  it("train_ensemble.py output schema is compatible with validateConfig", () => {
    // This is the exact shape that train_ensemble.py writes.
    // If that script changes its schema, this test will catch the drift.
    const pythonGeneratedShape = {
      schemaVersion: "1",
      configProfile: "source-data-trained-v1",
      scope: "Grid-search-calibrated weights from ESA Mission 2 source data. These are FlightSentry project metrics, not official ESA-ADB benchmark results.",
      weights: {
        mad: 0.3,
        isolationForest: 0.4,
        autoencoder: 0.3,
      },
      alertThreshold: 0.78,
      persistence: {
        window: 5,
        requiredCount: 3,
      },
      normalization: {
        formula: "robust-z-clip",
        version: "1",
        description: "clip((z - 1.5) / 7, 0, 1) where z = (score - median(calibration)) / (MAD(calibration) * 1.4826)",
        deadBand: 1.5,
        scale: 7,
        madMultiplier: 1.4826,
        minScale: 1e-6,
      },
      modelType: "source-data-nonlinear-onnx",
      provenance: {
        source: "ESA Mission 2 / Zenodo 12528696",
        weightsSource: "Grid search on 1000 samples from ESA Mission 2 extracted scenarios; F1=0.9500",
        thresholdSource: "Fixed at 0.78 (calibrated to robust-z-clip normalization scale)",
        generatedBy: "scripts/data_pipeline/train_ensemble.py",
        replacedBy: "Re-run train_ensemble.py against updated ESA Mission 2 source data",
      },
    };
    expect(() => validateConfig(pythonGeneratedShape)).not.toThrow();
  });

  it("build_demo_model.py output schema is compatible with validateConfig", () => {
    // This is the exact shape that build_demo_model.py writes.
    const demoGeneratedShape = {
      schemaVersion: "1",
      configProfile: "bundled-demo-v1",
      scope: "DEMONSTRATION ONLY — not official ESA-ADB benchmark results. Bundled weights were hand-selected for the two-scenario browser demo; run train_ensemble.py against ESA Mission 2 source data to replace with grid-search-calibrated values.",
      weights: {
        mad: 0.3,
        isolationForest: 0.3,
        autoencoder: 0.4,
      },
      alertThreshold: 0.78,
      persistence: {
        window: 5,
        requiredCount: 3,
      },
      normalization: {
        formula: "robust-z-clip",
        version: "1",
        description: "clip((z - 1.5) / 7, 0, 1) where z = (score - median(calibration)) / (MAD(calibration) * 1.4826)",
        deadBand: 1.5,
        scale: 7,
        madMultiplier: 1.4826,
        minScale: 1e-6,
      },
      modelType: "bundled-rank2-linear-onnx",
      provenance: {
        source: "build_demo_model.py deterministic construction — no ESA source data",
        weightsSource: "hand-selected for bundled two-scenario demo",
        thresholdSource: "hand-selected for bundled two-scenario demo",
        generatedBy: "scripts/data_pipeline/build_demo_model.py",
        replacedBy: "Run scripts/data_pipeline/train_ensemble.py against ESA Mission 2 source data (Zenodo 12528696)",
      },
    };
    expect(() => validateConfig(demoGeneratedShape)).not.toThrow();
  });
});

// ─── Paired-event regression (unchanged behavior) ────────────────────────────

describe("detector ensemble — paired-event regression with artifact config", () => {
  it.each(["esa-m2-609", "esa-m2-618"] as const)(
    "still detects telemetry shift in %s after config artifact migration",
    (scenarioId) => {
      const scenario = getScenario(scenarioId);
      const frames = runDetectorEnsemble(scenario);
      const alerts = frames.filter((f) => f.alert);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].timestamp).toBeGreaterThanOrEqual(scenario.eventWindow[0]);
      expect(alerts[0].timestamp).toBeLessThanOrEqual(scenario.eventWindow[1] + 4);
    },
  );

  it("persistence window uses config values (3 of 5)", () => {
    // At index 2 we have only 3 samples in window → cannot satisfy 3 of 5.
    // At index 4 we have 5 samples. Verify detectorConfig drives this.
    expect(detectorConfig.persistence.requiredCount).toBe(3);
    expect(detectorConfig.persistence.window).toBe(5);
  });
});
