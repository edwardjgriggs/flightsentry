import * as ort from "onnxruntime-web/wasm";

import {
  channelBaselineStats,
  normalizeAutoencoderScores,
} from "@/lib/detectors";
import type { Scenario } from "@/lib/types";

let sessionPromise: Promise<ort.InferenceSession> | undefined;
let inferenceQueue: Promise<void> = Promise.resolve();

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    sessionPromise = ort.InferenceSession.create(
      "/models/flightsentry-autoencoder.onnx",
      { executionProviders: ["wasm"] },
    );
    // A transient failure (network blip during wasm fetch) must not poison
    // every later attempt; clear the cached promise so the next call retries.
    sessionPromise.catch(() => {
      sessionPromise = undefined;
    });
  }
  return sessionPromise;
}

export async function runOnnxAutoencoder(scenario: Scenario): Promise<number[]> {
  const session = await getSession();
  const channelIds = scenario.channels.map((channel) => channel.id);
  // Shared with the TypeScript detector path so ONNX inference and the PCA
  // fallback normalize inputs identically.
  const stats = channelBaselineStats(scenario);
  const normalized = scenario.telemetry.flatMap((sample) =>
    channelIds.map(
      (id, index) => (sample.values[id] - stats[index].average) / stats[index].scale,
    ),
  );
  const input = new ort.Tensor(
    "float32",
    Float32Array.from(normalized),
    [scenario.telemetry.length, channelIds.length],
  );
  const queuedRun = inferenceQueue.then(() => session.run({ input }));
  inferenceQueue = queuedRun.then(
    () => undefined,
    () => undefined,
  );
  const results = await queuedRun;
  const reconstruction = results.reconstruction;
  if (!reconstruction) throw new Error("ONNX model returned no reconstruction output.");
  const values = Array.from(reconstruction.data as Float32Array);
  const rawScores = scenario.telemetry.map((_, row) => {
    let squaredError = 0;
    for (let column = 0; column < channelIds.length; column += 1) {
      const index = row * channelIds.length + column;
      squaredError += Math.pow(normalized[index] - values[index], 2);
    }
    return squaredError / channelIds.length;
  });
  return normalizeAutoencoderScores(rawScores);
}
