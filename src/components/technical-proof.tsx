import { detectorConfiguration } from "@/lib/detectors";
import type { DetectorFrame, Scenario } from "@/lib/types";
import sourceEvaluation from "@/data/source-evaluation.json";
import {
  calculateContextMetrics,
  evaluateContextDecision,
} from "@/lib/context-integrity";

export function TechnicalProof({
  scenarios,
  frames,
  modelRuntime,
}: {
  scenarios: Scenario[];
  frames: Record<string, DetectorFrame[]>;
  modelRuntime: "idle" | "loading" | "onnx" | "fallback";
}) {
  const rows = [
    ["Rolling MAD", "mad"],
    ["Isolation Forest", "isolationForest"],
    [modelRuntime === "onnx" ? "Bundled linear autoencoder (ONNX)" : modelRuntime === "fallback" ? "TypeScript PCA fallback" : "Bundled linear autoencoder", "autoencoder"],
    ["Weighted ensemble", "fused"],
  ] as const;
  const contextMetrics = calculateContextMetrics(scenarios);

  return (
    <main id="main-content" className="panel-enter mt-5" tabIndex={-1}>
      <div className="mb-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <section className="hairline-panel p-5 sm:p-7">
          <p className="kicker mb-2 text-[var(--mint)]">Technical proof / 01</p>
          <h1 className="display-type text-3xl font-semibold text-white">The language model never controls the detection result.</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--muted)]">
            FlightSentry keeps anomaly detection deterministic and reproducible. Granite receives a bounded evidence packet only after the numerical ensemble raises a persistent alert.
          </p>
          <div className="mt-6 grid gap-px bg-[var(--line)] sm:grid-cols-5">
            {["Telemetry", "3 detectors", "Score fusion", "Trusted context", "Granite brief"].map((item, index) => (
              <div key={item} className="relative bg-[var(--panel)] px-3 py-4">
                <span className="mono mb-2 block text-[10px] text-[var(--mint)]">{String(index + 1).padStart(2, "0")}</span>
                <span className="kicker text-[var(--ink)]">{item}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="hairline-panel p-5">
          <p className="kicker mb-3 text-[var(--mint)]">Calibration record</p>
          <dl className="space-y-3 text-sm">
            <ProofRow label="Config profile" value={detectorConfiguration.configProfile} />
            <ProofRow label="Baseline" value={`${detectorConfiguration.baselineSamples} samples`} />
            <ProofRow label="MAD window" value={`${detectorConfiguration.rollingWindow} samples`} />
            <ProofRow label="Alert threshold" value={detectorConfiguration.threshold.toFixed(2)} />
            <ProofRow label="Persistence" value={detectorConfiguration.persistence} />
            <ProofRow
              label="Fusion weights"
              value={`${detectorConfiguration.weights.mad.toFixed(2)} / ${detectorConfiguration.weights.isolationForest.toFixed(2)} / ${detectorConfiguration.weights.autoencoder.toFixed(2)}`}
            />
            <ProofRow label="Weights source" value={detectorConfiguration.provenance.weightsSource} />
            <ProofRow
              label="Model runtime"
              value={
                modelRuntime === "onnx"
                  ? "Browser / ONNX verified"
                  : modelRuntime === "fallback"
                    ? "Browser / TypeScript fallback"
                    : modelRuntime === "loading"
                      ? "Browser / loading ONNX"
                      : "Browser / ONNX warms on operator intent"
              }
            />
          </dl>
        </section>
      </div>

      <section className="hairline-panel overflow-hidden">
        <div className="border-b border-[var(--line)] p-5">
          <p className="kicker mb-1 text-[var(--mint)]">Paired-case ablation / 02</p>
          <h2 className="display-type text-2xl font-semibold text-white">Every detector sees change. Context determines action.</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Bundled challenge fixture, n=2. These values are not official ESA-ADB benchmark results.</p>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Paired-case ablation table">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="kicker text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--line)] px-5 py-3 font-normal">Method</th>
                {scenarios.map((scenario) => (
                  <th key={scenario.id} className="border-b border-l border-[var(--line)] px-5 py-3 font-normal">
                    Event {scenario.eventId} max score (alert &ge; {detectorConfiguration.threshold.toFixed(2)})
                  </th>
                ))}
                <th className="border-b border-l border-[var(--line)] px-5 py-3 font-normal">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key]) => (
                <tr key={key}>
                  <td className="border-b border-[var(--line)] px-5 py-4 text-[var(--ink)]">{label}</td>
                  {scenarios.map((scenario) => {
                    const maximum = Math.max(...frames[scenario.id].map((frame) => frame[key]));
                    const flagged = maximum >= detectorConfiguration.threshold;
                    return (
                      <td key={scenario.id} className={`mono border-b border-l border-[var(--line)] px-5 py-4 ${flagged ? "text-[var(--amber)]" : "text-[var(--muted)]"}`}>
                        {maximum.toFixed(2)} · {flagged ? "FLAG" : "BELOW"}
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-[var(--line)] px-5 py-4 text-[var(--muted)]">
                    {key === "fused" ? "Persistent alert" : "Independent evidence"}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#0d211c]">
                <td className="px-5 py-4 font-medium text-[var(--mint)]">Context resolver</td>
                {scenarios.map((scenario) => {
                  const disposition = evaluateContextDecision(scenario, "trusted-context").disposition;
                  return (
                    <td key={scenario.id} className={`mono border-l border-[var(--line)] px-5 py-4 ${disposition === "MONITOR" ? "text-[var(--mint)]" : "text-[var(--amber)]"}`}>
                      {disposition}
                    </td>
                  );
                })}
                <td className="border-l border-[var(--line)] px-5 py-4 text-[var(--muted)]">Human decision support</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="hairline-panel mt-5 overflow-hidden">
        <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[.85fr_1.15fr]">
          <div className="bg-[#0d211c] p-5">
            <p className="kicker text-[var(--mint)]">Context effectiveness / 03</p>
            <h2 className="display-type mt-2 text-2xl font-semibold text-white">One unnecessary investigation prevented.</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Telemetry-only policy investigates both cases. Trusted context de-escalates the rare-nominal event while retaining the anomaly for investigation.
            </p>
            <p className="mono mt-5 text-[10px] text-[var(--muted)]">
              Paired challenge case, n={contextMetrics.sampleSize}. Project evaluation only, not an official ESA-ADB result.
            </p>
          </div>
          <dl className="grid bg-[var(--panel)] sm:grid-cols-2">
            <Metric label="Telemetry-only investigations" value={`${contextMetrics.telemetryOnlyInvestigations}/${contextMetrics.sampleSize}`} />
            <Metric label="Trusted-context investigations" value={`${contextMetrics.trustedContextInvestigations}/${contextMetrics.sampleSize}`} />
            <Metric label="Rare-nominal de-escalation" value={formatPercent(contextMetrics.rareNominalDeEscalationRate)} />
            <Metric label="Anomaly investigation recall" value={formatPercent(contextMetrics.anomalyInvestigationRecall)} />
            <Metric label="Unnecessary investigations prevented" value={`${contextMetrics.unnecessaryInvestigationsPrevented}`} />
            <Metric label="Counterfactual dependency" value={formatPercent(contextMetrics.counterfactualDependencyRate)} />
          </dl>
        </div>
      </section>

      <section className="hairline-panel mt-5 overflow-hidden">
        <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[1.15fr_.85fr]">
          <div className="bg-[var(--panel)] p-5">
            <p className="kicker mb-1 text-[var(--mint)]">Source-data evaluation / 04</p>
            <h2 className="display-type text-2xl font-semibold text-white">Real Mission 2 source data, gated before deployment.</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              The checksum-verified Mission 2 extracts confirm the operational contrast: event 609 includes a priority-3 telecommand and overlapping event record; event 618 includes neither.
            </p>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <ProofRow label="Archive checksum" value="MD5 verified" />
              <ProofRow label="Shared channels" value={`${sourceEvaluation.source.channels.length}`} />
              <ProofRow label="Source samples" value={`${sourceEvaluation.source.samples}`} />
              <ProofRow label="ONNX checker" value={sourceEvaluation.candidate.onnxValidation} />
              <ProofRow label="Validation event 609" value={`${sourceEvaluation.results.validation609.detectionDelaySeconds}s detection`} />
              <ProofRow label="Held-out event 618" value={`${sourceEvaluation.results.heldOut618.detectionDelaySeconds}s detection`} />
            </dl>
            <div className="mono mt-4 flex flex-wrap gap-4 text-xs">
              <a className="text-[var(--mint)] underline-offset-4 hover:underline" href="/data/source-evaluation/esa-m2-609.json" target="_blank" rel="noopener noreferrer">
                Event 609 extract<span className="sr-only"> (opens raw JSON in a new tab)</span>
              </a>
              <a className="text-[var(--mint)] underline-offset-4 hover:underline" href="/data/source-evaluation/esa-m2-618.json" target="_blank" rel="noopener noreferrer">
                Event 618 extract<span className="sr-only"> (opens raw JSON in a new tab)</span>
              </a>
            </div>
          </div>
          <div className="bg-[#0d211c] p-5">
            <p className="kicker text-[var(--amber)]">Deployment gate</p>
            <p className="mono mt-3 text-sm text-white">{sourceEvaluation.deploymentDecision.status.replaceAll("_", " ")}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{sourceEvaluation.deploymentDecision.reason}</p>
            <p className="mono mt-5 text-xs text-[var(--muted)]">
              Candidate weights {sourceEvaluation.candidate.weights.mad.toFixed(2)} / {sourceEvaluation.candidate.weights.isolationForest.toFixed(2)} / {sourceEvaluation.candidate.weights.autoencoder.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-[var(--line)]" tabIndex={0} role="region" aria-label="Held-out event 618 ablation table">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="kicker text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--line)] px-5 py-3 font-normal">Held-out event 618</th>
                <th className="border-b border-l border-[var(--line)] px-5 py-3 font-normal">Detected</th>
                <th className="border-b border-l border-[var(--line)] px-5 py-3 font-normal">Event F1</th>
                <th className="border-b border-l border-[var(--line)] px-5 py-3 font-normal">False-alert episodes</th>
                <th className="border-b border-l border-[var(--line)] px-5 py-3 font-normal">Delay</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(sourceEvaluation.results.heldOutAblation).map(([method, result]) => (
                <tr key={method}>
                  <td className="border-b border-[var(--line)] px-5 py-4 text-[var(--ink)]">{formatMethod(method)}</td>
                  <td className={`mono border-b border-l border-[var(--line)] px-5 py-4 ${result.detected ? "text-[var(--mint)]" : "text-[var(--red)]"}`}>
                    {result.detected ? "YES" : "NO"}
                  </td>
                  <td className="mono border-b border-l border-[var(--line)] px-5 py-4 text-[var(--ink)]">{result.eventF1.toFixed(2)}</td>
                  <td className="mono border-b border-l border-[var(--line)] px-5 py-4 text-[var(--ink)]">{result.falseAlertEpisodes}</td>
                  <td className="mono border-b border-l border-[var(--line)] px-5 py-4 text-[var(--ink)]">
                    {result.detectionDelaySeconds === null ? "n/a" : `${result.detectionDelaySeconds}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-4 text-xs text-[var(--faint)]">{sourceEvaluation.scope} {sourceEvaluation.evaluationDesign.limitation}.</p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <ProofCard number="05" title="Grounded by construction" body="Granite can cite only evidence IDs present in the server-created packet. Unknown references fail validation and trigger the reference brief." />
        <ProofCard number="06" title="Human remains in command" body="FlightSentry recommends low-risk checks. It exposes uncertainty and cannot create or execute spacecraft commands." />
        <ProofCard number="07" title="Reproducible data path" body="The Python pipeline verifies the ESA archive checksum, extracts attributed windows, trains artifacts, and records configuration provenance." />
      </div>
    </main>
  );
}

function formatMethod(method: string): string {
  return method
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--line)] p-5 sm:border-l">
      <dt className="kicker text-[var(--muted)]">{label}</dt>
      <dd className="display-type mt-3 text-2xl font-semibold text-white">{value}</dd>
    </div>
  );
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mono text-right text-xs text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function ProofCard({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <section className="hairline-panel p-5">
      <p className="mono mb-5 text-xs text-[var(--mint)]">/{number}</p>
      <h3 className="display-type text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
    </section>
  );
}
