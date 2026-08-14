import { useMemo } from "react";

import type { ChannelDefinition, TelemetrySample } from "@/lib/types";

export type ChartPhase = "idle" | "live" | "complete";

interface TelemetryChartProps {
  channels: ChannelDefinition[];
  telemetry: TelemetrySample[];
  progress: number;
  phase: ChartPhase;
  /** Timestamps where the fused persistent alert was active, detector-derived. */
  alertTimestamps: number[];
  firstAlert: number | null;
}

const IDLE_PREVIEW_SAMPLES = 40;
const STRIP_PADDING_RATIO = 0.1;

interface StripScale {
  min: number;
  max: number;
}

function stripScale(values: number[]): StripScale {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * STRIP_PADDING_RATIO, 1e-9);
  return { min: min - pad, max: max + pad };
}

function tracePath(
  telemetry: TelemetrySample[],
  channelId: string,
  scale: StripScale,
  lastIndex: number,
  totalSamples: number,
): string {
  const span = scale.max - scale.min;
  const points: string[] = [];
  for (let index = 0; index <= lastIndex; index += 1) {
    const x = (index / (totalSamples - 1)) * 100;
    const value = telemetry[index].values[channelId];
    const y = 100 - ((value - scale.min) / span) * 100;
    points.push(`${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join(" ");
}

function alertRanges(timestamps: number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const timestamp of timestamps) {
    const current = ranges[ranges.length - 1];
    if (current && timestamp === current[1] + 1) {
      current[1] = timestamp;
    } else {
      ranges.push([timestamp, timestamp]);
    }
  }
  return ranges;
}

function formatValue(value: number, unit: string): string {
  return `${value.toFixed(unit === "deg" ? 3 : 2)} ${unit}`;
}

export function TelemetryChart({
  channels,
  telemetry,
  progress,
  phase,
  alertTimestamps,
  firstAlert,
}: TelemetryChartProps) {
  const totalSamples = telemetry.length;
  const lastIndex =
    phase === "idle"
      ? Math.min(IDLE_PREVIEW_SAMPLES, totalSamples) - 1
      : phase === "complete"
        ? totalSamples - 1
        : Math.min(progress, totalSamples - 1);
  const currentSample = telemetry[Math.min(progress, totalSamples - 1)];

  const scales = useMemo(
    () =>
      Object.fromEntries(
        channels.map((channel) => [
          channel.id,
          stripScale(telemetry.map((sample) => sample.values[channel.id])),
        ]),
      ) as Record<string, StripScale>,
    [channels, telemetry],
  );

  const shading = useMemo(() => alertRanges(alertTimestamps), [alertTimestamps]);

  const alertX = firstAlert === null ? null : (firstAlert / (totalSamples - 1)) * 100;
  const showAlertMarker =
    firstAlert !== null && (phase === "complete" || firstAlert <= progress);

  const summary = useMemo(() => {
    const names = channels.map((channel) => channel.label.toLowerCase()).join(", ");
    // Only describe the alert once the replay has actually reached it; the
    // summary must never leak future replay state.
    const alertText =
      phase === "idle"
        ? `Standby preview of the first ${Math.min(IDLE_PREVIEW_SAMPLES, totalSamples)} baseline samples.`
        : showAlertMarker && firstAlert !== null
          ? `The fused detector alert became persistent at sample T+${firstAlert}.`
          : "No persistent fused-score exceedance so far.";
    return `Strip charts of ${channels.length} telemetry channels (${names}) across ${totalSamples} replay samples. Each channel is drawn on its own fixed scale. ${alertText}`;
  }, [channels, firstAlert, phase, showAlertMarker, totalSamples]);

  return (
    <div className="telemetry-strips">
      <p className="sr-only">{summary}</p>
      {channels.map((channel) => {
        const scale = scales[channel.id];
        return (
          <div key={channel.id} className="strip-row" data-phase={phase}>
            <div className="strip-gutter">
              <span className="kicker text-[var(--muted)]" title={channel.label}>
                {channel.shortLabel}
              </span>
              <span className="mono text-xs text-[var(--ink)]">
                {phase === "idle" ? "STANDBY" : formatValue(currentSample.values[channel.id], channel.unit)}
              </span>
            </div>
            <div className="strip-plot">
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="strip-svg"
              >
                {phase !== "idle" &&
                  shading.map(([start, end]) => (
                    <rect
                      key={`${start}-${end}`}
                      x={(start / (totalSamples - 1)) * 100}
                      y={0}
                      width={Math.max(((end - start) / (totalSamples - 1)) * 100, 0.6)}
                      height={100}
                      className="strip-alert-band"
                    />
                  ))}
                <path
                  d={tracePath(telemetry, channel.id, scale, lastIndex, totalSamples)}
                  className="strip-trace"
                  vectorEffect="non-scaling-stroke"
                />
                {showAlertMarker && alertX !== null && (
                  <line
                    x1={alertX}
                    x2={alertX}
                    y1={0}
                    y2={100}
                    className="strip-alert-line"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              <span className="strip-range strip-range-max mono">
                {scale.max.toFixed(channel.unit === "deg" ? 3 : 1)}
              </span>
              <span className="strip-range strip-range-min mono">
                {scale.min.toFixed(channel.unit === "deg" ? 3 : 1)}
              </span>
            </div>
          </div>
        );
      })}
      <div className="strip-axis">
        <span className="mono">T+000</span>
        {showAlertMarker && firstAlert !== null ? (
          <span className="mono text-[var(--amber)]">ALERT T+{String(firstAlert).padStart(3, "0")}</span>
        ) : (
          <span className="mono text-[var(--faint)]">
            {phase === "idle" ? "standby preview" : "sample index"}
          </span>
        )}
        <span className="mono">T+{String(totalSamples - 1).padStart(3, "0")}</span>
      </div>
    </div>
  );
}
