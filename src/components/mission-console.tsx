"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScenarioPanel } from "@/components/scenario-panel";
import { DecisionComparison } from "@/components/decision-comparison";
import { DecisionTrace } from "@/components/decision-trace";
import { TechnicalProof } from "@/components/technical-proof";
import {
  replaceAutoencoderScores,
  runDetectorEnsemble,
} from "@/lib/detectors";
import { getLatchedDetectorFrame } from "@/lib/replay-presentation";
import { evaluateContextDecision } from "@/lib/context-integrity";
import type {
  AnalysisResponse,
  DetectorFrame,
  DecisionMode,
  InvestigationRunbook,
  OperatorAcknowledgement,
  Scenario,
  ScenarioId,
} from "@/lib/types";

type RunState = "idle" | "replaying" | "paused" | "complete";
type View = "operations" | "proof";
type ModelRuntime = "idle" | "loading" | "onnx" | "fallback";

const REPLAY_TICK_MS = 68;

const runtimeLabels: Record<ModelRuntime, string> = {
  idle: "ONNX PENDING",
  loading: "ONNX LOADING",
  onnx: "ONNX WASM",
  fallback: "TS FALLBACK",
};

export function MissionConsole({ scenarios }: { scenarios: Scenario[] }) {
  const [view, setView] = useState<View>("operations");
  const [runState, setRunState] = useState<RunState>("idle");
  const [hasCompleted, setHasCompleted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [responses, setResponses] = useState<Partial<Record<ScenarioId, AnalysisResponse>>>({});
  const [revealAnnotation, setRevealAnnotation] = useState(false);
  const [modelRuntime, setModelRuntime] = useState<ModelRuntime>("idle");
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("trusted-context");
  const [excludedEvidence, setExcludedEvidence] = useState<Partial<Record<ScenarioId, string[]>>>({});
  const [acknowledgements, setAcknowledgements] = useState<Partial<Record<ScenarioId, OperatorAcknowledgement>>>({});
  const [runbooks, setRunbooks] = useState<Partial<Record<ScenarioId, InvestigationRunbook>>>({});
  const runIdRef = useRef(0);
  const progressRef = useRef(0);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  const maximum = Math.min(...scenarios.map((scenario) => scenario.telemetry.length)) - 1;
  const baseDetectorFrames = useMemo(
    () => Object.fromEntries(scenarios.map((scenario) => [scenario.id, runDetectorEnsemble(scenario)])),
    [scenarios],
  );
  const [detectorFrames, setDetectorFrames] = useState<Record<string, DetectorFrame[]>>(baseDetectorFrames);
  const latchedDetectorFrames = useMemo(
    () =>
      Object.fromEntries(
        scenarios.map((scenario) => [
          scenario.id,
          getLatchedDetectorFrame(detectorFrames[scenario.id]),
        ]),
      ),
    [detectorFrames, scenarios],
  );
  const showLatchedResults = hasCompleted && progress >= maximum;
  const telemetryDecisions = useMemo(
    () => Object.fromEntries(scenarios.map((scenario) => [scenario.id, evaluateContextDecision(scenario, "telemetry-only")])),
    [scenarios],
  );
  const contextDecisions = useMemo(
    () => Object.fromEntries(scenarios.map((scenario) => [
      scenario.id,
      evaluateContextDecision(scenario, "trusted-context", excludedEvidence[scenario.id] ?? []),
    ])),
    [excludedEvidence, scenarios],
  );
  const briefsPending =
    hasCompleted && scenarios.some((scenario) => !responses[scenario.id]);
  const responseList = scenarios
    .map((scenario) => responses[scenario.id])
    .filter((item): item is AnalysisResponse => Boolean(item));
  const graniteStatus =
    responseList.length === 0
      ? briefsPending
        ? "GRANITE ANALYZING"
        : "GRANITE 4 STANDBY"
      : responseList.some((item) => item.source === "watsonx")
        ? "GRANITE 4 LIVE"
        : "GRANITE REFERENCE MODE";

  const activateOnnx = useCallback(async () => {
    if (modelRuntime === "loading" || modelRuntime === "onnx") return;
    setModelRuntime("loading");
    try {
      const { runOnnxAutoencoder } = await import("@/lib/onnx-autoencoder");
      const scores = await Promise.all(
        scenarios.map(async (scenario) => [scenario.id, await runOnnxAutoencoder(scenario)] as const),
      );
      setDetectorFrames(
        Object.fromEntries(
          scores.map(([scenarioId, onnxScores]) => [
            scenarioId,
            replaceAutoencoderScores(baseDetectorFrames[scenarioId], onnxScores),
          ]),
        ),
      );
      setModelRuntime("onnx");
    } catch (error) {
      console.error("FlightSentry ONNX runtime fallback", error);
      setDetectorFrames(baseDetectorFrames);
      setModelRuntime("fallback");
    }
  }, [baseDetectorFrames, modelRuntime, scenarios]);

  // Warm the ONNX runtime on operator intent (hover, focus, or first touch)
  // so slow networks do not race the replay, while page-load metrics stay
  // clean: nothing heavy loads until a human reaches for the controls.
  useEffect(() => {
    const warm = () => void activateOnnx();
    window.addEventListener("touchstart", warm, { once: true, passive: true });
    return () => window.removeEventListener("touchstart", warm);
  }, [activateOnnx]);

  const analyze = useCallback(async () => {
    const runId = runIdRef.current;
    const entries = await Promise.all(
      scenarios.map(async (scenario) => {
        try {
          const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenarioId: scenario.id }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`Analysis endpoint returned ${response.status}`);
          return [scenario.id, (await response.json()) as AnalysisResponse] as const;
        } catch {
          return [
            scenario.id,
            {
              analysis: scenario.referenceAnalysis,
              source: "reference",
              offline: true,
              message: "Analysis endpoint unavailable. Showing the validated reference brief.",
            } satisfies AnalysisResponse,
          ] as const;
        }
      }),
    );
    // A reset or new run may have started while the requests were in flight.
    if (runIdRef.current !== runId) return;
    setResponses(Object.fromEntries(entries));
  }, [scenarios]);

  // Keep a ref in sync so the replay engine can resume from the live value
  // without re-arming its interval on every tick.
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Replay engine: progress derives from elapsed wall time, so a throttled
  // background tab catches up instead of crawling at the throttled timer rate.
  useEffect(() => {
    if (runState !== "replaying") return;
    const startedAt = performance.now();
    const startProgress = progressRef.current;
    const timer = window.setInterval(() => {
      const elapsedSteps = Math.round((performance.now() - startedAt) / REPLAY_TICK_MS);
      const target = Math.min(maximum, startProgress + Math.max(1, elapsedSteps));
      setProgress(target);
      if (target >= maximum) {
        window.clearInterval(timer);
        setHasCompleted(true);
        setRunState("complete");
        if (!hasCompleted) void analyze();
      }
    }, REPLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [analyze, hasCompleted, maximum, runState]);

  // The screen reader live region derives its text from replay state, so every
  // operationally significant transition announces without imperative pushes.
  const liveAnnouncement = useMemo(() => {
    if (runState === "idle") return "";
    if (hasCompleted && runState === "paused") {
      return `Timeline review paused at T plus ${progress}. Deterministic decisions and operator controls remain available.`;
    }
    if (runState === "replaying" || runState === "paused") {
      const latched = scenarios.filter((scenario) => {
        const firstAlert = detectorFrames[scenario.id].find((frame) => frame.alert)?.timestamp;
        return firstAlert !== undefined && firstAlert <= progress;
      });
      if (latched.length === 0) return "Paired incident replay running.";
      return `${latched
        .map((scenario) => `Event ${scenario.eventId} persistent detector alert latched`)
        .join(". ")}.`;
    }
    const dispositions = scenarios
      .map((scenario) => {
        const decision =
          decisionMode === "telemetry-only"
            ? telemetryDecisions[scenario.id]
            : contextDecisions[scenario.id];
        return `event ${scenario.eventId} ${decision.disposition}`;
      })
      .join(", ");
    const briefText = briefsPending
      ? "Granite is composing analysis briefs."
      : responseList.some((item) => item.offline)
        ? "Analysis briefs ready in reference mode; live Granite unavailable."
        : "Live Granite analysis briefs ready.";
    return `Replay complete. Deterministic dispositions: ${dispositions}. ${briefText}`;
  }, [
    briefsPending,
    contextDecisions,
    decisionMode,
    detectorFrames,
    progress,
    responseList,
    runState,
    hasCompleted,
    scenarios,
    telemetryDecisions,
  ]);

  // Bring the decision comparison into view when it first appears.
  useEffect(() => {
    if (!hasCompleted) return;
    comparisonRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [hasCompleted]);

  const startReplay = () => {
    runIdRef.current += 1;
    void activateOnnx();
    setView("operations");
    setHasCompleted(false);
    setProgress(0);
    setResponses({});
    setRevealAnnotation(false);
    setDecisionMode("trusted-context");
    setExcludedEvidence({});
    setAcknowledgements({});
    setRunbooks({});
    setRunState("replaying");
    requestAnimationFrame(() => pauseButtonRef.current?.focus());
  };

  const reset = () => {
    runIdRef.current += 1;
    setRunState("idle");
    setHasCompleted(false);
    setProgress(0);
    setResponses({});
    setRevealAnnotation(false);
    setDecisionMode("trusted-context");
    setExcludedEvidence({});
    setAcknowledgements({});
    setRunbooks({});
    requestAnimationFrame(() => runButtonRef.current?.focus());
  };

  const revealAnnotations = () => {
    setRevealAnnotation(true);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-annotation]")?.focus();
    });
  };

  const toggleEvidence = (scenarioId: ScenarioId, evidenceId: string) => {
    setExcludedEvidence((current) => {
      const ids = current[scenarioId] ?? [];
      return {
        ...current,
        [scenarioId]: ids.includes(evidenceId)
          ? ids.filter((id) => id !== evidenceId)
          : [...ids, evidenceId],
      };
    });
    setAcknowledgements((current) => {
      const { [scenarioId]: _removed, ...remaining } = current;
      void _removed;
      return remaining;
    });
    setRunbooks((current) => {
      const { [scenarioId]: _removed, ...remaining } = current;
      void _removed;
      return remaining;
    });
  };

  const changeDecisionMode = (mode: DecisionMode) => {
    setDecisionMode(mode);
    setAcknowledgements({});
    setRunbooks({});
  };

  const seekReplay = (nextProgress: number) => {
    if (runState === "idle") return;
    const target = Math.max(0, Math.min(maximum, nextProgress));
    setProgress(target);
    if (target >= maximum) {
      const firstCompletion = !hasCompleted;
      setHasCompleted(true);
      setRunState("complete");
      if (firstCompletion) void analyze();
      return;
    }
    setRunState("paused");
  };

  const eventOnset = Math.min(...scenarios.map((scenario) => scenario.eventWindow[0]));
  const alertTimestamp = Math.min(
    ...scenarios.map(
      (scenario) => detectorFrames[scenario.id].find((frame) => frame.alert)?.timestamp ?? maximum,
    ),
  );
  const activeDecisions = decisionMode === "telemetry-only" ? telemetryDecisions : contextDecisions;
  const chartPhase = runState === "idle" ? "idle" : showLatchedResults ? "complete" : "live";

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to mission console</a>
      <div aria-live="polite" role="status" className="sr-only">{liveAnnouncement}</div>
      <div className="mission-shell">
        <header className="flex flex-col gap-5 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="brand-lockup flex min-w-0 items-center gap-4">
            <div className="grid h-12 w-12 place-items-center border border-[var(--mint-dim)] bg-[#0d211c]" aria-hidden="true">
              <svg width="27" height="27" viewBox="0 0 27 27" fill="none">
                <path d="M4 21.5 13.5 3l9.5 18.5-9.5-5.2L4 21.5Z" stroke="#66f2c2" strokeWidth="1.4" />
                <circle cx="13.5" cy="13.5" r="2.3" fill="#66f2c2" />
              </svg>
            </div>
            <div>
              <p className="kicker text-[var(--mint)]">Mission assurance workbench</p>
              <p className="brand-title display-type text-2xl font-semibold tracking-[.08em] text-white sm:text-3xl">FLIGHTSENTRY</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="status" className="mr-2 flex items-center gap-2 text-[var(--muted)]">
              <span className={`signal-dot ${briefsPending ? "pulse-ring text-[var(--amber)]" : "text-[var(--mint)]"}`} />
              <span className="kicker">
                {runState === "idle"
                  ? "SYSTEM READY"
                  : hasCompleted && runState === "paused"
                    ? "TIMELINE REVIEW"
                    : runState === "complete"
                    ? briefsPending
                      ? "GRANITE ANALYZING"
                      : "REPLAY COMPLETE"
                    : runState.toUpperCase()}
              </span>
            </div>
            <nav aria-label="Primary views" className="primary-nav grid w-full grid-cols-2 border border-[var(--line)] bg-[var(--panel)] p-1 sm:flex sm:w-auto">
              <ViewButton active={view === "operations"} onClick={() => setView("operations")}>Operations</ViewButton>
              <ViewButton active={view === "proof"} onClick={() => setView("proof")}>Technical proof</ViewButton>
            </nav>
          </div>
        </header>

        {view === "operations" ? (
          <main id="main-content" className="mt-5" tabIndex={-1}>
            <section className="mb-5 grid gap-4 border border-[var(--line)] bg-[var(--panel)] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="kicker mb-1 text-[var(--mint)]">Paired incident exercise · ESA Mission 2</p>
                <h1 className="display-type text-lg font-semibold text-white sm:text-2xl">Same signal. Different operational truth.</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">Telemetry-only detection flags both cases. Command and mission-plan context decides which one still requires investigation.</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {runState === "idle" || runState === "complete" ? (
                  <button
                    ref={runButtonRef}
                    type="button"
                    onClick={startReplay}
                    onPointerEnter={() => void activateOnnx()}
                    onFocus={() => void activateOnnx()}
                    className="kicker bg-[var(--mint)] px-5 py-3 font-medium text-[var(--void)] transition hover:bg-[#91ffda]"
                  >
                    {runState === "complete" ? "Run replay again" : "Run paired incident replay"}
                  </button>
                ) : (
                  <>
                    <button ref={pauseButtonRef} type="button" onClick={() => setRunState(runState === "paused" ? "replaying" : "paused")} className="kicker border border-[var(--line-hot)] px-4 py-3 text-[var(--ink)]">
                      {runState === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button type="button" disabled={runState !== "paused" || progress <= 0} onClick={() => seekReplay(progress - 1)} className="kicker border border-[var(--line)] px-4 py-3 text-[var(--muted)] disabled:opacity-40">
                      Step -1
                    </button>
                    <button type="button" disabled={runState !== "paused" || progress >= maximum} onClick={() => seekReplay(progress + 1)} className="kicker border border-[var(--line)] px-4 py-3 text-[var(--muted)] disabled:opacity-40">
                      Step +1
                    </button>
                  </>
                )}
                {runState !== "idle" && (
                  <button type="button" onClick={reset} className="kicker border border-[var(--line)] px-4 py-3 text-[var(--muted)]">Reset</button>
                )}
              </div>
            </section>

            {hasCompleted && (
              <div ref={comparisonRef}>
                <DecisionComparison
                  scenarios={scenarios}
                  mode={decisionMode}
                  onModeChange={changeDecisionMode}
                  telemetryDecisions={telemetryDecisions}
                  contextDecisions={contextDecisions}
                />
                <DecisionTrace
                  scenarios={scenarios}
                  decisions={activeDecisions}
                  frames={latchedDetectorFrames}
                  mode={decisionMode}
                />
              </div>
            )}

            <section className="replay-command-strip mb-4 border border-[var(--line)] bg-[#091011] px-3 py-3 sm:px-4" aria-labelledby="replay-progress-label">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span id="replay-progress-label" className="kicker text-[var(--muted)]">Replay timeline</span>
                  <span className="mono text-sm font-medium text-[var(--ink)]">T+{String(progress).padStart(3, "0")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={runState === "idle"} onClick={() => seekReplay(eventOnset)} className="kicker border border-[var(--line)] px-2.5 py-1.5 text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40">
                    Jump onset
                  </button>
                  <button type="button" disabled={runState === "idle"} onClick={() => seekReplay(alertTimestamp)} className="kicker border border-[#765d2e] px-2.5 py-1.5 text-[var(--amber)] disabled:opacity-40">
                    Jump alert
                  </button>
                </div>
              </div>
              <div className="replay-range-wrap mt-3">
                <input
                  type="range"
                  min={0}
                  max={maximum}
                  value={progress}
                  disabled={runState === "idle"}
                  onChange={(event) => seekReplay(Number(event.target.value))}
                  aria-label="Replay timeline cursor"
                  aria-valuetext={`T plus ${progress}`}
                  className="replay-range"
                  style={{
                    "--replay-fill": `${(progress / maximum) * 100}%`,
                  } as React.CSSProperties}
                />
                <span className="replay-marker replay-marker-onset" style={{ left: `${(eventOnset / maximum) * 100}%` }} aria-hidden="true">
                  <span>ONSET T+{eventOnset}</span>
                </span>
                <span className="replay-marker replay-marker-alert" style={{ left: `${(alertTimestamp / maximum) * 100}%` }} aria-hidden="true">
                  <span>ALERT T+{alertTimestamp}</span>
                </span>
              </div>
              <div className="mono mt-7 flex justify-between text-[9px] text-[var(--faint)]" aria-hidden="true">
                <span>T+000</span>
                <span>{Math.round((progress / maximum) * 100)}% COMPLETE</span>
                <span>T+{String(maximum).padStart(3, "0")}</span>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              {scenarios.map((scenario) => (
                <ScenarioPanel
                  key={scenario.id}
                  scenario={scenario}
                  frame={
                    showLatchedResults
                      ? latchedDetectorFrames[scenario.id]
                      : detectorFrames[scenario.id][progress]
                  }
                  progress={progress}
                  response={responses[scenario.id]}
                  briefPending={hasCompleted && !responses[scenario.id]}
                  showDecision={hasCompleted}
                  revealAnnotation={revealAnnotation}
                  scoreMode={showLatchedResults ? "peak" : "live"}
                  chartPhase={chartPhase}
                  decisionMode={decisionMode}
                  decision={decisionMode === "telemetry-only" ? telemetryDecisions[scenario.id] : contextDecisions[scenario.id]}
                  detectorHistory={detectorFrames[scenario.id]}
                  excludedEvidenceIds={excludedEvidence[scenario.id] ?? []}
                  acknowledgement={acknowledgements[scenario.id]}
                  runbook={runbooks[scenario.id]}
                  runtimeLabel={runtimeLabels[modelRuntime]}
                  onToggleEvidence={(evidenceId) => toggleEvidence(scenario.id, evidenceId)}
                  onRecordAcknowledgement={(acknowledgement) => setAcknowledgements((current) => ({
                    ...current,
                    [scenario.id]: acknowledgement,
                  }))}
                  onClearAcknowledgement={() => setAcknowledgements((current) => {
                    const { [scenario.id]: _removed, ...remaining } = current;
                    void _removed;
                    return remaining;
                  })}
                  onRunbookChange={(runbook) => {
                    setRunbooks((current) => ({
                      ...current,
                      [scenario.id]: runbook,
                    }));
                    setAcknowledgements((current) => {
                      const { [scenario.id]: _removed, ...remaining } = current;
                      void _removed;
                      return remaining;
                    });
                  }}
                />
              ))}
            </div>

            {hasCompleted && !revealAnnotation && (
              <div className="panel-enter mt-5 flex flex-col items-start justify-between gap-3 border border-[var(--mint-dim)] bg-[#0d211c] p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="kicker text-[var(--mint)]">Ground truth check</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">Compare FlightSentry&rsquo;s dispositions with the dataset&rsquo;s expert classifications.</p>
                </div>
                <button type="button" onClick={revealAnnotations} className="kicker border border-[var(--mint)] px-4 py-3 text-[var(--mint)] hover:bg-[var(--mint)] hover:text-[var(--void)]">
                  Reveal expert annotations
                </button>
              </div>
            )}
          </main>
        ) : (
          <TechnicalProof
            scenarios={scenarios}
            frames={detectorFrames}
            modelRuntime={modelRuntime}
          />
        )}

        <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-[var(--line)] pt-4 text-xs text-[var(--faint)] sm:flex-row">
          <p>Decision support only · No autonomous spacecraft control</p>
          <p className="mono">
            <a
              className="underline-offset-4 hover:text-[var(--ink)] hover:underline"
              href="https://zenodo.org/records/12528696"
              target="_blank"
              rel="noopener noreferrer"
            >
              ESA-ADB · CC BY 3.0 IGO
            </a>
            {" · "}
            {modelRuntime === "onnx" ? "ONNX VERIFIED" : modelRuntime === "fallback" ? "MODEL FALLBACK" : modelRuntime === "loading" ? "ONNX LOADING" : "ONNX READY"}
            {" · "}
            {graniteStatus}
          </p>
        </footer>
      </div>
    </>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`kicker px-3 py-2 transition ${active ? "bg-[#1a2927] text-[var(--mint)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>
      {children}
    </button>
  );
}
