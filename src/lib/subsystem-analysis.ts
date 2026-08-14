import type { Scenario } from "@/lib/types";

export interface ChannelImpact {
  channelId: string;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  baseline: number;
  peakValue: number;
  signedDelta: number;
  peakTimestamp: number;
  recoveryPercent: number;
  recoveryState: "RECOVERED" | "RESIDUAL";
}

export interface SubsystemImpact {
  subsystem: string;
  channels: ChannelImpact[];
}

function mean(values: number[]): number {
  if (values.length === 0) throw new Error("Cannot calculate a mean from no values.");
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number, precision = 4): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function buildSubsystemImpacts(scenario: Scenario): SubsystemImpact[] {
  const [eventStart, eventEnd] = scenario.eventWindow;
  const baselineSamples = scenario.telemetry.filter(
    (sample) => sample.timestamp < eventStart,
  );
  const eventAndRecoverySamples = scenario.telemetry.filter(
    (sample) => sample.timestamp >= eventStart && sample.timestamp <= eventEnd + 7,
  );
  const recoverySamples = scenario.telemetry.slice(-6);

  if (baselineSamples.length === 0 || eventAndRecoverySamples.length === 0) {
    throw new Error("Scenario does not contain the baseline and event samples required for impact analysis.");
  }

  const channelImpacts = scenario.channels.map((channel): ChannelImpact => {
    const baseline = mean(
      baselineSamples.map((sample) => sample.values[channel.id]),
    );
    const peakSample = eventAndRecoverySamples.reduce((currentPeak, sample) =>
      Math.abs(sample.values[channel.id] - baseline) >
      Math.abs(currentPeak.values[channel.id] - baseline)
        ? sample
        : currentPeak,
    );
    const peakValue = peakSample.values[channel.id];
    const signedDelta = peakValue - baseline;
    const recoveredValue = mean(
      recoverySamples.map((sample) => sample.values[channel.id]),
    );
    const peakMagnitude = Math.abs(signedDelta);
    const recoveryPercent =
      peakMagnitude === 0
        ? 100
        : Math.max(
            0,
            Math.min(100, (1 - Math.abs(recoveredValue - baseline) / peakMagnitude) * 100),
          );

    return {
      channelId: channel.id,
      label: channel.label,
      shortLabel: channel.shortLabel,
      unit: channel.unit,
      color: channel.color,
      baseline: round(baseline),
      peakValue: round(peakValue),
      signedDelta: round(signedDelta),
      peakTimestamp: peakSample.timestamp,
      recoveryPercent: round(recoveryPercent, 1),
      recoveryState: recoveryPercent >= 80 ? "RECOVERED" : "RESIDUAL",
    };
  });

  const groups = new Map<string, ChannelImpact[]>();
  for (const impact of channelImpacts) {
    const subsystem = scenario.channels.find(
      (channel) => channel.id === impact.channelId,
    )?.subsystem;
    if (!subsystem) continue;
    groups.set(subsystem, [...(groups.get(subsystem) ?? []), impact]);
  }

  return [...groups.entries()].map(([subsystem, channelGroup]) => ({
    subsystem,
    channels: channelGroup,
  }));
}
