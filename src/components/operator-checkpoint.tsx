import { useId, useState } from "react";

import { dispositionStyle } from "@/components/disposition-style";
import type {
  ContextDecision,
  Disposition,
  OperatorAcknowledgement,
} from "@/lib/types";

const dispositionOrder: Disposition[] = ["MONITOR", "INVESTIGATE", "ESCALATE"];

export function OperatorCheckpoint({
  decision,
  minimumDisposition,
  disabledReason,
  acknowledgement,
  onRecord,
  onClear,
}: {
  decision: ContextDecision;
  minimumDisposition?: Disposition;
  disabledReason?: string;
  acknowledgement?: OperatorAcknowledgement;
  onRecord: (acknowledgement: OperatorAcknowledgement) => void;
  onClear: () => void;
}) {
  const operatorIdId = useId();
  const notesId = useId();
  const [operatorId, setOperatorId] = useState("OPS-01");
  const [notes, setNotes] = useState("");
  const [finalDisposition, setFinalDisposition] = useState<Disposition>(decision.disposition);
  const [error, setError] = useState("");

  if (acknowledgement) {
    return (
      <section className="operator-checkpoint border-t border-[var(--line)] bg-[#0b1816] p-3" aria-label="Recorded operator decision">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="kicker text-[var(--mint)]">Operator checkpoint recorded</p>
              <span className="mono text-[9px] text-[var(--faint)]">{acknowledgement.timestamp}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--ink)]">
              <span className="font-medium">{acknowledgement.operatorId}</span> {acknowledgement.action === "ACCEPTED" ? "accepted" : "raised"} the recommendation.
            </p>
            {acknowledgement.notes && <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{acknowledgement.notes}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className={`kicker border px-3 py-2 ${dispositionStyle[acknowledgement.finalDisposition]}`}>
              FINAL {acknowledgement.finalDisposition}
            </span>
            <button type="button" onClick={onClear} className="kicker border border-[var(--line-hot)] px-3 py-2 text-[var(--muted)] hover:text-[var(--ink)]">
              Amend
            </button>
          </div>
        </div>
      </section>
    );
  }

  const minimumIndex = Math.max(
    dispositionOrder.indexOf(decision.disposition),
    minimumDisposition ? dispositionOrder.indexOf(minimumDisposition) : 0,
  );
  const availableDispositions = dispositionOrder.slice(minimumIndex);
  const effectiveFinalDisposition = availableDispositions.includes(finalDisposition)
    ? finalDisposition
    : availableDispositions[0];
  const recordDecision = () => {
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    const normalizedId = operatorId.trim();
    const normalizedNotes = notes.trim();
    if (!normalizedId) {
      setError("Enter an operator ID.");
      return;
    }
    if (effectiveFinalDisposition !== decision.disposition && !normalizedNotes) {
      setError("Record a rationale when raising severity.");
      return;
    }
    setError("");
    onRecord({
      status: "RECORDED",
      operatorId: normalizedId,
      timestamp: new Date().toISOString(),
      notes: normalizedNotes,
      action: effectiveFinalDisposition === decision.disposition ? "ACCEPTED" : "RAISED",
      recommendedDisposition: decision.disposition,
      finalDisposition: effectiveFinalDisposition,
      decisionMode: decision.mode,
      activeEvidenceIds: [...decision.activeEvidenceIds],
    });
  };

  return (
    <section className="operator-checkpoint border-t border-[var(--line)] bg-[#0b1516] p-3" aria-labelledby={`${operatorIdId}-title`}>
      <div className="grid gap-4 lg:grid-cols-[.7fr_1.3fr]">
        <div>
          <p className="kicker text-[var(--mint)]">Human decision checkpoint</p>
          <h4 id={`${operatorIdId}-title`} className="display-type mt-1 text-base font-semibold text-white">
            Record the accountable disposition.
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Operators may accept the recommendation or raise severity. A failed context gate can never be downgraded to MONITOR.
          </p>
          {minimumDisposition && minimumIndex > dispositionOrder.indexOf(decision.disposition) && (
            <p className="mt-2 border-l-2 border-[var(--amber)] bg-[#241d10] px-2 py-2 text-xs text-[#f1d69d]">
              OPEN CONCERN · Minimum accountable outcome raised to {minimumDisposition}.
            </p>
          )}
        </div>
        <div className="grid gap-3">
          <fieldset>
            <legend className="kicker mb-2 text-[var(--faint)]">Final disposition</legend>
            <div className="flex flex-wrap gap-2">
              {availableDispositions.map((disposition) => (
                <label key={disposition} className={`operator-choice cursor-pointer border px-3 py-2 ${effectiveFinalDisposition === disposition ? dispositionStyle[disposition] : "border-[var(--line-hot)] text-[var(--muted)]"}`}>
                  <input
                    className="sr-only"
                    type="radio"
                    name={`${operatorIdId}-disposition`}
                    value={disposition}
                    checked={effectiveFinalDisposition === disposition}
                    onChange={() => setFinalDisposition(disposition)}
                  />
                  <span className="kicker">{disposition === decision.disposition ? "Accept" : "Raise to"} {disposition}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label htmlFor={operatorIdId} className="grid gap-1">
              <span className="kicker text-[var(--faint)]">Operator ID</span>
              <input
                id={operatorIdId}
                value={operatorId}
                maxLength={32}
                onChange={(event) => setOperatorId(event.target.value)}
                className="mono min-w-0 border border-[var(--line-hot)] bg-[#071011] px-3 py-2 text-xs text-[var(--ink)]"
              />
            </label>
            <label htmlFor={notesId} className="grid gap-1">
              <span className="kicker text-[var(--faint)]">Decision rationale</span>
              <input
                id={notesId}
                value={notes}
                maxLength={240}
                placeholder={effectiveFinalDisposition === decision.disposition ? "Optional operator note" : "Required for severity raise"}
                onChange={(event) => setNotes(event.target.value)}
                className="min-w-0 border border-[var(--line-hot)] bg-[#071011] px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--faint)]"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="alert" className={`text-xs text-[var(--red)] ${error ? "" : "sr-only"}`}>{error}</p>
            {disabledReason && (
              <p className="text-xs text-[var(--amber)]">SIGNOFF BLOCKED · {disabledReason}</p>
            )}
            <button type="button" disabled={Boolean(disabledReason)} onClick={recordDecision} className="kicker ml-auto bg-[var(--mint)] px-4 py-2.5 font-medium text-[var(--void)] hover:bg-[#91ffda] disabled:cursor-not-allowed disabled:bg-[var(--line-hot)] disabled:text-[var(--faint)]">
              Record operator decision
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
