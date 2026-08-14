import { dispositionStyle } from "@/components/disposition-style";
import type { AnalysisResponse, Scenario } from "@/lib/types";

export function IncidentBriefPanel({
  response,
  scenario,
}: {
  response: AnalysisResponse;
  scenario: Scenario;
}) {
  const brief = response.analysis;
  const live = response.source === "watsonx";
  return (
    <section className="panel-enter mt-4 border-t border-[var(--line-hot)] pt-4" aria-label={`${scenario.title} incident brief`}>
      {response.offline && (
        <div className="mb-3 border-l-2 border-[var(--amber)] bg-[#241d10] px-3 py-2 text-xs text-[#f1d69d]">
          REFERENCE MODE · {response.message}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="kicker text-[var(--muted)]">Granite incident brief</p>
            <span
              className={`mono border px-1.5 py-0.5 text-[9px] uppercase tracking-[.08em] ${
                live
                  ? "border-[var(--mint-dim)] text-[var(--mint)]"
                  : "border-[#765d2e] text-[var(--amber)]"
              }`}
            >
              {live
                ? `LIVE · ${response.model ?? "ibm/granite-4-h-small"} · watsonx.ai`
                : `REFERENCE BRIEF · ${response.model ?? "stored-reference-v1"}`}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--ink)]">{brief.summary}</p>
        </div>
        <span className={`kicker border px-3 py-2 ${dispositionStyle[brief.disposition]}`}>
          {brief.disposition}
        </span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h4 className="kicker mb-2 text-[var(--muted)]">Evidence-backed observations</h4>
          <ol className="space-y-2 text-sm">
            {brief.observations.map((observation) => (
              <li key={observation.statement} className="border-l border-[var(--line-hot)] pl-3">
                <p>{observation.statement}</p>
                <p className="mono mt-1 text-[10px] text-[var(--faint)]">{observation.evidenceIds.join(" · ")}</p>
              </li>
            ))}
          </ol>
          <h4 className="kicker mb-2 mt-4 text-[var(--muted)]">Ranked hypotheses</h4>
          <ol className="space-y-2.5 text-sm">
            {[...brief.hypotheses]
              .sort((a, b) => a.rank - b.rank)
              .map((hypothesis) => (
                <li key={hypothesis.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[var(--ink)]">
                      <span className="mono mr-2 text-[10px] text-[var(--mint)]">
                        H{hypothesis.rank}
                      </span>
                      {hypothesis.label}
                    </p>
                    <span className="mono shrink-0 text-[10px] text-[var(--muted)]">
                      {(hypothesis.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="confidence-bar" aria-hidden="true">
                    <span style={{ width: `${hypothesis.confidence * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{hypothesis.rationale}</p>
                  <p className="mono mt-0.5 text-[10px] text-[var(--faint)]">{hypothesis.evidenceIds.join(" · ")}</p>
                </li>
              ))}
          </ol>
        </div>
        <div>
          <h4 className="kicker mb-2 text-[var(--muted)]">Next diagnostic checks</h4>
          <ol className="space-y-2 text-sm text-[#b7c5c2]">
            {brief.diagnosticChecks.map((check, index) => (
              <li key={check} className="flex gap-2">
                <span className="mono text-[var(--mint)]">{String(index + 1).padStart(2, "0")}</span>
                <span>{check}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
        <span className="kicker mr-2 text-[var(--amber)]">Uncertainty</span>
        {brief.uncertainty}
      </p>
    </section>
  );
}
