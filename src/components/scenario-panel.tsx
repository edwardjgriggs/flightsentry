import { ContextIntegrityPanel } from "@/components/context-integrity-panel";
import { DetectorStrip } from "@/components/detector-strip";
import { IncidentBriefPanel } from "@/components/incident-brief";
import { InvestigationRunbookPanel } from "@/components/investigation-runbook";
import { OperatorCheckpoint } from "@/components/operator-checkpoint";
import { SubsystemImpactMap } from "@/components/subsystem-impact-map";
import { TelemetryChart, type ChartPhase } from "@/components/telemetry-chart";
import {
  getEffectiveDiagnosticChecks,
  reconcileInvestigationRunbook,
  summarizeInvestigationRunbook,
} from "@/lib/investigation";
import type {
  AnalysisResponse,
  ContextDecision,
  DecisionMode,
  DetectorFrame,
  InvestigationRunbook,
  OperatorAcknowledgement,
  Scenario,
} from "@/lib/types";

const evidenceKindCode: Record<string, string> = {
  telecommand: "TC",
  "planned-event": "PLAN",
  telemetry: "TLM",
  model: "MODEL",
};

interface ScenarioPanelProps {
  scenario: Scenario;
  frame: DetectorFrame;
  progress: number;
  response?: AnalysisResponse;
  briefPending: boolean;
  showDecision: boolean;
  revealAnnotation: boolean;
  scoreMode?: "live" | "peak";
  chartPhase: ChartPhase;
  decisionMode: DecisionMode;
  decision: ContextDecision;
  detectorHistory: DetectorFrame[];
  excludedEvidenceIds: string[];
  acknowledgement?: OperatorAcknowledgement;
  runbook?: InvestigationRunbook;
  runtimeLabel: string;
  onToggleEvidence: (evidenceId: string) => void;
  onRecordAcknowledgement: (acknowledgement: OperatorAcknowledgement) => void;
  onClearAcknowledgement: () => void;
  onRunbookChange: (runbook: InvestigationRunbook) => void;
}

export function ScenarioPanel({
  scenario,
  frame,
  progress,
  response,
  briefPending,
  showDecision,
  revealAnnotation,
  scoreMode = "live",
  chartPhase,
  decisionMode,
  decision,
  detectorHistory,
  excludedEvidenceIds,
  acknowledgement,
  runbook,
  runtimeLabel,
  onToggleEvidence,
  onRecordAcknowledgement,
  onClearAcknowledgement,
  onRunbookChange,
}: ScenarioPanelProps) {
  const alertActive = frame.alert;
  const statusLabel =
    scoreMode === "peak"
      ? alertActive
        ? "EVENT DETECTED"
        : "NO EVENT DETECTED"
      : alertActive
        ? "DETECTOR ALERT"
        : "NOMINAL";
  const position = (progress / (scenario.telemetry.length - 1)) * 100;
  const alertTimestamps = detectorHistory
    .filter((item) => item.alert && item.timestamp <= progress)
    .map((item) => item.timestamp);
  const firstAlert = detectorHistory.find((item) => item.alert)?.timestamp ?? null;
  const visibleEvidence = scenario.evidence.filter(
    (item) =>
      (decisionMode === "trusted-context" ||
        (item.kind !== "telecommand" && item.kind !== "planned-event")) &&
      (chartPhase === "complete" || item.timestamp <= progress),
  );
  const diagnosticChecks = getEffectiveDiagnosticChecks(response, decision);
  const workflowReady =
    decision.mode === "telemetry-only" ||
    decision.excludedEvidenceIds.length > 0 ||
    Boolean(response);
  const activeRunbook = workflowReady && diagnosticChecks.length > 0
    ? reconcileInvestigationRunbook(scenario.id, diagnosticChecks, runbook)
    : undefined;
  const runbookSummary = activeRunbook
    ? summarizeInvestigationRunbook(activeRunbook)
    : undefined;
  const undocumentedConcern = activeRunbook?.checks.some(
    (check) => check.status === "CONCERN" && !check.note.trim(),
  );
  const checkpointBlock = !runbookSummary
    ? "Diagnostic checks are not available yet."
    : runbookSummary.resolved < runbookSummary.total
      ? `Resolve ${runbookSummary.total - runbookSummary.resolved} pending diagnostic check${runbookSummary.total - runbookSummary.resolved === 1 ? "" : "s"}.`
      : undocumentedConcern
        ? "Document every recorded concern before signoff."
        : undefined;

  return (
    <article className={`hairline-panel relative min-w-0 overflow-hidden p-4 sm:p-5 ${alertActive ? "border-[var(--line-hot)]" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="kicker mb-1 text-[var(--mint)]">{scenario.eyebrow}</p>
          <h2 className="display-type text-xl font-semibold text-white sm:text-2xl">
            Event {scenario.eventId} / {scenario.title}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">{scenario.description}</p>
        </div>
        <div className={`flex shrink-0 items-center gap-2 border px-2.5 py-2 ${alertActive ? "border-[#765d2e] text-[var(--amber)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
          <span className={`signal-dot ${alertActive ? "pulse-ring" : ""}`} />
          <span className="kicker">{statusLabel}</span>
        </div>
      </div>

      <div className="relative overflow-hidden border border-[var(--line)] bg-[#091011] p-2">
        <TelemetryChart
          channels={scenario.channels}
          telemetry={scenario.telemetry}
          progress={progress}
          phase={chartPhase}
          alertTimestamps={alertTimestamps}
          firstAlert={firstAlert}
        />
        {chartPhase === "live" && (
          <div className="scanline" style={{ "--scan-position": `${position}%` } as React.CSSProperties} />
        )}
      </div>

      <div className="mt-3">
        <DetectorStrip
          frame={frame}
          mode={scoreMode}
          history={detectorHistory}
          progress={progress}
          runtimeLabel={runtimeLabel}
        />
      </div>

      <section className="mt-4" aria-label={`${scenario.title} evidence timeline`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="kicker text-[var(--muted)]">Trusted context timeline</h3>
          <span className="mono text-[10px] text-[var(--faint)]">T+{progress.toString().padStart(3, "0")}</span>
        </div>
        <div className="min-h-24 border border-[var(--line)] bg-[#091011] p-3">
          {visibleEvidence.length === 0 ? (
            <p className="mono py-5 text-center text-xs text-[var(--faint)]">
              {chartPhase === "idle"
                ? "Standby. Trusted records appear as the replay reaches them."
                : "No trusted context records at this point in the replay."}
            </p>
          ) : (
            <>
              {decisionMode === "telemetry-only" && (
                <p className="mb-3 border-l-2 border-[var(--amber)] bg-[#241d10] px-3 py-2 text-xs text-[#f1d69d]">
                  TELEMETRY ONLY · Operational context is intentionally withheld from the decision.
                </p>
              )}
              <ol className="space-y-2">
                {visibleEvidence.map((item) => {
                  const removed = excludedEvidenceIds.includes(item.id);
                  return (
                    <li key={item.id} className={`grid grid-cols-[3rem_3.2rem_1fr] gap-2 text-xs ${removed ? "line-through" : ""}`}>
                      <span className={`mono text-[10px] ${removed ? "text-[var(--muted)]" : "text-[var(--faint)]"}`}>
                        T+{String(item.timestamp).padStart(3, "0")}
                      </span>
                      <span
                        className={`kicker ${removed ? "text-[var(--muted)]" : item.kind === "telecommand" || item.kind === "planned-event" ? "text-[var(--mint)]" : "text-[var(--amber)]"}`}
                        title={item.kind}
                      >
                        {evidenceKindCode[item.kind]}
                      </span>
                      <span className={removed ? "text-[var(--muted)]" : "text-[#b9c7c4]"}>
                        {item.label}{" "}
                        <span className={`mono ${removed ? "text-[var(--muted)]" : "text-[var(--faint)]"}`}>[{item.id}]</span>
                        {removed ? " · REMOVED" : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </section>

      {showDecision && (
        <>
          <SubsystemImpactMap scenario={scenario} />
          <ContextIntegrityPanel
            scenario={scenario}
            decision={decision}
            response={response}
            frames={detectorHistory}
            runbook={activeRunbook}
            acknowledgement={acknowledgement}
            onToggleEvidence={onToggleEvidence}
          />
          {decisionMode === "telemetry-only" ? (
            <div className="mt-4 border-l-2 border-[var(--amber)] bg-[#241d10] px-3 py-3 text-xs text-[#f1d69d]">
              AI CONTEXT BRIEF GATED · Switch back to Trusted context to see the Granite explanation of this disposition.
            </div>
          ) : excludedEvidenceIds.length > 0 ? null : briefPending ? (
            <div className="brief-skeleton mt-4 border border-[var(--line)] bg-[#0d1718] p-4" role="status">
              <p className="kicker text-[var(--muted)]">Granite incident brief</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Granite is composing the evidence-grounded brief. The deterministic disposition above is already final and does not depend on it.
              </p>
              <div className="skeleton-lines mt-3" aria-hidden="true">
                <span /><span /><span />
              </div>
            </div>
          ) : response ? (
            <IncidentBriefPanel response={response} scenario={scenario} />
          ) : null}
          {activeRunbook && (
            <>
              <InvestigationRunbookPanel
                scenarioId={scenario.id}
                prompts={diagnosticChecks}
                runbook={activeRunbook}
                onChange={onRunbookChange}
              />
              <OperatorCheckpoint
                decision={decision}
                minimumDisposition={
                  runbookSummary?.concerns && decision.disposition === "MONITOR"
                    ? "INVESTIGATE"
                    : undefined
                }
                disabledReason={checkpointBlock}
                acknowledgement={acknowledgement}
                onRecord={onRecordAcknowledgement}
                onClear={onClearAcknowledgement}
              />
            </>
          )}
        </>
      )}

      {revealAnnotation && (
        <div className="panel-enter mt-4 border border-[var(--mint-dim)] bg-[#0d211c] p-3" tabIndex={-1} data-annotation={scenario.id}>
          <p className="kicker mb-1 text-[var(--mint)]">Expert annotation revealed</p>
          <p className="text-sm">{scenario.expertAnnotation}</p>
        </div>
      )}
    </article>
  );
}
