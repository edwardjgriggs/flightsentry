import type { DetectorFrame } from "@/lib/types";

const detectors = [
  ["MAD", "mad"],
  ["ISO FOREST", "isolationForest"],
  ["AUTOENCODER", "autoencoder"],
] as const;

export function DetectorStrip({
  frame,
  mode = "live",
}: {
  frame: DetectorFrame;
  mode?: "live" | "peak";
}) {
  return (
    <div>
      {mode === "peak" && (
        <p className="kicker mb-2 text-[var(--amber)]">
          Latched peak detector scores
        </p>
      )}
      <div className="grid grid-cols-3 gap-px overflow-hidden border border-[var(--line)] bg-[var(--line)]">
        {detectors.map(([label, key]) => {
          const score = frame[key];
          const hot = score >= 0.78;
          return (
            <div key={key} className="bg-[var(--panel)] px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="kicker text-[var(--muted)]">{label}</span>
                <span className={`mono text-xs ${hot ? "text-[var(--amber)]" : "text-[var(--ink)]"}`}>
                  {score.toFixed(2)}
                </span>
              </div>
              <div className="h-1 overflow-hidden bg-[#192322]">
                <div
                  className={`h-full transition-[width] duration-100 ${hot ? "bg-[var(--amber)]" : "bg-[var(--mint-dim)]"}`}
                  style={{ width: `${Math.max(2, score * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
