import type { Scenario } from "@/lib/types";

export interface PairedSignalComparison {
  channelCount: number;
  similarity: number;
  window: [number, number];
}

function pearsonCorrelation(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftMean = left.reduce((total, value) => total + value, 0) / left.length;
  const rightMean = right.reduce((total, value) => total + value, 0) / right.length;
  let numerator = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftMagnitude += leftDelta * leftDelta;
    rightMagnitude += rightDelta * rightDelta;
  }

  const denominator = Math.sqrt(leftMagnitude * rightMagnitude);
  if (denominator === 0) {
    return left.every((value, index) => value === right[index]) ? 1 : 0;
  }
  return Math.max(-1, Math.min(1, numerator / denominator));
}

export function comparePairedSignalShape(
  left: Scenario,
  right: Scenario,
): PairedSignalComparison {
  const start = Math.max(
    0,
    Math.min(left.eventWindow[0], right.eventWindow[0]) - 4,
  );
  const finalTimestamp = Math.min(
    left.telemetry.at(-1)?.timestamp ?? 0,
    right.telemetry.at(-1)?.timestamp ?? 0,
  );
  const end = Math.min(
    finalTimestamp,
    Math.max(left.eventWindow[1], right.eventWindow[1]) + 7,
  );
  const rightSamples = new Map(
    right.telemetry.map((sample) => [sample.timestamp, sample]),
  );
  const commonChannels = left.channels
    .map((channel) => channel.id)
    .filter((channelId) => right.channels.some((channel) => channel.id === channelId));

  const correlations = commonChannels.flatMap((channelId) => {
    const pairs = left.telemetry
      .filter((sample) => sample.timestamp >= start && sample.timestamp <= end)
      .flatMap((sample) => {
        const counterpart = rightSamples.get(sample.timestamp);
        return counterpart
          ? [[sample.values[channelId], counterpart.values[channelId]] as const]
          : [];
      });
    if (pairs.length < 2) return [];
    return [
      pearsonCorrelation(
        pairs.map(([value]) => value),
        pairs.map(([, value]) => value),
      ),
    ];
  });

  const similarity = correlations.length === 0
    ? 0
    : correlations.reduce((total, value) => total + Math.max(0, value), 0) /
      correlations.length;

  return {
    channelCount: correlations.length,
    similarity,
    window: [start, end],
  };
}
