import type { AnalysisResponse, Scenario } from "@/lib/types";

const dispositionColor = {
  MONITOR: "text-[var(--mint)] border-[var(--mint-dim)]",
  INVESTIGATE: "text-[var(--amber)] border-[#765d2e]",
  ESCALATE: "text-[var(--red)] border-[#743f3f]",
};

export function IncidentBriefPanel({
  response,
  scenario,
}: {
  response: AnalysisResponse;
  scenario: Scenario;
}) {
  const brief = response.analysis;
  return (
    <section className="panel-enter mt-4 border-t border-[var(--line-hot)] pt-4" aria-label={`${scenario.title} incident brief`}>
      {response.offline && (
        <div role="status" className="mb-3 border-l-2 border-[var(--amber)] bg-[#241d10] px-3 py-2 text-xs text-[#f1d69d]">
          REFERENCE MODE · {response.message}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker mb-1 text-[var(--muted)]">Granite incident brief</p>
          <p className="text-sm leading-relaxed text-[var(--ink)]">{brief.summary}</p>
        </div>
        <span className={`kicker border px-3 py-2 ${dispositionColor[brief.disposition]}`}>
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
        </div>
        <div>
          <h4 className="kicker mb-2 text-[var(--muted)]">Next diagnostic checks</h4>
          <ol className="space-y-2 text-sm text-[#b7c5c2]">
            {brief.diagnosticChecks.map((check, index) => (
              <li key={check} className="flex gap-2">
                <span className="mono text-[var(--mint)]">0{index + 1}</span>
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
