import { detectorConfiguration } from "@/lib/detectors";
import type {
  AnalysisResponse,
  ContextDecision,
  DetectorFrame,
  Scenario,
} from "@/lib/types";

export interface IncidentDecisionRecord {
  schemaVersion: "1";
  recordId: string;
  generatedAt: string;
  project: "FlightSentry";
  scenario: {
    id: string;
    eventId: number;
    title: string;
    sourceUrl: string;
    dataNotice: string;
  };
  detection: {
    configurationProfile: string;
    threshold: number;
    persistence: string;
    weights: typeof detectorConfiguration.weights;
    eventOnset: number;
    firstPersistentAlert: number | null;
    detectionDelay: number | null;
    peakScores: Pick<DetectorFrame, "mad" | "isolationForest" | "autoencoder" | "fused">;
  };
  decision: ContextDecision;
  evidence: Array<{
    id: string;
    kind: string;
    timestamp: number;
    endTimestamp?: number;
    label: string;
    detail: string;
  }>;
  analysis: {
    source: AnalysisResponse["source"];
    offline: boolean;
    model: string;
    validatedDisposition: string;
    summary: string;
    uncertainty: string;
    diagnosticChecks: string[];
    policyOnly: boolean;
    originalBriefWithheld: boolean;
  };
  operatorAcknowledgement: {
    name: string;
    timestamp: string;
    notes: string;
  };
}

function peak(frames: DetectorFrame[], key: keyof Pick<DetectorFrame, "mad" | "isolationForest" | "autoencoder" | "fused">): number {
  return Math.max(...frames.map((frame) => frame[key]));
}

export function buildIncidentDecisionRecord({
  scenario,
  frames,
  response,
  decision,
  generatedAt = new Date().toISOString(),
}: {
  scenario: Scenario;
  frames: DetectorFrame[];
  response: AnalysisResponse;
  decision: ContextDecision;
  generatedAt?: string;
}): IncidentDecisionRecord {
  if (frames.length === 0) throw new Error("Cannot export an incident without detector frames.");
  const firstAlert = frames.find((frame) => frame.alert)?.timestamp ?? null;
  const activeIds = new Set(decision.activeEvidenceIds);
  const policyOnly =
    decision.mode === "telemetry-only" || decision.excludedEvidenceIds.length > 0;

  return {
    schemaVersion: "1",
    recordId: `flightsentry-${scenario.id}-${generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    generatedAt,
    project: "FlightSentry",
    scenario: {
      id: scenario.id,
      eventId: scenario.eventId,
      title: scenario.title,
      sourceUrl: scenario.sourceUrl,
      dataNotice: scenario.dataNotice,
    },
    detection: {
      configurationProfile: detectorConfiguration.configProfile,
      threshold: detectorConfiguration.threshold,
      persistence: detectorConfiguration.persistence,
      weights: detectorConfiguration.weights,
      eventOnset: scenario.eventWindow[0],
      firstPersistentAlert: firstAlert,
      detectionDelay: firstAlert === null ? null : firstAlert - scenario.eventWindow[0],
      peakScores: {
        mad: peak(frames, "mad"),
        isolationForest: peak(frames, "isolationForest"),
        autoencoder: peak(frames, "autoencoder"),
        fused: peak(frames, "fused"),
      },
    },
    decision,
    evidence: scenario.evidence
      .filter((item) => activeIds.has(item.id))
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        timestamp: item.timestamp,
        ...(item.endTimestamp === undefined ? {} : { endTimestamp: item.endTimestamp }),
        label: item.label,
        detail: item.detail,
      })),
    analysis: {
      source: response.source,
      offline: response.offline,
      model: response.model ?? (response.source === "watsonx" ? "IBM Granite 4" : "stored-reference-v1"),
      validatedDisposition: policyOnly
        ? decision.disposition
        : response.analysis.disposition,
      summary: policyOnly ? decision.rationale : response.analysis.summary,
      uncertainty: policyOnly
        ? "Granite was not run against this restricted evidence view. The deterministic context policy controls this record."
        : response.analysis.uncertainty,
      diagnosticChecks: policyOnly
        ? [
            "Verify the missing operational-context source and packet completeness.",
            "Continue operator investigation until the required evidence is restored or independently resolved.",
          ]
        : response.analysis.diagnosticChecks,
      policyOnly,
      originalBriefWithheld: policyOnly,
    },
    operatorAcknowledgement: {
      name: "",
      timestamp: "",
      notes: "",
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderIncidentDecisionHtml(record: IncidentDecisionRecord): string {
  const checks = record.decision.checks
    .map(
      (item) => `<tr><td>${escapeHtml(item.label)}</td><td class="${item.status.toLowerCase()}">${item.status}</td><td>${escapeHtml(item.detail)}</td></tr>`,
    )
    .join("");
  const evidence = record.evidence
    .map(
      (item) => `<li><strong>${escapeHtml(item.id)}</strong> ${escapeHtml(item.label)} at T+${item.timestamp}</li>`,
    )
    .join("");
  const diagnostics = record.analysis.diagnosticChecks
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlightSentry decision record ${escapeHtml(record.scenario.id)}</title>
<style>
body{font:14px/1.5 "Segoe UI",sans-serif;color:#17211f;max-width:900px;margin:40px auto;padding:0 24px}header{border-bottom:3px solid #0d765d;padding-bottom:18px}h1{margin:0;font-size:28px}h2{margin-top:30px;font-size:18px}dl{display:grid;grid-template-columns:190px 1fr;gap:7px 16px}dt{font-weight:700}dd{margin:0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aebbb8;padding:8px;text-align:left;vertical-align:top}.pass{color:#087454;font-weight:700}.fail{color:#a23b2d;font-weight:700}.ack{height:90px;border:1px solid #7f8b89;margin-top:8px}.muted{color:#52615e}.disposition{display:inline-block;border:2px solid #17211f;padding:6px 10px;font-weight:700;letter-spacing:.08em}@media print{body{margin:0;max-width:none}.no-print{display:none}}
</style></head><body>
<header><div class="muted">MISSION ASSURANCE DECISION RECORD</div><h1>FlightSentry / Event ${record.scenario.eventId}</h1><p class="disposition">${record.decision.disposition}</p></header>
<dl><dt>Record ID</dt><dd>${escapeHtml(record.recordId)}</dd><dt>Generated</dt><dd>${escapeHtml(record.generatedAt)}</dd><dt>Decision mode</dt><dd>${escapeHtml(record.decision.mode)}</dd><dt>Policy</dt><dd>${escapeHtml(record.decision.policyVersion)}</dd><dt>Detector config</dt><dd>${escapeHtml(record.detection.configurationProfile)}</dd><dt>First persistent alert</dt><dd>${record.detection.firstPersistentAlert === null ? "None" : `T+${record.detection.firstPersistentAlert}`}</dd><dt>Analysis source</dt><dd>${escapeHtml(record.analysis.source)} / ${escapeHtml(record.analysis.model)}</dd></dl>
<h2>Decision rationale</h2><p>${escapeHtml(record.decision.rationale)}</p>
<h2>Context-integrity gate</h2><table><thead><tr><th>Check</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${checks}</tbody></table>
<h2>Active evidence</h2><ul>${evidence}</ul>
<h2>Validated analysis</h2><p>${escapeHtml(record.analysis.summary)}</p><p><strong>Uncertainty:</strong> ${escapeHtml(record.analysis.uncertainty)}</p>${record.analysis.originalBriefWithheld ? "<p><strong>Original Granite brief withheld:</strong> this evidence view is policy-only.</p>" : ""}<ol>${diagnostics}</ol>
<h2>Operator acknowledgement</h2><p>Name: ____________________ &nbsp; Timestamp: ____________________</p><div class="ack"></div>
<p class="muted">Decision support only. No autonomous spacecraft control. ${escapeHtml(record.scenario.dataNotice)}</p>
</body></html>`;
}

export function downloadIncidentDecisionRecord(
  record: IncidentDecisionRecord,
  format: "json" | "html",
): void {
  const content =
    format === "json"
      ? JSON.stringify(record, null, 2)
      : renderIncidentDecisionHtml(record);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json" : "text/html",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `flightsentry-event-${record.scenario.eventId}-decision.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
