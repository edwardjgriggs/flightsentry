import {
  reconcileInvestigationRunbook,
  summarizeInvestigationRunbook,
  updateInvestigationCheck,
} from "@/lib/investigation";
import type {
  DiagnosticCheckRecord,
  DiagnosticCheckStatus,
  InvestigationRunbook,
  ScenarioId,
} from "@/lib/types";

const statuses: Array<{ value: DiagnosticCheckStatus; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "VERIFIED", label: "Verified" },
  { value: "CONCERN", label: "Concern" },
];

export function InvestigationRunbookPanel({
  scenarioId,
  prompts,
  runbook,
  onChange,
}: {
  scenarioId: ScenarioId;
  prompts: string[];
  runbook?: InvestigationRunbook;
  onChange: (runbook: InvestigationRunbook) => void;
}) {
  const activeRunbook = reconcileInvestigationRunbook(scenarioId, prompts, runbook);
  const summary = summarizeInvestigationRunbook(activeRunbook);
  const statusTone =
    summary.status === "COMPLETE"
      ? "border-[var(--mint-dim)] text-[var(--mint)]"
      : summary.status === "CONCERN"
        ? "border-[#765d2e] text-[var(--amber)]"
        : "border-[var(--line-hot)] text-[var(--muted)]";

  const updateCheck = (
    checkId: string,
    update: { status?: DiagnosticCheckStatus; note?: string },
  ) => {
    onChange(updateInvestigationCheck(activeRunbook, checkId, update));
  };

  return (
    <section
      className="panel-enter mt-4 overflow-hidden border border-[var(--line-hot)] bg-[#091011]"
      aria-labelledby={`${scenarioId}-runbook-title`}
    >
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="kicker text-[var(--mint)]">Interactive investigation runbook</p>
          <h3
            id={`${scenarioId}-runbook-title`}
            className="display-type mt-1 text-base font-semibold text-white"
          >
            Resolve each diagnostic check before signoff.
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="mono text-[10px] text-[var(--muted)]">
            {summary.resolved}/{summary.total} RESOLVED
          </span>
          <span className={`kicker border px-3 py-2 ${statusTone}`}>
            {summary.status.replace("_", " ")}
          </span>
        </div>
      </div>

      <ol className="divide-y divide-[var(--line)]">
        {activeRunbook.checks.map((check, index) => (
          <RunbookCheck
            key={check.id}
            check={check}
            index={index}
            onStatusChange={(status) => updateCheck(check.id, { status })}
            onNoteChange={(note) => updateCheck(check.id, { note })}
          />
        ))}
      </ol>

      <div className="border-t border-[var(--line)] bg-[#0b1516] px-3 py-2 text-[10px] leading-relaxed text-[var(--faint)]">
        Pending checks block operator signoff. Any recorded concern raises a MONITOR recommendation to at least INVESTIGATE.
      </div>
    </section>
  );
}

function RunbookCheck({
  check,
  index,
  onStatusChange,
  onNoteChange,
}: {
  check: DiagnosticCheckRecord;
  index: number;
  onStatusChange: (status: DiagnosticCheckStatus) => void;
  onNoteChange: (note: string) => void;
}) {
  const concern = check.status === "CONCERN";

  return (
    <li className="grid gap-3 p-3">
      <div className="grid gap-2 sm:grid-cols-[2rem_1fr]">
        <span className="mono text-[10px] text-[var(--mint)]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <p className="text-xs leading-relaxed text-[var(--ink)]">{check.prompt}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-end sm:pl-10">
        <div>
          <span className="kicker mb-1.5 block text-[var(--faint)]">Check result</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Result for check ${index + 1}`}>
            {statuses.map((status) => {
              const selected = check.status === status.value;
              const selectedTone =
                status.value === "CONCERN"
                  ? "border-[#765d2e] bg-[#241d10] text-[var(--amber)]"
                  : status.value === "VERIFIED"
                    ? "border-[var(--mint-dim)] bg-[#0d211c] text-[var(--mint)]"
                    : "border-[var(--line-hot)] bg-[#12191a] text-[var(--muted)]";
              return (
                <button
                  key={status.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onStatusChange(status.value)}
                  className={`kicker border px-2.5 py-2 ${selected ? selectedTone : "border-[var(--line)] text-[var(--faint)] hover:text-[var(--ink)]"}`}
                >
                  {selected ? "● " : ""}{status.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="grid gap-1">
          <span className={`kicker ${concern ? "text-[var(--amber)]" : "text-[var(--faint)]"}`}>
            Operator finding {concern ? "· document concern" : "· optional"}
          </span>
          <input
            value={check.note}
            maxLength={240}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={concern ? "Record the observed concern" : "Add verification evidence or observation"}
            aria-label={`Operator finding for diagnostic check ${index + 1}`}
            className={`min-w-0 border bg-[#071011] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--faint)] ${concern && !check.note.trim() ? "border-[#765d2e]" : "border-[var(--line-hot)]"}`}
          />
        </label>
      </div>
    </li>
  );
}
