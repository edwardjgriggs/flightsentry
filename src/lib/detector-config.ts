/**
 * Versioned detector configuration artifact.
 *
 * The canonical values live in public/models/detector-config.json. This module
 * imports that artifact at build time, validates every invariant at module-load
 * time, and exports a strongly-typed, read-only configuration object.
 *
 * At runtime the same JSON is also served from /models/detector-config.json so
 * the Technical Proof view can surface provenance to the operator.
 *
 * Invariants checked on load:
 *   - weights are finite, non-negative, and sum to 1 within 1e-9
 *   - alertThreshold is in [0, 1]
 *   - persistence.requiredCount <= persistence.window
 *   - normalization formula/version matches the hard-coded implementation
 *   - normalization deadBand, scale, madMultiplier, and minScale are finite
 *     numbers within sane ranges (a non-numeric or wild value fails the load)
 */

import rawConfig from "../../public/models/detector-config.json";

// ─── Schema types ────────────────────────────────────────────────────────────

export interface DetectorWeights {
  readonly mad: number;
  readonly isolationForest: number;
  readonly autoencoder: number;
}

export interface PersistenceConfig {
  readonly window: number;
  readonly requiredCount: number;
}

export interface NormalizationConfig {
  readonly formula: string;
  readonly version: string;
  readonly description: string;
  readonly deadBand: number;
  readonly scale: number;
  readonly madMultiplier: number;
  readonly minScale: number;
}

export interface ProvenanceConfig {
  readonly source: string;
  readonly weightsSource: string;
  readonly thresholdSource: string;
  readonly generatedBy: string;
  readonly replacedBy: string;
}

export interface DetectorConfig {
  readonly schemaVersion: string;
  readonly configProfile: string;
  readonly scope: string;
  readonly weights: DetectorWeights;
  readonly alertThreshold: number;
  readonly persistence: PersistenceConfig;
  readonly normalization: NormalizationConfig;
  readonly modelType: string;
  readonly provenance: ProvenanceConfig;
}

// ─── Expected normalization identity ─────────────────────────────────────────

/**
 * The normalization formula hard-coded in robustNormalize(). Any artifact with
 * a different formula/version identifier is incompatible with this build.
 */
const EXPECTED_NORMALIZATION_FORMULA = "robust-z-clip";
const EXPECTED_NORMALIZATION_VERSION = "1";

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateConfig(config: unknown): asserts config is DetectorConfig {
  if (typeof config !== "object" || config === null) {
    throw new Error("Detector config: expected a JSON object.");
  }
  const c = config as Record<string, unknown>;

  // schemaVersion
  if (typeof c.schemaVersion !== "string" || c.schemaVersion.trim() === "") {
    throw new Error("Detector config: schemaVersion must be a non-empty string.");
  }

  // weights
  if (typeof c.weights !== "object" || c.weights === null) {
    throw new Error("Detector config: weights must be an object.");
  }
  const w = c.weights as Record<string, unknown>;
  const weightKeys = ["mad", "isolationForest", "autoencoder"] as const;
  for (const key of weightKeys) {
    const v = w[key];
    if (typeof v !== "number" || !isFinite(v) || v < 0) {
      throw new Error(
        `Detector config: weights.${key} must be a finite non-negative number (got ${v}).`,
      );
    }
  }
  const weightSum =
    (w.mad as number) +
    (w.isolationForest as number) +
    (w.autoencoder as number);
  if (Math.abs(weightSum - 1) > 1e-9) {
    throw new Error(
      `Detector config: weights must sum to 1 within 1e-9 (sum=${weightSum}).`,
    );
  }

  // alertThreshold
  if (
    typeof c.alertThreshold !== "number" ||
    !isFinite(c.alertThreshold) ||
    c.alertThreshold < 0 ||
    c.alertThreshold > 1
  ) {
    throw new Error(
      `Detector config: alertThreshold must be in [0, 1] (got ${c.alertThreshold}).`,
    );
  }

  // persistence
  if (typeof c.persistence !== "object" || c.persistence === null) {
    throw new Error("Detector config: persistence must be an object.");
  }
  const p = c.persistence as Record<string, unknown>;
  if (typeof p.window !== "number" || !Number.isInteger(p.window) || p.window < 1) {
    throw new Error(
      `Detector config: persistence.window must be a positive integer (got ${p.window}).`,
    );
  }
  if (
    typeof p.requiredCount !== "number" ||
    !Number.isInteger(p.requiredCount) ||
    p.requiredCount < 1
  ) {
    throw new Error(
      `Detector config: persistence.requiredCount must be a positive integer (got ${p.requiredCount}).`,
    );
  }
  if ((p.requiredCount as number) > (p.window as number)) {
    throw new Error(
      `Detector config: persistence.requiredCount (${p.requiredCount}) must not exceed persistence.window (${p.window}).`,
    );
  }

  // normalization
  if (typeof c.normalization !== "object" || c.normalization === null) {
    throw new Error("Detector config: normalization must be an object.");
  }
  const n = c.normalization as Record<string, unknown>;
  if (n.formula !== EXPECTED_NORMALIZATION_FORMULA) {
    throw new Error(
      `Detector config: normalization.formula "${n.formula}" does not match implementation "${EXPECTED_NORMALIZATION_FORMULA}".`,
    );
  }
  if (n.version !== EXPECTED_NORMALIZATION_VERSION) {
    throw new Error(
      `Detector config: normalization.version "${n.version}" does not match implementation "${EXPECTED_NORMALIZATION_VERSION}".`,
    );
  }
  const numericNormalizationFields = [
    ["deadBand", 0, 10],
    ["scale", 1e-6, 100],
    ["madMultiplier", 1, 2],
    ["minScale", 0, 1],
  ] as const;
  for (const [key, min, max] of numericNormalizationFields) {
    const value = n[key];
    if (typeof value !== "number" || !isFinite(value) || value < min || value > max) {
      throw new Error(
        `Detector config: normalization.${key} must be a finite number in [${min}, ${max}] (got ${value}).`,
      );
    }
  }

  // provenance (required)
  if (typeof c.provenance !== "object" || c.provenance === null) {
    throw new Error("Detector config: provenance must be an object.");
  }
  const prov = c.provenance as Record<string, unknown>;
  for (const key of ["source", "weightsSource", "thresholdSource", "generatedBy", "replacedBy"]) {
    if (typeof prov[key] !== "string" || (prov[key] as string).trim() === "") {
      throw new Error(`Detector config: provenance.${key} must be a non-empty string.`);
    }
  }
}

// ─── Load and validate ───────────────────────────────────────────────────────

validateConfig(rawConfig);

/** The validated, deployment-safe detector configuration. */
export const detectorConfig: DetectorConfig = rawConfig as DetectorConfig;
