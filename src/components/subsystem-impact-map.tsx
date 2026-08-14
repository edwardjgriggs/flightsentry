import { buildSubsystemImpacts } from "@/lib/subsystem-analysis";
import type { ChannelImpact } from "@/lib/subsystem-analysis";
import type { Scenario } from "@/lib/types";

export function SubsystemImpactMap({ scenario }: { scenario: Scenario }) {
  const impacts = buildSubsystemImpacts(scenario);

  return (
    <section
      className="panel-enter mt-4 overflow-hidden border border-[var(--line)] bg-[#081011]"
      aria-labelledby={`${scenario.id}-impact-title`}
    >
      <div className="flex flex-col gap-2 border-b border-[var(--line)] px-3 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker text-[var(--mint)]">Subsystem impact analysis</p>
          <h3
            id={`${scenario.id}-impact-title`}
            className="display-type mt-1 text-base font-semibold text-white"
          >
            Measured excursion and recovery by channel
          </h3>
        </div>
        <p className="mono text-[9px] text-[var(--faint)]">
          FIXTURE-DERIVED · NO SYNTHETIC SEVERITY SCORE
        </p>
      </div>

      <div className="divide-y divide-[var(--line)]">
        {impacts.map((impact, subsystemIndex) => (
          <div
            key={impact.subsystem}
            className="grid gap-3 px-3 py-3 md:grid-cols-[8.5rem_1fr]"
          >
            <div>
              <span className="mono text-[9px] text-[var(--faint)]">
                SYS-{String(subsystemIndex + 1).padStart(2, "0")}
              </span>
              <p className="mt-1 text-xs font-medium text-[var(--ink)]">
                {impact.subsystem}
              </p>
              <p className="mono mt-1 text-[9px] text-[var(--faint)]">
                {impact.channels.length} CHANNEL{impact.channels.length === 1 ? "" : "S"}
              </p>
            </div>
            <div className="grid gap-2">
              {impact.channels.map((channel) => (
                <ChannelImpactRow key={channel.channelId} impact={channel} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="border-t border-[var(--line)] bg-[#0b1516] px-3 py-2 text-[10px] leading-relaxed text-[var(--faint)]">
        Recovery compares the final six replay samples with the pre-event baseline. The map describes the bundled trace and does not establish root cause.
      </p>
    </section>
  );
}

function ChannelImpactRow({ impact }: { impact: ChannelImpact }) {
  const delta = formatDelta(impact.signedDelta, impact.unit);
  const stateTone =
    impact.recoveryState === "RECOVERED"
      ? "text-[var(--mint)]"
      : "text-[var(--amber)]";

  return (
    <div className="grid gap-2 border border-[var(--line)] bg-[#0b1516] px-3 py-2 sm:grid-cols-[minmax(8rem,1fr)_auto_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-7 w-1 shrink-0"
          style={{ backgroundColor: impact.color }}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-[var(--ink)]" title={impact.label}>
            {impact.shortLabel}
          </span>
          <span className="mono block text-[9px] text-[var(--faint)]">
            BASE {formatValue(impact.baseline, impact.unit)}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
        <Metric label="Peak delta" value={delta} />
        <Metric label="Peak time" value={`T+${impact.peakTimestamp}`} />
      </div>
      <div className="sm:min-w-24 sm:text-right">
        <p className={`kicker ${stateTone}`}>{impact.recoveryState}</p>
        <p className="mono mt-0.5 text-[10px] text-[var(--muted)]">
          {impact.recoveryPercent.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="kicker block text-[var(--faint)]">{label}</span>
      <span className="mono mt-0.5 block text-[10px] text-[var(--ink)]">{value}</span>
    </span>
  );
}

function formatValue(value: number, unit: string): string {
  const precision = unit === "deg" ? 3 : 2;
  return `${value.toFixed(precision)} ${unit}`;
}

function formatDelta(value: number, unit: string): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatValue(value, unit)}`;
}
