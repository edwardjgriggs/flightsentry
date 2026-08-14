import { describe, expect, it } from "vitest";

import { getScenario } from "@/lib/scenarios";
import { buildSubsystemImpacts } from "@/lib/subsystem-analysis";

describe("subsystem impact analysis", () => {
  it("maps every telemetry channel into its spacecraft subsystem", () => {
    const impacts = buildSubsystemImpacts(getScenario("esa-m2-609"));

    expect(impacts.map((impact) => impact.subsystem)).toEqual([
      "Electrical power",
      "Attitude control",
      "Thermal control",
    ]);
    expect(impacts.flatMap((impact) => impact.channels)).toHaveLength(4);
    expect(impacts.find((impact) => impact.subsystem === "Attitude control")?.channels).toHaveLength(2);
  });

  it("reports signed peak deltas and fixture recovery without inventing a severity score", () => {
    const impacts = buildSubsystemImpacts(getScenario("esa-m2-609"));
    const channels = impacts.flatMap((impact) => impact.channels);
    const busVoltage = channels.find((channel) => channel.channelId === "eps_bus_voltage");
    const wheelCurrent = channels.find((channel) => channel.channelId === "aocs_wheel_current");

    expect(busVoltage?.signedDelta).toBeLessThan(0);
    expect(wheelCurrent?.signedDelta).toBeGreaterThan(0);
    expect(channels.every((channel) => channel.recoveryPercent >= 80)).toBe(true);
  });

  it("preserves the larger attitude excursion in the uncommanded anomaly", () => {
    const event609 = buildSubsystemImpacts(getScenario("esa-m2-609"))
      .flatMap((impact) => impact.channels)
      .find((channel) => channel.channelId === "aocs_attitude_error");
    const event618 = buildSubsystemImpacts(getScenario("esa-m2-618"))
      .flatMap((impact) => impact.channels)
      .find((channel) => channel.channelId === "aocs_attitude_error");

    expect(Math.abs(event618?.signedDelta ?? 0)).toBeGreaterThan(
      Math.abs(event609?.signedDelta ?? 0),
    );
  });
});
