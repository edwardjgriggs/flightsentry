import {
  buildIncidentDecisionRecord,
  downloadIncidentDecisionRecord,
} from "@/lib/incident-export";
import type {
  AnalysisResponse,
  ContextDecision,
  DetectorFrame,
  EvidenceItem,
  Scenario,
} from "@/lib/types";

const dispositionStyle = {
  MONITOR: "text-[var(--mint)] border-[var(--mint-dim)]",
  INVESTIGATE: "text-[var(--amber)] border-[#765d2e]",
  ESCALATE: "text-[var(--red)] border-[#743f3f]",
};

export function ContextIntegrityPanel({
  scenario,
  decision,
  response,
  frames,
  onToggleEvidence,
}: {
  scenario: Scenario;
  decision: ContextDecision;
  response: AnalysisResponse;
  frames: DetectorFrame[];
  onToggleEvidence: (evidenceId: string) => void;
}) {
  const passed = decision.checks.filter((item) => item.status === "PASS").length;
  const contextEvidence = scenario.evidence.filter(
    (item) => item.kind === "telecommand" || item.kind === "planned-event",
  );
  const counterfactualActive = decision.excludedEvidenceIds.length > 0;

  const exportRecord = (format: "json" | "html") => {
    const record = buildIncidentDecisionRecord({ scenario, frames, response, decision });
    downloadIncidentDecisionRecord(record, format);
  };

  return (
    <section className="panel-enter mt-4 border border-[var(--line-hot)] bg-[#091011]" aria-label={`${scenario.title} context integrity gate`}>
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="kicker text-[var(--mint)]">Context-integrity gate</p>
          <p className="mt-1 text-sm text-[var(--ink)]">{decision.rationale}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="mono text-[10px] text-[var(--muted)]">{passed}/{decision.checks.length} PASS</span>
          <span className={`kicker border px-3 py-2 ${dispositionStyle[decision.disposition]}`}>
            {decision.disposition}
          </span>
        </div>
      </div>

      <ol className="divide-y divide-[var(--line)]">
        {decision.checks.map((item) => (
          <li key={item.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[5rem_1fr]">
            <span className={`mono text-[10px] ${item.status === "PASS" ? "text-[var(--mint)]" : "text-[var(--red)]"}`}>
              {item.status === "PASS" ? "● PASS" : "× FAIL"}
            </span>
            <span>
              <span className="block text-xs font-medium text-[var(--ink)]">{item.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">{item.detail}</span>
              <span className="mono mt-1 block text-[9px] text-[var(--faint)]">
                {item.provenance}{item.evidenceIds.length > 0 ? ` · ${item.evidenceIds.join(" · ")}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {decision.mode === "trusted-context" && contextEvidence.length > 0 && (
        <div className="border-t border-[var(--line)] bg-[#0d1718] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="kicker text-[var(--amber)]">Counterfactual evidence test</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Remove trusted evidence and recalculate without asking Granite.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {contextEvidence.map((item) => (
                <EvidenceToggle
                  key={item.id}
                  item={item}
                  removed={decision.excludedEvidenceIds.includes(item.id)}
                  onClick={() => onToggleEvidence(item.id)}
                />
              ))}
            </div>
          </div>
          {counterfactualActive && (
            <p role="status" className="mt-3 border-l-2 border-[var(--amber)] bg-[#241d10] px-3 py-2 text-xs text-[#f1d69d]">
              COUNTERFACTUAL ACTIVE · The deterministic policy was recalculated. The original Granite brief is withheld because it used the complete evidence packet.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <details className="text-xs text-[var(--muted)]">
          <summary className="cursor-pointer text-[var(--ink)]">Replay scope and production gaps</summary>
          <p className="mt-2 max-w-2xl leading-relaxed">{scenario.contextAssurance.provenance}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {decision.productionLimitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
        <div className="flex shrink-0 flex-wrap gap-2" aria-label="Download incident decision record">
          <button type="button" onClick={() => exportRecord("json")} className="kicker border border-[var(--line-hot)] px-3 py-2 text-[var(--ink)] hover:border-[var(--mint)] hover:text-[var(--mint)]">
            Export JSON
          </button>
          <button type="button" onClick={() => exportRecord("html")} className="kicker border border-[var(--line-hot)] px-3 py-2 text-[var(--ink)] hover:border-[var(--mint)] hover:text-[var(--mint)]">
            Printable HTML
          </button>
        </div>
      </div>
    </section>
  );
}

function EvidenceToggle({
  item,
  removed,
  onClick,
}: {
  item: EvidenceItem;
  removed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={!removed}
      onClick={onClick}
      className={`mono border px-3 py-2 text-[10px] transition ${removed ? "border-[#765d2e] bg-[#241d10] text-[var(--amber)]" : "border-[var(--mint-dim)] text-[var(--mint)] hover:bg-[#10251f]"}`}
    >
      {removed ? "RESTORE" : "REMOVE"} {item.kind === "telecommand" ? "COMMAND" : "PLAN"}
    </button>
  );
}
