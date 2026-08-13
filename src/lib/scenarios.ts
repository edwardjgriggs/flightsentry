import type {
  ChannelDefinition,
  EvidenceItem,
  IncidentBrief,
  Scenario,
  ScenarioId,
  TelemetrySample,
} from "@/lib/types";

const SOURCE_URL = "https://openreview.net/pdf?id=bbpRMoatVO";

const channels: ChannelDefinition[] = [
  {
    id: "eps_bus_voltage",
    label: "Primary bus voltage",
    shortLabel: "BUS V",
    unit: "V",
    subsystem: "Electrical power",
    color: "#66f2c2",
  },
  {
    id: "aocs_wheel_current",
    label: "Reaction wheel current",
    shortLabel: "RW CURR",
    unit: "A",
    subsystem: "Attitude control",
    color: "#ffcb66",
  },
  {
    id: "thermal_panel_temp",
    label: "Equipment panel temperature",
    shortLabel: "PANEL T",
    unit: "°C",
    subsystem: "Thermal control",
    color: "#ff7a7a",
  },
  {
    id: "aocs_attitude_error",
    label: "Attitude error",
    shortLabel: "ATT ERR",
    unit: "deg",
    subsystem: "Attitude control",
    color: "#82aaff",
  },
];

function noise(index: number, offset: number): number {
  return (
    Math.sin(index * 1.73 + offset) * 0.55 +
    Math.cos(index * 0.41 + offset * 1.7) * 0.45
  );
}

function makeTelemetry(eventId: 609 | 618): TelemetrySample[] {
  return Array.from({ length: 84 }, (_, timestamp) => {
    const inEvent = timestamp >= 50 && timestamp <= 61;
    const tail = timestamp > 61 && timestamp <= 68;
    const eventStep = inEvent ? Math.min(1, (timestamp - 49) / 4) : 0;
    const recovery = tail ? Math.max(0, 1 - (timestamp - 61) / 7) : 0;
    const magnitude = eventId === 609 ? eventStep : eventStep * 1.15;
    const residual = eventId === 618 ? recovery : recovery * 0.18;

    return {
      timestamp,
      values: {
        eps_bus_voltage:
          27.82 + 0.055 * noise(timestamp, 1) - 0.76 * magnitude - 0.31 * residual,
        aocs_wheel_current:
          0.84 + 0.035 * noise(timestamp, 2) + 2.32 * magnitude + 0.56 * residual,
        thermal_panel_temp:
          18.45 + 0.11 * noise(timestamp, 3) + 1.44 * magnitude + 1.1 * residual,
        aocs_attitude_error:
          0.036 + 0.006 * noise(timestamp, 4) +
          (eventId === 609 ? 0.052 : 0.145) * magnitude +
          0.06 * residual,
      },
    };
  });
}

const evidence609: EvidenceItem[] = [
  {
    id: "model-609-ensemble",
    kind: "model",
    timestamp: 52,
    label: "Three-detector agreement",
    detail: "MAD, Isolation Forest, and the bundled rank-2 linear autoencoder all exceed their calibrated thresholds.",
  },
  {
    id: "tel-609-wheel",
    kind: "telemetry",
    timestamp: 52,
    label: "Reaction wheel current shift",
    detail: "Wheel current rises with a corresponding, bounded bus-voltage response.",
    channelId: "aocs_wheel_current",
  },
  {
    id: "tc-609-recorded",
    kind: "telecommand",
    timestamp: 49,
    label: "Recorded priority-3 telecommand",
    detail: "Mission 2 source data records anonymized telecommand_6 at 09:18:31 UTC, aligned with the annotated onset.",
  },
  {
    id: "plan-609-event-14",
    kind: "planned-event",
    timestamp: 48,
    label: "Overlapping operational event",
    detail: "The source events timeline records anonymized event_14 from 09:18:52 to 11:03:52 UTC.",
  },
];

const evidence618: EvidenceItem[] = [
  {
    id: "model-618-ensemble",
    kind: "model",
    timestamp: 52,
    label: "Three-detector agreement",
    detail: "All detectors identify a persistent multichannel deviation.",
  },
  {
    id: "tel-618-wheel",
    kind: "telemetry",
    timestamp: 52,
    label: "Uncommanded wheel-current rise",
    detail: "Reaction wheel current rises without a corresponding command in the trusted timeline.",
    channelId: "aocs_wheel_current",
  },
  {
    id: "tel-618-attitude",
    kind: "telemetry",
    timestamp: 53,
    label: "Attitude error diverges",
    detail: "Attitude error departs from its nominal envelope and remains elevated after the initial change.",
    channelId: "aocs_attitude_error",
  },
];

const analysis609: IncidentBrief = {
  disposition: "MONITOR",
  summary: "The telemetry shift coincides with recorded command and operational-event context, so it should be monitored through recovery.",
  observations: [
    {
      statement: "All three detectors identify a real change in spacecraft behavior.",
      evidenceIds: ["model-609-ensemble", "tel-609-wheel"],
    },
    {
      statement: "A recorded priority-3 telecommand and operational event overlap the onset.",
      evidenceIds: ["tc-609-recorded", "plan-609-event-14"],
    },
  ],
  hypotheses: [
    {
      rank: 1,
      label: "Commanded operational response",
      rationale: "The telecommand, operational event, onset, and bounded response are temporally aligned.",
      confidence: 0.9,
      evidenceIds: ["tc-609-recorded", "plan-609-event-14", "tel-609-wheel"],
    },
  ],
  uncertainty: "The replay does not prove the command caused every observed channel response.",
  diagnosticChecks: [
    "Confirm the recorded telecommand completed with the expected acknowledgement.",
    "Verify wheel current returns to its nominal envelope after the operational event.",
    "Escalate if attitude error persists beyond the planned recovery interval.",
  ],
};

const analysis618: IncidentBrief = {
  disposition: "ESCALATE",
  summary: "A persistent multichannel deviation has no trusted command or planned-event explanation and requires operator investigation.",
  observations: [
    {
      statement: "The ensemble identifies a persistent change across attitude, power, and thermal channels.",
      evidenceIds: ["model-618-ensemble", "tel-618-wheel", "tel-618-attitude"],
    },
    {
      statement: "No trusted telecommand or mission-plan event explains the onset.",
      evidenceIds: ["model-618-ensemble"],
    },
  ],
  hypotheses: [
    {
      rank: 1,
      label: "Attitude-control subsystem disturbance",
      rationale: "Wheel current and attitude error move together, followed by power and thermal effects.",
      confidence: 0.72,
      evidenceIds: ["tel-618-wheel", "tel-618-attitude"],
    },
    {
      rank: 2,
      label: "Unrecorded or incomplete command context",
      rationale: "The signature resembles a commanded transition, but the trusted evidence packet contains no command.",
      confidence: 0.24,
      evidenceIds: ["model-618-ensemble"],
    },
  ],
  uncertainty: "The telemetry supports escalation but does not establish a root cause; command-history completeness must be verified.",
  diagnosticChecks: [
    "Verify command-history completeness across the onset window.",
    "Compare wheel speed and torque telemetry for saturation or control-loop oscillation.",
    "Confirm attitude error is not increasing before considering any recovery action.",
  ],
};

const common = {
  channels,
  sourceUrl: SOURCE_URL,
  dataNotice:
    "Telemetry traces are a deterministic fixture. Context labels mirror the anonymized Mission 2 source records verified by the repository pipeline.",
} as const;

const scenarios: Record<ScenarioId, Scenario> = {
  "esa-m2-609": {
    ...common,
    id: "esa-m2-609",
    eventId: 609,
    title: "Commanded rare nominal",
    eyebrow: "CASE A · CONTEXT EXPLAINS CHANGE",
    classification: "RARE_NOMINAL",
    description: "An unusual telemetry signature aligns with recorded command and operational-event context.",
    eventWindow: [50, 61],
    telemetry: makeTelemetry(609),
    evidence: evidence609,
    referenceAnalysis: analysis609,
    expertAnnotation: "ESA Mission 2 event 609 is categorized as a commanded rare nominal event.",
  },
  "esa-m2-618": {
    ...common,
    id: "esa-m2-618",
    eventId: 618,
    title: "Uncommanded disturbance",
    eyebrow: "CASE B · NO EXPLANATORY CONTEXT",
    classification: "ANOMALY",
    description: "A similar multichannel shift occurs without a trusted command or planned operation.",
    eventWindow: [50, 61],
    telemetry: makeTelemetry(618),
    evidence: evidence618,
    referenceAnalysis: analysis618,
    expertAnnotation: "ESA Mission 2 event 618 is categorized as a non-commanded anomaly.",
  },
};

export const scenarioIds = Object.freeze(Object.keys(scenarios) as ScenarioId[]);

export function getScenario(id: ScenarioId): Scenario {
  return scenarios[id];
}

export function getAllScenarios(): Scenario[] {
  return scenarioIds.map((id) => getScenario(id));
}
