import { detectorConfig } from "@/lib/detector-config";
import type { DetectorFrame } from "@/lib/types";

const detectors = [
  ["MAD", "mad", "Rolling median absolute deviation"],
  ["ISO FOREST", "isolationForest", "Isolation Forest"],
  ["AUTOENCODER", "autoencoder", "Reconstruction error"],
] as const;

const THRESHOLD = detectorConfig.alertThreshold;
const PERSISTENCE_WINDOW = detectorConfig.persistence.window;
const PERSISTENCE_REQUIRED = detectorConfig.persistence.requiredCount;

export function DetectorStrip({
  frame,
  mode = "live",
  history,
  progress,
  runtimeLabel,
}: {
  frame: DetectorFrame;
  mode?: "live" | "peak";
  history: DetectorFrame[];
  progress: number;
  runtimeLabel: string;
}) {
  const windowStart = Math.max(0, progress - (PERSISTENCE_WINDOW - 1));
  const recentWindow =
    mode === "live" ? history.slice(windowStart, progress + 1) : [];
  const pips = Array.from({ length: PERSISTENCE_WINDOW }, (_, index) => {
    const item = recentWindow[recentWindow.length - PERSISTENCE_WINDOW + index];
    return item ? item.fused >= THRESHOLD : false;
  });
  const firstAlert = history.find((item) => item.alert)?.timestamp ?? null;

  return (
    <div>
      {mode === "peak" && (
        <p className="kicker mb-2 text-[var(--amber)]">
          Latched peak detector scores
        </p>
      )}
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
        {detectors.map(([label, key, title]) => (
          <ScoreCell
            key={key}
            label={label}
            title={key === "autoencoder" ? `${title} · ${runtimeLabel}` : title}
            score={frame[key]}
            tag={key === "autoencoder" ? runtimeLabel : undefined}
          />
        ))}
        <div className="bg-[#0d211c] px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="kicker text-[var(--mint)]" title="Weighted ensemble score">
              FUSED
            </span>
            <span
              className={`mono text-xs ${frame.fused >= THRESHOLD ? "text-[var(--amber)]" : "text-[var(--ink)]"}`}
            >
              {frame.fused >= THRESHOLD ? "▲ " : ""}
              {frame.fused.toFixed(2)}
              {frame.fused >= THRESHOLD && <span className="sr-only"> above threshold</span>}
            </span>
          </div>
          <ScoreBar score={frame.fused} />
          <div className="mt-2 flex items-center justify-between gap-2">
            {mode === "live" ? (
              <>
                <span
                  className="flex gap-1"
                  aria-label={`Persistence: ${pips.filter(Boolean).length} of ${PERSISTENCE_WINDOW} recent windows above threshold`}
                  role="img"
                >
                  {pips.map((hot, index) => (
                    <span
                      key={index}
                      className={`persistence-pip ${hot ? "persistence-pip-hot" : ""}`}
                    />
                  ))}
                </span>
                <span className="mono text-[9px] text-[var(--muted)]">
                  {PERSISTENCE_REQUIRED}/{PERSISTENCE_WINDOW} &ge; {THRESHOLD.toFixed(2)}
                </span>
              </>
            ) : (
              <span className="mono text-[9px] text-[var(--muted)]">
                {firstAlert === null
                  ? "persistence never fired"
                  : `persistent from T+${String(firstAlert).padStart(3, "0")}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCell({
  label,
  title,
  score,
  tag,
}: {
  label: string;
  title: string;
  score: number;
  tag?: string;
}) {
  const hot = score >= THRESHOLD;
  return (
    <div className="bg-[var(--panel)] px-3 py-2.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="kicker text-[var(--muted)]" title={title}>
          {label}
        </span>
        <span className={`mono shrink-0 whitespace-nowrap text-xs ${hot ? "text-[var(--amber)]" : "text-[var(--ink)]"}`}>
          {hot ? "▲ " : ""}
          {score.toFixed(2)}
          {hot && <span className="sr-only"> above threshold</span>}
        </span>
      </div>
      <ScoreBar score={score} />
      {tag && (
        <p className="mono mt-2 text-[9px] uppercase tracking-[.08em] text-[var(--muted)]">{tag}</p>
      )}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const hot = score >= THRESHOLD;
  return (
    <div className="score-bar">
      <div
        className={`h-full transition-[width] duration-100 ${hot ? "bg-[var(--amber)]" : "bg-[var(--mint-dim)]"}`}
        style={{ width: `${Math.max(2, score * 100)}%` }}
      />
      <span className="score-bar-threshold" style={{ left: `${THRESHOLD * 100}%` }} />
    </div>
  );
}
