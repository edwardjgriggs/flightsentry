import type { Disposition } from "@/lib/types";

/** Shared border/text classes so every disposition badge reads identically. */
export const dispositionStyle: Record<Disposition, string> = {
  MONITOR: "text-[var(--mint)] border-[var(--mint-dim)]",
  INVESTIGATE: "text-[var(--amber)] border-[#765d2e]",
  ESCALATE: "text-[var(--red)] border-[#743f3f]",
};
