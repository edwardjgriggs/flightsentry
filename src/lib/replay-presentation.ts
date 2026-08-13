import type { DetectorFrame } from "@/lib/types";

/**
 * Build the completed-replay presentation state without changing detector
 * outputs. Each score is its observed replay maximum, while the alert remains
 * latched if temporal persistence fired at any point in the replay.
 */
export function getLatchedDetectorFrame(frames: DetectorFrame[]): DetectorFrame {
  if (frames.length === 0) {
    throw new Error("Cannot summarize an empty detector replay.");
  }

  const peakFusedFrame = frames.reduce((peak, frame) =>
    frame.fused > peak.fused ? frame : peak,
  );
  const firstAlert = frames.find((frame) => frame.alert);

  return {
    timestamp: firstAlert?.timestamp ?? peakFusedFrame.timestamp,
    mad: Math.max(...frames.map((frame) => frame.mad)),
    isolationForest: Math.max(
      ...frames.map((frame) => frame.isolationForest),
    ),
    autoencoder: Math.max(...frames.map((frame) => frame.autoencoder)),
    fused: peakFusedFrame.fused,
    alert: firstAlert !== undefined,
    contributors: [...peakFusedFrame.contributors],
  };
}
