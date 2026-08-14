import { detectorConfig } from "@/lib/detector-config";
import type { DetectorFrame, Scenario, TelemetrySample } from "@/lib/types";

export const BASELINE_END = 36;
const ROLLING_WINDOW = 10;

// All tuning values come from the versioned config artifact.
// Modifying these values must be done in public/models/detector-config.json.
const ENSEMBLE_THRESHOLD = detectorConfig.alertThreshold;
const PERSISTENCE_WINDOW = detectorConfig.persistence.window;
const PERSISTENCE_REQUIRED = detectorConfig.persistence.requiredCount;
const WEIGHTS = {
  mad: detectorConfig.weights.mad,
  isolationForest: detectorConfig.weights.isolationForest,
  autoencoder: detectorConfig.weights.autoencoder,
} as const;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function standardDeviation(values: number[], average = mean(values)): number {
  return Math.sqrt(
    mean(values.map((value) => Math.pow(value - average, 2))),
  );
}

/**
 * Normalize a raw detector score to [0, 1].
 *
 * Formula: clip((z - 1.5) / 7, 0, 1)
 * where z = (score - median(calibration)) / (MAD(calibration) * 1.4826)
 *
 * The dead-band, range divisor, and MAD multiplier are read from
 * public/models/detector-config.json (normalization.deadBand, .scale, and
 * .madMultiplier). validateConfig() rejects an artifact whose formula/version
 * identifiers differ from this implementation or whose numeric normalization
 * fields are non-finite or out of range at module-load time.
 */
export function robustNormalize(score: number, baseline: number[]): number {
  const center = median(baseline);
  const deviations = baseline.map((value) => Math.abs(value - center));
  const scale = Math.max(
    median(deviations) * detectorConfig.normalization.madMultiplier,
    detectorConfig.normalization.minScale,
  );
  const z = (score - center) / scale;
  return Math.max(
    0,
    Math.min(
      1,
      (z - detectorConfig.normalization.deadBand) / detectorConfig.normalization.scale,
    ),
  );
}

function madScores(scenario: Scenario): number[] {
  const ids = scenario.channels.map((channel) => channel.id);

  return scenario.telemetry.map((sample, index) => {
    if (index < ROLLING_WINDOW) return 0;
    const history = scenario.telemetry.slice(index - ROLLING_WINDOW, index);

    return Math.max(
      ...ids.map((id) => {
        const values = history.map((item) => item.values[id]);
        const center = median(values);
        // Rolling-window guards, independent of the calibration artifact: the
        // 0.25-sigma floor and 1e-6 epsilon keep a locally flat window from
        // exploding the score. Only the MAD consistency factor is shared with
        // the artifact's normalization block.
        const scale = Math.max(
          median(values.map((value) => Math.abs(value - center))) *
            detectorConfig.normalization.madMultiplier,
          standardDeviation(values) * 0.25,
          1e-6,
        );
        return Math.abs(sample.values[id] - center) / scale;
      }),
    );
  });
}

interface IsolationNode {
  size: number;
  feature?: number;
  split?: number;
  left?: IsolationNode;
  right?: IsolationNode;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function averagePathLength(size: number): number {
  if (size <= 1) return 0;
  if (size === 2) return 1;
  const harmonicApproximation = Math.log(size - 1) + 0.5772156649;
  return 2 * harmonicApproximation - (2 * (size - 1)) / size;
}

function buildIsolationTree(
  rows: number[][],
  depth: number,
  maxDepth: number,
  random: () => number,
): IsolationNode {
  if (rows.length <= 1 || depth >= maxDepth) return { size: rows.length };

  const candidates = rows[0]
    .map((_, feature) => {
      const values = rows.map((row) => row[feature]);
      return { feature, min: Math.min(...values), max: Math.max(...values) };
    })
    .filter((candidate) => candidate.max > candidate.min);

  if (candidates.length === 0) return { size: rows.length };
  const selected = candidates[Math.floor(random() * candidates.length)];
  const split = selected.min + random() * (selected.max - selected.min);
  const leftRows = rows.filter((row) => row[selected.feature] < split);
  const rightRows = rows.filter((row) => row[selected.feature] >= split);
  if (leftRows.length === 0 || rightRows.length === 0) return { size: rows.length };

  return {
    size: rows.length,
    feature: selected.feature,
    split,
    left: buildIsolationTree(leftRows, depth + 1, maxDepth, random),
    right: buildIsolationTree(rightRows, depth + 1, maxDepth, random),
  };
}

function isolationPath(row: number[], node: IsolationNode, depth = 0): number {
  if (
    node.feature === undefined ||
    node.split === undefined ||
    !node.left ||
    !node.right
  ) {
    return depth + averagePathLength(node.size);
  }
  return row[node.feature] < node.split
    ? isolationPath(row, node.left, depth + 1)
    : isolationPath(row, node.right, depth + 1);
}

/**
 * Per-channel baseline mean and standard-deviation scale over the first
 * BASELINE_END samples. Shared with the ONNX input path so browser inference
 * and the TypeScript fallback normalize identically.
 */
export function channelBaselineStats(
  scenario: Scenario,
): Array<{ average: number; scale: number }> {
  const baseline = scenario.telemetry.slice(0, BASELINE_END);
  return scenario.channels.map((channel) => {
    const values = baseline.map((sample) => sample.values[channel.id]);
    const average = mean(values);
    return { average, scale: Math.max(standardDeviation(values, average), 1e-6) };
  });
}

function normalizedRows(scenario: Scenario): number[][] {
  const ids = scenario.channels.map((channel) => channel.id);
  const stats = channelBaselineStats(scenario);

  return scenario.telemetry.map((sample, index) =>
    ids.flatMap((id, channelIndex) => {
      const current = (sample.values[id] - stats[channelIndex].average) / stats[channelIndex].scale;
      const previous =
        index === 0
          ? current
          : (scenario.telemetry[index - 1].values[id] - stats[channelIndex].average) /
            stats[channelIndex].scale;
      return [current, current - previous];
    }),
  );
}

function isolationForestScores(rows: number[][]): number[] {
  const sampleSize = Math.min(28, BASELINE_END);
  const random = seededRandom(609618);
  const trees = Array.from({ length: 48 }, () => {
    const shuffled = [...rows.slice(0, BASELINE_END)].sort(() => random() - 0.5);
    return buildIsolationTree(
      shuffled.slice(0, sampleSize),
      0,
      Math.ceil(Math.log2(sampleSize)),
      random,
    );
  });
  const normalizer = averagePathLength(sampleSize);
  return rows.map((row) => {
    const path = mean(trees.map((tree) => isolationPath(row, tree)));
    return Math.pow(2, -path / normalizer);
  });
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function topPrincipalComponents(rows: number[][], count: number): number[][] {
  const dimensions = rows[0].length;
  const covariance = Array.from({ length: dimensions }, (_, row) =>
    Array.from({ length: dimensions }, (_, column) =>
      mean(rows.map((values) => values[row] * values[column])),
    ),
  );
  const components: number[][] = [];

  for (let component = 0; component < count; component += 1) {
    let vector = Array.from(
      { length: dimensions },
      (_, index) => 1 / (index + component + 1),
    );
    for (let iteration = 0; iteration < 40; iteration += 1) {
      let next = covariance.map((row) => dot(row, vector));
      for (const prior of components) {
        const projection = dot(next, prior);
        next = next.map((value, index) => value - projection * prior[index]);
      }
      const magnitude = Math.sqrt(dot(next, next)) || 1;
      vector = next.map((value) => value / magnitude);
    }
    components.push(vector);
  }
  return components;
}

function autoencoderScores(rows: number[][]): number[] {
  const baseline = rows.slice(0, BASELINE_END).map((row) =>
    row.filter((_, index) => index % 2 === 0),
  );
  const components = topPrincipalComponents(baseline, 2);

  return rows.map((row) => {
    const input = row.filter((_, index) => index % 2 === 0);
    const reconstruction = input.map((_, dimension) =>
      components.reduce(
        (sum, component) => sum + dot(input, component) * component[dimension],
        0,
      ),
    );
    return mean(
      input.map((value, index) => Math.pow(value - reconstruction[index], 2)),
    );
  });
}

function channelContributors(
  sample: TelemetrySample,
  scenario: Scenario,
): string[] {
  const baseline = scenario.telemetry.slice(0, BASELINE_END);
  return scenario.channels
    .map((channel) => {
      const values = baseline.map((item) => item.values[channel.id]);
      const average = mean(values);
      const scale = Math.max(standardDeviation(values, average), 1e-6);
      return {
        id: channel.id,
        deviation: Math.abs(sample.values[channel.id] - average) / scale,
      };
    })
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, 2)
    .map((item) => item.id);
}

function applyPersistence(frames: DetectorFrame[]): DetectorFrame[] {
  return frames.map((frame, index) => {
    const windowStart = Math.max(0, index - (PERSISTENCE_WINDOW - 1));
    const recent = frames.slice(windowStart, index + 1);
    return {
      ...frame,
      alert:
        recent.filter((item) => item.fused >= ENSEMBLE_THRESHOLD).length >=
        PERSISTENCE_REQUIRED,
    };
  });
}

export function runDetectorEnsemble(scenario: Scenario): DetectorFrame[] {
  const madRaw = madScores(scenario);
  const rows = normalizedRows(scenario);
  const isolationRaw = isolationForestScores(rows);
  const autoencoderRaw = autoencoderScores(rows);
  const calibrationRange = (values: number[]) => values.slice(ROLLING_WINDOW, BASELINE_END);

  const frames = scenario.telemetry.map((sample, index) => {
    const mad = robustNormalize(madRaw[index], calibrationRange(madRaw));
    const isolationForest = robustNormalize(
      isolationRaw[index],
      calibrationRange(isolationRaw),
    );
    const autoencoder = robustNormalize(
      autoencoderRaw[index],
      calibrationRange(autoencoderRaw),
    );
    return {
      timestamp: sample.timestamp,
      mad,
      isolationForest,
      autoencoder,
      fused:
        mad * WEIGHTS.mad +
        isolationForest * WEIGHTS.isolationForest +
        autoencoder * WEIGHTS.autoencoder,
      alert: false,
      contributors: channelContributors(sample, scenario),
    };
  });

  return applyPersistence(frames);
}

export function replaceAutoencoderScores(
  frames: DetectorFrame[],
  normalizedScores: number[],
): DetectorFrame[] {
  if (frames.length !== normalizedScores.length) {
    throw new Error("ONNX score frame count does not match detector frames.");
  }

  const updated = frames.map((frame, index) => {
    const autoencoder = Math.max(0, Math.min(1, normalizedScores[index]));
    return {
      ...frame,
      autoencoder,
      fused:
        frame.mad * WEIGHTS.mad +
        frame.isolationForest * WEIGHTS.isolationForest +
        autoencoder * WEIGHTS.autoencoder,
      alert: false,
    };
  });

  return applyPersistence(updated);
}

export function normalizeAutoencoderScores(rawScores: number[]): number[] {
  const calibration = rawScores.slice(ROLLING_WINDOW, BASELINE_END);
  return rawScores.map((score) => robustNormalize(score, calibration));
}

export const detectorConfiguration = {
  baselineSamples: BASELINE_END,
  rollingWindow: ROLLING_WINDOW,
  threshold: ENSEMBLE_THRESHOLD,
  persistence: `${PERSISTENCE_REQUIRED} of ${PERSISTENCE_WINDOW} windows`,
  weights: WEIGHTS,
  configProfile: detectorConfig.configProfile,
  scope: detectorConfig.scope,
  provenance: detectorConfig.provenance,
} as const;
