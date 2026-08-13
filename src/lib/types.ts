export type ScenarioId = "esa-m2-609" | "esa-m2-618";

export type Disposition = "MONITOR" | "INVESTIGATE" | "ESCALATE";

export type DecisionMode = "telemetry-only" | "trusted-context";

export type IntegrityStatus = "PASS" | "FAIL";

export interface ChannelDefinition {
  id: string;
  label: string;
  shortLabel: string;
  unit: string;
  subsystem: string;
  color: string;
}

export interface TelemetrySample {
  timestamp: number;
  values: Record<string, number>;
}

export interface EvidenceItem {
  id: string;
  kind: "telemetry" | "telecommand" | "planned-event" | "model";
  timestamp: number;
  label: string;
  detail: string;
  channelId?: string;
  endTimestamp?: number;
}

export interface ContextAssurance {
  scope: string;
  commandHistoryComplete: boolean;
  missionPlanComplete: boolean;
  provenance: string;
  productionLimitations: readonly string[];
}

export interface ContextIntegrityCheck {
  id: string;
  label: string;
  status: IntegrityStatus;
  detail: string;
  evidenceIds: string[];
  provenance: "DETECTOR" | "ESA RECORD" | "REPLAY ASSERTION" | "POLICY";
}

export interface ContextDecision {
  mode: DecisionMode;
  disposition: Disposition;
  gatePassed: boolean;
  rationale: string;
  activeEvidenceIds: string[];
  excludedEvidenceIds: string[];
  checks: ContextIntegrityCheck[];
  policyVersion: string;
  scope: string;
  productionLimitations: readonly string[];
}

export interface IncidentObservation {
  statement: string;
  evidenceIds: string[];
}

export interface IncidentHypothesis {
  rank: number;
  label: string;
  rationale: string;
  confidence: number;
  evidenceIds: string[];
}

export interface IncidentBrief {
  disposition: Disposition;
  summary: string;
  observations: IncidentObservation[];
  hypotheses: IncidentHypothesis[];
  uncertainty: string;
  diagnosticChecks: string[];
}

export interface Scenario {
  id: ScenarioId;
  eventId: 609 | 618;
  title: string;
  eyebrow: string;
  classification: "RARE_NOMINAL" | "ANOMALY";
  description: string;
  eventWindow: [number, number];
  channels: ChannelDefinition[];
  telemetry: TelemetrySample[];
  evidence: EvidenceItem[];
  contextAssurance: ContextAssurance;
  referenceAnalysis: IncidentBrief;
  expertAnnotation: string;
  sourceUrl: string;
  dataNotice: string;
}

export interface DetectorFrame {
  timestamp: number;
  mad: number;
  isolationForest: number;
  autoencoder: number;
  fused: number;
  alert: boolean;
  contributors: string[];
}

export interface AnalysisResponse {
  analysis: IncidentBrief;
  source: "watsonx" | "reference";
  offline: boolean;
  model?: string;
  message?: string;
}
