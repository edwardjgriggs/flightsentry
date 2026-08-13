"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ScenarioPanel } from "@/components/scenario-panel";
import { TechnicalProof } from "@/components/technical-proof";
import {
  replaceAutoencoderScores,
  runDetectorEnsemble,
} from "@/lib/detectors";
import { getLatchedDetectorFrame } from "@/lib/replay-presentation";
import type {
  AnalysisResponse,
  DetectorFrame,
  Scenario,
  ScenarioId,
} from "@/lib/types";

type RunState = "idle" | "replaying" | "paused" | "analyzing" | "complete";
type View = "operations" | "proof";
type ModelRuntime = "idle" | "loading" | "onnx" | "fallback";

export function MissionConsole({ scenarios }: { scenarios: Scenario[] }) {
  const [view, setView] = useState<View>("operations");
  const [runState, setRunState] = useState<RunState>("idle");
  const [progress, setProgress] = useState(0);
  const [responses, setResponses] = useState<Partial<Record<ScenarioId, AnalysisResponse>>>({});
  const [revealAnnotation, setRevealAnnotation] = useState(false);
  const [modelRuntime, setModelRuntime] = useState<ModelRuntime>("idle");
  const maximum = scenarios[0].telemetry.length - 1;
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
  const showLatchedResults = runState === "analyzing" || runState === "complete";

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

  const analyze = useCallback(async () => {
    setRunState("analyzing");
    const entries = await Promise.all(
      scenarios.map(async (scenario) => {
        try {
          const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenarioId: scenario.id }),
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
    setResponses(Object.fromEntries(entries));
    setRunState("complete");
  }, [scenarios]);

  useEffect(() => {
    if (runState !== "replaying") return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= maximum) {
          window.clearInterval(timer);
          void analyze();
          return maximum;
        }
        return current + 1;
      });
    }, 68);
    return () => window.clearInterval(timer);
  }, [analyze, maximum, runState]);

  const startReplay = () => {
    void activateOnnx();
    setView("operations");
    setProgress(0);
    setResponses({});
    setRevealAnnotation(false);
    setRunState("replaying");
  };

  const reset = () => {
    setRunState("idle");
    setProgress(0);
    setResponses({});
    setRevealAnnotation(false);
  };

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to mission console</a>
      <div className="mission-shell">
        <header className="flex flex-col gap-5 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center border border-[var(--mint-dim)] bg-[#0d211c]" aria-hidden="true">
              <svg width="27" height="27" viewBox="0 0 27 27" fill="none">
                <path d="M4 21.5 13.5 3l9.5 18.5-9.5-5.2L4 21.5Z" stroke="#66f2c2" strokeWidth="1.4" />
                <circle cx="13.5" cy="13.5" r="2.3" fill="#66f2c2" />
              </svg>
            </div>
            <div>
              <p className="kicker text-[var(--mint)]">Mission assurance workbench</p>
              <p className="display-type text-2xl font-semibold tracking-[.08em] text-white sm:text-3xl">FLIGHTSENTRY</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="status" className="mr-2 flex items-center gap-2 text-[var(--muted)]">
              <span className={`signal-dot ${runState === "analyzing" ? "pulse-ring text-[var(--amber)]" : "text-[var(--mint)]"}`} />
              <span className="kicker">{runState === "idle" ? "SYSTEM READY" : runState.toUpperCase()}</span>
            </div>
            <nav aria-label="Primary views" className="flex border border-[var(--line)] bg-[var(--panel)] p-1">
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
                <h1 className="display-type text-xl font-semibold text-white sm:text-2xl">Same signal. Different operational truth.</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">Telemetry-only detection flags both cases. Command and mission-plan context decides which one deserves escalation.</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {runState === "idle" || runState === "complete" ? (
                  <button type="button" onClick={startReplay} className="kicker bg-[var(--mint)] px-5 py-3 font-medium text-[var(--void)] transition hover:bg-[#91ffda]">
                    {runState === "complete" ? "Run replay again" : "Run paired incident replay"}
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={runState === "analyzing"} onClick={() => setRunState(runState === "paused" ? "replaying" : "paused")} className="kicker border border-[var(--line-hot)] px-4 py-3 text-[var(--ink)] disabled:opacity-40">
                      {runState === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button type="button" disabled={runState !== "paused" || progress >= maximum} onClick={() => setProgress((current) => Math.min(maximum, current + 1))} className="kicker border border-[var(--line)] px-4 py-3 text-[var(--muted)] disabled:opacity-40">
                      Step +1
                    </button>
                  </>
                )}
                {runState !== "idle" && (
                  <button type="button" onClick={reset} className="kicker border border-[var(--line)] px-4 py-3 text-[var(--muted)]">Reset</button>
                )}
              </div>
            </section>

            <div className="mb-3 flex items-center gap-3">
              <span className="kicker text-[var(--muted)]">Replay progress</span>
              <div className="h-px flex-1 bg-[var(--line)]"><div className="h-px bg-[var(--mint)] transition-[width] duration-100" style={{ width: `${(progress / maximum) * 100}%` }} /></div>
              <span className="mono text-xs text-[var(--ink)]">{Math.round((progress / maximum) * 100)}%</span>
            </div>

            <div className="grid gap-4 2xl:grid-cols-2">
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
                  revealAnnotation={revealAnnotation}
                  scoreMode={showLatchedResults ? "peak" : "live"}
                />
              ))}
            </div>

            {runState === "complete" && !revealAnnotation && (
              <div className="panel-enter mt-5 flex flex-col items-start justify-between gap-3 border border-[var(--mint-dim)] bg-[#0d211c] p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="kicker text-[var(--mint)]">Human verification gate</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">Compare FlightSentry’s dispositions with the dataset’s expert classifications.</p>
                </div>
                <button type="button" onClick={() => setRevealAnnotation(true)} className="kicker border border-[var(--mint)] px-4 py-3 text-[var(--mint)] hover:bg-[var(--mint)] hover:text-[var(--void)]">
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
            ESA-AD · CC BY 3.0 IGO · {modelRuntime === "onnx" ? "ONNX VERIFIED" : modelRuntime === "fallback" ? "MODEL FALLBACK" : modelRuntime === "loading" ? "ONNX LOADING" : "ONNX READY"} · GRANITE 4 READY
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
