import { DetectorStrip } from "@/components/detector-strip";
import { IncidentBriefPanel } from "@/components/incident-brief";
import { TelemetryChart } from "@/components/telemetry-chart";
import type { AnalysisResponse, DetectorFrame, Scenario } from "@/lib/types";

interface ScenarioPanelProps {
  scenario: Scenario;
  frame: DetectorFrame;
  progress: number;
  response?: AnalysisResponse;
  revealAnnotation: boolean;
  scoreMode?: "live" | "peak";
}

export function ScenarioPanel({
  scenario,
  frame,
  progress,
  response,
  revealAnnotation,
  scoreMode = "live",
}: ScenarioPanelProps) {
  const visibleSamples = scenario.telemetry.slice(0, progress + 1);
  const currentSample = scenario.telemetry[Math.min(progress, scenario.telemetry.length - 1)];
  const alertActive = frame.alert;
  const statusLabel =
    scoreMode === "peak"
      ? alertActive
        ? "EVENT DETECTED"
        : "NO EVENT DETECTED"
      : alertActive
        ? "DETECTOR ALERT"
        : "NOMINAL";
  const evidenceVisible = progress >= scenario.eventWindow[0];
  const position = (progress / (scenario.telemetry.length - 1)) * 100;

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

      <div className="relative overflow-hidden border border-[var(--line)] bg-[#091011] px-2 pt-2">
        <TelemetryChart channels={scenario.channels} samples={visibleSamples} />
        <div className="scanline" style={{ "--scan-position": `${position}%` } as React.CSSProperties} />
      </div>

      <div className="my-3 flex flex-wrap gap-x-5 gap-y-2">
        {scenario.channels.map((channel) => (
          <div key={channel.id} className="flex items-center gap-2">
            <span className="h-px w-4" style={{ backgroundColor: channel.color }} />
            <span className="kicker text-[var(--muted)]">{channel.shortLabel}</span>
            <span className="mono text-xs text-[var(--ink)]">
              {currentSample.values[channel.id].toFixed(channel.unit === "deg" ? 3 : 2)} {channel.unit}
            </span>
          </div>
        ))}
      </div>

      <DetectorStrip frame={frame} mode={scoreMode} />

      <section className="mt-4" aria-label={`${scenario.title} evidence timeline`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="kicker text-[var(--muted)]">Trusted context timeline</h3>
          <span className="mono text-[10px] text-[var(--faint)]">T+{progress.toString().padStart(3, "0")}</span>
        </div>
        <div className="min-h-24 border border-[var(--line)] bg-[#091011] p-3">
          {!evidenceVisible ? (
            <p className="mono py-5 text-center text-xs text-[var(--faint)]">Awaiting event onset…</p>
          ) : (
            <ol className="space-y-2">
              {scenario.evidence.map((item) => (
                <li key={item.id} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
                  <span className={`kicker ${item.kind === "telecommand" || item.kind === "planned-event" ? "text-[var(--mint)]" : "text-[var(--amber)]"}`}>
                    {item.kind}
                  </span>
                  <span className="text-[#b9c7c4]">
                    {item.label} <span className="mono text-[var(--faint)]">[{item.id}]</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {response && <IncidentBriefPanel response={response} scenario={scenario} />}

      {revealAnnotation && (
        <div className="panel-enter mt-4 border border-[var(--mint-dim)] bg-[#0d211c] p-3">
          <p className="kicker mb-1 text-[var(--mint)]">Expert annotation revealed</p>
          <p className="text-sm">{scenario.expertAnnotation}</p>
        </div>
      )}
    </article>
  );
}
