import * as ort from "onnxruntime-web/wasm";

import { normalizeAutoencoderScores } from "@/lib/detectors";
import type { Scenario } from "@/lib/types";

let sessionPromise: Promise<ort.InferenceSession> | undefined;
let inferenceQueue: Promise<void> = Promise.resolve();

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], average: number): number {
  return Math.sqrt(
    values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
      values.length,
  );
}

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    sessionPromise = ort.InferenceSession.create(
      "/models/flightsentry-autoencoder.onnx",
      { executionProviders: ["wasm"] },
    );
  }
  return sessionPromise;
}

export async function runOnnxAutoencoder(scenario: Scenario): Promise<number[]> {
  const session = await getSession();
  const channelIds = scenario.channels.map((channel) => channel.id);
  const baseline = scenario.telemetry.slice(0, 36);
  const stats = channelIds.map((id) => {
    const values = baseline.map((sample) => sample.values[id]);
    const average = mean(values);
    return {
      average,
      scale: Math.max(standardDeviation(values, average), 1e-6),
    };
  });
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
