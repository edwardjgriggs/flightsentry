import { dispositionStyle } from "@/components/disposition-style";
import { detectorConfiguration } from "@/lib/detectors";
import { comparePairedSignalShape } from "@/lib/paired-analysis";
import type {
  ContextDecision,
  DecisionMode,
  DetectorFrame,
  EvidenceItem,
  Scenario,
} from "@/lib/types";

interface DecisionTraceProps {
  scenarios: Scenario[];
  decisions: Record<string, ContextDecision>;
  frames: Record<string, DetectorFrame>;
  mode: DecisionMode;
}

function hasActiveEvidence(
  scenario: Scenario,
  decision: ContextDecision,
  kind: EvidenceItem["kind"],
): boolean {
  const activeIds = new Set(decision.activeEvidenceIds);
  return scenario.evidence.some(
    (item) => item.kind === kind && activeIds.has(item.id),
  );
}

export function DecisionTrace({
  scenarios,
  decisions,
  frames,
  mode,
}: DecisionTraceProps) {
  if (scenarios.length !== 2) return null;
  const [left, right] = scenarios;
  const comparison = comparePairedSignalShape(left, right);
  const similarity = Math.round(comparison.similarity * 100);

  return (
    <section
      className="decision-trace panel-enter mb-5 overflow-hidden border border-[var(--line-hot)] bg-[#081011]"
      aria-labelledby="decision-trace-title"
    >
      <header className="grid gap-4 border-b border-[var(--line)] bg-[#0d1718] p-4 lg:grid-cols-[1fr_auto] lg:items-end sm:p-5">
        <div>
          <p className="kicker text-[var(--mint)]">Causal decision trace</p>
          <h2 id="decision-trace-title" className="display-type mt-2 text-xl font-semibold text-white sm:text-2xl">
            The signal matches. The evidence path does not.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
            Every result is traced through the same deterministic stages. Change the evidence mode or run a counterfactual and this trace recalculates immediately.
          </p>
        </div>
        <div className="trace-similarity border border-[var(--mint-dim)] bg-[#0b211b] px-4 py-3">
          <p className="kicker text-[var(--muted)]">Paired shape correlation</p>
          <p className="display-type mt-1 text-3xl font-semibold text-[var(--mint)]">{similarity}%</p>
          <p className="mono mt-1 text-[9px] text-[var(--muted)]">
            {comparison.channelCount} CHANNELS · T+{comparison.window[0]} TO T+{comparison.window[1]}
          </p>
        </div>
      </header>

      <div
        className="trace-grid"
        role="region"
        aria-label="Scrollable causal decision trace"
        tabIndex={0}
      >
        <table className="trace-table" aria-label="Causal comparison of paired incident decisions">
          <colgroup><col className="trace-stage-column" /><col /><col /></colgroup>
          <thead>
            <tr>
              <th className="trace-stage trace-heading" scope="col">
                <span className="kicker text-[var(--faint)]">Decision stage</span>
                <span className="mono text-[9px] text-[var(--faint)]">MODE: {mode.toUpperCase()}</span>
              </th>
              {scenarios.map((scenario) => (
                <th key={scenario.id} className="trace-case trace-heading" scope="col">
                  <span className="kicker text-[var(--mint)]">Case {scenario.eventId === 609 ? "A" : "B"}</span>
                  <strong className="display-type text-base text-white">Event {scenario.eventId}</strong>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <TraceStage index="01" label="Signal shape" detail="Normalized paired event window" />
              {scenarios.map((scenario) => (
                <TraceCell key={`signal-${scenario.id}`} status="MATCH" tone="mint">
                  {similarity}% paired correlation
                </TraceCell>
              ))}
            </tr>
            <tr>
              <TraceStage index="02" label="Detector consensus" detail="Independent numerical evidence" />
              {scenarios.map((scenario) => {
                const frame = frames[scenario.id];
                const agreement = [frame.mad, frame.isolationForest, frame.autoencoder]
                  .filter((score) => score >= detectorConfiguration.threshold)
                  .length;
                return (
                  <TraceCell key={`detector-${scenario.id}`} status={frame.alert ? `${agreement}/3 FLAG` : "NO FLAG"} tone={frame.alert ? "amber" : "muted"}>
                    Fused peak {frame.fused.toFixed(2)}
                  </TraceCell>
                );
              })}
            </tr>
            <tr>
              <TraceStage index="03" label="Recorded command" detail="Trusted operational intent" />
              {scenarios.map((scenario) => {
                const present = hasActiveEvidence(scenario, decisions[scenario.id], "telecommand");
                return (
                  <TraceCell key={`command-${scenario.id}`} status={present ? "PRESENT" : "ABSENT"} tone={present ? "mint" : "red"}>
                    {present ? "Time-aligned trusted record" : "No active command evidence"}
                  </TraceCell>
                );
              })}
            </tr>
            <tr>
              <TraceStage index="04" label="Mission plan" detail="Approved operation overlap" />
              {scenarios.map((scenario) => {
                const present = hasActiveEvidence(scenario, decisions[scenario.id], "planned-event");
                return (
                  <TraceCell key={`plan-${scenario.id}`} status={present ? "PRESENT" : "ABSENT"} tone={present ? "mint" : "red"}>
                    {present ? "Event window overlaps onset" : "No active plan evidence"}
                  </TraceCell>
                );
              })}
            </tr>
            <tr>
              <TraceStage index="05" label="Integrity gate" detail="Fail-closed context policy" />
              {scenarios.map((scenario) => {
                const decision = decisions[scenario.id];
                const passed = decision.checks.filter((check) => check.status === "PASS").length;
                return (
                  <TraceCell key={`gate-${scenario.id}`} status={decision.gatePassed ? "GATE PASS" : "GATE FAIL"} tone={decision.gatePassed ? "mint" : "red"}>
                    {passed}/{decision.checks.length} checks passed
                  </TraceCell>
                );
              })}
            </tr>
            <tr>
              <TraceStage index="06" label="Operator recommendation" detail="Deterministic final policy" outcome />
              {scenarios.map((scenario) => {
                const decision = decisions[scenario.id];
                return (
                  <td key={`outcome-${scenario.id}`} className="trace-case trace-outcome">
                    <span className={`kicker inline-flex border px-3 py-2 ${dispositionStyle[decision.disposition]}`}>
                      {decision.disposition}
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-[var(--muted)]">{decision.rationale}</span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--faint)] sm:px-5">
        Similarity is Pearson shape correlation across the four shared fixture channels in the paired event window. It is an explainability aid, not an ESA benchmark metric.
      </p>
    </section>
  );
}

function TraceStage({
  index,
  label,
  detail,
  outcome = false,
}: {
  index: string;
  label: string;
  detail: string;
  outcome?: boolean;
}) {
  return (
    <th className={`trace-stage ${outcome ? "trace-outcome" : ""}`} scope="row">
      <span className="mono text-[10px] text-[var(--mint)]">/{index}</span>
      <strong className="mt-1 block text-sm text-[var(--ink)]">{label}</strong>
      <span className="mt-0.5 block text-[10px] leading-relaxed text-[var(--faint)]">{detail}</span>
    </th>
  );
}

function TraceCell({
  status,
  tone,
  children,
}: {
  status: string;
  tone: "mint" | "amber" | "red" | "muted";
  children: React.ReactNode;
}) {
  const toneClass = {
    mint: "text-[var(--mint)]",
    amber: "text-[var(--amber)]",
    red: "text-[var(--red)]",
    muted: "text-[var(--muted)]",
  }[tone];
  return (
    <td className="trace-case">
      <span className={`kicker ${toneClass}`}>{status}</span>
      <span className="mt-1 block text-xs text-[var(--muted)]">{children}</span>
    </td>
  );
}
