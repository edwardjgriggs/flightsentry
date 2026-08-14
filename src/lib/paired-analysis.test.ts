import { describe, expect, it } from "vitest";

import { comparePairedSignalShape } from "@/lib/paired-analysis";
import { getScenario } from "@/lib/scenarios";

describe("paired signal analysis", () => {
  it("quantifies the paired fixture across every shared channel", () => {
    const comparison = comparePairedSignalShape(
      getScenario("esa-m2-609"),
      getScenario("esa-m2-618"),
    );

    expect(comparison.channelCount).toBe(4);
    expect(comparison.similarity).toBeGreaterThan(0.9);
    expect(comparison.window).toEqual([46, 68]);
  });

  it("returns zero when no channels are shared", () => {
    const left = structuredClone(getScenario("esa-m2-609"));
    const right = structuredClone(getScenario("esa-m2-618"));
    right.channels = right.channels.map((channel) => ({
      ...channel,
      id: `other-${channel.id}`,
    }));

    expect(comparePairedSignalShape(left, right).similarity).toBe(0);
  });
});
