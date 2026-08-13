import type { ContextDecision, DecisionMode, Scenario } from "@/lib/types";

const dispositionStyle = {
  MONITOR: "text-[var(--mint)] border-[var(--mint-dim)]",
  INVESTIGATE: "text-[var(--amber)] border-[#765d2e]",
  ESCALATE: "text-[var(--red)] border-[#743f3f]",
};

export function DecisionComparison({
  scenarios,
  mode,
  onModeChange,
  telemetryDecisions,
  contextDecisions,
}: {
  scenarios: Scenario[];
  mode: DecisionMode;
  onModeChange: (mode: DecisionMode) => void;
  telemetryDecisions: Record<string, ContextDecision>;
  contextDecisions: Record<string, ContextDecision>;
}) {
  return (
    <section className="mb-5 overflow-hidden border border-[var(--line-hot)] bg-[#0a1213]" aria-labelledby="decision-comparison-title">
      <div className="grid gap-px bg-[var(--line)] xl:grid-cols-[.7fr_1fr_1fr]">
        <div className="bg-[#0d1718] p-4 sm:p-5">
          <p className="kicker text-[var(--mint)]">Operational differential</p>
          <h2 id="decision-comparison-title" className="display-type mt-2 text-xl font-semibold text-white">
            The same alert changes meaning when trusted context arrives.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Switch modes to see which evidence changes the operator decision. The detector result never changes.
          </p>
        </div>
        <ModeCard
          active={mode === "telemetry-only"}
          label="Telemetry only"
          detail="No operational intent is available. Both alerts require investigation."
          onClick={() => onModeChange("telemetry-only")}
          scenarios={scenarios}
          decisions={telemetryDecisions}
        />
        <ModeCard
          active={mode === "trusted-context"}
          label="Trusted context"
          detail="Recorded command and plan evidence can safely reduce operator workload."
          onClick={() => onModeChange("trusted-context")}
          scenarios={scenarios}
          decisions={contextDecisions}
        />
      </div>
    </section>
  );
}

function ModeCard({
  active,
  label,
  detail,
  onClick,
  scenarios,
  decisions,
}: {
  active: boolean;
  label: string;
  detail: string;
  onClick: () => void;
  scenarios: Scenario[];
  decisions: Record<string, ContextDecision>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`group bg-[var(--panel)] p-4 text-left transition sm:p-5 ${active ? "decision-mode-active" : "hover:bg-[#111c1d]"}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className={`kicker ${active ? "text-[var(--mint)]" : "text-[var(--muted)]"}`}>{label}</span>
        <span className={`grid h-5 w-5 place-items-center border ${active ? "border-[var(--mint)] text-[var(--mint)]" : "border-[var(--line-hot)] text-transparent"}`} aria-hidden="true">
          ✓
        </span>
      </span>
      <span className="mt-2 block text-sm text-[var(--muted)]">{detail}</span>
      <span className="mt-4 flex flex-wrap gap-2">
        {scenarios.map((scenario) => {
          const disposition = decisions[scenario.id].disposition;
          return (
            <span key={scenario.id} className={`mono border px-2 py-1 text-[10px] ${dispositionStyle[disposition]}`}>
              {scenario.eventId} {disposition}
            </span>
          );
        })}
      </span>
    </button>
  );
}
