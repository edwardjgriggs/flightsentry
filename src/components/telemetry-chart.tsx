"use client";

import { useEffect, useRef } from "react";
import uPlot from "uplot";

import type { ChannelDefinition, TelemetrySample } from "@/lib/types";

interface TelemetryChartProps {
  channels: ChannelDefinition[];
  samples: TelemetrySample[];
}

export function TelemetryChart({ channels, samples }: TelemetryChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || samples.length < 2) return;
    let plot: uPlot | undefined;

    const render = () => {
      plot?.destroy();
      const width = Math.max(host.clientWidth, 280);
      const timestamps = samples.map((sample) => sample.timestamp);
      const data: uPlot.AlignedData = [
        timestamps,
        ...channels.map((channel) => samples.map((sample) => sample.values[channel.id])),
      ];
      plot = new uPlot(
        {
          width,
          height: 190,
          cursor: { show: true, drag: { x: false, y: false } },
          legend: { show: false },
          axes: [
            {
              stroke: "#647471",
              grid: { stroke: "rgba(90, 115, 110, .12)", width: 1 },
              ticks: { stroke: "rgba(90, 115, 110, .22)", width: 1 },
              size: 26,
              font: "10px IBM Plex Mono",
            },
            { show: false },
          ],
          scales: { x: { time: false } },
          series: [
            {},
            ...channels.map((channel) => ({
              label: channel.shortLabel,
              stroke: channel.color,
              width: 1.4,
              points: { show: false },
            })),
          ],
        },
        data,
        host,
      );
    };

    render();
    const resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(host);
    return () => {
      resizeObserver.disconnect();
      plot?.destroy();
    };
  }, [channels, samples]);

  return <div ref={hostRef} className="min-h-[190px] w-full" aria-hidden="true" />;
}
