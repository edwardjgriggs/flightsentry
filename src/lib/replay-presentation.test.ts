import { describe, expect, it } from "vitest";

import { getLatchedDetectorFrame } from "@/lib/replay-presentation";
import type { DetectorFrame } from "@/lib/types";

function frame(
  timestamp: number,
  scores: Pick<DetectorFrame, "mad" | "isolationForest" | "autoencoder" | "fused">,
  alert = false,
): DetectorFrame {
  return {
    timestamp,
    ...scores,
    alert,
    contributors: [`channel-${timestamp}`],
  };
}

describe("completed replay presentation", () => {
  it("latches each detector peak and a historical persistent alert", () => {
    const frames = [
      frame(50, { mad: 0.95, isolationForest: 0.62, autoencoder: 0.7, fused: 0.77 }),
      frame(52, { mad: 0.82, isolationForest: 0.88, autoencoder: 1, fused: 0.93 }, true),
      frame(83, { mad: 0, isolationForest: 0, autoencoder: 0, fused: 0 }),
    ];

    expect(getLatchedDetectorFrame(frames)).toEqual({
      timestamp: 52,
      mad: 0.95,
      isolationForest: 0.88,
      autoencoder: 1,
      fused: 0.93,
      alert: true,
      contributors: ["channel-52"],
    });
  });

  it("does not invent an event when persistence never fired", () => {
    const result = getLatchedDetectorFrame([
      frame(10, { mad: 0.2, isolationForest: 0.1, autoencoder: 0.3, fused: 0.21 }),
      frame(11, { mad: 0.1, isolationForest: 0.2, autoencoder: 0.25, fused: 0.2 }),
    ]);

    expect(result.alert).toBe(false);
    expect(result.timestamp).toBe(10);
  });

  it("rejects an empty replay", () => {
    expect(() => getLatchedDetectorFrame([])).toThrow(/empty detector replay/i);
  });
});
